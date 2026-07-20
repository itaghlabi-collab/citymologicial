/**
 * projectExpenseSync.js — Alimentation automatique depuis modules ERP existants
 * N'altère pas les workflows Achats / Finance / Projets
 */
import { getSupabase } from '../../lib/supabase';
import {
  upsertProjectExpenseFromSource,
  upsertPurchaseProjectExpense,
  dedupePurchaseProjectExpenses,
} from './projectExpenses';
import { listProjects, listProjectsForSelect } from '../projects/projects';
import {
  buildProjectIndexes,
  resolveChargeProject,
  syncChargesToProjectsViaApi,
} from './projectExpenseMerge';
import {
  isChargePaidForProject,
  isInternalCostCenterName,
  isWorkerPaymentSourceType,
} from './projectExpenseRules';

const SKIP_STATUTS = ['Annulé', 'Refusé', 'Refusée', 'Brouillon'];
const OP_PAID_STATUTS = ['Payé'];
const WORKER_EXPENSE_CATEGORY = "Main d'œuvre";

function isActiveStatut(statut) {
  return statut && !SKIP_STATUTS.includes(statut);
}

function isPaidOpStatut(statut) {
  return OP_PAID_STATUTS.includes(statut);
}

export async function syncProjectExpensesFromErp() {
  const projects = await listProjects();
  const indexes = buildProjectIndexes(projects);

  const stats = { created: 0, updated: 0, skipped: 0, errors: 0, deduped: 0 };

  const resolveProject = (row) => resolveChargeProject(row, indexes);

  try {
    const dedupe = await dedupePurchaseProjectExpenses();
    stats.deduped = dedupe.deleted;
  } catch {
    stats.errors++;
  }

  await syncCharges(stats, resolveProject);
  await syncPaymentOrders(stats, resolveProject);

  return stats;
}

function chargeProjectExpensePayload(charge, projectId) {
  const ref = charge.ref || charge.ref_charge || '';
  return {
    project_id: projectId,
    date_depense: charge.date || charge.date_charge,
    categorie: charge.categorie,
    element_depense: charge.libelle || charge.categorie || 'Charge',
    description: charge.commentaire,
    fournisseur: charge.fournisseur,
    montant: charge.montant,
    montant_paye: Number(charge.montant) || 0,
    observation: ref ? `Réf. ${ref}` : null,
    origine: 'charge_manuelle',
    source_type: 'finance_charge',
    source_id: charge.id,
    statut: 'payee',
    mode_paiement: charge.mode_paiement,
  };
}

/** Synchronise une dépense générale vers project_expenses — uniquement si statut Payé. */
export async function syncChargeToProjectExpense(charge) {
  if (!charge?.id) return null;
  const sb = getSupabase();

  if (!isChargePaidForProject(charge)) {
    if (['Annulé', 'Refusé', 'Refusée'].includes(charge.statut)) {
      const { data: existing } = await sb
        .from('project_expenses')
        .select('id')
        .eq('source_type', 'finance_charge')
        .eq('source_id', charge.id)
        .maybeSingle();
      if (existing?.id) {
        await sb.from('project_expenses').update({ statut: 'annule' }).eq('id', existing.id);
      }
    } else {
      await removeProjectExpenseForCharge(charge.id);
    }
    return null;
  }

  const hasLink = charge.project_id || String(charge.projet_lie || '').trim();
  if (!hasLink) {
    await removeProjectExpenseForCharge(charge.id);
    return null;
  }

  // ATELIER / DÉPÔT : jamais de dépense chantier (même si un libellé projet est présent).
  if (isInternalCostCenterName(charge.projet_lie)) {
    await removeProjectExpenseForCharge(charge.id);
    return null;
  }

  const projects = await listProjectsForSelect().catch(() => []);
  const project = resolveChargeProject(charge, buildProjectIndexes(projects));
  if (!project?.id) return null;

  try {
    const result = await upsertProjectExpenseFromSource(chargeProjectExpensePayload(charge, project.id));
    await syncChargesToProjectsViaApi();
    return result;
  } catch (err) {
    console.warn('[CITYMO] sync charge → project_expense direct', err);
    await syncChargesToProjectsViaApi();
    return null;
  }
}

export async function removeProjectExpenseForCharge(chargeId) {
  if (!chargeId) return;
  await getSupabase()
    .from('project_expenses')
    .delete()
    .eq('source_type', 'finance_charge')
    .eq('source_id', chargeId);
}

/**
 * Supprime la dépense chantier liée à un paiement ouvrier consolidé (source_type + source_id).
 * Idempotent — ne touche pas aux autres origines.
 */
export async function removeProjectExpenseForWorkerPayment(sourceType, sourceId) {
  if (!sourceId) return;
  const sb = getSupabase();
  const types = isWorkerPaymentSourceType(sourceType)
    ? ['worker_weekly_payment', 'worker_payment']
    : [sourceType].filter(Boolean);
  for (const type of types) {
    await sb
      .from('project_expenses')
      .delete()
      .eq('source_type', type)
      .eq('source_id', sourceId);
  }
}

function workerPaymentProjectExpensePayload(entity, sourceType, sourceId) {
  const ouvrier = String(entity?.ouvrier || '').trim() || 'Ouvrier';
  const ref = entity?.reference ? `Réf. ${entity.reference}` : null;
  const montant = Number(entity?.net_to_pay ?? entity?.paid_amount ?? entity?.montantNet) || 0;
  const datePay = entity?.paymentDate || entity?.paidAt?.slice?.(0, 10) || new Date().toISOString().slice(0, 10);
  return {
    project_id: entity.projectId,
    date_depense: datePay,
    categorie: WORKER_EXPENSE_CATEGORY,
    element_depense: `Paiement ouvrier — ${ouvrier}`,
    description: ref || 'Paiement hebdomadaire (pipeline RH)',
    fournisseur: ouvrier,
    montant,
    montant_paye: montant,
    observation: ref,
    origine: 'main_oeuvre',
    source_type: sourceType,
    source_id: sourceId,
    statut: 'payee',
    date_paiement: datePay,
    mode_paiement: entity?.paymentMethod || null,
  };
}

/**
 * Après validation / paiement RH : dépense chantier « Main d'œuvre » pour les projets clients.
 * ATELIER / DÉPÔT sont exclus ici (voir syncWorkerPaymentToGeneralCharge).
 * Réutilise upsertProjectExpenseFromSource (même clé source_type + source_id que la caisse).
 */
export async function syncWorkerPaymentToProjectExpense({ entity, sourceType, sourceId } = {}) {
  if (!sourceId || !isWorkerPaymentSourceType(sourceType)) {
    return { action: 'none', id: null };
  }

  const projectId = entity?.projectId || entity?.project_id || null;
  if (!projectId) {
    await removeProjectExpenseForWorkerPayment(sourceType, sourceId);
    return { action: 'skipped_no_project', id: null };
  }

  // Nom officiel du projet ERP (fiable pour ATELIER / DÉPÔT), fallback libellé paie.
  let projectName = entity?.projet || entity?.project_name || entity?.projectNom || '';
  try {
    const projects = await listProjectsForSelect();
    const matched = (projects || []).find((p) => String(p.id) === String(projectId));
    if (matched?.nom) projectName = matched.nom;
  } catch {
    /* keep entity label */
  }

  if (isInternalCostCenterName(projectName)) {
    await removeProjectExpenseForWorkerPayment(sourceType, sourceId);
    return { action: 'skipped_internal', id: null };
  }

  const montant = Number(entity?.net_to_pay ?? entity?.paid_amount ?? entity?.montantNet) || 0;
  if (montant <= 0) {
    await removeProjectExpenseForWorkerPayment(sourceType, sourceId);
    return { action: 'skipped_zero', id: null };
  }

  try {
    return await upsertProjectExpenseFromSource(
      workerPaymentProjectExpensePayload(entity, sourceType, sourceId),
    );
  } catch (err) {
    // Fallback si contrainte origine pas encore élargie en prod : même ligne, origine autorisée.
    if (String(err?.message || '').includes('origine') || err?.code === '23514') {
      return upsertProjectExpenseFromSource({
        ...workerPaymentProjectExpensePayload(entity, sourceType, sourceId),
        origine: 'charge_manuelle',
      });
    }
    console.warn('[CITYMO] sync worker_payment → project_expense', err);
    throw err;
  }
}

async function syncCharges(stats, resolveProject) {
  const { data, error } = await getSupabase().from('finance_charges').select('*');
  if (error) throw error;

  for (const c of (data || []).filter((row) => row.project_id || String(row.projet_lie || '').trim())) {
    if (!isChargePaidForProject(c)) { stats.skipped++; continue; }
    const project = resolveProject(c);
    if (!project?.id) { stats.skipped++; continue; }
    try {
      const result = await upsertProjectExpenseFromSource(
        chargeProjectExpensePayload(c, project.id),
      );
      stats[result.action]++;
    } catch {
      stats.errors++;
    }
  }
}

async function syncPaymentOrders(stats, resolveProject) {
  const { data, error } = await getSupabase()
    .from('payment_orders')
    .select('*')
    .not('project_id', 'is', null);
  if (error) throw error;

  for (const o of data || []) {
    if (!isPaidOpStatut(o.statut)) { stats.skipped++; continue; }
    if (o.purchase_request_id) {
      stats.skipped++;
      continue;
    }
    try {
      const montant = Number(o.montant_ttc ?? o.montant) || 0;
      const result = await upsertProjectExpenseFromSource({
        project_id: o.project_id,
        date_depense: o.date_paiement || o.date_ordre,
        categorie: 'Ordre de paiement',
        element_depense: o.motif || o.ref_ordre || 'Ordre de paiement',
        description: o.commentaire || o.observation,
        fournisseur: o.fournisseur_lie || o.beneficiaire,
        montant,
        origine: 'ordre_paiement',
        source_type: 'payment_order',
        source_id: o.id,
        statut: 'valide',
        payment_order_id: o.id,
        mode_paiement: o.mode_paiement,
      });
      stats[result.action]++;
    } catch {
      stats.errors++;
    }
  }
}

async function syncAcquisitionOrders(stats, resolveProject) {
  const { data, error } = await getSupabase()
    .from('purchase_acquisition_orders')
    .select('*')
    .not('project_id', 'is', null);
  if (error) throw error;

  for (const o of data || []) {
    if (!isActiveStatut(o.statut)) { stats.skipped++; continue; }
    if (!o.purchase_request_id) { stats.skipped++; continue; }
    try {
      const { data: request } = await getSupabase()
        .from('purchase_requests')
        .select('ref_demande, titre, statut')
        .eq('id', o.purchase_request_id)
        .maybeSingle();
      const result = await upsertPurchaseProjectExpense({
        project_id: o.project_id,
        purchase_request_id: o.purchase_request_id,
        purchase_acquisition_order_id: o.id,
        payment_order_id: o.payment_order_id,
        date_depense: String(o.created_at || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
        categorie: 'Bon de commande',
        element_depense: null,
        purchase_ref: request?.ref_demande || o.ref_oa,
        purchase_titre: request?.titre || o.objet,
        description: o.conditions_paiement,
        fournisseur: o.supplier_name,
        montant: Number(o.montant_ttc) || 0,
        purchase_statut: request?.statut,
        op_statut: o.payment_order_id ? 'Préparé' : null,
        mode_paiement: o.mode_paiement,
      });
      stats[result.action]++;
    } catch {
      stats.errors++;
    }
  }
}

async function syncPurchaseRequests(stats, resolveProject) {
  const { data, error } = await getSupabase()
    .from('purchase_requests')
    .select('*, purchase_request_quotes ( id, montant_ttc, supplier_name, statut )')
    .not('project_id', 'is', null);
  if (error) throw error;

  for (const r of data || []) {
    if (!isActiveStatut(r.statut)) { stats.skipped++; continue; }
    const quotes = r.purchase_request_quotes || [];
    const selected = quotes.find((q) => q.id === r.selected_quote_id) || quotes[0];
    const montant = Number(selected?.montant_ttc) || 0;
    if (!montant) { stats.skipped++; continue; }
    try {
      const result = await upsertPurchaseProjectExpense({
        project_id: r.project_id,
        purchase_request_id: r.id,
        purchase_acquisition_order_id: r.acquisition_order_id,
        payment_order_id: r.payment_order_id,
        date_depense: r.date_debut || String(r.created_at || '').slice(0, 10),
        categorie: "Demande d'achat",
        purchase_ref: r.ref_demande,
        purchase_titre: r.titre,
        description: r.description,
        fournisseur: selected?.supplier_name,
        montant,
        purchase_statut: r.statut,
        mode_paiement: null,
      });
      stats[result.action]++;
    } catch {
      stats.errors++;
    }
  }
}

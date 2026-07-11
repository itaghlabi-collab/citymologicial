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

const PAID_STATUTS = ['Payé', 'Validé', 'Comptabilisée', 'Exécuté'];
const SKIP_STATUTS = ['Annulé', 'Refusé', 'Refusée', 'Brouillon'];

function isActiveStatut(statut) {
  return statut && !SKIP_STATUTS.includes(statut);
}

function isPaidStatut(statut) {
  return PAID_STATUTS.includes(statut);
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
  await syncAcquisitionOrders(stats, resolveProject);
  await syncPurchaseRequests(stats, resolveProject);

  return stats;
}

function buildProjectIndexes(projects) {
  const projectById = Object.fromEntries(projects.map((p) => [p.id, p]));
  const projectByName = {};
  const projectByRef = {};
  projects.forEach((p) => {
    projectByName[normalizeName(p.nom)] = p;
    if (p.ref) projectByRef[p.ref] = p;
  });
  return { projectById, projectByName, projectByRef };
}

function resolveChargeProject(charge, indexes) {
  const { projectById, projectByName, projectByRef } = indexes;
  if (charge.project_id) {
    return projectById[charge.project_id] || { id: charge.project_id };
  }
  const label = String(charge.projet_lie || charge.project_name || '').trim();
  if (!label) return null;
  const refPart = label.split(' — ')[0]?.trim();
  if (refPart && projectByRef[refPart]) return projectByRef[refPart];
  const nomPart = label.split(' — ')[1]?.trim() || label;
  return projectByName[normalizeName(nomPart)] || projectByName[normalizeName(label)] || null;
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
    observation: ref ? `Réf. ${ref}` : null,
    origine: 'charge_manuelle',
    source_type: 'finance_charge',
    source_id: charge.id,
    statut: isPaidStatut(charge.statut) ? 'valide' : 'en_attente',
    mode_paiement: charge.mode_paiement,
  };
}

/** Synchronise une dépense générale vers project_expenses (immédiat à l'enregistrement). */
export async function syncChargeToProjectExpense(charge) {
  if (!charge?.id) return null;
  const sb = getSupabase();

  if (!isActiveStatut(charge.statut)) {
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

  const projects = await listProjectsForSelect().catch(() => []);
  const project = resolveChargeProject(charge, buildProjectIndexes(projects));
  if (!project?.id) return null;

  return upsertProjectExpenseFromSource(chargeProjectExpensePayload(charge, project.id));
}

export async function removeProjectExpenseForCharge(chargeId) {
  if (!chargeId) return;
  await getSupabase()
    .from('project_expenses')
    .delete()
    .eq('source_type', 'finance_charge')
    .eq('source_id', chargeId);
}

function normalizeName(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function syncCharges(stats, resolveProject) {
  const { data, error } = await getSupabase().from('finance_charges').select('*');
  if (error) throw error;

  for (const c of (data || []).filter((row) => row.project_id || String(row.projet_lie || '').trim())) {
    if (!isActiveStatut(c.statut)) { stats.skipped++; continue; }
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
    if (!isActiveStatut(o.statut)) { stats.skipped++; continue; }
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
        statut: isPaidStatut(o.statut) ? 'valide' : 'en_attente',
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

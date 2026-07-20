/**
 * workerPaymentExpenseSync.js — Étape 5 Finance (ajustement ATELIER / DÉPÔT)
 *
 * Après paiement hebdo Payé :
 * — chantier client → project_expenses (Main d'œuvre)
 * — ATELIER / DÉPÔT → finance_charges (Main-d'œuvre interne), hors projet
 *
 * Ne recalcule aucune paie. Ne crée pas de double ligne caisse
 * (la caisse reste gérée par syncFinanceTransaction worker_weekly_payment).
 */
import { getSupabase } from '../../lib/supabase';
import { listProjectsForSelect } from '../projects/projects';
import { assignChargeRefIfMissing, generateChargeRef } from './charges';
import {
  removeProjectExpenseForCharge,
  removeProjectExpenseForWorkerPayment,
  syncWorkerPaymentToProjectExpense,
} from './projectExpenseSync';
import {
  INTERNAL_LABOR_CHARGE_CATEGORY,
  isInternalCostCenterName,
  isWorkerPaymentSourceType,
  resolveInternalCostCenterLabel,
  workerPaymentChargeRefKey,
} from './projectExpenseRules';

function normalizeCatKey(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/['’\-–—]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function resolveProjectName(entity) {
  const projectId = entity?.projectId || entity?.project_id || null;
  let projectName = entity?.projet || entity?.project_name || entity?.projectNom || '';
  if (!projectId) return { projectId: null, projectName };
  try {
    const projects = await listProjectsForSelect();
    const matched = (projects || []).find((p) => String(p.id) === String(projectId));
    if (matched?.nom) projectName = matched.nom;
  } catch {
    /* keep entity label */
  }
  return { projectId, projectName };
}

async function ensureInternalLaborCategoryId() {
  const sb = getSupabase();
  const targetKey = normalizeCatKey(INTERNAL_LABOR_CHARGE_CATEGORY);
  const { data, error } = await sb.from('finance_categories').select('id, nom');
  if (error) {
    console.warn('[CITYMO] finance_categories lookup', error);
    return null;
  }
  const found = (data || []).find((row) => normalizeCatKey(row.nom) === targetKey);
  if (found?.id) return found.id;

  const uid = (await sb.auth.getUser()).data?.user?.id;
  const { data: created, error: createErr } = await sb
    .from('finance_categories')
    .insert([{
      nom: INTERNAL_LABOR_CHARGE_CATEGORY,
      description: 'Paie ATELIER / DÉPÔT — charges internes hors projet',
      statut: 'Active',
      created_by: uid || null,
    }])
    .select('id')
    .single();
  if (createErr) {
    console.warn('[CITYMO] ensure Main-d\'œuvre interne category', createErr);
    return null;
  }
  return created?.id || null;
}

async function findChargeByWorkerPaymentSource(sourceId) {
  const refKey = workerPaymentChargeRefKey(sourceId);
  if (!refKey) return null;
  const { data, error } = await getSupabase()
    .from('finance_charges')
    .select('id, ref_charge, ref_paiement, statut')
    .eq('ref_paiement', refKey)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

/**
 * Annule la dépense générale liée à un paiement ouvrier (ATELIER/DÉPÔT).
 * Ne touche pas à la ligne caisse worker_weekly_payment.
 */
export async function cancelWorkerPaymentGeneralCharge(sourceId) {
  const existing = await findChargeByWorkerPaymentSource(sourceId);
  if (!existing?.id) return { action: 'none', id: null };

  const { error } = await getSupabase()
    .from('finance_charges')
    .update({
      statut: 'Annulé',
      project_id: null,
      projet_lie: null,
    })
    .eq('id', existing.id);
  if (error) throw error;

  await removeProjectExpenseForCharge(existing.id).catch(() => {});
  return { action: 'cancelled', id: existing.id };
}

/**
 * ATELIER / DÉPÔT payé → upsert dépense générale (hors projet).
 * Idempotent via ref_paiement = citymo:wp:{sourceId}.
 */
export async function syncWorkerPaymentToGeneralCharge({
  entity,
  sourceType,
  sourceId,
  centerLabel,
} = {}) {
  if (!sourceId || !isWorkerPaymentSourceType(sourceType)) {
    return { action: 'none', id: null };
  }

  const center = centerLabel || resolveInternalCostCenterLabel(entity?.projet) || 'ATELIER';
  const montant = Number(entity?.net_to_pay ?? entity?.paid_amount ?? entity?.montantNet) || 0;
  if (montant <= 0) {
    return cancelWorkerPaymentGeneralCharge(sourceId);
  }

  const ouvrier = String(entity?.ouvrier || '').trim() || 'Ouvrier';
  const datePay = entity?.paymentDate
    || entity?.paidAt?.slice?.(0, 10)
    || new Date().toISOString().slice(0, 10);
  const refKey = workerPaymentChargeRefKey(sourceId);
  const categoryId = await ensureInternalLaborCategoryId();

  const chargeRow = {
    date_charge: datePay,
    libelle: `${INTERNAL_LABOR_CHARGE_CATEGORY} — ${center} — ${ouvrier}`,
    categorie: INTERNAL_LABOR_CHARGE_CATEGORY,
    category_id: categoryId,
    montant,
    fournisseur: ouvrier,
    // Hors projet : jamais de lien projet (évite sync → project_expenses / KPI chantier)
    projet_lie: null,
    project_id: null,
    worker_id: entity?.workerId || entity?.worker_id || null,
    departement: center,
    mode_paiement: entity?.paymentMethod || 'Virement',
    ref_paiement: refKey,
    statut: 'Payé',
    commentaire: entity?.reference
      ? `Paie hebdo ${entity.reference} — centre interne ${center}`
      : `Paie hebdo consolidée — centre interne ${center}`,
    validateur: null,
  };

  const sb = getSupabase();
  const existing = await findChargeByWorkerPaymentSource(sourceId);

  if (existing?.id) {
    const refCharge = await assignChargeRefIfMissing(existing.id, existing.ref_charge);
    const { data, error } = await sb
      .from('finance_charges')
      .update({ ...chargeRow, ref_charge: refCharge })
      .eq('id', existing.id)
      .select('id')
      .single();
    if (error) throw error;
    await removeProjectExpenseForCharge(existing.id).catch(() => {});
    return { action: 'updated', id: data.id, kind: 'general_charge', center };
  }

  const uid = (await sb.auth.getUser()).data?.user?.id;
  const { data, error } = await sb
    .from('finance_charges')
    .insert([{
      ...chargeRow,
      ref_charge: await generateChargeRef(),
      created_by: uid || null,
    }])
    .select('id')
    .single();
  if (error) throw error;
  await removeProjectExpenseForCharge(data.id).catch(() => {});
  return { action: 'created', id: data.id, kind: 'general_charge', center };
}

/**
 * Point d'entrée unique après sync caisse paiement ouvrier.
 */
export async function syncWorkerPaymentExpenseOutcome({ entity, sourceType, sourceId } = {}) {
  if (!sourceId || !isWorkerPaymentSourceType(sourceType)) {
    return { action: 'none', id: null };
  }

  const { projectId, projectName } = await resolveProjectName(entity);
  const center = resolveInternalCostCenterLabel(projectName);

  if (center || isInternalCostCenterName(projectName)) {
    await removeProjectExpenseForWorkerPayment(sourceType, sourceId);
    if (!entity || !(Number(entity.net_to_pay ?? entity.paid_amount) > 0)) {
      return cancelWorkerPaymentGeneralCharge(sourceId);
    }
    return syncWorkerPaymentToGeneralCharge({
      entity: { ...entity, projectId, projet: projectName },
      sourceType,
      sourceId,
      centerLabel: center || 'ATELIER',
    });
  }

  // Chantier client : pas de dépense générale auto, uniquement project_expenses.
  await cancelWorkerPaymentGeneralCharge(sourceId).catch(() => {});
  return syncWorkerPaymentToProjectExpense({
    entity: { ...entity, projectId, projet: projectName },
    sourceType,
    sourceId,
  });
}

/** Nettoyage bilatéral quand le paiement n'est plus syncable (non payé / annulé). */
export async function clearWorkerPaymentExpenseLinks(sourceType, sourceId) {
  await removeProjectExpenseForWorkerPayment(sourceType, sourceId);
  return cancelWorkerPaymentGeneralCharge(sourceId);
}

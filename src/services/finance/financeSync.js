/**
 * financeSync.js — Journal caisse central : syncFinanceTransaction(sourceType, sourceId)
 */
import { getSupabase } from '../../lib/supabase';

const TABLE = 'finance_transactions';

export const FINANCE_SOURCE_TYPES = {
  /** Paiement ouvrier validé (une ligne caisse par ouvrier × projet, montant net consolidé). */
  WORKER_PAYMENT: 'worker_payment',
  /** @deprecated Lignes hebdo — supprimées au profit de worker_payment. */
  WORKER_WEEKLY_PAYMENT: 'worker_weekly_payment',
  SUBCONTRACTOR_PAYMENT: 'subcontractor_payment',
  CHARGE: 'charge',
  PAYMENT_ORDER: 'payment_order',
  CUSTOMER_INVOICE_PAYMENT: 'customer_invoice_payment',
  CASH_FUNDING: 'cash_funding',
};

export const SOURCE_TYPE_LABELS = {
  worker_payment: 'Paiement ouvrier',
  worker_weekly_payment: 'Paiement ouvrier',
  subcontractor_payment: 'Paiement sous-traitant',
  charge: 'Charge',
  payment_order: 'Ordre paiement',
  customer_invoice_payment: 'Facture client',
  cash_funding: 'Alimentation caisse',
};

export const SOURCE_MODULE_LABELS = {
  worker_payment: 'Paiement hebdomadaire',
  worker_weekly_payment: 'Paiement hebdomadaire',
  subcontractor_payment: 'Paiement sous-traitants',
  charge: 'Charges',
  payment_order: 'Ordres de paiement',
  customer_invoice_payment: 'Factures clients',
};

const PAID_CHARGE_STATUTS = new Set(['payé', 'paye', 'validé', 'valide', 'validée', 'validee', 'comptabilisée', 'comptabilisee']);
const PAID_ORDER_STATUTS = new Set(['payé', 'paye', 'exécuté', 'execute', 'comptabilisé', 'comptabilise']);
const PAID_PAYROLL_KEYS = new Set(['payé', 'paye', 'paid']);
const PAID_SUBCONTRACTOR_KEYS = new Set(['paid', 'payé', 'paye']);

function normalizeStatutKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function isPaidStatut(value, allowedSet) {
  return allowedSet.has(normalizeStatutKey(value));
}

/** Uniquement statut PAYÉ — pas En attente, Validé, Annulé, Partiel. */
export function isPayrollEntityPaid(entity) {
  if (!entity) return false;
  const key = normalizeStatutKey(entity.statut ?? entity.statut_db ?? entity.status);
  return PAID_PAYROLL_KEYS.has(key);
}

/** Uniquement status paid — pas pending, partial, cancelled. */
export function isSubcontractorEntityPaid(entity) {
  if (!entity) return false;
  const key = normalizeStatutKey(entity.status ?? entity.statut ?? entity.statut_db);
  return PAID_SUBCONTRACTOR_KEYS.has(key);
}

function isRhPaymentSourceType(sourceType) {
  return sourceType === FINANCE_SOURCE_TYPES.WORKER_PAYMENT
    || sourceType === FINANCE_SOURCE_TYPES.WORKER_WEEKLY_PAYMENT
    || sourceType === FINANCE_SOURCE_TYPES.SUBCONTRACTOR_PAYMENT;
}

const CATEGORY_NAMES = {
  WORKER: "Main d'œuvre",
  SUBCONTRACTOR: 'Sous-traitance',
};

let categoryIdCache = null;

function normalizeCategoryKey(name) {
  return String(name || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').trim();
}

async function getRhCategoryIds() {
  if (categoryIdCache) return categoryIdCache;
  const { data, error } = await getSupabase().from('finance_categories').select('id, nom');
  if (error) {
    console.warn('[CITYMO] finance_categories lookup', error);
    categoryIdCache = { worker: null, subcontractor: null };
    return categoryIdCache;
  }
  const byKey = {};
  (data || []).forEach((row) => {
    byKey[normalizeCategoryKey(row.nom)] = row.id;
  });
  categoryIdCache = {
    worker: byKey[normalizeCategoryKey(CATEGORY_NAMES.WORKER)] || null,
    subcontractor: byKey[normalizeCategoryKey(CATEGORY_NAMES.SUBCONTRACTOR)] || null,
  };
  return categoryIdCache;
}

async function ensureRhFinanceCategories() {
  const cats = await getRhCategoryIds();
  const missing = [];
  if (!cats.worker) {
    missing.push({ nom: CATEGORY_NAMES.WORKER, description: 'Paiements ouvriers hebdomadaires', statut: 'Active' });
  }
  if (!cats.subcontractor) {
    missing.push({ nom: CATEGORY_NAMES.SUBCONTRACTOR, description: 'Paiements sous-traitants', statut: 'Active' });
  }
  if (!missing.length) return cats;
  const { error } = await getSupabase().from('finance_categories').insert(missing);
  if (error) {
    console.warn('[CITYMO] ensureRhFinanceCategories', error);
    return cats;
  }
  categoryIdCache = null;
  return getRhCategoryIds();
}

export function resolveTransactionCategoryName(tx, catMap = {}) {
  if (!tx) return 'Divers';
  if (tx.category_id && catMap[tx.category_id]) return catMap[tx.category_id];
  if (tx.source_type === FINANCE_SOURCE_TYPES.WORKER_PAYMENT
    || tx.source_type === FINANCE_SOURCE_TYPES.WORKER_WEEKLY_PAYMENT) return CATEGORY_NAMES.WORKER;
  if (tx.source_type === FINANCE_SOURCE_TYPES.SUBCONTRACTOR_PAYMENT) return CATEGORY_NAMES.SUBCONTRACTOR;
  if (tx.source_type === FINANCE_SOURCE_TYPES.CHARGE || tx.charge_id) return 'Charges';
  if (tx.source_type === FINANCE_SOURCE_TYPES.PAYMENT_ORDER || tx.payment_order_id) return 'Ordres de paiement';
  return 'Divers';
}

function asUuidOrNull(value) {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return s;
  return null;
}

function wrapSyncError(error) {
  const msg = error?.message || String(error);
  if (msg.includes('source_type') || msg.includes('source_id') || msg.includes('is_auto_generated')) {
    const err = new Error('Base Supabase incomplète : exécutez supabase/RUN_SUPABASE_A_EXECUTER.sql puis actualisez.');
    err.code = 'SCHEMA';
    err.cause = error;
    throw err;
  }
  if (msg.includes('row-level security') || msg.includes('42501') || error?.code === '42501') {
    const err = new Error('RLS Supabase bloque l\'écriture — exécutez supabase/RUN_SUPABASE_A_EXECUTER.sql dans SQL Editor.');
    err.code = 'RLS';
    err.cause = error;
    throw err;
  }
  throw error;
}

function todayIsoLocal() {
  return new Date().toISOString().slice(0, 10);
}

function fmtWeekRangeLocal(debut, fin) {
  const d = debut ? new Date(`${debut}T12:00:00`).toLocaleDateString('fr-MA') : '—';
  const f = fin ? new Date(`${fin}T12:00:00`).toLocaleDateString('fr-MA') : '—';
  return `${d} - ${f}`;
}

function mapPaymentMode(mode) {
  const m = String(mode || '').toLowerCase();
  if (m.includes('espece') || m === 'cash' || m === 'espèces') return 'Espèces';
  if (m.includes('virement') || m.includes('transfer')) return 'Virement';
  if (m.includes('cheque') || m.includes('chèque')) return 'Chèque';
  if (m.includes('carte')) return 'Carte bancaire';
  return mode?.trim() || 'Espèces';
}

function isSourceActive(sourceType, entity) {
  if (!entity) return false;
  switch (sourceType) {
    case FINANCE_SOURCE_TYPES.CHARGE:
      return isPaidStatut(entity.statut, PAID_CHARGE_STATUTS);
    case FINANCE_SOURCE_TYPES.PAYMENT_ORDER:
      return isPaidStatut(entity.statut, PAID_ORDER_STATUTS);
    case FINANCE_SOURCE_TYPES.WORKER_PAYMENT:
    case FINANCE_SOURCE_TYPES.WORKER_WEEKLY_PAYMENT:
      return isPayrollEntityPaid(entity);
    case FINANCE_SOURCE_TYPES.SUBCONTRACTOR_PAYMENT:
      return isSubcontractorEntityPaid(entity);
    case FINANCE_SOURCE_TYPES.CUSTOMER_INVOICE_PAYMENT:
      return Number(entity.montant) > 0;
    default:
      return false;
  }
}

/** Date caisse ouvrier = payment_date (jamais semaine_debut / semaine_fin). */
function resolveWorkerSyncDate(entity) {
  const paymentDate = entity?.paymentDate || entity?.payment_date;
  if (paymentDate) return String(paymentDate).slice(0, 10);
  return todayIsoLocal();
}

function resolveWorkerSyncMontant(entity) {
  return Number(
    entity?.paid_amount ?? entity?.net_to_pay ?? entity?.net_amount ?? entity?.total_net
    ?? entity?.total ?? entity?.montantNet ?? entity?.montant_net,
  ) || 0;
}

function buildTransactionRow(sourceType, entity) {
  switch (sourceType) {
    case FINANCE_SOURCE_TYPES.CHARGE:
      return {
        date_operation: entity.date || entity.date_charge,
        sens: 'sortie',
        type_operation: 'charge',
        contrepartie: entity.fournisseur || '',
        description: entity.libelle || 'Charge',
        montant: Number(entity.montant) || 0,
        mode_paiement: mapPaymentMode(entity.mode_paiement),
        category_id: entity.category_id || null,
        project_id: entity.project_id || null,
        vehicle_id: entity.vehicle_id || null,
        worker_id: entity.worker_id || null,
        client_id: entity.client_id || null,
        charge_id: entity.id,
        payment_order_id: null,
        invoice_id: null,
        ref_operation: entity.ref || entity.ref_charge || null,
        source_module: 'finance',
      };
    case FINANCE_SOURCE_TYPES.PAYMENT_ORDER:
      return {
        date_operation: entity.date || entity.date_ordre || entity.date_prevue,
        sens: 'sortie',
        type_operation: 'ordre_paiement',
        contrepartie: entity.beneficiaire || '',
        description: entity.motif || `Ordre ${entity.ref || ''}`.trim(),
        montant: Number(entity.montant) || 0,
        mode_paiement: mapPaymentMode(entity.mode_paiement),
        category_id: entity.category_id || null,
        project_id: entity.project_id || null,
        worker_id: entity.worker_id || null,
        client_id: entity.client_id || null,
        charge_id: entity.charge_id || null,
        payment_order_id: entity.id,
        invoice_id: null,
        ref_operation: entity.ref || entity.ref_ordre || null,
        source_module: 'finance',
      };
    case FINANCE_SOURCE_TYPES.WORKER_PAYMENT:
    case FINANCE_SOURCE_TYPES.WORKER_WEEKLY_PAYMENT: {
      const payDate = resolveWorkerSyncDate(entity);
      const weekLabel = entity.semaineDebut && entity.semaineFin
        ? fmtWeekRangeLocal(entity.semaineDebut, entity.semaineFin)
        : '';
      const descBase = `Paiement ouvrier — ${entity.projet || 'Chantier'}`;
      const montant = resolveWorkerSyncMontant(entity);
      return {
        date_operation: payDate,
        sens: 'sortie',
        type_operation: 'autre_sortie',
        contrepartie: entity.ouvrier || '',
        description: weekLabel ? `${descBase} (${weekLabel})` : descBase,
        montant,
        mode_paiement: mapPaymentMode(entity.paymentMethod),
        project_id: asUuidOrNull(entity.projectId),
        worker_id: asUuidOrNull(entity.workerId),
        ref_operation: entity.reference || null,
        source_module: 'rh',
        category_id: entity.category_id || null,
      };
    }
    case FINANCE_SOURCE_TYPES.SUBCONTRACTOR_PAYMENT:
      return {
        date_operation: entity.paymentDate || new Date().toISOString().slice(0, 10),
        sens: 'sortie',
        type_operation: 'autre_sortie',
        contrepartie: entity.subcontractorName || entity.contrepartie || 'Sous-traitant',
        description: entity.description || entity.designation || `Paiement sous-traitant — ${entity.projectName || ''}`.trim(),
        montant: Number(entity.amount ?? entity.montant) || 0,
        mode_paiement: mapPaymentMode(entity.paymentMethod),
        project_id: asUuidOrNull(entity.projectId),
        ref_operation: entity.reference || null,
        source_module: 'rh',
        category_id: entity.category_id || null,
      };
    case FINANCE_SOURCE_TYPES.CUSTOMER_INVOICE_PAYMENT:
      return {
        date_operation: entity.date || entity.date_paiement || new Date().toISOString().slice(0, 10),
        sens: 'entree',
        type_operation: 'reglement_client',
        contrepartie: entity.clientNom || entity.client_nom || '',
        description: `Règlement facture ${entity.factureNumero || entity.numero || ''}`.trim(),
        montant: Number(entity.montant) || 0,
        mode_paiement: mapPaymentMode(entity.mode),
        client_id: entity.clientId || entity.client_id || null,
        invoice_id: entity.factureId || entity.facture_id || null,
        ref_operation: entity.reference || null,
        source_module: 'crm',
      };
    default:
      return null;
  }
}

async function findExistingTransaction(sourceType, sourceId) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('id, statut')
    .eq('source_type', sourceType)
    .eq('source_id', sourceId)
    .maybeSingle();
  if (error) {
    console.error('[FINANCE SYNC ERROR] findExistingTransaction', { sourceType, sourceId, error });
    wrapSyncError(error);
  }
  return data;
}

/** Supprime lignes consolidées (source_id = hash ouvrier×projet, pas payroll.id). */
export async function purgeConsolidatedWorkerFinanceRows() {
  try {
    const { data: payrollRows } = await getSupabase().from('payroll').select('id');
    const payrollIds = new Set((payrollRows || []).map((r) => r.id).filter(Boolean));
    const { data: txs, error: listErr } = await getSupabase()
      .from(TABLE)
      .select('id, source_id')
      .eq('source_type', FINANCE_SOURCE_TYPES.WORKER_WEEKLY_PAYMENT);
    if (listErr) throw listErr;
    const orphanIds = (txs || [])
      .filter((t) => t.source_id && !payrollIds.has(t.source_id))
      .map((t) => t.id);
    if (!orphanIds.length) return { action: 'none', count: 0 };
    const { data, error } = await getSupabase()
      .from(TABLE)
      .delete()
      .in('id', orphanIds)
      .select('id');
    if (error) throw error;
    return { action: 'deleted', count: (data || []).length };
  } catch (error) {
    wrapSyncError(error);
    return { action: 'none', count: 0 };
  }
}

/** Supprime lignes caisse par semaine (source_id = payroll.id) — modèle abandonné. */
export async function purgePerPayrollIdWorkerFinanceRows() {
  try {
    const { data: payrollRows } = await getSupabase().from('payroll').select('id');
    const ids = (payrollRows || []).map((r) => r.id).filter(Boolean);
    if (!ids.length) return { action: 'none', count: 0 };
    const { data, error } = await getSupabase()
      .from(TABLE)
      .delete()
      .in('source_type', [FINANCE_SOURCE_TYPES.WORKER_WEEKLY_PAYMENT, FINANCE_SOURCE_TYPES.WORKER_PAYMENT])
      .in('source_id', ids)
      .select('id');
    if (error) throw error;
    return { action: 'deleted', count: (data || []).length };
  } catch (error) {
    wrapSyncError(error);
    return { action: 'none', count: 0 };
  }
}

/** @deprecated Utiliser purgePerPayrollIdWorkerFinanceRows — ne supprime plus toutes les lignes. */
export async function purgeAllLegacyWorkerWeeklyFinanceTransactions() {
  return purgePerPayrollIdWorkerFinanceRows();
}

/** Supprime toutes les lignes source_type worker_payment (ancien format consolidé). */
export async function purgeLegacyWorkerPaymentSourceType() {
  try {
    const { data, error } = await getSupabase()
      .from(TABLE)
      .delete()
      .eq('source_type', FINANCE_SOURCE_TYPES.WORKER_PAYMENT)
      .select('id');
    if (error) throw error;
    return { action: 'deleted', count: (data || []).length };
  } catch (error) {
    wrapSyncError(error);
    return { action: 'none', count: 0 };
  }
}

/** Supprime ancienne ligne worker_payment pour un source_id consolidé. */
export async function removeLegacyWorkerPaymentTypeRows(consolidatedSourceId) {
  if (!consolidatedSourceId) return { action: 'none', count: 0 };
  try {
    const { data, error } = await getSupabase()
      .from(TABLE)
      .delete()
      .eq('source_type', FINANCE_SOURCE_TYPES.WORKER_PAYMENT)
      .eq('source_id', consolidatedSourceId)
      .select('id');
    if (error) throw error;
    return { action: 'deleted', count: (data || []).length };
  } catch (error) {
    wrapSyncError(error);
    return { action: 'none', count: 0 };
  }
}

/** Supprime les lignes hebdo liées à des payroll ids précis. */
export async function removeLegacyWorkerWeeklyFinanceTransactions(payrollIds = []) {
  const ids = (payrollIds || []).filter(Boolean);
  if (!ids.length) return { action: 'none', count: 0 };
  try {
    const { data, error } = await getSupabase()
      .from(TABLE)
      .delete()
      .eq('source_type', FINANCE_SOURCE_TYPES.WORKER_WEEKLY_PAYMENT)
      .in('source_id', ids)
      .select('id');
    if (error) throw error;
    return { action: 'deleted', count: (data || []).length };
  } catch (error) {
    wrapSyncError(error);
    return { action: 'none', count: 0 };
  }
}

/** Supprime la transaction caisse auto liée (source_type + source_id). Ne touche pas au paiement RH. */
export async function removeLinkedFinanceTransaction(sourceType, sourceId) {
  if (!sourceType || !sourceId) return null;
  const { data, error } = await getSupabase()
    .from(TABLE)
    .delete()
    .eq('source_type', sourceType)
    .eq('source_id', sourceId)
    .select('id')
    .maybeSingle();
  if (error) {
    console.error('[FINANCE SYNC ERROR] removeLinkedFinanceTransaction', { sourceType, sourceId, error });
    wrapSyncError(error);
  }
  return data?.id ? { action: 'deleted', id: data.id } : { action: 'none', id: null };
}

const PAYMENT_NOTIFY_TYPES = new Set([
  FINANCE_SOURCE_TYPES.WORKER_PAYMENT,
  FINANCE_SOURCE_TYPES.WORKER_WEEKLY_PAYMENT,
  FINANCE_SOURCE_TYPES.SUBCONTRACTOR_PAYMENT,
  FINANCE_SOURCE_TYPES.PAYMENT_ORDER,
  FINANCE_SOURCE_TYPES.CHARGE,
]);

async function maybeNotifyPaymentCreated(sourceType, sourceId, entity, built, result) {
  if (!result || result.action !== 'created') return;
  if (!PAYMENT_NOTIFY_TYPES.has(sourceType)) return;
  try {
    const { notifyPaymentRealized } = await import('../notifications/notificationEvents');
    await notifyPaymentRealized({
      sourceType,
      sourceId,
      entity,
      montant: built?.montant,
      beneficiaire: built?.contrepartie,
    });
  } catch (err) {
    console.warn('[CITYMO] notify payment', err);
  }
}

/**
 * Sync idempotent paiements RH → caisse :
 * - PAYÉ → créer / mettre à jour (montant, date, projet)
 * - autre statut → supprimer la transaction finance liée (pas le paiement RH)
 */
export async function syncFinanceTransaction(sourceType, sourceId, options = {}) {
  console.log('[FINANCE SYNC START]', sourceType, sourceId);
  if (!sourceType || !sourceId) {
    console.error('[FINANCE SYNC ERROR] sourceType ou sourceId manquant', { sourceType, sourceId });
    return { action: 'error', reason: 'missing_source', id: null };
  }
  const entity = options.entity;
  if (!entity) {
    console.error('[FINANCE SYNC ERROR] entity manquant', { sourceType, sourceId });
    return { action: 'error', reason: 'entity_missing', id: null };
  }

  const active = options.active ?? isSourceActive(sourceType, entity);
  const existing = await findExistingTransaction(sourceType, sourceId);
  const rhPayment = isRhPaymentSourceType(sourceType);

  if (!active) {
    console.log('[FINANCE SYNC SKIP] source inactive', { sourceType, sourceId, statut: entity.statut ?? entity.status });
    if (rhPayment) {
      if (existing?.id) {
        return removeLinkedFinanceTransaction(sourceType, sourceId);
      }
      return { action: 'none', id: null };
    }
    if (existing?.id) {
      const now = new Date().toISOString();
      const { error } = await getSupabase()
        .from(TABLE)
        .update({
          statut: 'Annulé',
          validation_status: 'cancelled',
          synced_at: now,
        })
        .eq('id', existing.id);
      if (error) {
        console.error('[FINANCE SYNC ERROR] cancel update', { sourceType, sourceId, error });
        wrapSyncError(error);
      }
    }
    return { action: 'cancelled', id: existing?.id || null };
  }

  const built = buildTransactionRow(sourceType, entity);
  if (!built || !built.montant) {
    console.warn('[FINANCE SYNC SKIP] montant nul', { sourceType, sourceId, built });
    if (rhPayment && existing?.id) {
      return removeLinkedFinanceTransaction(sourceType, sourceId);
    }
    return { action: 'skipped', id: existing?.id || null, reason: 'montant_zero' };
  }

  const rhCats = await ensureRhFinanceCategories();
  if ((sourceType === FINANCE_SOURCE_TYPES.WORKER_PAYMENT
    || sourceType === FINANCE_SOURCE_TYPES.WORKER_WEEKLY_PAYMENT) && !built.category_id) {
    built.category_id = rhCats.worker;
  }
  if (sourceType === FINANCE_SOURCE_TYPES.SUBCONTRACTOR_PAYMENT && !built.category_id) {
    built.category_id = rhCats.subcontractor;
  }

  const now = new Date().toISOString();
  const row = {
    ...built,
    source_type: sourceType,
    source_id: sourceId,
    is_auto_generated: true,
    validation_status: 'pending',
    synced_at: now,
    statut: 'Validé',
  };

  try {
    if (existing?.id) {
      const { error } = await getSupabase()
        .from(TABLE)
        .update(row)
        .eq('id', existing.id);
      if (error) throw error;
      const result = { action: 'updated', id: existing.id, date: built.date_operation, montant: built.montant };
      console.log('[FINANCE SYNC OK]', result);
      return result;
    }

    const uid = (await getSupabase().auth.getUser()).data?.user?.id;
    const { data, error } = await getSupabase()
      .from(TABLE)
      .insert([{ ...row, created_by: uid }])
      .select()
      .single();
    if (error) throw error;
    const result = { action: 'created', id: data.id, date: built.date_operation, montant: built.montant };
    console.log('[FINANCE SYNC OK]', result);
    await maybeNotifyPaymentCreated(sourceType, sourceId, entity, built, result);
    return result;
  } catch (error) {
    console.error('[FINANCE SYNC ERROR]', {
      sourceType,
      sourceId,
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
      error,
    });
    wrapSyncError(error);
  }
}

/** Synchronise tous les paiements d'une facture CRM. */
export async function syncFacturePaymentsToCash(facture) {
  if (!facture?.id) return;
  const factureId = facture.id;
  const paiements = facture.paiements || [];
  const activeIds = new Set(paiements.filter((p) => p.id && Number(p.montant) > 0).map((p) => p.id));

  const { data: existing } = await getSupabase()
    .from(TABLE)
    .select('id, source_id')
    .eq('source_type', FINANCE_SOURCE_TYPES.CUSTOMER_INVOICE_PAYMENT)
    .eq('invoice_id', factureId);

  for (const ex of existing || []) {
    if (!activeIds.has(ex.source_id)) {
      await syncFinanceTransaction(
        FINANCE_SOURCE_TYPES.CUSTOMER_INVOICE_PAYMENT,
        ex.source_id,
        { entity: { montant: 0 }, active: false },
      );
    }
  }

  for (const p of paiements) {
    if (!p.id || Number(p.montant) <= 0) continue;
    await syncFinanceTransaction(
      FINANCE_SOURCE_TYPES.CUSTOMER_INVOICE_PAYMENT,
      p.id,
      {
        entity: {
          ...p,
          factureId,
          facture_id: factureId,
          factureNumero: facture.numero,
          numero: facture.numero,
          clientId: facture.client_id,
          client_id: facture.client_id,
          clientNom: facture.client_nom,
        },
      },
    );
  }
}

export function isAutoGeneratedTransaction(tx) {
  if (!tx) return false;
  return Boolean(
    tx.is_auto_generated
    || tx.source_type
    || tx.charge_id
    || tx.payment_order_id,
  );
}

export function getSourceBadgeLabel(tx) {
  if (!tx) return '';
  if (tx.source_type && SOURCE_TYPE_LABELS[tx.source_type]) {
    return SOURCE_TYPE_LABELS[tx.source_type];
  }
  if (tx.charge_id) return SOURCE_TYPE_LABELS.charge;
  if (tx.payment_order_id) return SOURCE_TYPE_LABELS.payment_order;
  if (tx.type_operation === 'alimentation_caisse') return SOURCE_TYPE_LABELS.cash_funding;
  return 'Manuel';
}

export function getSourceModuleMessage(tx) {
  const mod = tx?.source_type || (tx?.charge_id ? 'charge' : tx?.payment_order_id ? 'payment_order' : null);
  const label = SOURCE_MODULE_LABELS[mod];
  if (!label) return 'Cette opération est liée à un autre module. Modifiez-la depuis son module d\'origine.';
  return `Cette opération vient du module « ${label} ». Modifiez-la depuis son module d'origine.`;
}

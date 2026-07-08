/**
 * paymentOrders.js — Ordres de paiement (Supabase)
 */
import { getSupabase } from '../../lib/supabase';
import { syncPaymentOrderToTransaction } from './financeTransactions';
import { syncPaymentOrderPaidOutcome } from './paymentOrderPaidSync';

const TABLE = 'payment_orders';

export const PAYMENT_ORDER_STATUTS = ['À préparer', 'Préparé', 'Payé'];

export const PAYMENT_ORDER_UI_STATUTS = [
  { value: 'À préparer', label: 'En attente de paiement' },
  { value: 'Payé', label: 'Payé' },
];

export function getPaymentOrderStatusLabel(statut) {
  return normalizePaymentOrderStatut(statut) === 'Payé' ? 'Payé' : 'En attente de paiement';
}

export function getPaymentOrderStatusSelectValue(statut) {
  return normalizePaymentOrderStatut(statut) === 'Payé' ? 'Payé' : 'À préparer';
}

export function normalizePaymentOrderStatut(statut) {
  const s = String(statut || '').trim();
  if (s === 'Payé') return 'Payé';
  if (['Préparé', 'Validé', 'Soumis', 'Exécuté', 'Comptabilisé', 'En attente validation DG'].includes(s)) {
    return 'Préparé';
  }
  return 'À préparer';
}

export function normalizePaymentOrder(row) {
  if (!row) return null;
  return {
    id: row.id,
    ref: row.ref_ordre || '',
    beneficiaire: row.beneficiaire || '',
    type_benef: row.type_beneficiaire || 'Fournisseur',
    fournisseur_lie: row.fournisseur_lie || '',
    employe_lie: row.employe_lie || '',
    montant: Number(row.montant) || 0,
    date: row.date_ordre || '',
    date_paiement: row.date_paiement || '',
    date_prevue: row.date_echeance || '',
    updated_at: row.updated_at || null,
    statut: normalizePaymentOrderStatut(row.statut),
    mode_paiement: row.mode_paiement || 'Virement',
    banque: row.banque || '',
    rib: row.rib || '',
    motif: row.motif || '',
    ref_reglement: row.ref_reglement || '',
    comptabilise: row.comptabilise ? 'Oui' : 'Non',
    commentaire: row.commentaire || '',
    observation: row.observation || '',
    prepare_par: row.prepare_par || '',
    valide_par: row.valide_par || '',
    category_id: row.category_id || null,
    project_id: row.project_id || null,
    worker_id: row.worker_id || null,
    client_id: row.client_id || null,
    supplier_id: row.supplier_id || null,
    purchase_request_id: row.purchase_request_id || null,
    purchase_acquisition_order_id: row.purchase_acquisition_order_id || null,
    purchase_request_ref: row.purchase_request_ref || '',
    purchase_oa_ref: row.purchase_oa_ref || '',
    montant_ht: row.montant_ht != null ? Number(row.montant_ht) : null,
    tva_rate: row.tva_rate != null ? Number(row.tva_rate) : null,
    charge_id: row.charge_id || null,
    justificatifs: row.justificatifs || [],
    date_creation: row.created_at ? String(row.created_at).slice(0, 10) : '',
    origine: resolvePaymentOrderOrigin(row),
    created_at: row.created_at,
  };
}

/** Libellé d'origine pour l'UI (liste Finance unique) */
export function resolvePaymentOrderOrigin(row) {
  if (!row) return 'Autre';
  if (row.purchase_request_id || row.purchase_acquisition_order_id || row.purchase_request_ref) {
    return 'Achats';
  }
  if (row.charge_id) return 'Finance / Trésorerie';
  if (row.worker_id || row.client_id) return 'Autre';
  return 'Manuel';
}

export function toPaymentOrderRow(form) {
  return {
    ref_ordre: form.ref || null,
    beneficiaire: (form.beneficiaire || '').trim(),
    type_beneficiaire: form.type_benef || null,
    fournisseur_lie: form.fournisseur_lie || null,
    employe_lie: form.employe_lie || null,
    montant: Number(form.montant) || 0,
    montant_ht: form.montant_ht != null ? Number(form.montant_ht) : null,
    tva_rate: form.tva_rate != null ? Number(form.tva_rate) : null,
    date_ordre: form.date || form.date_prevue || null,
    date_echeance: form.date_prevue || null,
    date_paiement: form.date_paiement || null,
    statut: form.statut || 'À préparer',
    mode_paiement: form.mode_paiement || 'Virement',
    banque: form.banque || null,
    rib: form.rib || null,
    motif: form.motif || null,
    ref_reglement: form.ref_reglement || null,
    comptabilise: form.comptabilise === 'Oui' || form.comptabilise === true,
    commentaire: form.commentaire || null,
    observation: form.observation || null,
    prepare_par: form.prepare_par || null,
    valide_par: form.valide_par || null,
    category_id: form.category_id || null,
    project_id: form.project_id || null,
    purchase_request_id: form.purchase_request_id || null,
    purchase_acquisition_order_id: form.purchase_acquisition_order_id || null,
    purchase_request_ref: form.purchase_request_ref || null,
    purchase_oa_ref: form.purchase_oa_ref || null,
    worker_id: form.worker_id || null,
    client_id: form.client_id || null,
    supplier_id: form.supplier_id || null,
    charge_id: form.charge_id || null,
    justificatifs: form.justificatifs || [],
  };
}

async function requireUser() {
  const { data: { user }, error } = await getSupabase().auth.getUser();
  if (error || !user) throw new Error('Session requise.');
  return user.id;
}

export async function generatePaymentOrderRef() {
  const year = new Date().getFullYear();
  const prefix = `OP-${year}-`;
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('ref_ordre')
    .like('ref_ordre', `${prefix}%`);
  if (error) throw error;
  let maxSeq = 0;
  for (const row of data || []) {
    const match = String(row.ref_ordre || '').match(/-(\d{3,})$/);
    if (match) maxSeq = Math.max(maxSeq, parseInt(match[1], 10));
  }
  return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
}

export async function assignPaymentOrderRefIfMissing(id, existingRef = '') {
  const current = String(existingRef || '').trim();
  if (current) return current;
  const newRef = await generatePaymentOrderRef();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update({ ref_ordre: newRef })
    .eq('id', id)
    .select('ref_ordre')
    .single();
  if (error) throw error;
  return data.ref_ordre;
}

/** Attribue OP-AAAA-NNN aux ordres existants sans ref_ordre. */
export async function reconcileMissingPaymentOrderRefs() {
  // Uniquement .is(null) — un .eq. vide provoque une erreur 400 PostgREST
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('id, ref_ordre, created_at')
    .is('ref_ordre', null)
    .order('created_at', { ascending: true });
  if (error) {
    console.warn('[CITYMO] reconcile payment order refs query', error);
    return 0;
  }
  const missing = (data || []).filter((row) => !String(row.ref_ordre || '').trim());
  if (!missing.length) return 0;
  let fixed = 0;
  for (const row of missing) {
    await assignPaymentOrderRefIfMissing(row.id, row.ref_ordre);
    fixed += 1;
  }
  return fixed;
}

export async function listPaymentOrders({ reconcileRefs = false } = {}) {
  if (reconcileRefs) {
    await reconcileMissingPaymentOrderRefs().catch((err) => {
      console.warn('[CITYMO] reconcile payment order refs', err);
    });
  }
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .order('date_ordre', { ascending: false });
  if (error) throw error;
  return (data || []).map(normalizePaymentOrder);
}

export async function createPaymentOrder(form) {
  const uid = await requireUser();
  const row = { ...toPaymentOrderRow(form), created_by: uid };
  if (!String(row.ref_ordre || '').trim()) {
    row.ref_ordre = await generatePaymentOrderRef();
  }
  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([row])
    .select()
    .single();
  if (error) throw error;
  const order = normalizePaymentOrder(data);
  await syncPaymentOrderToTransaction(order);
  return order;
}

export async function updatePaymentOrder(id, form) {
  await requireUser();
  const { data: prev } = await getSupabase().from(TABLE).select('statut').eq('id', id).maybeSingle();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(toPaymentOrderRow(form))
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  const order = normalizePaymentOrder(data);
  await syncPaymentOrderToTransaction(order);
  if (order.statut === 'Payé' && normalizePaymentOrderStatut(prev?.statut) !== 'Payé') {
    await syncPaymentOrderPaidOutcome(order);
  }
  return order;
}

export async function deletePaymentOrder(id) {
  await requireUser();
  await getSupabase().from('finance_transactions').delete().eq('payment_order_id', id);
  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) throw error;
}

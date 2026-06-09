/**
 * financeTransactions.js — Journal caisse (entrées / sorties)
 */
import { getSupabase } from '../../lib/supabase';
import { requireSupabaseUserId } from '../supabase/requireUser';

const TABLE = 'finance_transactions';

const PAID_CHARGE_STATUTS = ['Payé', 'Validé', 'Validée', 'Comptabilisée'];
const PAID_ORDER_STATUTS = ['Payé', 'Exécuté', 'Comptabilisé'];

export const TYPES_ENTREE = [
  { value: 'alimentation_caisse', label: 'Alimentation caisse' },
  { value: 'reglement_client', label: 'Règlement client' },
  { value: 'remboursement', label: 'Remboursement' },
  { value: 'autre_entree', label: 'Autre entrée' },
];

export const TYPES_SORTIE = [
  { value: 'charge', label: 'Charge / dépense' },
  { value: 'ordre_paiement', label: 'Ordre de paiement' },
  { value: 'autre_sortie', label: 'Autre sortie' },
];

export function normalizeTransaction(row) {
  if (!row) return null;
  return {
    id: row.id,
    date: row.date_operation || '',
    sens: row.sens || 'sortie',
    type_operation: row.type_operation || 'autre',
    contrepartie: row.contrepartie || '',
    description: row.description || '',
    montant: Number(row.montant) || 0,
    mode_paiement: row.mode_paiement || 'Espèces',
    category_id: row.category_id || null,
    project_id: row.project_id || null,
    vehicle_id: row.vehicle_id || null,
    worker_id: row.worker_id || null,
    client_id: row.client_id || null,
    invoice_id: row.invoice_id || null,
    charge_id: row.charge_id || null,
    payment_order_id: row.payment_order_id || null,
    ref: row.ref_operation || '',
    statut: row.statut || 'Validé',
    created_at: row.created_at,
  };
}

export function toTransactionRow(form) {
  const sens = form.sens || (form.montant_entree ? 'entree' : 'sortie');
  return {
    date_operation: form.date || null,
    sens,
    type_operation: form.type_operation || (sens === 'entree' ? 'autre_entree' : 'autre_sortie'),
    contrepartie: form.contrepartie || null,
    description: (form.description || '').trim(),
    montant: Number(form.montant ?? form.montant_entree ?? form.montant_sortie) || 0,
    mode_paiement: form.mode_paiement || 'Espèces',
    category_id: form.category_id || null,
    project_id: form.project_id || null,
    vehicle_id: form.vehicle_id || null,
    worker_id: form.worker_id || null,
    client_id: form.client_id || null,
    invoice_id: form.invoice_id || null,
    charge_id: form.charge_id || null,
    payment_order_id: form.payment_order_id || null,
    ref_operation: form.ref || null,
    statut: form.statut || 'Validé',
  };
}

export async function listFinanceTransactions({ year, month } = {}) {
  let q = getSupabase().from(TABLE).select('*').order('date_operation', { ascending: true });
  if (year && month) {
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const endMonth = month === 12 ? 1 : month + 1;
    const endYear = month === 12 ? year + 1 : year;
    const end = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;
    q = q.gte('date_operation', start).lt('date_operation', end);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(normalizeTransaction);
}

export async function createFinanceTransaction(form) {
  const uid = await requireSupabaseUserId();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([{ ...toTransactionRow(form), created_by: uid }])
    .select()
    .single();
  if (error) throw error;
  return normalizeTransaction(data);
}

export async function updateFinanceTransaction(id, form) {
  await requireSupabaseUserId();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(toTransactionRow(form))
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return normalizeTransaction(data);
}

export async function deleteFinanceTransaction(id) {
  await requireSupabaseUserId();
  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) throw error;
}

export function computeCashTotals(transactions, balanceRow) {
  const soldeInitial = Number(balanceRow?.solde_initial) || 0;
  const alimentation = Number(balanceRow?.alimentation) || 0;
  let totalEntrees = 0;
  let totalSorties = 0;
  (transactions || []).forEach((t) => {
    if (t.statut === 'Annulé') return;
    if (t.sens === 'entree') totalEntrees += t.montant || 0;
    else totalSorties += t.montant || 0;
  });
  const soldeMois = soldeInitial + alimentation + totalEntrees - totalSorties;
  return { soldeInitial, alimentation, totalEntrees, totalSorties, soldeMois };
}

export async function syncChargeToTransaction(charge) {
  if (!charge?.id) return;
  const paid = PAID_CHARGE_STATUTS.includes(charge.statut);
  const { data: existing } = await getSupabase()
    .from(TABLE)
    .select('id')
    .eq('charge_id', charge.id)
    .maybeSingle();
  if (!paid) {
    if (existing?.id) await getSupabase().from(TABLE).delete().eq('id', existing.id);
    return;
  }
  const row = {
    date_operation: charge.date,
    sens: 'sortie',
    type_operation: 'charge',
    contrepartie: charge.fournisseur || '',
    description: charge.libelle || 'Charge',
    montant: charge.montant,
    mode_paiement: charge.mode_paiement,
    category_id: charge.category_id,
    project_id: charge.project_id,
    vehicle_id: charge.vehicle_id,
    worker_id: charge.worker_id,
    client_id: charge.client_id,
    charge_id: charge.id,
    ref_operation: charge.ref,
    statut: 'Validé',
  };
  if (existing?.id) {
    await getSupabase().from(TABLE).update(row).eq('id', existing.id);
  } else {
    const uid = (await getSupabase().auth.getUser()).data?.user?.id;
    await getSupabase().from(TABLE).insert([{ ...row, created_by: uid }]);
  }
}

export async function syncPaymentOrderToTransaction(order) {
  if (!order?.id) return;
  const paid = PAID_ORDER_STATUTS.includes(order.statut);
  const { data: existing } = await getSupabase()
    .from(TABLE)
    .select('id')
    .eq('payment_order_id', order.id)
    .maybeSingle();
  if (!paid) {
    if (existing?.id) await getSupabase().from(TABLE).delete().eq('id', existing.id);
    return;
  }
  const row = {
    date_operation: order.date || order.date_prevue,
    sens: 'sortie',
    type_operation: 'ordre_paiement',
    contrepartie: order.beneficiaire || '',
    description: order.motif || `Ordre ${order.ref}`,
    montant: order.montant,
    mode_paiement: order.mode_paiement,
    category_id: order.category_id,
    project_id: order.project_id,
    worker_id: order.worker_id,
    client_id: order.client_id,
    payment_order_id: order.id,
    ref_operation: order.ref,
    statut: 'Validé',
  };
  if (existing?.id) {
    await getSupabase().from(TABLE).update(row).eq('id', existing.id);
  } else {
    const uid = (await getSupabase().auth.getUser()).data?.user?.id;
    await getSupabase().from(TABLE).insert([{ ...row, created_by: uid }]);
  }
}

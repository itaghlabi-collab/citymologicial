/**
 * purchasePaymentOrdersAchats.js — Ordres de paiement liés aux achats
 */
import { getSupabase } from '../../lib/supabase';
import { normalizePaymentOrder, toPaymentOrderRow, generatePaymentOrderRef } from '../finance/paymentOrders';
import { syncPaymentOrderPaidOutcome } from '../finance/paymentOrderPaidSync';
import { appendPurchaseRequestHistory } from './purchaseRequestHistory';
import { PURCHASE_ASSIGNEE } from '../../constants/purchaseWorkflow';
import { notifyPaymentOrderCreated, notifyPaymentValidated } from '../notifications/purchaseWorkflowNotifications';

const TABLE = 'payment_orders';

export function normalizeAchatsPaymentOrder(row) {
  const base = normalizePaymentOrder(row);
  if (!base) return null;
  const ht = Number(row.montant_ht) || 0;
  const tva = Number(row.tva_rate) ?? 20;
  const ttc = Number(row.montant) || base.montant || 0;
  return {
    ...base,
    montant_ht: ht || (ttc / (1 + tva / 100)),
    tva_rate: tva,
    montant_ttc: ttc,
    purchase_request_ref: row.purchase_request_ref || '',
    purchase_oa_ref: row.purchase_oa_ref || '',
    observation: row.observation || base.observation || '',
  };
}

export async function listAchatsPaymentOrders() {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .not('purchase_request_id', 'is', null)
    .order('created_at', { ascending: false });
  if (error) {
    if (error.code === '42P01') return [];
    throw error;
  }
  return (data || []).map(normalizeAchatsPaymentOrder);
}

export async function getAchatsPaymentOrder(id) {
  const { data, error } = await getSupabase().from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return normalizeAchatsPaymentOrder(data);
}

export async function createAchatsPaymentOrderFromAcquisition({
  request, oa, quote, userId, projectOverride, amountOverride,
}) {
  const projectId = projectOverride?.project_id ?? request.project_id;
  const montantTtc = amountOverride?.montant_ttc ?? quote.montant_ttc;
  const montantHt = amountOverride?.montant_ht ?? quote.montant_ht;
  const projectLabel = projectOverride?.projet_lie || projectOverride?.project_name || '';
  const motif = projectLabel
    ? `Achat groupé — ${request.ref} — ${projectLabel}`
    : `Achat — ${request.ref} — ${request.titre}`;
  const row = {
    beneficiaire: quote.supplier_name,
    type_benef: 'Fournisseur',
    fournisseur_lie: quote.supplier_name,
    montant: montantTtc,
    montant_ht: montantHt,
    tva_rate: quote.tva_rate,
    date: new Date().toISOString().slice(0, 10),
    date_prevue: new Date().toISOString().slice(0, 10),
    statut: 'À préparer',
    mode_paiement: 'Virement',
    motif,
    commentaire: `OA ${oa.ref} — Demande ${request.ref}`,
    observation: quote.observations || '',
    project_id: projectId,
    supplier_id: quote.supplier_id,
    purchase_request_id: request.id,
    purchase_acquisition_order_id: oa.id,
    purchase_request_ref: request.ref,
    purchase_oa_ref: oa.ref,
  };
  const insertRow = { ...toPaymentOrderRow(row), created_by: userId };
  if (!String(insertRow.ref_ordre || '').trim()) {
    insertRow.ref_ordre = await generatePaymentOrderRef();
  }
  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([insertRow])
    .select()
    .single();
  if (error) throw error;
  const op = normalizeAchatsPaymentOrder(data);
  await appendPurchaseRequestHistory({
    purchaseRequestId: request.id,
    action: 'Création ordre de paiement',
    detail: op.ref,
    userId,
    userName: PURCHASE_ASSIGNEE.label,
  });
  await notifyPaymentOrderCreated(request, oa, op);
  return op;
}

export async function updateAchatsPaymentOrder(id, form) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(toPaymentOrderRow(form))
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return normalizeAchatsPaymentOrder(data);
}

/** Synchronise l'OP achats après modification super admin de la demande d'achat. */
export async function syncAchatsPaymentOrderFromRequest(paymentOrderId, { request, quote, oa }) {
  if (!paymentOrderId || !request) return null;
  const patch = {
    project_id: request.project_id || null,
    purchase_request_ref: request.ref,
    purchase_oa_ref: oa?.ref || null,
    motif: `Achat — ${request.ref} — ${request.titre}`,
    commentaire: oa ? `OA ${oa.ref} — Demande ${request.ref}` : `Demande ${request.ref}`,
  };
  if (quote) {
    patch.beneficiaire = quote.supplier_name;
    patch.type_beneficiaire = 'Fournisseur';
    patch.fournisseur_lie = quote.supplier_name;
    patch.montant = quote.montant_ttc;
    patch.montant_ht = quote.montant_ht;
    patch.tva_rate = quote.tva_rate;
    patch.supplier_id = quote.supplier_id || null;
    patch.observation = quote.observations || null;
  }
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(patch)
    .eq('id', paymentOrderId)
    .select()
    .single();
  if (error) throw error;
  const updated = normalizeAchatsPaymentOrder(data);
  const { syncPaymentOrderToTransaction } = await import('../finance/financeTransactions');
  await syncPaymentOrderToTransaction(updated);
  return updated;
}

export async function validateAchatsPaymentOrder(id, userName) {
  const op = await getAchatsPaymentOrder(id);
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update({ statut: 'Validé', valide_par: userName })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  const updated = normalizeAchatsPaymentOrder(data);
  if (op.purchase_request_id) {
    await appendPurchaseRequestHistory({
      purchaseRequestId: op.purchase_request_id,
      action: 'Validation paiement',
      detail: updated.ref,
      userName,
    });
    await notifyPaymentValidated(updated);
  }
  return updated;
}

export async function markAchatsPaymentOrderPaid(id, userName) {
  const op = await getAchatsPaymentOrder(id);
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update({
      statut: 'Payé',
      date_paiement: new Date().toISOString().slice(0, 10),
      valide_par: userName,
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  const updated = normalizeAchatsPaymentOrder(data);
  const { syncPaymentOrderToTransaction } = await import('../finance/financeTransactions');
  await syncPaymentOrderToTransaction(updated);
  await syncPaymentOrderPaidOutcome(updated);
  if (op.purchase_request_id) {
    await appendPurchaseRequestHistory({
      purchaseRequestId: op.purchase_request_id,
      action: 'Paiement effectué',
      detail: updated.ref,
      userName,
    });
  }
  return updated;
}

export async function submitAchatsPaymentForDgValidation(id) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update({ statut: 'En attente validation DG' })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return normalizeAchatsPaymentOrder(data);
}

export async function deleteAchatsPaymentOrder(id) {
  const { data: { user }, error: authError } = await getSupabase().auth.getUser();
  if (authError || !user) throw new Error('Session requise.');
  const op = await getAchatsPaymentOrder(id);
  if (!op) {
    const err = new Error('Ordre de paiement introuvable.');
    err.code = 'VALIDATION';
    throw err;
  }
  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) throw error;
  if (op.purchase_request_id) {
    await getSupabase()
      .from('purchase_requests')
      .update({ payment_order_id: null })
      .eq('id', op.purchase_request_id);
  }
}

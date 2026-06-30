/**
 * purchaseAcquisitionOrders.js — Ordres d'achat (OA) persistés Supabase
 */
import { getSupabase } from '../../lib/supabase';

import { PURCHASE_ASSIGNEE } from '../../constants/purchaseWorkflow';

const TABLE = 'purchase_acquisition_orders';

export function normalizeAcquisitionOrder(row) {
  if (!row) return null;
  return {
    id: row.id,
    ref: row.ref_oa || '',
    ref_oa: row.ref_oa || '',
    purchase_request_id: row.purchase_request_id,
    quote_id: row.quote_id,
    supplier_id: row.supplier_id,
    supplier_name: row.supplier_name || '',
    fournisseur: row.supplier_name || '',
    project_id: row.project_id,
    project_ref: row.project_ref || '',
    project_name: row.project_name || '',
    projet_lie: row.project_ref && row.project_name ? `${row.project_ref} — ${row.project_name}` : row.project_name || '',
    objet: row.objet || '',
    montant_ht: Number(row.montant_ht) || 0,
    tva_rate: Number(row.tva_rate) || 20,
    tva: Number(row.tva_rate) || 20,
    montant_ttc: Number(row.montant_ttc) || 0,
    delai: row.delai || '',
    conditions_paiement: row.conditions_paiement || '',
    garantie: row.garantie || '',
    mode_paiement: row.mode_paiement || '',
    date_livraison: row.date_livraison || '',
    statut: row.statut || 'Brouillon',
    payment_order_id: row.payment_order_id,
    purchase_request_ref: row.purchase_request_ref || row.payload?.purchase_request_ref || '',
    responsable_achats: row.responsable_achats || PURCHASE_ASSIGNEE.label,
    attachment_url: row.attachment_url || '',
    lines: row.lines || [],
    date_creation: row.created_at ? String(row.created_at).slice(0, 10) : '',
    created_at: row.created_at,
  };
}

export async function generateAcquisitionOrderRef() {
  const year = new Date().getFullYear();
  const prefix = `OA-${year}-`;
  const { count, error } = await getSupabase()
    .from(TABLE)
    .select('*', { count: 'exact', head: true })
    .like('ref_oa', `${prefix}%`);
  if (error) throw error;
  return `${prefix}${String((count || 0) + 1).padStart(3, '0')}`;
}

async function requireUser() {
  const { data: { user }, error } = await getSupabase().auth.getUser();
  if (error || !user) throw new Error('Session requise.');
  return user;
}

export async function listAcquisitionOrders() {
  await requireUser();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false });
  if (error) {
    if (error.code === '42P01') return [];
    throw error;
  }
  return (data || []).map(normalizeAcquisitionOrder);
}

export async function getAcquisitionOrder(id) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return normalizeAcquisitionOrder(data);
}

export async function createAcquisitionOrderFromQuote({ request, quote, userId }) {
  const ref = await generateAcquisitionOrderRef();
  const row = {
    ref_oa: ref,
    purchase_request_id: request.id,
    quote_id: quote.id,
    supplier_id: quote.supplier_id || null,
    supplier_name: quote.supplier_name,
    project_id: request.project_id || null,
    project_ref: request.project_ref || null,
    project_name: request.project_name || null,
    objet: request.titre || '',
    montant_ht: quote.montant_ht,
    tva_rate: quote.tva_rate,
    montant_ttc: quote.montant_ttc,
    delai: quote.delai || null,
    conditions_paiement: quote.conditions_paiement || null,
    garantie: quote.garantie || null,
    mode_paiement: quote.conditions_paiement || null,
    statut: 'Brouillon',
    lines: request.payload?.lines || [],
    purchase_request_ref: request.ref,
    responsable_achats: PURCHASE_ASSIGNEE.label,
    attachment_url: quote.attachment_url || null,
    payload: {
      purchase_request_ref: request.ref,
      quote_id: quote.id,
    },
    created_by: userId,
  };
  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([row])
    .select()
    .single();
  if (error) throw error;
  return normalizeAcquisitionOrder(data);
}

export async function updateAcquisitionOrder(id, patch) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return normalizeAcquisitionOrder(data);
}

export async function updateAcquisitionOrderStatus(id, statut) {
  const oa = await updateAcquisitionOrder(id, { statut });
  try {
    const { syncPurchaseRequestFromAcquisitionOrder } = await import('./purchaseWorkflow');
    await syncPurchaseRequestFromAcquisitionOrder(oa);
  } catch (err) {
    console.warn('[CITYMO] syncPurchaseRequestFromAcquisitionOrder', err);
  }
  return oa;
}

export async function linkPaymentOrderToAcquisition(acquisitionOrderId, paymentOrderId) {
  const { error } = await getSupabase()
    .from(TABLE)
    .update({ payment_order_id: paymentOrderId })
    .eq('id', acquisitionOrderId);
  if (error) throw error;
}

export async function deleteAcquisitionOrder(id) {
  await requireUser();
  const oa = await getAcquisitionOrder(id);
  if (!oa) {
    const err = new Error('Ordre d\'achat introuvable.');
    err.code = 'VALIDATION';
    throw err;
  }
  if (oa.statut !== 'Brouillon') {
    const err = new Error('Seuls les ordres d\'achat en brouillon peuvent être supprimés.');
    err.code = 'VALIDATION';
    throw err;
  }
  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) throw error;
  if (oa.purchase_request_id) {
    await getSupabase()
      .from('purchase_requests')
      .update({ acquisition_order_id: null })
      .eq('id', oa.purchase_request_id)
      .eq('acquisition_order_id', id);
  }
}

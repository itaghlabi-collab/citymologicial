/**
 * purchaseRequestQuotes.js — Devis fournisseurs liés à une demande d'achat
 */
import { getSupabase } from '../../lib/supabase';
import { QUOTE_STATUSES } from '../../constants/purchaseWorkflow';

const TABLE = 'purchase_request_quotes';

export function normalizeQuote(row) {
  if (!row) return null;
  const ht = Number(row.montant_ht) || 0;
  const tva = Number(row.tva_rate) ?? 20;
  const ttc = Number(row.montant_ttc) || ht * (1 + tva / 100);
  return {
    id: row.id,
    purchase_request_id: row.purchase_request_id,
    supplier_id: row.supplier_id || null,
    supplier_name: row.supplier_name || '',
    fournisseur: row.supplier_name || '',
    montant_ht: ht,
    tva_rate: tva,
    tva: tva,
    montant_ttc: ttc,
    delai: row.delai || '',
    validite: row.validite || '',
    conditions_paiement: row.conditions_paiement || '',
    garantie: row.garantie || '',
    observations: row.observations || '',
    attachment_url: row.attachment_url || '',
    statut: row.statut || QUOTE_STATUSES.ACTIF,
    selected: row.statut === QUOTE_STATUSES.RETENU,
    verrouille: row.statut === QUOTE_STATUSES.VERROUILLE,
    created_at: row.created_at,
  };
}

export function toQuoteRow(form, purchaseRequestId) {
  const ht = Number(form.montant_ht) || 0;
  const tva = Number(form.tva_rate ?? form.tva) || 0;
  const ttc = form.montant_ttc != null && form.montant_ttc !== ''
    ? Number(form.montant_ttc)
    : ht * (1 + tva / 100);
  return {
    purchase_request_id: purchaseRequestId,
    supplier_id: form.supplier_id || null,
    supplier_name: (form.supplier_name || form.fournisseur || '').trim(),
    montant_ht: ht,
    tva_rate: tva,
    montant_ttc: ttc,
    delai: form.delai?.trim() || null,
    validite: form.validite?.trim() || null,
    conditions_paiement: form.conditions_paiement?.trim() || null,
    garantie: form.garantie?.trim() || null,
    observations: form.observations?.trim() || null,
    attachment_url: form.attachment_url?.trim() || null,
    statut: form.statut || QUOTE_STATUSES.ACTIF,
  };
}

async function requireUser() {
  const { data: { user }, error } = await getSupabase().auth.getUser();
  if (error || !user) throw new Error('Session requise.');
  return user;
}

export async function listQuotesForRequest(purchaseRequestId) {
  if (!purchaseRequestId) return [];
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .eq('purchase_request_id', purchaseRequestId)
    .order('created_at', { ascending: true });
  if (error) {
    if (error.code === '42P01') return [];
    throw error;
  }
  return (data || []).map(normalizeQuote);
}

export async function createPurchaseRequestQuote(purchaseRequestId, form) {
  const user = await requireUser();
  const row = toQuoteRow(form, purchaseRequestId);
  if (!row.supplier_name) {
    const err = new Error('Le fournisseur est obligatoire.');
    err.code = 'VALIDATION';
    throw err;
  }
  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([{ ...row, created_by: user.id }])
    .select()
    .single();
  if (error) throw error;
  return normalizeQuote(data);
}

export async function updatePurchaseRequestQuote(id, form) {
  await requireUser();
  const row = toQuoteRow(form, form.purchase_request_id);
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(row)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return normalizeQuote(data);
}

export async function deletePurchaseRequestQuote(id) {
  await requireUser();
  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) throw error;
}

export async function lockOtherQuotes(purchaseRequestId, selectedQuoteId) {
  if (!purchaseRequestId) return;
  const { data: quotes } = await getSupabase()
    .from(TABLE)
    .select('id, statut')
    .eq('purchase_request_id', purchaseRequestId);
  for (const q of quotes || []) {
    const statut = q.id === selectedQuoteId ? QUOTE_STATUSES.RETENU : QUOTE_STATUSES.VERROUILLE;
    await getSupabase().from(TABLE).update({ statut }).eq('id', q.id);
  }
}

/**
 * purchaseRequestQuotes.js — Devis fournisseurs liés à une demande d'achat
 */
import { getSupabase } from '../../lib/supabase';
import { QUOTE_STATUSES } from '../../constants/purchaseWorkflow';
import Big from 'big.js';
import { moneyLineHt, moneyRound2, moneyVatFromHt } from '../../utils/decimalMoney';

const TABLE = 'purchase_request_quotes';

function lineId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export const EMPTY_QUOTE_LINE = () => ({
  id: lineId(),
  reference: '',
  designation: '',
  quantite: '',
  unite: 'u',
  prix_unitaire_ht: '',
  remise_pct: '',
  montant_ht: '',
});

export function computeQuoteLineTotal(line) {
  const ht = moneyLineHt({
    qty: line?.quantite,
    unitPriceHt: line?.prix_unitaire_ht,
    remisePct: line?.remise_pct,
  });
  return Number(moneyRound2(ht).toString());
}

export function normalizeQuoteLines(raw) {
  const arr = Array.isArray(raw) ? raw : [];
  if (!arr.length) return [];
  return arr.map((l) => {
    const montant = l.montant_ht != null && l.montant_ht !== ''
      ? Number(l.montant_ht) || 0
      : computeQuoteLineTotal(l);
    return {
      id: l.id || lineId(),
      reference: l.reference || '',
      designation: l.designation || '',
      quantite: l.quantite ?? '',
      unite: l.unite || 'u',
      prix_unitaire_ht: l.prix_unitaire_ht ?? '',
      remise_pct: l.remise_pct ?? '',
      montant_ht: montant,
    };
  });
}

export function sumQuoteLinesHt(lines) {
  const normalized = normalizeQuoteLines(lines);
  const sum = normalized.reduce((s, l) => s.plus(new Big(l.montant_ht || 0)), new Big(0));
  return Number(moneyRound2(sum).toString());
}

export function formatQuoteReferencesSummary(lines) {
  const normalized = normalizeQuoteLines(lines);
  if (!normalized.length) return '';
  const labels = normalized
    .map((l) => l.reference || l.designation)
    .filter(Boolean);
  if (labels.length) return labels.join(', ');
  return `${normalized.length} réf.`;
}

export function normalizeQuote(row) {
  if (!row) return null;
  const lines = normalizeQuoteLines(row.lines);
  const htFromLines = lines.length ? sumQuoteLinesHt(lines) : 0;
  const ht = htFromLines > 0 ? htFromLines : (Number(row.montant_ht) || 0);
  const tva = Number(row.tva_rate) ?? 20;
  const ttc = Number(row.montant_ttc) || Number(moneyRound2(new Big(ht).plus(moneyVatFromHt(new Big(ht), tva))).toString());
  return {
    id: row.id,
    purchase_request_id: row.purchase_request_id,
    supplier_id: row.supplier_id || null,
    ref_devis_fournisseur: row.ref_devis_fournisseur || '',
    ref_devis: row.ref_devis_fournisseur || '',
    supplier_name: row.supplier_name || '',
    fournisseur: row.supplier_name || '',
    lines,
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
  const lines = normalizeQuoteLines(form.lines);
  const htFromLines = sumQuoteLinesHt(lines);
  const ht = htFromLines > 0 ? htFromLines : (Number(form.montant_ht) || 0);
  const tva = Number(form.tva_rate ?? form.tva) || 0;
  const ttc = form.montant_ttc != null && form.montant_ttc !== ''
    ? Number(form.montant_ttc)
    : Number(moneyRound2(new Big(ht).plus(moneyVatFromHt(new Big(ht), tva))).toString());
  return {
    purchase_request_id: purchaseRequestId,
    supplier_id: form.supplier_id || null,
    supplier_name: (form.supplier_name || form.fournisseur || '').trim(),
    ref_devis_fournisseur: (form.ref_devis_fournisseur || form.ref_devis || '').trim() || null,
    lines,
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

export async function getPurchaseRequestQuote(id) {
  if (!id) return null;
  const { data, error } = await getSupabase().from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return normalizeQuote(data);
}

/** Tous les devis avec infos demande — pour Comparaison devis */
export async function listAllQuotesForComparison() {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select(`
      *,
      purchase_requests (
        id, ref_demande, titre, statut, project_ref, project_name, requester_name
      )
    `)
    .order('created_at', { ascending: false });
  if (error) {
    if (error.code === '42P01') return [];
    throw error;
  }
  return (data || []).map((row) => {
    const q = normalizeQuote(row);
    const req = row.purchase_requests || {};
    return {
      ...q,
      request_id: req.id || row.purchase_request_id,
      request_ref: req.ref_demande || '',
      request_titre: req.titre || '',
      request_statut: req.statut || '',
      project_ref: req.project_ref || '',
      project_name: req.project_name || '',
      requester_name: req.requester_name || '',
    };
  });
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

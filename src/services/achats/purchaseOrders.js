/**
 * purchaseOrders.js — Bons de commande (Supabase purchase_orders)
 */
import { getSupabase } from '../../lib/supabase';
import { moneyLineHt, moneyComputeDocumentTotals, moneyToNumber } from '../../utils/decimalMoney';

const TABLE = 'purchase_orders';

const EMPTY_LIGNE = {
  type: 'article', designation: '', description: '', categorie_id: '', article_id: '',
  qte: 1, unite: 'unite', prix_ht: 0, remise: 0, tva: 20, ephemeral: false,
};

function lineHt(l) {
  const t = l.type || 'article';
  if (t === 'titre' || t === 'sous_titre') return 0;
  return moneyToNumber(moneyLineHt({
    qty: l.qte,
    unitPriceHt: l.prix_ht,
    remisePct: l.remise,
  }));
}

function lineId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Ligne exploitable (exclut les lignes fantômes vides). */
export function isMeaningfulBCLigne(l) {
  if (!l) return false;
  const t = l.type || 'article';
  if (t === 'titre' || t === 'sous_titre') return !!String(l.designation || '').trim();
  return !!String(l.designation || '').trim();
}

export function sanitizeBCLignes(lignes) {
  return (lignes || []).filter(isMeaningfulBCLigne);
}

function normalizeLines(raw) {
  const arr = Array.isArray(raw) ? raw : [];
  return sanitizeBCLignes(arr.map((l) => ({
    id: l.id || lineId(),
    type: l.type || 'article',
    ephemeral: l.ephemeral ?? false,
    categorie_id: l.categorie_id || '',
    article_id: l.article_id || '',
    designation: l.designation || '',
    description: l.description || '',
    qte: l.qte ?? l.quantite ?? 1,
    unite: l.unite || 'unite',
    prix_ht: l.prix_ht ?? '',
    remise: l.remise ?? 0,
    tva: l.tva ?? 20,
  })));
}

export function computeLineTotals(lignes) {
  return moneyComputeDocumentTotals(lignes, (l) => {
    const t = l.type || 'article';
    if (t === 'titre' || t === 'sous_titre') return null;
    return {
      qty: l.qte,
      unitPriceHt: l.prix_ht,
      tvaPct: l.tva,
      remisePct: l.remise,
    };
  });
}

export function normalizePurchaseOrder(row) {
  if (!row) return null;
  const lignes = normalizeLines(row.lines);
  const totals = computeLineTotals(lignes);
  return {
    id: row.id,
    ref: row.ref_bc || '',
    ref_bc: row.ref_bc || '',
    supplier_id: row.supplier_id || null,
    fournisseur: row.supplier_name || '',
    supplier_name: row.supplier_name || '',
    date: row.order_date || '',
    order_date: row.order_date || '',
    date_livraison: row.delivery_date || '',
    delivery_date: row.delivery_date || '',
    devise: row.currency || 'MAD',
    currency: row.currency || 'MAD',
    note: row.note || '',
    statut: row.status || 'Brouillon',
    status: row.status || 'Brouillon',
    lignes,
    lines: lignes,
    subtotal_ht: Number(row.subtotal_ht ?? totals.subtotal_ht),
    total_vat: Number(row.total_vat ?? totals.total_vat),
    total_ttc: Number(row.total_ttc ?? totals.total_ttc),
    date_creation: row.created_at ? String(row.created_at).slice(0, 10) : '',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function toPurchaseOrderRow(form) {
  const lignes = normalizeLines(form.lignes || form.lines);
  const totals = computeLineTotals(lignes);
  const supplierName = (form.fournisseur || form.supplier_name || '').trim();

  return {
    ref_bc: form.ref || form.ref_bc || null,
    supplier_id: form.supplier_id || null,
    supplier_name: supplierName || null,
    order_date: form.date || form.order_date || null,
    delivery_date: form.date_livraison || form.delivery_date || null,
    currency: form.devise || form.currency || 'MAD',
    note: form.note?.trim() || null,
    status: form.statut || form.status || 'Brouillon',
    subtotal_ht: totals.subtotal_ht,
    total_vat: totals.total_vat,
    total_ttc: form.total_ttc != null ? Number(form.total_ttc) : totals.total_ttc,
    lines: lignes.map(({
      id, type, ephemeral, categorie_id, article_id, designation, description, qte, unite, prix_ht, remise, tva,
    }) => ({
      id,
      type: type || 'article',
      ephemeral: !!ephemeral,
      categorie_id: categorie_id || null,
      article_id: article_id || null,
      designation: designation || '',
      description: description || '',
      qte: Number(qte) || 0,
      unite: unite || 'unite',
      // garder la saisie (string possible avec virgule) : les calculs savent parser
      prix_ht: prix_ht === '' || prix_ht == null ? '' : String(prix_ht),
      remise: Number(remise) || 0,
      tva: Number(tva) || 0,
    })),
  };
}

async function requireUser() {
  const { data: { user }, error } = await getSupabase().auth.getUser();
  if (error || !user) throw new Error('Session requise.');
  return user.id;
}

export async function generatePurchaseOrderRef() {
  const year = new Date().getFullYear();
  const prefix = `BC-${year}-`;
  const { count, error } = await getSupabase()
    .from(TABLE)
    .select('*', { count: 'exact', head: true })
    .like('ref_bc', `${prefix}%`);
  if (error) throw error;
  const seq = String((count || 0) + 1).padStart(3, '0');
  return `${prefix}${seq}`;
}

export async function listPurchaseOrders() {
  await requireUser();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(normalizePurchaseOrder);
}

export async function createPurchaseOrder(form) {
  const uid = await requireUser();
  const row = toPurchaseOrderRow(form);
  if (!row.ref_bc) row.ref_bc = await generatePurchaseOrderRef();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([{ ...row, created_by: uid }])
    .select()
    .single();
  if (error) throw error;
  return normalizePurchaseOrder(data);
}

export async function updatePurchaseOrder(id, form) {
  await requireUser();
  const row = toPurchaseOrderRow(form);
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(row)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return normalizePurchaseOrder(data);
}

export async function deletePurchaseOrder(id) {
  await requireUser();
  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) throw error;
}

export async function duplicatePurchaseOrder(source) {
  const copy = {
    ...source,
    ref: null,
    ref_bc: null,
    statut: 'Brouillon',
    status: 'Brouillon',
  };
  return createPurchaseOrder(copy);
}

export function exportPurchaseOrdersCsv(orders) {
  const headers = [
    'Référence', 'Fournisseur', 'Date commande', 'Date livraison', 'Devise',
    'Sous-total HT', 'TVA', 'Total TTC', 'Statut', 'Note',
  ];
  const esc = (v) => {
    const s = String(v ?? '');
    return s.includes(';') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = (orders || []).map((o) => [
    o.ref,
    o.fournisseur,
    o.date || o.order_date,
    o.date_livraison || o.delivery_date,
    o.devise,
    o.subtotal_ht?.toFixed?.(2) ?? o.subtotal_ht,
    o.total_vat?.toFixed?.(2) ?? o.total_vat,
    o.total_ttc?.toFixed?.(2) ?? o.total_ttc,
    o.statut,
    o.note,
  ]);
  const csv = '\uFEFF' + [headers, ...rows].map((r) => r.map(esc).join(';')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bons-commande-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * purchaseOrderRetrievals.js — Suivi des réceptions BC (visibilité uniquement).
 *
 * Lit les bons de commande en lecture seule.
 * Écrit UNIQUEMENT dans public.purchase_order_retrievals.
 * Ne touche ni stock, ni mouvements, ni finance, ni purchase_orders.
 */
import { getSupabase } from '../../lib/supabase';
import { listPurchaseOrders, isMeaningfulBCLigne } from './purchaseOrders';

const TABLE = 'purchase_order_retrievals';

export const RETRIEVAL_STATUS = {
  A_RECUPERER: 'À récupérer',
  PARTIEL: 'Partiellement récupéré',
  RECUPERE: 'Récupéré',
};

export const RETRIEVAL_STATUS_BADGE = {
  [RETRIEVAL_STATUS.A_RECUPERER]: 'badge-orange',
  [RETRIEVAL_STATUS.PARTIEL]: 'badge-blue',
  [RETRIEVAL_STATUS.RECUPERE]: 'badge-green',
};

function isArticleLine(line) {
  if (!isMeaningfulBCLigne(line)) return false;
  const t = line.type || 'article';
  return t !== 'titre' && t !== 'sous_titre';
}

function lineKey(line, index) {
  return String(line?.id || `idx-${index}`);
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function clampRetrieved(qty, ordered) {
  const q = Math.max(0, num(qty));
  const o = Math.max(0, num(ordered));
  if (o <= 0) return 0;
  return Math.min(q, o);
}

export function computeRetrievalStatus({ qtyOrdered, qtyRetrieved }) {
  const ordered = Math.max(0, num(qtyOrdered));
  const retrieved = Math.max(0, num(qtyRetrieved));
  if (ordered <= 0) return RETRIEVAL_STATUS.RECUPERE;
  if (retrieved <= 0) return RETRIEVAL_STATUS.A_RECUPERER;
  if (retrieved + 1e-9 >= ordered) return RETRIEVAL_STATUS.RECUPERE;
  return RETRIEVAL_STATUS.PARTIEL;
}

export function computeRetrievalPct({ qtyOrdered, qtyRetrieved }) {
  const ordered = Math.max(0, num(qtyOrdered));
  if (ordered <= 0) return 100;
  const retrieved = Math.max(0, Math.min(num(qtyRetrieved), ordered));
  return Math.round((retrieved / ordered) * 1000) / 10;
}

function extractProjectLabel(order) {
  const note = String(order?.note || '');
  const m = note.match(/projet\s*[:=]\s*(.+)/i);
  if (m?.[1]) return m[1].trim().split('|')[0].trim();
  return '';
}

async function listRetrievalRows() {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*');
  if (error) throw error;
  return data || [];
}

function buildOrderView(order, retrievalByLine) {
  const articleLines = (order.lignes || order.lines || [])
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => isArticleLine(line));

  let qtyOrdered = 0;
  let qtyRetrieved = 0;
  let lastUpdate = null;
  let incompleteLines = 0;

  const lines = articleLines.map(({ line, index }) => {
    const key = lineKey(line, index);
    const row = retrievalByLine.get(key) || null;
    const ordered = Math.max(0, num(line.qte));
    const retrieved = clampRetrieved(row?.qty_retrieved, ordered);
    qtyOrdered += ordered;
    qtyRetrieved += retrieved;
    if (retrieved + 1e-9 < ordered) incompleteLines += 1;
    const updated = row?.updated_at || row?.retrieved_at || null;
    if (updated && (!lastUpdate || String(updated) > String(lastUpdate))) {
      lastUpdate = updated;
    }
    return {
      line_id: key,
      designation: line.designation || '—',
      unite: line.unite || 'U',
      qty_ordered: ordered,
      qty_retrieved: retrieved,
      done: ordered > 0 && retrieved + 1e-9 >= ordered,
      retrieved_at: row?.retrieved_at || '',
      retrieved_by: row?.retrieved_by || '',
      observation: row?.observation || '',
      updated_at: row?.updated_at || null,
    };
  });

  const statut = computeRetrievalStatus({ qtyOrdered, qtyRetrieved });
  const pct = computeRetrievalPct({ qtyOrdered, qtyRetrieved });

  return {
    id: order.id,
    ref: order.ref || order.ref_bc || '',
    fournisseur: order.fournisseur || order.supplier_name || '—',
    supplier_id: order.supplier_id || null,
    projet: extractProjectLabel(order) || '—',
    date_commande: order.date || order.order_date || '',
    montant: Number(order.total_ttc) || 0,
    devise: order.devise || order.currency || 'MAD',
    statut_recuperation: statut,
    pourcentage: pct,
    qty_ordered: qtyOrdered,
    qty_retrieved: qtyRetrieved,
    articles_restants: incompleteLines,
    derniere_maj: lastUpdate ? String(lastUpdate).slice(0, 16).replace('T', ' ') : '—',
    derniere_maj_raw: lastUpdate,
    lines,
  };
}

/** Liste BC enrichis pour le suivi récupération (lecture BC + table dédiée). */
export async function listSuiviReceptions() {
  const [orders, rows] = await Promise.all([
    listPurchaseOrders(),
    listRetrievalRows(),
  ]);

  const byOrder = new Map();
  for (const row of rows) {
    const oid = String(row.purchase_order_id);
    if (!byOrder.has(oid)) byOrder.set(oid, new Map());
    byOrder.get(oid).set(String(row.line_id), row);
  }

  return (orders || [])
    .map((order) => buildOrderView(order, byOrder.get(String(order.id)) || new Map()))
    .sort((a, b) => String(b.date_commande || '').localeCompare(String(a.date_commande || '')));
}

export function filterSuiviReceptions(rows, {
  statut = '',
  fournisseur = '',
  projet = '',
  dateFrom = '',
  dateTo = '',
  search = '',
} = {}) {
  const q = String(search || '').toLowerCase().trim();
  return (rows || []).filter((r) => {
    if (statut && r.statut_recuperation !== statut) return false;
    if (fournisseur && r.fournisseur !== fournisseur) return false;
    if (projet && projet !== '—' && r.projet !== projet) return false;
    if (dateFrom && String(r.date_commande || '') < dateFrom) return false;
    if (dateTo && String(r.date_commande || '') > dateTo) return false;
    if (q) {
      const hay = `${r.ref} ${r.fournisseur} ${r.projet}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function buildSuiviKpis(rows) {
  const list = rows || [];
  return {
    a_recuperer: list.filter((r) => r.statut_recuperation === RETRIEVAL_STATUS.A_RECUPERER).length,
    partiel: list.filter((r) => r.statut_recuperation === RETRIEVAL_STATUS.PARTIEL).length,
    recupere: list.filter((r) => r.statut_recuperation === RETRIEVAL_STATUS.RECUPERE).length,
    articles_restants: list.reduce((s, r) => s + (Number(r.articles_restants) || 0), 0),
  };
}

/**
 * Enregistre / met à jour la quantité récupérée d'une ligne.
 * N'écrit QUE dans purchase_order_retrievals.
 */
export async function upsertLineRetrieval({
  purchaseOrderId,
  lineId,
  qtyRetrieved,
  qtyOrdered,
  retrievedBy,
  observation,
  retrievedAt,
}) {
  if (!purchaseOrderId || !lineId) {
    throw new Error('Bon de commande / ligne requis.');
  }
  const qty = clampRetrieved(qtyRetrieved, qtyOrdered);
  const payload = {
    purchase_order_id: purchaseOrderId,
    line_id: String(lineId),
    qty_retrieved: qty,
    retrieved_at: retrievedAt || new Date().toISOString().slice(0, 10),
    retrieved_by: (retrievedBy || '').trim() || null,
    observation: (observation || '').trim() || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await getSupabase()
    .from(TABLE)
    .upsert(payload, { onConflict: 'purchase_order_id,line_id' })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

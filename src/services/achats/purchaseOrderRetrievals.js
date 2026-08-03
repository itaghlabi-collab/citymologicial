/**
 * purchaseOrderRetrievals.js — Suivi des réceptions (visibilité uniquement).
 *
 * Source : Ordres d'achat (statut technique « Validé » uniquement).
 * Écrit UNIQUEMENT dans public.purchase_acquisition_order_retrievals.
 * Ne touche ni stock, ni mouvements, ni finance, ni purchase_orders, ni OA métier.
 * Table BC purchase_order_retrievals conservée (non utilisée ici).
 */
import { getSupabase } from '../../lib/supabase';
import {
  listAcquisitionOrders,
  acquisitionOrderProjectLabel,
} from './purchaseAcquisitionOrders';

const TABLE = 'purchase_acquisition_order_retrievals';

/** Seul statut OA affiché dans le Suivi des réceptions. */
export const OA_SUIVI_STATUT = 'Validé';

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

const WHOLE_LINE_ID = '__whole__';

/** Normalise une chaîne pour un line_id TEXT déterministe (sans accents / espaces). */
function normalizeToken(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
}

/**
 * Identifiant stable d'une ligne OA pour la check-list.
 * Ne dépend pas de l'ordre du tableau tant qu'un id / article / source / contenu distinct existe.
 * L'index n'est utilisé qu'en dernier recours absolu.
 */
export function buildStableLineId(line, index = 0) {
  if (!line || typeof line !== 'object') {
    return `idx-${index}`;
  }

  // 1. Identifiants explicites
  const explicitId = line.id ?? line.line_id;
  if (explicitId != null && String(explicitId).trim() !== '') {
    return String(explicitId).trim();
  }

  const articleId = line.article_id ?? line.articleId;
  if (articleId != null && String(articleId).trim() !== '') {
    return `art-${String(articleId).trim()}`;
  }

  const sourceId = line.source_line_id
    ?? line.da_line_id
    ?? line.purchase_request_line_id
    ?? line.sourceLineId;
  if (sourceId != null && String(sourceId).trim() !== '') {
    return `src-${String(sourceId).trim()}`;
  }

  // 2. Clé déterministe sur données stables (indépendante de l'index / ordre)
  const ref = normalizeToken(line.reference || line.ref || line.article_ref || line.code);
  const designation = normalizeToken(line.designation || line.libelle || line.label);
  const unit = normalizeToken(line.unite || line.unit || 'u') || 'u';
  const qty = normalizeToken(line.quantite ?? line.quantite_demandee ?? line.qte ?? line.qty ?? '');
  const project = normalizeToken(line.project_id || line.project_ref || '');
  const comment = normalizeToken(line.commentaire || line.comment || '');

  const parts = [ref, designation, unit];
  // Suffixe déterministe pour distinguer deux lignes au contenu quasi-identique
  if (qty) parts.push(`q${qty}`);
  if (project) parts.push(`p${project}`);
  if (comment) parts.push(`c${comment}`);

  const contentKey = parts.filter(Boolean).join('-');
  if (contentKey && (designation || ref)) {
    return contentKey.slice(0, 200);
  }

  // 3. Dernier recours absolu
  return `idx-${index}`;
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

function lineOrderedQty(line) {
  return Math.max(0, num(
    line?.quantite ?? line?.quantite_demandee ?? line?.qte ?? line?.qty,
  ));
}

function isMeaningfulOaLine(line) {
  if (!line || typeof line !== 'object') return false;
  const t = line.type || 'article';
  if (t === 'titre' || t === 'sous_titre') return false;
  return Boolean(String(line.designation || line.reference || '').trim());
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

async function listRetrievalRows() {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*');
  if (error) throw error;
  return data || [];
}

function buildOaView(oa, retrievalByLine) {
  const rawLines = Array.isArray(oa.lines) ? oa.lines : [];
  const articleLines = rawLines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => isMeaningfulOaLine(line));

  const baseLines = articleLines.length > 0
    ? articleLines.map(({ line, index }) => ({
      line_id: buildStableLineId(line, index),
      designation: String(line.designation || line.reference || '—').trim() || '—',
      unite: line.unite || line.unit || 'u',
      qty_ordered: lineOrderedQty(line),
      _sortKey: [
        normalizeToken(line.designation),
        normalizeToken(line.unite || line.unit),
        normalizeToken(line.quantite ?? line.qte ?? ''),
        normalizeToken(line.project_id || line.project_ref || ''),
        normalizeToken(line.commentaire || ''),
        normalizeToken(line.reference || ''),
        String(index), // départage ultime uniquement si tout le reste est identique
      ].join('|'),
    }))
    : [{
      line_id: WHOLE_LINE_ID,
      designation: oa.objet || 'Ordre d\'achat récupéré',
      unite: 'u',
      qty_ordered: 1,
      _sortKey: WHOLE_LINE_ID,
    }];

  // Collisions de contenu : suffixe --dupN selon un tri déterministe (pas l'ordre du tableau)
  const byKey = new Map();
  for (const base of baseLines) {
    if (base.line_id === WHOLE_LINE_ID || String(base.line_id).startsWith('idx-')) continue;
    if (!byKey.has(base.line_id)) byKey.set(base.line_id, []);
    byKey.get(base.line_id).push(base);
  }
  for (const group of byKey.values()) {
    if (group.length <= 1) continue;
    group.sort((a, b) => String(a._sortKey).localeCompare(String(b._sortKey)));
    group.forEach((base, i) => {
      base.line_id = `${base.line_id}--dup${i + 1}`;
    });
  }
  for (const base of baseLines) delete base._sortKey;

  let qtyOrdered = 0;
  let qtyRetrieved = 0;
  let lastUpdate = null;
  let incompleteLines = 0;

  const lines = baseLines.map((base) => {
    const row = retrievalByLine.get(String(base.line_id)) || null;
    const ordered = Math.max(0, num(base.qty_ordered)) || 1;
    const retrieved = clampRetrieved(row?.qty_retrieved, ordered);
    qtyOrdered += ordered;
    qtyRetrieved += retrieved;
    if (retrieved + 1e-9 < ordered) incompleteLines += 1;
    const updated = row?.updated_at || row?.retrieved_at || null;
    if (updated && (!lastUpdate || String(updated) > String(lastUpdate))) {
      lastUpdate = updated;
    }
    return {
      line_id: base.line_id,
      designation: base.designation || '—',
      unite: base.unite || 'u',
      qty_ordered: ordered,
      qty_retrieved: retrieved,
      done: retrieved > 0,
      retrieved_at: row?.retrieved_at || '',
      retrieved_by: row?.retrieved_by || '',
      observation: row?.observation || '',
      updated_at: row?.updated_at || null,
    };
  });

  const statut = computeRetrievalStatus({ qtyOrdered, qtyRetrieved });
  const pct = computeRetrievalPct({ qtyOrdered, qtyRetrieved });

  return {
    id: oa.id,
    ref: oa.ref || oa.ref_oa || '',
    titre: oa.objet || oa.ref || '—',
    demandeur: oa.responsable_achats || '—',
    fournisseur: oa.fournisseur || oa.supplier_name || '—',
    supplier_id: oa.supplier_id || null,
    projet: acquisitionOrderProjectLabel(oa) || oa.projet_lie || '—',
    date_commande: oa.date_creation || '',
    date_validation: oa.date_creation || '',
    montant: Number(oa.montant_ttc) || 0,
    devise: 'MAD',
    statut_oa: oa.statut || '',
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

/** Liste OA Validés enrichis pour le suivi récupération. */
export async function listSuiviReceptions() {
  const [orders, rows] = await Promise.all([
    listAcquisitionOrders(),
    listRetrievalRows(),
  ]);

  const byOrder = new Map();
  for (const row of rows) {
    const oid = String(row.acquisition_order_id);
    if (!byOrder.has(oid)) byOrder.set(oid, new Map());
    byOrder.get(oid).set(String(row.line_id), row);
  }

  return (orders || [])
    .filter((oa) => String(oa.statut || '') === OA_SUIVI_STATUT)
    .map((oa) => buildOaView(oa, byOrder.get(String(oa.id)) || new Map()))
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
    if (dateFrom && String(r.date_commande || r.date_validation || '') < dateFrom) return false;
    if (dateTo && String(r.date_commande || r.date_validation || '') > dateTo) return false;
    if (q) {
      const hay = `${r.ref} ${r.titre || ''} ${r.fournisseur} ${r.projet}`.toLowerCase();
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
 * Enregistre / met à jour une ligne de check-list OA.
 * N'écrit QUE dans purchase_acquisition_order_retrievals.
 * qty_retrieved = donnée technique (0 ou qty commandée).
 */
export async function upsertLineRetrieval({
  acquisitionOrderId,
  purchaseOrderId,
  lineId,
  qtyRetrieved,
  qtyOrdered,
  retrievedBy,
  observation,
  retrievedAt,
}) {
  const oid = acquisitionOrderId || purchaseOrderId;
  if (!oid || !lineId) {
    throw new Error('Ordre d\'achat / ligne requis.');
  }
  const ordered = Math.max(num(qtyOrdered), 1);
  const qty = clampRetrieved(qtyRetrieved, ordered);
  const payload = {
    acquisition_order_id: oid,
    line_id: String(lineId),
    qty_retrieved: qty,
    retrieved_at: retrievedAt || new Date().toISOString().slice(0, 10),
    retrieved_by: (retrievedBy || '').trim() || null,
    observation: (observation || '').trim() || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await getSupabase()
    .from(TABLE)
    .upsert(payload, { onConflict: 'acquisition_order_id,line_id' })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

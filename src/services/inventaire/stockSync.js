/**
 * stockSync.js — Source de vérité stock par emplacement + ledger + recalcul.
 * Ne touche pas aux mouvements (lecture seule pour le rebuild / affichage).
 */
import { getSupabase } from '../../lib/supabase';
import { requireSupabaseUserId } from '../supabase/requireUser';

const LEVELS = 'stock_levels';
const MOVEMENTS = 'stock_movements';
const ARTICLES = 'stock_articles';

const DEPRECATED_EMPLACEMENTS = ['F5', 'G3', 'F2'];

function isDeprecatedEmplacement(value) {
  const k = String(value || '').trim().toUpperCase();
  return DEPRECATED_EMPLACEMENTS.some((d) => d.toUpperCase() === k);
}

function isSansEmplacement(value) {
  const e = String(value || '').trim();
  return !e || isDeprecatedEmplacement(e);
}

export const STOCK_CHANGED_EVENT = 'citymo-stock-changed';

export function notifyStockChanged(detail = {}) {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(STOCK_CHANGED_EVENT, { detail }));
    }
  } catch { /* ignore */ }
}

export function subscribeStockChanged(handler) {
  if (typeof window === 'undefined') return () => {};
  const fn = (e) => handler(e?.detail || {});
  window.addEventListener(STOCK_CHANGED_EVENT, fn);
  return () => window.removeEventListener(STOCK_CHANGED_EVENT, fn);
}

export function normEmp(v) {
  return String(v || '').trim();
}

export function empKey(v) {
  return normEmp(v).toLowerCase();
}

function typeFromDb(type) {
  const t = String(type || '');
  if (t === 'Entree') return 'Entrée';
  return t;
}

export function isMovementStockApplicable(row) {
  const p = row.payload || {};
  const statut = String(p.statut || '').trim();
  if (/annul/i.test(statut)) return false;
  if (p.annule_par) return false;
  if (p.applied === true) return true;
  if (statut === 'Validé' || statut === 'Terminé') return true;
  return false;
}

/**
 * Normalise le type métier :
 * source + destination physiques distinctes → transfert interne
 * sauf Sortie / Rebut (destination éventuelle = traçabilité, pas un crédit stock).
 */
/**
 * Normalise le type métier pour recalcul / ledger.
 * Le type explicite Sortie / Rebut / Transfert / Entrée prime toujours.
 * src+dest → transfert UNIQUEMENT si le type n’est pas une Sortie/Rebut/Entrée explicite
 * (réparation d’anciens mouvements ambigus).
 */
export function normalizeMovementKind(row) {
  const p = row?.payload || {};
  const src = normEmp(p.emplacement_source);
  const dest = normEmp(p.emplacement_destination);
  const rawDb = typeFromDb(row?.type_mouvement);
  const key = String(rawDb || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const qty = Number(row?.quantite) || 0;

  if (key === 'sortie') {
    return { normalized_type: 'exit', label: 'Consommation / sortie', src, dest, qty, raw_type: 'Sortie' };
  }
  if (key === 'rebut') {
    return { normalized_type: 'scrap', label: 'Rebut', src, dest, qty, raw_type: 'Rebut' };
  }
  if (key === 'transfert') {
    return { normalized_type: 'transfer', label: 'Transfert', src, dest, qty, raw_type: 'Transfert' };
  }
  if (key === 'entree' || key === 'entrée') {
    return { normalized_type: 'entry', label: 'Entrée', src, dest, qty, raw_type: 'Entrée' };
  }
  if (key === 'retour') {
    if (src && dest && empKey(src) !== empKey(dest)) {
      return { normalized_type: 'transfer', label: 'Retour / transfert', src, dest, qty, raw_type: 'Retour' };
    }
    return { normalized_type: 'entry', label: 'Retour', src, dest, qty, raw_type: 'Retour' };
  }

  // Historique ambigu (type manquant / inconnu) : src+dest → transfert
  if (src && dest && empKey(src) !== empKey(dest)) {
    return {
      normalized_type: 'transfer',
      label: 'Transfert',
      src,
      dest,
      qty,
      raw_type: rawDb || 'Transfert',
    };
  }
  if (!src && dest) {
    return { normalized_type: 'entry', label: 'Entrée', src, dest, qty, raw_type: rawDb || 'Entrée' };
  }
  return {
    normalized_type: 'exit',
    label: rawDb || 'Sortie',
    src,
    dest,
    qty,
    raw_type: rawDb || 'Sortie',
  };
}

/** Delta net pour un emplacement donné (+ entrant, − sortant). */
export function deltaForEmplacement(row, emplacement) {
  const kind = normalizeMovementKind(row);
  const ek = empKey(emplacement);
  let inbound = 0;
  let outbound = 0;

  if (kind.normalized_type === 'transfer') {
    if (empKey(kind.dest) === ek) inbound = kind.qty;
    if (empKey(kind.src) === ek) outbound = kind.qty;
  } else if (kind.normalized_type === 'entry') {
    if (empKey(kind.dest) === ek) inbound = kind.qty;
  } else {
    if (empKey(kind.src) === ek) outbound = kind.qty;
  }

  return {
    ...kind,
    inbound,
    outbound,
    delta: inbound - outbound,
    touches: inbound > 0 || outbound > 0,
  };
}

function extractProjet(payload = {}) {
  if (payload.projet) return String(payload.projet).trim();
  const note = String(payload.note || '');
  const m = note.match(/Projet:\s*([^|]+)/i);
  return m ? m[1].trim() : '';
}

function fmtDateLabel(d) {
  if (!d) return '—';
  try {
    const raw = String(d).slice(0, 10);
    return new Date(`${raw}T12:00:00`).toLocaleDateString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  } catch {
    return String(d);
  }
}

export function getEmplacementStockState(qte, seuilMin, seuilMax = null) {
  const q = Number(qte) || 0;
  const s = Number(seuilMin) || 0;
  if (q < 0) return { label: 'Stock négatif', cls: 'badge-red', key: 'negatif' };
  if (q === 0) return { label: 'Rupture', cls: 'badge-red', key: 'rupture' };
  if (seuilMax != null && Number(seuilMax) > 0 && q > Number(seuilMax)) {
    return { label: 'Surstock', cls: 'badge-purple', key: 'surstock' };
  }
  if (s > 0 && q <= s * 0.5) return { label: 'Critique', cls: 'badge-red', key: 'critique' };
  if (s > 0 && q <= s) return { label: 'Stock faible', cls: 'badge-orange', key: 'faible' };
  return { label: 'Disponible', cls: 'badge-green', key: 'disponible' };
}

export function periodRange(periodKey, customFrom = '', customTo = '') {
  const now = new Date();
  const startOfDay = (d) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  };
  const endOfDay = (d) => {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
  };

  if (periodKey === 'today') {
    return { from: startOfDay(now), to: endOfDay(now) };
  }
  if (periodKey === '7d') {
    const from = startOfDay(now);
    from.setDate(from.getDate() - 6);
    return { from, to: endOfDay(now) };
  }
  if (periodKey === '30d') {
    const from = startOfDay(now);
    from.setDate(from.getDate() - 29);
    return { from, to: endOfDay(now) };
  }
  if (periodKey === 'month') {
    const from = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
    return { from, to: endOfDay(now) };
  }
  if (periodKey === 'custom') {
    const from = customFrom ? startOfDay(customFrom) : null;
    const to = customTo ? endOfDay(customTo) : null;
    return { from, to };
  }
  return { from: null, to: null };
}

function movementInstant(row) {
  const d = row.date_mouvement || (row.created_at || '').slice(0, 10);
  const t = row.created_at || `${d}T12:00:00`;
  return new Date(t).getTime() || 0;
}

/**
 * Charge toutes les lignes stock_levels.
 */
export async function listAllStockLevels() {
  const { data, error } = await getSupabase()
    .from(LEVELS)
    .select('id, article_id, emplacement, quantite, warehouse_id, updated_at')
    .order('emplacement', { ascending: true });
  if (error) {
    if (error.code === '42P01') return [];
    throw error;
  }
  return (data || []).map((l) => ({
    id: l.id,
    article_id: l.article_id ? String(l.article_id) : '',
    emplacement: normEmp(l.emplacement),
    quantite: Number(l.quantite) || 0,
    warehouse_id: l.warehouse_id || null,
    updated_at: l.updated_at,
  }));
}

/** Tous les mouvements (pour ledger / contrôle emplacement). */
export async function listAllStockMovementsRaw() {
  const { data, error } = await getSupabase()
    .from(MOVEMENTS)
    .select('id, ref_mouvement, type_mouvement, article_id, quantite, date_mouvement, motif, payload, created_at, stock_articles(reference, nom)')
    .order('date_mouvement', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

/**
 * Une ligne UI par combinaison article + emplacement (à partir de stock_levels).
 */
export function expandArticlesByEmplacement(articles = [], levels = []) {
  const byArticle = new Map();
  (levels || []).forEach((l) => {
    const aid = String(l.article_id || '');
    if (!aid) return;
    if (!byArticle.has(aid)) byArticle.set(aid, []);
    byArticle.get(aid).push(l);
  });

  const rows = [];
  (articles || []).forEach((art) => {
    const lvls = (byArticle.get(String(art.id)) || [])
      .filter((l) => {
        const e = normEmp(l.emplacement);
        return e && !isDeprecatedEmplacement(e);
      });

    if (!lvls.length) {
      rows.push({
        ...art,
        _rowKey: `${art.id}__sans`,
        emplacement: isSansEmplacement(art.emplacement) ? '' : normEmp(art.emplacement),
        stock_actuel: 0,
        stock_global: Number(art.stock_actuel) || 0,
        level_id: null,
        is_level_row: false,
      });
      return;
    }

    lvls.forEach((l) => {
      const emp = normEmp(l.emplacement);
      const qty = Number(l.quantite) || 0;
      rows.push({
        ...art,
        _rowKey: `${art.id}__${empKey(emp)}`,
        emplacement: emp,
        stock_actuel: qty,
        stock_global: Number(art.stock_actuel) || 0,
        level_id: l.id || null,
        is_level_row: true,
      });
    });
  });

  return rows;
}

/**
 * Applique un mouvement sur une map articleId -> empKey -> qty (simulation).
 * Règle : source+destination → transfert.
 */
export function applyMovementToMap(map, mvt, reverse = false) {
  const qty = Number(mvt.quantite) || 0;
  if (!mvt.article_id || qty <= 0) return;
  const sign = reverse ? -1 : 1;
  const kind = normalizeMovementKind(mvt);
  const aid = String(mvt.article_id);

  if (!map.has(aid)) map.set(aid, new Map());
  const empMap = map.get(aid);

  const bump = (emp, delta) => {
    const e = normEmp(emp);
    if (!e || isDeprecatedEmplacement(e)) return;
    const k = empKey(e);
    const prev = empMap.get(k) || { emplacement: e, quantite: 0 };
    empMap.set(k, { emplacement: e, quantite: prev.quantite + delta });
  };

  if (kind.normalized_type === 'entry') {
    bump(kind.dest, sign * qty);
  } else if (kind.normalized_type === 'transfer') {
    bump(kind.src, sign * -qty);
    bump(kind.dest, sign * qty);
  } else {
    bump(kind.src, sign * -qty);
  }
}

function enrichMovementRow(row) {
  const p = row.payload || {};
  const art = row.stock_articles || {};
  const kind = normalizeMovementKind(row);
  return {
    id: row.id,
    ref: row.ref_mouvement || '',
    article_id: row.article_id ? String(row.article_id) : '',
    article_code: art.reference || '',
    article_designation: art.nom || '',
    type_mouvement: typeFromDb(row.type_mouvement),
    quantite: Number(row.quantite) || 0,
    date_mouvement: row.date_mouvement || '',
    date_label: fmtDateLabel(row.date_mouvement),
    created_at: row.created_at,
    motif: row.motif || '',
    note: p.note || '',
    projet: extractProjet(p),
    cree_par: p.cree_par || '',
    statut: p.statut || '',
    applied: !!p.applied,
    annule: /annul/i.test(String(p.statut || '')) || !!p.annule_par,
    emplacement_source: kind.src,
    emplacement_destination: kind.dest,
    normalized_type: kind.normalized_type,
    label: kind.label,
    raw: row,
  };
}

/**
 * Vue de contrôle complète pour un emplacement.
 * Quantités = replay des mouvements validés (formule métier).
 */
export function buildEmplacementControlView({
  articles = [],
  movements = [],
  emplacement,
  levels = [],
  period = { from: null, to: null },
}) {
  const emp = normEmp(emplacement);
  const ek = empKey(emp);
  if (!ek) {
    return {
      emplacement: emp,
      articles: [],
      history: [],
      kpis: emptyKpis(),
      anomalies: [],
    };
  }

  const articleById = new Map((articles || []).map((a) => [String(a.id), a]));
  const levelByArticle = new Map();
  (levels || []).forEach((l) => {
    if (empKey(l.emplacement) === ek) {
      levelByArticle.set(String(l.article_id), Number(l.quantite) || 0);
    }
  });

  const sorted = [...(movements || [])].sort((a, b) => movementInstant(a) - movementInstant(b));
  const balances = new Map(); // aid -> running qty
  const totals = new Map(); // aid -> aggregates
  const history = [];
  const anomalies = [];
  const refsSeen = new Set();

  const ensureTot = (aid) => {
    if (!totals.has(aid)) {
      totals.set(aid, {
        entree: 0,
        sortie: 0,
        transfer_in: 0,
        transfer_out: 0,
        consomme: 0,
        last_in: null,
        last_out: null,
        last_mvt: null,
        mvt_count: 0,
      });
    }
    return totals.get(aid);
  };

  sorted.forEach((row) => {
    const enriched = enrichMovementRow(row);
    const d = deltaForEmplacement(row, emp);
    if (!d.touches) return;

    // Anomalies (tous mouvements touchant l'emplacement)
    if (!enriched.emplacement_source && ['exit', 'transfer', 'scrap'].includes(d.normalized_type)) {
      anomalies.push({ type: 'sans_source', ref: enriched.ref, article_id: enriched.article_id });
    }
    if (!enriched.emplacement_destination && d.normalized_type === 'entry') {
      anomalies.push({ type: 'sans_destination', ref: enriched.ref, article_id: enriched.article_id });
    }
    if (d.normalized_type === 'transfer' && empKey(d.src) === empKey(d.dest)) {
      anomalies.push({ type: 'transfert_identique', ref: enriched.ref, article_id: enriched.article_id });
    }
    if (enriched.quantite < 0) {
      anomalies.push({ type: 'quantite_negative', ref: enriched.ref, article_id: enriched.article_id });
    }
    const dupKey = `${enriched.ref}|${enriched.article_id}|${enriched.quantite}|${enriched.date_mouvement}`;
    if (refsSeen.has(dupKey)) {
      anomalies.push({ type: 'doublon', ref: enriched.ref, article_id: enriched.article_id });
    }
    refsSeen.add(dupKey);
    if (!isMovementStockApplicable(row) && !enriched.annule) {
      anomalies.push({ type: 'non_valide', ref: enriched.ref, article_id: enriched.article_id });
    }
    if (enriched.article_id && !articleById.has(enriched.article_id)) {
      anomalies.push({ type: 'article_supprime', ref: enriched.ref, article_id: enriched.article_id });
    }

    const applicable = isMovementStockApplicable(row);
    const aid = enriched.article_id || '_unknown';
    let solde = balances.get(aid) || 0;
    if (applicable) {
      solde += d.delta;
      balances.set(aid, solde);
      const tot = ensureTot(aid);
      tot.mvt_count += 1;
      if (d.normalized_type === 'transfer') {
        tot.transfer_in += d.inbound;
        tot.transfer_out += d.outbound;
      } else if (d.normalized_type === 'entry') {
        tot.entree += d.inbound;
      } else {
        tot.sortie += d.outbound;
        tot.consomme += d.outbound;
      }
      if (d.inbound > 0) tot.last_in = enriched;
      if (d.outbound > 0) tot.last_out = enriched;
      tot.last_mvt = enriched;
    }

    const inPeriod = isInPeriod(row, period);
    history.push({
      ...enriched,
      inbound: d.inbound,
      outbound: d.outbound,
      delta: d.delta,
      solde_apres: applicable ? solde : null,
      applicable,
      in_period: inPeriod,
      operation_label: d.inbound > 0 && d.outbound === 0
        ? (d.normalized_type === 'transfer' ? 'Transfert entrant' : d.label)
        : (d.outbound > 0 && d.inbound === 0
          ? (d.normalized_type === 'transfer' ? 'Transfert sortant' : d.label)
          : d.label),
    });
  });

  // Articles : union des balances + levels
  const articleIds = new Set([...balances.keys(), ...levelByArticle.keys()]);
  const articleRows = [];

  articleIds.forEach((aid) => {
    if (aid === '_unknown') return;
    const art = articleById.get(aid) || {
      id: aid,
      code: '',
      designation: '(article introuvable)',
      valeur: 0,
      unite: 'U',
      stock_minimum: 0,
      categorie_id: null,
      etat: '—',
    };
    const computed = Number(balances.get(aid) || 0);
    const recorded = levelByArticle.has(aid) ? Number(levelByArticle.get(aid)) : null;
    // Ne jamais afficher 0 si le replay mouvements est > 0
    const stockActuel = computed !== 0 ? computed : (recorded != null ? recorded : 0);
    const tot = ensureTot(aid);
    const state = getEmplacementStockState(stockActuel, art.stock_minimum);
    const val = (Number(art.valeur) || 0) * stockActuel;

    articleRows.push({
      ...art,
      _rowKey: `${aid}__${ek}`,
      article_id: aid,
      emplacement: emp,
      stock_actuel: stockActuel,
      stock_computed: computed,
      stock_recorded: recorded,
      stock_ecart: recorded == null ? null : Math.round((computed - recorded) * 1000) / 1000,
      valeur_actuelle: val,
      is_level_row: true,
      has_mouvement: tot.mvt_count > 0,
      total_entree: tot.entree + tot.transfer_in,
      total_sortie: tot.sortie + tot.transfer_out,
      total_transfer_in: tot.transfer_in,
      total_transfer_out: tot.transfer_out,
      total_consomme: tot.consomme,
      derniere_entree: tot.last_in,
      derniere_sortie: tot.last_out,
      dernier_mouvement: tot.last_mvt,
      etat_emplacement: state,
    });
  });

  articleRows.sort((a, b) => String(a.code || a.designation).localeCompare(String(b.code || b.designation), 'fr'));

  const historyDesc = [...history].reverse();
  const periodHistory = historyDesc.filter((h) => h.in_period && h.applicable);

  const kpis = {
    valeur_totale: articleRows.reduce((s, r) => s + (Number(r.valeur_actuelle) || 0), 0),
    nb_articles: articleRows.filter((r) => Number(r.stock_actuel) !== 0).length,
    nb_articles_all: articleRows.length,
    stock_faible: articleRows.filter((r) => r.etat_emplacement?.key === 'faible').length,
    critiques: articleRows.filter((r) => r.etat_emplacement?.key === 'critique').length,
    ruptures: articleRows.filter((r) => r.etat_emplacement?.key === 'rupture').length,
    negatifs: articleRows.filter((r) => r.etat_emplacement?.key === 'negatif').length,
    total_mouvements: periodHistory.length,
    entrees_periode: periodHistory.reduce((s, h) => s + (Number(h.inbound) || 0), 0),
    sorties_periode: periodHistory.reduce((s, h) => s + (Number(h.outbound) || 0), 0),
  };

  return {
    emplacement: emp,
    articles: articleRows,
    history: historyDesc,
    historyPeriod: periodHistory,
    kpis,
    anomalies,
  };
}

function isInPeriod(row, period) {
  if (!period?.from && !period?.to) return true;
  const ts = movementInstant(row);
  if (period.from && ts < period.from.getTime()) return false;
  if (period.to && ts > period.to.getTime()) return false;
  return true;
}

function emptyKpis() {
  return {
    valeur_totale: 0,
    nb_articles: 0,
    nb_articles_all: 0,
    stock_faible: 0,
    critiques: 0,
    ruptures: 0,
    negatifs: 0,
    total_mouvements: 0,
    entrees_periode: 0,
    sorties_periode: 0,
  };
}

/**
 * Fiche détail article × emplacement (soldes après chaque mvt).
 */
export function buildArticleEmplacementLedger(movements, emplacement, articleId) {
  const view = buildEmplacementControlView({
    articles: [],
    movements: (movements || []).filter((m) => String(m.article_id) === String(articleId)),
    emplacement,
    levels: [],
    period: { from: null, to: null },
  });
  const row = view.articles[0] || null;
  return {
    row,
    history: view.history.filter((h) => String(h.article_id) === String(articleId)),
    anomalies: view.anomalies,
  };
}

/**
 * DRY RUN / apply : recalcule stock_levels depuis l'historique (avec règle transfert).
 */
export async function rebuildStockLevelsFromMovements({ dryRun = true } = {}) {
  await requireSupabaseUserId();

  const [{ data: movements, error: mErr }, currentLevels, { data: articles, error: aErr }] = await Promise.all([
    getSupabase()
      .from(MOVEMENTS)
      .select('id, ref_mouvement, type_mouvement, article_id, quantite, date_mouvement, payload, created_at')
      .order('date_mouvement', { ascending: true })
      .order('created_at', { ascending: true }),
    listAllStockLevels(),
    getSupabase().from(ARTICLES).select('id, reference, nom, emplacement'),
  ]);
  if (mErr) throw mErr;
  if (aErr) throw aErr;

  const applicable = (movements || []).filter(isMovementStockApplicable);
  const skipped = (movements || []).length - applicable.length;

  const computed = new Map();
  const movementRefsByKey = new Map();
  const lastMvtByKey = new Map();
  const anomalies = [];

  applicable.forEach((row) => {
    const kind = normalizeMovementKind(row);
    if (kind.normalized_type === 'transfer' && empKey(kind.src) === empKey(kind.dest)) {
      anomalies.push({ type: 'transfert_identique', ref: row.ref_mouvement, article_id: row.article_id });
    }
    if ((kind.normalized_type === 'exit' || kind.normalized_type === 'scrap') && !kind.src) {
      anomalies.push({ type: 'sans_source', ref: row.ref_mouvement, article_id: row.article_id });
    }
    if (kind.normalized_type === 'entry' && !kind.dest) {
      anomalies.push({ type: 'sans_destination', ref: row.ref_mouvement, article_id: row.article_id });
    }

    applyMovementToMap(computed, row, false);
    const touched = [];
    if (kind.normalized_type === 'entry') touched.push(kind.dest);
    else if (kind.normalized_type === 'transfer') touched.push(kind.src, kind.dest);
    else touched.push(kind.src);

    touched.filter(Boolean).forEach((emp) => {
      const key = `${row.article_id}|${empKey(emp)}`;
      if (!movementRefsByKey.has(key)) movementRefsByKey.set(key, []);
      const list = movementRefsByKey.get(key);
      if (row.ref_mouvement && !list.includes(row.ref_mouvement)) list.push(row.ref_mouvement);
      lastMvtByKey.set(key, row);
    });
  });

  const articleMeta = new Map((articles || []).map((a) => [String(a.id), a]));
  const currentMap = new Map();
  currentLevels.forEach((l) => {
    if (!l.article_id || !l.emplacement) return;
    currentMap.set(`${l.article_id}|${empKey(l.emplacement)}`, l);
  });

  const expectedKeys = new Set();
  const report = [];

  computed.forEach((empMap, aid) => {
    empMap.forEach((cell, ek) => {
      const key = `${aid}|${ek}`;
      expectedKeys.add(key);
      const cur = currentMap.get(key);
      const stockActuel = cur ? Number(cur.quantite) || 0 : 0;
      const stockRecalcule = Number(cell.quantite) || 0;
      const meta = articleMeta.get(String(aid));
      const mvts = movementRefsByKey.get(key) || [];
      const last = lastMvtByKey.get(key);
      const rowAnoms = [];
      if (stockRecalcule < 0) rowAnoms.push('stock_negatif');
      report.push({
        article_id: aid,
        article_code: meta?.reference || '',
        article_nom: meta?.nom || '',
        emplacement: cell.emplacement,
        stock_actuel: stockActuel,
        stock_recalcule: stockRecalcule,
        ecart: Math.round((stockRecalcule - stockActuel) * 1000) / 1000,
        mouvements: mvts,
        nb_mouvements: mvts.length,
        dernier_mouvement: last ? `${last.ref_mouvement || ''} ${fmtDateLabel(last.date_mouvement)}` : '—',
        anomalies: rowAnoms,
        level_id: cur?.id || null,
      });
    });
  });

  currentLevels.forEach((l) => {
    if (!l.article_id || !l.emplacement || isDeprecatedEmplacement(l.emplacement)) return;
    const key = `${l.article_id}|${empKey(l.emplacement)}`;
    if (expectedKeys.has(key)) return;
    const meta = articleMeta.get(String(l.article_id));
    report.push({
      article_id: l.article_id,
      article_code: meta?.reference || '',
      article_nom: meta?.nom || '',
      emplacement: l.emplacement,
      stock_actuel: Number(l.quantite) || 0,
      stock_recalcule: 0,
      ecart: -(Number(l.quantite) || 0),
      mouvements: [],
      nb_mouvements: 0,
      dernier_mouvement: '—',
      anomalies: Number(l.quantite) > 0 ? ['niveau_orphelin'] : [],
      level_id: l.id,
    });
  });

  report.sort((a, b) => {
    const c = String(a.article_code).localeCompare(String(b.article_code), 'fr');
    if (c) return c;
    return String(a.emplacement).localeCompare(String(b.emplacement), 'fr');
  });

  const divergences = report.filter((r) => Math.abs(r.ecart) > 0.0005);
  const summary = {
    dryRun,
    mouvements_total: (movements || []).length,
    mouvements_appliques: applicable.length,
    mouvements_ignores: skipped,
    lignes_rapport: report.length,
    divergences: divergences.length,
    anomalies: anomalies.length,
  };

  if (dryRun) {
    return { summary, report, divergences, anomalies };
  }

  for (const row of report) {
    const qty = Number(row.stock_recalcule) || 0;
    const writeQty = qty; // autorise négatif signalé ; stocké tel quel
    if (row.level_id) {
      const { error } = await getSupabase()
        .from(LEVELS)
        .update({ quantite: writeQty })
        .eq('id', row.level_id);
      if (error) throw error;
    } else if (Math.abs(writeQty) > 0.0005 && row.article_id && row.emplacement) {
      const { error } = await getSupabase().from(LEVELS).insert([{
        article_id: row.article_id,
        warehouse_id: null,
        project_id: null,
        emplacement: row.emplacement,
        quantite: writeQty,
      }]);
      if (error) throw error;
    }
  }

  const bestByArticle = new Map();
  report.forEach((r) => {
    if ((Number(r.stock_recalcule) || 0) <= 0) return;
    const prev = bestByArticle.get(r.article_id);
    if (!prev || r.stock_recalcule > prev.qty) {
      bestByArticle.set(r.article_id, { emp: r.emplacement, qty: r.stock_recalcule });
    }
  });
  await Promise.all(
    [...bestByArticle.entries()].map(([aid, { emp }]) => getSupabase()
      .from(ARTICLES)
      .update({ emplacement: emp })
      .eq('id', aid)),
  );

  notifyStockChanged({ reason: 'rebuild' });
  return { summary: { ...summary, dryRun: false, written: true }, report, divergences, anomalies };
}

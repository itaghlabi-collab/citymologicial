/**
 * stockSync.js — Source de vérité stock par emplacement + invalidation UI + recalcul.
 * Ne touche pas aux mouvements (lecture seule pour le rebuild).
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

function normEmp(v) {
  return String(v || '').trim();
}

function empKey(v) {
  return normEmp(v).toLowerCase();
}

function typeFromDb(type) {
  const t = String(type || '');
  if (t === 'Entree') return 'Entrée';
  return t;
}

function isMovementStockApplicable(row) {
  const p = row.payload || {};
  const statut = String(p.statut || '').trim();
  if (/annul/i.test(statut)) return false;
  if (p.annule_par) return false;
  // Validé / Terminé (ou applied) comptent ; brouillons exclus
  if (p.applied === true) return true;
  if (statut === 'Validé' || statut === 'Terminé') return true;
  return false;
}

/**
 * Charge toutes les lignes stock_levels (source de vérité quantité × emplacement).
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
 */
function applyMovementToMap(map, mvt, reverse = false) {
  const type = typeFromDb(mvt.type_mouvement);
  const qty = Number(mvt.quantite) || 0;
  if (!mvt.article_id || qty <= 0) return;
  const sign = reverse ? -1 : 1;
  const p = mvt.payload || {};
  const src = normEmp(p.emplacement_source);
  const dest = normEmp(p.emplacement_destination);
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

  if (type === 'Entrée') {
    bump(dest, sign * qty);
  } else if (type === 'Sortie' || type === 'Rebut') {
    bump(src, sign * -qty);
  } else if (type === 'Transfert' || type === 'Retour') {
    bump(src, sign * -qty);
    bump(dest, sign * qty);
  }
}

/**
 * DRY RUN / apply : recalcule stock_levels depuis l'historique des mouvements validés.
 * Ne supprime aucun mouvement.
 * @param {{ dryRun?: boolean }} opts
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

  const computed = new Map(); // articleId -> Map(empKey -> {emplacement, quantite})
  const movementRefsByKey = new Map(); // `${aid}|${empKey}` -> refs[]

  applicable.forEach((row) => {
    applyMovementToMap(computed, row, false);
    const p = row.payload || {};
    const type = typeFromDb(row.type_mouvement);
    const touched = [];
    if (type === 'Entrée') touched.push(normEmp(p.emplacement_destination));
    else if (type === 'Sortie' || type === 'Rebut') touched.push(normEmp(p.emplacement_source));
    else if (type === 'Transfert' || type === 'Retour') {
      touched.push(normEmp(p.emplacement_source), normEmp(p.emplacement_destination));
    }
    touched.filter(Boolean).forEach((emp) => {
      const key = `${row.article_id}|${empKey(emp)}`;
      if (!movementRefsByKey.has(key)) movementRefsByKey.set(key, []);
      const list = movementRefsByKey.get(key);
      if (row.ref_mouvement && !list.includes(row.ref_mouvement)) list.push(row.ref_mouvement);
    });
  });

  const articleMeta = new Map(
    (articles || []).map((a) => [String(a.id), a]),
  );

  const currentMap = new Map(); // `${aid}|${empKey}` -> level
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
      report.push({
        article_id: aid,
        article_code: meta?.reference || '',
        article_nom: meta?.nom || '',
        emplacement: cell.emplacement,
        stock_actuel: stockActuel,
        stock_recalcule: stockRecalcule,
        ecart: Math.round((stockRecalcule - stockActuel) * 1000) / 1000,
        mouvements: movementRefsByKey.get(key) || [],
        level_id: cur?.id || null,
      });
    });
  });

  // Niveaux existants absents du recalcul → devraient passer à 0
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
  };

  if (dryRun) {
    return { summary, report, divergences };
  }

  // Écriture contrôlée — aucun mouvement modifié / supprimé
  for (const row of report) {
    const qty = Math.max(0, Number(row.stock_recalcule) || 0);
    if (row.level_id) {
      const { error } = await getSupabase()
        .from(LEVELS)
        .update({ quantite: qty })
        .eq('id', row.level_id);
      if (error) throw error;
    } else if (qty > 0 && row.article_id && row.emplacement) {
      const { error } = await getSupabase().from(LEVELS).insert([{
        article_id: row.article_id,
        warehouse_id: null,
        project_id: null,
        emplacement: row.emplacement,
        quantite: qty,
      }]);
      if (error) throw error;
    }
  }

  // Mettre à jour emplacement « principal » = emplacement au plus fort stock
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
  return { summary: { ...summary, dryRun: false, written: true }, report, divergences };
}

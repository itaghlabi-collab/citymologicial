/**
 * cashRestartLedger.js — Point de départ caisse au 17/09/2026 (affichage / calculs feuille)
 *
 * L'écriture « REGULARISATION CAISSE » du 17/09/2026 reste en historique.
 * Les cartes et exports ne comptent que les opérations strictement postérieures.
 * Ne modifie aucune donnée.
 *
 * Formule identique à computeCashTotals : reliquat + entrées − sorties.
 */

export const CASH_RESTART_DATE = '2026-09-17';

function computeCashTotalsLocal(transactions, soldeInitial) {
  const soldeInitialN = Number(soldeInitial) || 0;
  let totalEntrees = 0;
  let totalSorties = 0;
  (transactions || []).forEach((t) => {
    if (t.statut === 'Annulé') return;
    if (t.sens === 'entree') totalEntrees += t.montant || 0;
    else totalSorties += t.montant || 0;
  });
  const soldeMois = soldeInitialN + totalEntrees - totalSorties;
  return {
    soldeInitial: soldeInitialN,
    alimentation: totalEntrees,
    totalEntrees,
    totalSorties,
    soldeMois,
  };
}

export function isRegularisationCaisse(tx) {
  const raw = String(tx?.description || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return raw.includes('regularisation caisse');
}

function createdMs(tx) {
  const raw = tx?.created_at;
  if (!raw) return null;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** Ordre d'écriture : date, puis created_at, puis id. */
export function compareCashOrder(a, b) {
  const da = String(a?.date || '');
  const db = String(b?.date || '');
  if (da !== db) return da.localeCompare(db);
  const ma = createdMs(a);
  const mb = createdMs(b);
  if (ma != null && mb != null && ma !== mb) return ma - mb;
  return String(a?.id || '').localeCompare(String(b?.id || ''));
}

/**
 * Identifie l'écriture de départ du 17/09/2026.
 * Au 18/09/2026 une seule ligne caisse ce jour : REGULARISATION CAISSE (DIVERS, 12 253,78).
 * S'il y en a plusieurs, on prend la plus ancienne (created_at puis id) et on signale l'ambiguïté.
 */
export function findCashRestartTransaction(transactions) {
  const candidates = (transactions || []).filter((t) => (
    String(t.date || '').slice(0, 10) === CASH_RESTART_DATE
    && isRegularisationCaisse(t)
    && t.statut !== 'Annulé'
  ));
  if (!candidates.length) {
    return { restart: null, ambiguous: false, sameDayCount: 0 };
  }
  const sorted = [...candidates].sort(compareCashOrder);
  return {
    restart: sorted[0],
    ambiguous: sorted.length > 1,
    sameDayCount: sorted.length,
  };
}

/**
 * true si l'opération est postérieure à l'écriture de régularisation, y compris le 17/09.
 * Même jour : created_at (puis id). L'écriture de régularisation elle-même est exclue.
 */
export function isCountedAfterRestart(tx, restart) {
  if (!tx || tx.statut === 'Annulé') return false;
  if (!restart) return String(tx.date || '') > CASH_RESTART_DATE;
  if (String(tx.id) && String(restart.id) && String(tx.id) === String(restart.id)) return false;
  return compareCashOrder(tx, restart) > 0;
}

export function splitCashAfterRestart(transactions, restart) {
  const counted = [];
  const history = [];
  (transactions || []).forEach((t) => {
    if (isCountedAfterRestart(t, restart)) counted.push(t);
    else history.push(t);
  });
  return { counted, history };
}

export function monthStartIso(year, month) {
  return `${Number(year)}-${String(Number(month)).padStart(2, '0')}-01`;
}

export function inYearMonth(date, year, month) {
  const start = monthStartIso(year, month);
  const m = Number(month);
  const y = Number(year);
  const endMonth = m === 12 ? 1 : m + 1;
  const endYear = m === 12 ? y + 1 : y;
  const end = monthStartIso(endYear, endMonth);
  const d = String(date || '');
  return d >= start && d < end;
}

/** Mois dont la dernière journée est strictement avant le 17/09/2026. */
export function isMonthEntirelyBeforeRestart(year, month) {
  const m = Number(month);
  const y = Number(year);
  const endMonth = m === 12 ? 1 : m + 1;
  const endYear = m === 12 ? y + 1 : y;
  return monthStartIso(endYear, endMonth) <= CASH_RESTART_DATE;
}

export function computeRestartMonthTotals(counted, year, month) {
  const start = monthStartIso(year, month);
  const prior = (counted || []).filter((t) => String(t.date || '') < start);
  const period = (counted || []).filter((t) => inYearMonth(t.date, year, month));
  const reliquat = computeCashTotalsLocal(prior, 0).soldeMois;
  return computeCashTotalsLocal(period, reliquat);
}

export function computeRestartGlobalTotals(counted) {
  return computeCashTotalsLocal(counted || [], 0);
}

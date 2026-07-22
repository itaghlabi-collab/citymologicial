/**
 * cashSheetDisplay.js — Présentation feuille de caisse
 * worker_weekly_payment : 1 ligne DB = 1 ligne affichée (par semaine payée).
 * Affiche / consolide uniquement les mouvements en espèces (caisse physique).
 */

const WORKER_SOURCES = new Set(['worker_payment', 'worker_weekly_payment']);

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Champ mode paiement selon les variantes déjà présentes en base / sync. */
export function getCashSheetPaymentMode(tx) {
  if (!tx || typeof tx !== 'object') return '';
  return String(
    tx.mode_paiement
    ?? tx.payment_method
    ?? tx.mode_reglement
    ?? tx.paymentMethod
    ?? tx.mode
    ?? '',
  ).trim();
}

/**
 * True uniquement pour la caisse physique.
 * Pas de mode → exclu (ne pas inventer « Espèces »).
 */
export function isCashPaymentMode(mode) {
  const raw = String(mode ?? '').trim();
  if (!raw) return false;
  const n = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
  return n === 'especes' || n === 'espece' || n === 'cash';
}

function extractProjet(description = '') {
  const m = String(description).match(/—\s*([^(]+?)(?:\s*\(|$)/);
  return m?.[1]?.trim() || 'Chantier';
}

function extractDateRange(description = '') {
  const m = String(description).match(/\((\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})\)/);
  if (m) return { from: m[1], to: m[2] };
  return null;
}

function mergeDateRanges(rows) {
  let minIso = '';
  let maxIso = '';
  for (const r of rows) {
    const range = extractDateRange(r.description);
    if (!range) continue;
    const fromIso = frToIso(range.from);
    const toIso = frToIso(range.to);
    if (fromIso && (!minIso || fromIso < minIso)) minIso = fromIso;
    if (toIso && (!maxIso || toIso > maxIso)) maxIso = toIso;
  }
  if (minIso && maxIso) {
    return `${isoToFr(minIso)} - ${isoToFr(maxIso)}`;
  }
  return '';
}

function frToIso(fr) {
  const p = String(fr || '').split('/');
  if (p.length !== 3) return '';
  return `${p[2]}-${p[1]}-${p[0]}`;
}

function isoToFr(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function groupKey(t) {
  return `${t.worker_id || t.contrepartie || ''}|${t.project_id || ''}`;
}

function mergeLegacyWorkerPaymentGroup(rows) {
  if (!rows?.length) return [];

  const paymentRow = rows.find((r) => r.source_type === 'worker_payment');
  if (paymentRow) {
    return [{ ...paymentRow, isRecap: true }];
  }

  const sorted = [...rows].sort((a, b) => String(a.date).localeCompare(b.date));
  const primary = sorted[sorted.length - 1];
  const montant = round2(rows.reduce((s, r) => s + (Number(r.montant) || 0), 0));
  const opDate = sorted.map((r) => r.date).filter(Boolean).sort().pop() || primary.date;
  const projet = extractProjet(primary.description);
  const period = mergeDateRanges(rows);

  return [{
    ...primary,
    id: `recap-worker-${groupKey(primary)}`,
    date: opDate,
    montant,
    sens: 'sortie',
    source_type: 'worker_payment',
    description: period
      ? `Paiement ouvrier — ${projet} (${period})`
      : `Paiement ouvrier — ${projet}`,
    isRecap: true,
    is_auto_generated: true,
    _mergedIds: rows.map((r) => r.id),
  }];
}

/** Affiche chaque paiement hebdo tel quel ; fusionne uniquement l'ancien format worker_payment. Espèces uniquement. */
export function consolidateCashSheetTransactions(transactions) {
  const active = (transactions || []).filter((t) => (
    t.statut !== 'Annulé' && isCashPaymentMode(getCashSheetPaymentMode(t))
  ));
  const others = [];
  const legacyGroups = new Map();

  for (const t of active) {
    if (t.source_type === 'worker_weekly_payment') {
      others.push(t);
      continue;
    }
    if (t.source_type === 'worker_payment') {
      const key = groupKey(t);
      if (!legacyGroups.has(key)) legacyGroups.set(key, []);
      legacyGroups.get(key).push(t);
      continue;
    }
    others.push(t);
  }

  const mergedLegacy = [];
  for (const rows of legacyGroups.values()) {
    mergedLegacy.push(...mergeLegacyWorkerPaymentGroup(rows));
  }

  return [...others, ...mergedLegacy].sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

export function isWorkerPaymentRecap(t) {
  return Boolean(t?.isRecap || WORKER_SOURCES.has(t?.source_type));
}

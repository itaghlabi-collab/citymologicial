/**
 * Saisie décimale FR : accepte virgule ou point (ex. "13,5", ",07", "36,07").
 */

export function formatFrDecimalInput(value) {
  if (value === null || value === undefined || value === '') return '';
  return String(value).replace('.', ',');
}

/** Parse saisie FR/EN → number, ou null si vide/invalide. */
export function parseFrDecimal(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim().replace(/\s/g, '').replace(',', '.');
  if (!s || s === '.' || s === '-' || s === '-.') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function parseFrDecimalOrZero(raw) {
  return parseFrDecimal(raw) ?? 0;
}

/** Filtre la frappe : chiffres + une seule virgule ou un seul point. */
export function sanitizeFrDecimalTyping(raw) {
  let s = String(raw ?? '').replace(/[^\d.,]/g, '');
  const sepIdx = Math.max(s.indexOf(','), s.indexOf('.'));
  if (sepIdx >= 0) {
    const head = s.slice(0, sepIdx + 1);
    const tail = s.slice(sepIdx + 1).replace(/[.,]/g, '');
    s = head + tail;
  }
  return s;
}

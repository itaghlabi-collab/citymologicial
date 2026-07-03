/**
 * projectExpenseImportUtils.js — Détection lignes synthèse Excel (TOTAL)
 */

/** Ligne de synthèse Excel (TOTAL) — ne doit jamais devenir une dépense */
export function isTotalSummaryLabel(value) {
  const n = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
  return n === 'TOTAL' || n === 'TOTAL GENERAL' || n === 'TOTAL GENERALE';
}

export function isTotalSummaryRow({ element, description, categorie } = {}) {
  return isTotalSummaryLabel(element)
    || isTotalSummaryLabel(description)
    || isTotalSummaryLabel(categorie);
}

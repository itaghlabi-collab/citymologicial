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

/** TOTAL souvent placé en colonne DATE avec élément vide → sinon importé comme "Dépense" */
export function isExcelTotalSummaryLine(row, { iDate, iElement, iDesc } = {}) {
  if (!row?.length) return false;
  if (iDate >= 0 && isTotalSummaryLabel(row[iDate])) return true;
  return isTotalSummaryRow({
    element: iElement >= 0 ? row[iElement] : '',
    description: iDesc >= 0 ? row[iDesc] : '',
    categorie: iElement >= 0 ? row[iElement] : '',
  });
}

/** Liste fixe départements — module Documents (GED) */
export const DOCUMENT_DEPARTMENTS = Object.freeze([
  'COMMERCIAL',
  'RESSOURCES HUMAINES',
  'ACHATS',
  'MARKETING',
  'EXPLOITATION',
  'COMPTABILITÉ',
  'ADMINISTRATION',
  'SAV',
  'LOGISTIQUE',
  'PROJETS',
  'FINANCE & TRÉSORERIE',
  'DOCUMENTS GÉNÉRAUX',
]);

export function normalizeDocumentDepartment(value) {
  const v = (value || '').trim();
  return DOCUMENT_DEPARTMENTS.includes(v) ? v : '';
}

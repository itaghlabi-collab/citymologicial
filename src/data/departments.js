/**
 * CITYMO ERP – Centralized Department Registry
 * ─────────────────────────────────────────────
 * This is the SINGLE SOURCE OF TRUTH for all departments.
 * Do NOT allow users to add, remove, or modify these entries.
 * All modules must import from this file to ensure consistency.
 */

export const DEPARTMENTS = Object.freeze([
  { id: 1, code: 'COM', nom: 'DEPARTEMENT COMMERCIAL',           description: 'Gestion des ventes, clients et devis' },
  { id: 2, code: 'RH',  nom: 'DEPARTEMENT RESSOURCES HUMAINES',  description: 'Gestion du personnel, recrutement et conges' },
  { id: 3, code: 'ACH', nom: 'DEPARTEMENT ACHATS',               description: 'Approvisionnement, fournisseurs et commandes' },
  { id: 4, code: 'MKT', nom: 'DEPARTEMENT MARKETING',            description: 'Communication, marketing et actions commerciales' },
  { id: 5, code: 'EXP', nom: 'DEPARTEMENT EXPLOITATION',         description: 'Chantiers, ouvriers et suivi terrain' },
  { id: 6, code: 'CPT', nom: 'DEPARTEMENT COMPTABILITE',         description: 'Finances, tresorerie et charges' },
  { id: 7, code: 'ADM', nom: 'ADMINISTRATION',                   description: 'Direction, administration et systeme' },
  { id: 8, code: 'SAV', nom: 'SERVICE APRES VENTE',              description: 'Interventions, SAV et suivi client post-projet' },
  { id: 9, code: 'LOG', nom: 'LOGISTIQUE',                       description: 'Vehicules, transport et gestion du depot' },
]);

/** Returns the full department object by id */
export function getDeptById(id) {
  return DEPARTMENTS.find(d => d.id === Number(id)) || null;
}

/** Returns the department name by id, with a fallback */
export function getDeptName(id) {
  const d = getDeptById(id);
  return d ? d.nom : '—';
}

/** Returns just the code by id */
export function getDeptCode(id) {
  const d = getDeptById(id);
  return d ? d.code : '—';
}

/** Returns array of { value, label } for use in <select> */
export function getDeptOptions(includePlaceholder = true) {
  const opts = DEPARTMENTS.map(d => ({ value: d.id, label: d.nom, code: d.code }));
  if (includePlaceholder) return [{ value: '', label: 'Choisir un departement...', code: '' }, ...opts];
  return opts;
}

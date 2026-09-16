/** Besoins matériaux chantier — fiche déclarative (saisie libre) */

export const MATERIAL_BESOIN_LOTS = [
  'Gros œuvre',
  'Second œuvre',
  'Plomberie',
  'Électricité',
  'Peinture',
  'Autre',
];

export const MATERIAL_BESOIN_PRIORITES = ['Normale', 'Urgente'];

export const MATERIAL_BESOIN_UNITES = [
  'kg', 'tonne', 'm³', 'm²', 'mètre linéaire (ml)', 'sac', 'pot', 'rouleau', 'litre', 'unité', 'autre',
];

/** Chef de projet autorisé à modifier les BM (dont statut transmis) — e-mail exact. */
export const MATERIAL_BESOIN_EDITOR_EMAIL = 'y.mojab@citymo.ma';

export const MATERIAL_BESOIN_STATUTS = [
  { value: 'brouillon', label: 'Brouillon', badge: 'badge-grey' },
  { value: 'soumis', label: 'Soumis', badge: 'badge-blue' },
  { value: 'valide', label: 'Validé', badge: 'badge-green' },
  { value: 'refuse', label: 'Refusé', badge: 'badge-red' },
  { value: 'transmis', label: 'Transmis dépôt / achats', badge: 'badge-purple' },
  { value: 'cloture', label: 'Clôturé', badge: 'badge-grey' },
];

export function materialBesoinStatutLabel(statut) {
  return MATERIAL_BESOIN_STATUTS.find((s) => s.value === statut)?.label || statut || '—';
}

export function materialBesoinStatutBadge(statut) {
  return MATERIAL_BESOIN_STATUTS.find((s) => s.value === statut)?.badge || 'badge-grey';
}

export function isMaterialBesoinPrivilegedEditor(user) {
  const email = String(user?.email || '').trim().toLowerCase();
  return email === MATERIAL_BESOIN_EDITOR_EMAIL;
}

/**
 * Édition fiche BM :
 * - standard : brouillon / soumis
 * - Yassir Mojab (y.mojab@citymo.ma) : + transmis (sans créer de doublon DC)
 * Statuts clôturés / refusés / validés restent non modifiables.
 */
export function canEditMaterialBesoin(item, user = null) {
  if (!item) return false;
  const statut = item.statut;
  if (['brouillon', 'soumis'].includes(statut)) return true;
  if (statut === 'transmis' && isMaterialBesoinPrivilegedEditor(user)) return true;
  return false;
}

export function canDeleteMaterialBesoin(item) {
  return Boolean(item?.id);
}

export function canSubmitMaterialBesoin() {
  return false;
}

export const EMPTY_MATERIAL_BESOIN_LINE = {
  designation: '',
  quantite: '',
  unite: 'sac',
  lot: 'Gros œuvre',
  date_souhaitee: '',
  observation: '',
};

export const EMPTY_MATERIAL_BESOIN_FORM = {
  date_besoin: new Date().toISOString().slice(0, 10),
  priorite: 'Normale',
  observation: '',
  lines: [{ ...EMPTY_MATERIAL_BESOIN_LINE }],
};

/** Types de besoins RH projet (centralisation matériel → Demandes chantier / Inventaire) */
export const BESOIN_RH_TYPES = [
  'Chef de chantier',
  'Chef de projet',
  'Ouvriers',
  'Sous-traitants',
];

/** @deprecated Utiliser BESOIN_RH_TYPES */
export const BESOIN_FONCTIONS = BESOIN_RH_TYPES;

export const BESOIN_PRIORITES = ['Normale', 'Haute', 'Urgente'];

export const BESOIN_REQUEST_STATUTS = [
  { value: 'en_attente', label: 'En attente', color: '#F57C00' },
  { value: 'en_cours', label: 'En cours', color: '#1565C0' },
  { value: 'affectee', label: 'Affectée', color: '#2E7D32' },
  { value: 'cloturee', label: 'Clôturée', color: '#757575' },
];

export const BESOIN_STAFF_STATUTS = {
  couvert: { label: 'Couvert', badge: 'badge-green' },
  partiel: { label: 'Partiel', badge: 'badge-orange' },
  manque: { label: 'Manque', badge: 'badge-red' },
};

export function normBesoinFonction(s) {
  return (s || '').trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}

export function isChefChantierFonction(fonction) {
  const n = normBesoinFonction(fonction);
  return (n.includes('chef') && n.includes('chantier'))
    || (n.includes('conducteur') && n.includes('travaux'))
    || (n.includes('responsable') && n.includes('chantier'));
}

export function isChefProjetFonction(fonction) {
  const n = normBesoinFonction(fonction);
  return (n.includes('chef') && n.includes('projet'))
    || (n.includes('project') && n.includes('manager'))
    || (n.includes('responsable') && n.includes('projet'));
}

export function isOuvrierFonction(fonction) {
  return !isChefChantierFonction(fonction) && !isChefProjetFonction(fonction);
}

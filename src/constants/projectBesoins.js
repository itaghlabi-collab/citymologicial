/** Besoins RH projet — demandes de ressources chantier */

export const BESOIN_TYPES = [
  'Chef de projet',
  'Chef de chantier',
  'Conducteur de travaux',
  'Ouvriers',
  'Sous-traitants',
];

export const BESOIN_CORPS_METIERS = [
  'Maçon', 'Coffreur', 'Ferrailleur', 'Plombier', 'Électricien', 'Carreleur',
  'Peintre', 'Menuisier', 'Soudeur', 'Manœuvre', 'Magasinier', 'Chauffeur', 'Autre',
];

export const BESOIN_PRIORITES = ['Normale', 'Urgente', 'Critique'];

export const BESOIN_WORKFLOW_STATUTS = [
  { value: 'brouillon', label: 'Brouillon', color: '#757575', badge: 'badge-grey' },
  { value: 'soumis', label: 'Soumis', color: '#1565C0', badge: 'badge-blue' },
  { value: 'en_recherche_rh', label: 'En recherche RH', color: '#7B1FA2', badge: 'badge-purple' },
  { value: 'partiellement_couvert', label: 'Partiellement couvert', color: '#F57C00', badge: 'badge-orange' },
  { value: 'couvert', label: 'Couvert', color: '#2E7D32', badge: 'badge-green' },
  { value: 'annule', label: 'Annulé', color: '#C62828', badge: 'badge-red' },
  { value: 'clos', label: 'Clos', color: '#546E7A', badge: 'badge-grey' },
];

/** @deprecated */
export const BESOIN_RH_TYPES = BESOIN_TYPES;
export const BESOIN_FONCTIONS = BESOIN_TYPES;

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

export function besoinStatutLabel(statut) {
  return BESOIN_WORKFLOW_STATUTS.find((s) => s.value === statut)?.label || statut;
}

export function besoinStatutColor(statut) {
  return BESOIN_WORKFLOW_STATUTS.find((s) => s.value === statut)?.color || '#757575';
}

export function besoinStatutBadge(statut) {
  return BESOIN_WORKFLOW_STATUTS.find((s) => s.value === statut)?.badge || 'badge-grey';
}

export function besoinFonctionLabel(need) {
  if (!need) return '—';
  if (need.type_besoin === 'Ouvriers' && need.corps_metier) return need.corps_metier;
  if (need.specialite) return need.specialite;
  return need.type_besoin || need.fonction || '—';
}

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

export function isConducteurTravauxFonction(fonction) {
  const n = normBesoinFonction(fonction);
  return n.includes('conducteur') && n.includes('travaux');
}

export function isOuvrierFonction(fonction) {
  return !isChefChantierFonction(fonction)
    && !isChefProjetFonction(fonction)
    && !isConducteurTravauxFonction(fonction);
}

export function prioriteBadgeClass(priorite) {
  if (priorite === 'Critique') return 'badge-red';
  if (priorite === 'Urgente') return 'badge-orange';
  return 'badge-grey';
}

export const EMPTY_BESOIN_FORM = {
  type_besoin: 'Ouvriers',
  corps_metier: 'Maçon',
  specialite: '',
  quantite_necessaire: 1,
  date_debut_souhaitee: '',
  date_fin_estimee: '',
  duree_prevue: '',
  priorite: 'Normale',
  responsable_demande: '',
  description_travaux: '',
  competences: '',
  epi_obligatoires: '',
  observation: '',
  statut: 'brouillon',
};

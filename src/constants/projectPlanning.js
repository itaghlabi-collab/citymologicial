/** Lots / catégories planning chantier */
export const PLANNING_LOTS = [
  'Gros œuvre',
  'Second œuvre',
  'TCE',
  'Électricité',
  'Plomberie',
  'Peinture',
  'Menuiserie',
  'Carrelage',
  'Étanchéité',
  'Finitions',
  'Autre',
];

export const PLANNING_STATUTS = [
  { value: 'a_faire', label: 'À faire', color: '#9E9E9E', bg: '#F5F5F5' },
  { value: 'en_cours', label: 'En cours', color: '#E65100', bg: '#FFF3E0' },
  { value: 'bloque', label: 'Bloqué', color: '#C62828', bg: '#FFEBEE' },
  { value: 'termine', label: 'Terminé', color: '#2E7D32', bg: '#E8F5E9' },
];

export const LOT_COLORS = {
  'Gros œuvre': '#795548',
  'Second œuvre': '#5D4037',
  TCE: '#1565C0',
  'Électricité': '#F9A825',
  Plomberie: '#0277BD',
  Peinture: '#8E24AA',
  Menuiserie: '#6D4C41',
  Carrelage: '#00897B',
  'Étanchéité': '#455A64',
  Finitions: '#7B1FA2',
  Autre: '#757575',
};

export function planningStatutMeta(statut) {
  return PLANNING_STATUTS.find((s) => s.value === statut) || PLANNING_STATUTS[0];
}

export function planningLotColor(lot) {
  return LOT_COLORS[lot] || LOT_COLORS.Autre;
}

export const RESOURCE_TYPES = [
  { value: 'travail', label: 'Travail' },
  { value: 'materiel', label: 'Matériel' },
  { value: 'sous_traitance', label: 'Sous-traitance' },
];

export const MILESTONE_STATUTS = [
  { value: 'a_venir', label: 'À venir', color: '#1565C0', bg: '#E3F2FD' },
  { value: 'atteint', label: 'Atteint', color: '#2E7D32', bg: '#E8F5E9' },
  { value: 'retarde', label: 'Retardé', color: '#C62828', bg: '#FFEBEE' },
  { value: 'annule', label: 'Annulé', color: '#757575', bg: '#F5F5F5' },
];

export const PLANNING_VIEWS = [
  { id: 'gantt', label: 'Gantt' },
  { id: 'wbs', label: 'WBS' },
  { id: 'ressources', label: 'Ressources' },
  { id: 'timeline', label: 'Jalons' },
  { id: 'collab', label: 'Collaboration' },
];

export function milestoneStatutMeta(statut) {
  return MILESTONE_STATUTS.find((s) => s.value === statut) || MILESTONE_STATUTS[0];
}

export function resourceTypeLabel(type) {
  return RESOURCE_TYPES.find((t) => t.value === type)?.label || type;
}

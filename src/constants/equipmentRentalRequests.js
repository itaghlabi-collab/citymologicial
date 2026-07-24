/** Demandes d'engin de location — constantes */

export const EQUIPMENT_TYPES = [
  'Tractopelle',
  'Manitou',
  'Compacteur',
  'Grue',
  'Nacelle',
  'Pelle mécanique',
  'Mini-pelle',
  'Chargeuse',
  'Bulldozer',
  'Camion-benne',
  'Chariot élévateur',
  'Bétonnière',
  'Groupe électrogène',
  'Compresseur',
  'Autre',
];

export const EQUIPMENT_DURATION_UNITS = [
  { value: 'heure', label: 'Heure' },
  { value: 'demi_journee', label: 'Demi-journée' },
  { value: 'journee', label: 'Journée' },
  { value: 'semaine', label: 'Semaine' },
  { value: 'mois', label: 'Mois' },
];

export const EQUIPMENT_URGENCY = [
  { value: 'normal', label: 'Normal', color: '#757575', badge: 'badge-grey' },
  { value: 'urgent', label: 'Urgent', color: '#E65100', badge: 'badge-orange' },
  { value: 'tres_urgent', label: 'Très urgent', color: '#C62828', badge: 'badge-red' },
];

export const EQUIPMENT_RENTAL_STATUTS = [
  { value: 'brouillon', label: 'Brouillon', color: '#757575', badge: 'badge-grey' },
  { value: 'envoyee', label: 'Envoyée', color: '#1565C0', badge: 'badge-blue' },
  { value: 'en_cours', label: 'En cours de traitement', color: '#F57C00', badge: 'badge-orange' },
  { value: 'validee', label: 'Validée', color: '#2E7D32', badge: 'badge-green' },
  { value: 'refusee', label: 'Refusée', color: '#C62828', badge: 'badge-red' },
  { value: 'traitee', label: 'Traitée', color: '#00897B', badge: 'badge-green' },
  { value: 'annulee', label: 'Annulée', color: '#9E9E9E', badge: 'badge-grey' },
  { value: 'archivee', label: 'Archivée', color: '#616161', badge: 'badge-grey' },
];

export function equipmentStatutLabel(statut) {
  return EQUIPMENT_RENTAL_STATUTS.find((s) => s.value === statut)?.label || statut || '—';
}

export function equipmentStatutMeta(statut) {
  return EQUIPMENT_RENTAL_STATUTS.find((s) => s.value === statut)
    || { value: statut, label: statut || '—', badge: 'badge-grey', color: '#757575' };
}

export function equipmentUrgencyMeta(urgence) {
  return EQUIPMENT_URGENCY.find((u) => u.value === urgence)
    || EQUIPMENT_URGENCY[0];
}

export function equipmentDurationLabel(unite) {
  return EQUIPMENT_DURATION_UNITS.find((u) => u.value === unite)?.label || unite || '—';
}

export function equipmentTypeDisplay(typeEngin, typeAutre) {
  if (typeEngin === 'Autre') return typeAutre ? `Autre — ${typeAutre}` : 'Autre';
  return typeEngin || '—';
}

/** Transitions autorisées selon le statut courant. */
export const EQUIPMENT_STATUS_TRANSITIONS = {
  brouillon: ['envoyee', 'annulee'],
  envoyee: ['en_cours', 'validee', 'refusee', 'annulee'],
  en_cours: ['validee', 'refusee', 'traitee', 'annulee'],
  validee: ['traitee', 'annulee'],
  refusee: ['archivee'],
  traitee: ['archivee'],
  annulee: ['archivee'],
  archivee: [],
};

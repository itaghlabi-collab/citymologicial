/** Statuts après intervention — comptes rendus SAV */
export const STATUT_APRES_INTERVENTION = [
  { value: 'probleme_resolu', label: 'Problème résolu' },
  { value: 'resolution_partielle', label: 'Résolution partielle' },
  { value: 'non_resolu', label: 'Problème non résolu' },
  { value: 'attente_pieces', label: 'En attente de pièces' },
  { value: 'attente_validation', label: 'En attente validation client' },
  { value: 'intervention_reportee', label: 'Intervention reportée' },
  { value: 'nouvelle_intervention', label: 'Nouvelle intervention requise' },
];

export function statutApresInterventionLabel(value) {
  if (!value) return '—';
  const found = STATUT_APRES_INTERVENTION.find((s) => s.value === value);
  return found?.label || value;
}

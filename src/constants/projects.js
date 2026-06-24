/** Types d'intervention projet (multi-sélection) */
export const PROJECT_INTERVENTION_TYPES = Object.freeze([
  'TCE',
  'Gros œuvre',
  'Second œuvre',
]);

export function normalizeTypesIntervention(raw) {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : String(raw).split(',').map((s) => s.trim());
  return PROJECT_INTERVENTION_TYPES.filter((t) => list.includes(t));
}

export function formatTypesInterventionLabel(types) {
  const list = normalizeTypesIntervention(types);
  return list.length ? list.join(' + ') : '—';
}

export function projectHasInterventionType(project, type) {
  if (!type) return true;
  return normalizeTypesIntervention(project?.types_intervention).includes(type);
}

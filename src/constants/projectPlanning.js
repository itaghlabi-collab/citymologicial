/** Lots / catégories planning chantier */
export const PLANNING_LOTS = [
  'Études et préparation',
  'Installation chantier',
  'Topographie et implantation',
  'Terrassement',
  'Gros œuvre',
  'Charpente métallique',
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

/** Lots historiques conservés pour l'affichage des tâches existantes */
export const PLANNING_LOTS_LEGACY = [];

export function mergePlanningLots(existingTasks = []) {
  const fromTasks = [...new Set((existingTasks || []).map((t) => t.lot).filter(Boolean))];
  const extras = fromTasks.filter((l) => !PLANNING_LOTS.includes(l) && !PLANNING_LOTS_LEGACY.includes(l));
  return [...PLANNING_LOTS, ...PLANNING_LOTS_LEGACY, ...extras];
}

export const PLANNING_STATUTS = [
  { value: 'a_faire', label: 'À faire', color: '#9E9E9E', bg: '#F5F5F5' },
  { value: 'en_cours', label: 'En cours', color: '#E65100', bg: '#FFF3E0' },
  { value: 'bloque', label: 'Bloqué', color: '#C62828', bg: '#FFEBEE' },
  { value: 'termine', label: 'Terminé', color: '#2E7D32', bg: '#E8F5E9' },
];

export const LOT_COLORS = {
  'Études et préparation': '#5C6BC0',
  'Installation chantier': '#78909C',
  'Topographie et implantation': '#26A69A',
  Terrassement: '#8D6E63',
  'Gros œuvre': '#795548',
  'Charpente métallique': '#546E7A',
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

/** Nuancier couleur personnalisée tâche planning (Gantt). */
export const PLANNING_TASK_PALETTE = [
  '#795548', '#5D4037', '#1565C0', '#0277BD', '#00897B',
  '#2E7D32', '#F9A825', '#E65100', '#C62828', '#8E24AA',
  '#7B1FA2', '#6D4C41', '#455A64', '#757575', '#212121',
];

/** Couleur barres résumé lot (Gantt + PDF). */
export const PLANNING_SUMMARY_BAR_COLOR = '#B71C1C';

export function hexToRgb(hex) {
  const h = (hex || '#757575').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Assombrit une couleur RGB (overlay avancement tâche — comme écran). */
export function darkenRgb(rgb, factor = 0.72) {
  const [r, g, b] = rgb;
  return [Math.round(r * factor), Math.round(g * factor), Math.round(b * factor)];
}

/** Éclaircit une couleur RGB (overlay avancement résumé — comme écran). */
export function lightenRgb(rgb, amount = 0.22) {
  const [r, g, b] = rgb;
  return [
    Math.min(255, Math.round(r + (255 - r) * amount)),
    Math.min(255, Math.round(g + (255 - g) * amount)),
    Math.min(255, Math.round(b + (255 - b) * amount)),
  ];
}

/** Normalise une couleur hex saisie (#RGB ou #RRGGBB). */
export function normalizePlanningTaskColor(hex) {
  const raw = (hex || '').trim();
  if (!raw) return '';
  let h = raw.startsWith('#') ? raw.slice(1) : raw;
  if (/^[0-9A-Fa-f]{3}$/.test(h)) {
    h = h.split('').map((c) => c + c).join('');
  }
  if (/^[0-9A-Fa-f]{6}$/.test(h)) return `#${h.toUpperCase()}`;
  return '';
}

/** Lit la couleur personnalisée depuis les champs possibles (DB / formulaire). */
export function extractPlanningTaskColor(task) {
  if (!task) return '';
  const raw = task.couleur ?? task.color ?? task.task_color ?? task.bar_color ?? '';
  return normalizePlanningTaskColor(raw);
}

/** Couleur barre tâche : nuancier > lot > défaut. */
export function planningTaskBarColor(task) {
  const custom = extractPlanningTaskColor(task);
  if (custom) return custom;
  return planningLotColor(task?.lot);
}

export function planningGanttBarColor(row) {
  if (row?.type === 'summary') return PLANNING_SUMMARY_BAR_COLOR;
  return planningTaskBarColor(row);
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

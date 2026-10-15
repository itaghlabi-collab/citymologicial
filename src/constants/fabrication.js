export const FAB_ATELIERS = [
  { value: 'menuiserie_bois', label: 'Menuiserie Bois' },
  { value: 'aluminium', label: 'Aluminium' },
  { value: 'ferronnerie', label: 'Ferronnerie' },
  { value: 'machinerie', label: 'Machinerie' },
];

export const FAB_MACHINES = [
  { value: 'cnc', label: 'CNC' },
  { value: 'laser', label: 'Laser' },
  { value: 'co2', label: 'CO₂' },
];

export const FAB_UNITES = [
  { value: 'unite', label: 'Unité' },
  { value: 'ensemble', label: 'Ensemble' },
  { value: 'm2', label: 'm²' },
  { value: 'ml', label: 'ml' },
  { value: 'autre', label: 'Autre' },
];

export const FAB_STATUTS = [
  { value: 'plan_recu', label: 'Plan reçu', badge: 'badge-blue' },
  { value: 'brouillon', label: 'Brouillon', badge: 'badge-grey' },
  { value: 'a_lancer', label: 'À lancer', badge: 'badge-grey' },
  { value: 'en_fabrication', label: 'En cours', badge: 'badge-orange' },
  { value: 'en_attente', label: 'En attente', badge: 'badge-blue' },
  { value: 'bloque', label: 'Bloquée', badge: 'badge-red' },
  { value: 'termine', label: 'Terminée', badge: 'badge-green' },
];

export const FAB_STATUTS_MAJ = [
  { value: 'a_lancer', label: 'À lancer' },
  { value: 'en_fabrication', label: 'En cours' },
  { value: 'en_attente', label: 'En attente' },
  { value: 'bloque', label: 'Bloquée' },
  { value: 'termine', label: 'Terminée' },
];

/** Statuts visibles dans « Suivi de production ». */
export const FAB_SUIVI_STATUTS = ['a_lancer', 'en_fabrication', 'en_attente', 'bloque'];

export const FAB_PRIORITES = [
  { value: 'normale', label: 'Normale', badge: 'badge-blue' },
  { value: 'haute', label: 'Haute', badge: 'badge-orange' },
  { value: 'urgente', label: 'Urgente', badge: 'badge-red' },
];

export const FAB_OPERATION_STATUTS = [
  { value: 'a_faire', label: 'À faire', badge: 'badge-grey' },
  { value: 'en_cours', label: 'En cours', badge: 'badge-orange' },
  { value: 'termine', label: 'Terminé', badge: 'badge-green' },
];

export const FAB_LIBRARY_STATUTS = {
  disponible: { label: 'Disponible', badge: 'badge-blue' },
  en_production: { label: 'En production', badge: 'badge-orange' },
  termine: { label: 'Terminé', badge: 'badge-green' },
};

export function fabMachineLabel(value) {
  return FAB_MACHINES.find((m) => m.value === value)?.label || '';
}

export function fabUniteLabel(value, autre = '') {
  if (value === 'autre') return autre || 'Autre';
  return FAB_UNITES.find((u) => u.value === value)?.label || value || '';
}

export function fabAtelierFullLabel(atelier, machine) {
  const base = fabAtelierLabel(atelier);
  const m = atelier === 'machinerie' ? fabMachineLabel(machine) : '';
  return m ? `${base} · ${m}` : base;
}

/** Avancement d'une désignation (réalisée / demandée), plafonné à 100. */
export function fabLinePercent(line) {
  const q = Number(line?.quantite) || 0;
  if (q <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round(((Number(line?.quantite_realisee) || 0) / q) * 100)));
}

/** Avancement global = moyenne des % par désignation (jamais de somme de quantités). */
export function fabLinesPercent(lines) {
  const list = (lines || []).filter((l) => Number(l?.quantite) > 0);
  if (!list.length) return null;
  const sum = list.reduce((acc, l) => acc + fabLinePercent(l), 0);
  return Math.round(sum / list.length);
}

export function fabFmtQty(n) {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? String(v) : v.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
}

export const FAB_AVANCEMENT_PRESETS = [0, 25, 50, 75, 100];

export const FAB_ECHEANCE_PROCHE_JOURS = 2;

export function fabAtelierLabel(value) {
  return FAB_ATELIERS.find((a) => a.value === value)?.label || value || '—';
}

export function fabStatutMeta(value) {
  return FAB_STATUTS.find((s) => s.value === value) || { value, label: value || '—', badge: 'badge-grey' };
}

export function fabPrioriteMeta(value) {
  return FAB_PRIORITES.find((p) => p.value === value) || { value, label: value || '—', badge: 'badge-grey' };
}

export function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function daysBetween(fromIso, toIso) {
  if (!fromIso || !toIso) return null;
  const a = new Date(`${fromIso}T00:00:00`);
  const b = new Date(`${toIso}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/** Jours de retard (> 0) par rapport à la date prévue de fin. */
export function fabDelayDays(plan, asOf = todayISO()) {
  if (!plan?.date_fin_prevue) return 0;
  const end = plan.statut === 'termine' && plan.date_fin_reelle
    ? plan.date_fin_reelle
    : asOf;
  const days = daysBetween(plan.date_fin_prevue, end);
  return days > 0 ? days : 0;
}

export function fabIsLate(plan, asOf = todayISO()) {
  if (!plan || plan.statut === 'termine' || plan.statut === 'brouillon') return false;
  return fabDelayDays(plan, asOf) > 0;
}

export function fabIsDueSoon(plan, asOf = todayISO()) {
  if (!plan || plan.statut === 'termine' || plan.statut === 'bloque' || plan.statut === 'brouillon') return false;
  if (!plan.date_fin_prevue) return false;
  const days = daysBetween(asOf, plan.date_fin_prevue);
  return days !== null && days >= 0 && days <= FAB_ECHEANCE_PROCHE_JOURS;
}

export function fabOnTimeLabel(plan) {
  if (plan?.statut !== 'termine') return '';
  const delay = fabDelayDays(plan, plan.date_fin_reelle || todayISO());
  if (!plan.date_fin_prevue) return 'Délai non renseigné';
  if (delay <= 0) return 'Terminé dans les délais';
  return `Retard : ${delay} jour${delay > 1 ? 's' : ''}`;
}

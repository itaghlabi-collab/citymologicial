export const FAB_ATELIERS = [
  { value: 'menuiserie_bois', label: 'Menuiserie Bois' },
  { value: 'aluminium', label: 'Aluminium' },
  { value: 'ferronnerie', label: 'Ferronnerie' },
];

export const FAB_STATUTS = [
  { value: 'plan_recu', label: 'Plan reçu', badge: 'badge-blue' },
  { value: 'a_lancer', label: 'À lancer', badge: 'badge-grey' },
  { value: 'en_fabrication', label: 'En fabrication', badge: 'badge-orange' },
  { value: 'bloque', label: 'Bloqué', badge: 'badge-red' },
  { value: 'termine', label: 'Terminé', badge: 'badge-green' },
];

export const FAB_STATUTS_MAJ = [
  { value: 'a_lancer', label: 'À lancer' },
  { value: 'en_fabrication', label: 'En fabrication' },
  { value: 'bloque', label: 'Bloqué' },
  { value: 'termine', label: 'Terminé' },
];

export const FAB_PRIORITES = [
  { value: 'normale', label: 'Normale', badge: 'badge-blue' },
  { value: 'urgente', label: 'Urgente', badge: 'badge-red' },
];

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
  if (!plan || plan.statut === 'termine') return false;
  return fabDelayDays(plan, asOf) > 0;
}

export function fabIsDueSoon(plan, asOf = todayISO()) {
  if (!plan || plan.statut === 'termine' || plan.statut === 'bloque') return false;
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

/**
 * resourceRequestCoverage.js — Calcul centralisé couverture demandes RH
 * Source de vérité : resource_request_workers (affectations actives par demande)
 */
import { BESOIN_REQUEST_STATUTS } from '../../constants/projectBesoins';

/** Nombre d'ouvriers affectés — priorise le détail, sinon workers_count liste */
export function countAssignedWorkers(request) {
  if (!request) return 0;
  const workers = request.workers;
  if (Array.isArray(workers) && workers.length > 0) return workers.length;
  const count = Number(request.workers_count);
  if (Number.isFinite(count) && count >= 0) return count;
  return 0;
}

/** KPIs couverture recalculés dynamiquement */
export function computeRequestCoverage(request) {
  const demanded = Number(request?.quantite) || 0;
  const assigned = countAssignedWorkers(request);
  const manque = Math.max(0, demanded - assigned);
  const taux = demanded > 0 ? Math.round((assigned / demanded) * 100) : 0;

  const openRecruitments = Number(request?.open_recruitments_count) || 0;

  if (openRecruitments > 0 && manque > 0) {
    return { demanded, assigned, manque, taux, label: 'Recrutement en cours', badge: 'badge-purple', color: '#7B1FA2' };
  }
  if (manque === 0 && assigned > 0) {
    return { demanded, assigned, manque, taux, label: 'Couvert', badge: 'badge-green', color: '#2E7D32' };
  }
  if (assigned > 0) {
    return { demanded, assigned, manque, taux, label: 'Partiellement couvert', badge: 'badge-orange', color: '#F57C00' };
  }
  return { demanded, assigned, manque, taux, label: 'Non couvert', badge: 'badge-red', color: '#C62828' };
}

/** Statut dérivé des affectations — ne pas faire confiance au statut stocké seul */
export function deriveRequestStatut(request, coverage = null) {
  const cov = coverage || computeRequestCoverage(request);
  const stored = request?.statut || 'en_attente';

  if (['refusee', 'cloturee'].includes(stored)) return stored;

  const openRecruitments = Number(request?.open_recruitments_count) || 0;

  if (cov.demanded > 0 && cov.assigned >= cov.demanded) return 'affectee';
  if (openRecruitments > 0 && cov.manque > 0) return 'recrutement_en_cours';
  if (cov.assigned > 0 && cov.manque > 0) return 'partielle';
  if (stored === 'en_cours' && cov.assigned > 0) return 'en_cours';
  if (stored === 'en_attente') return 'en_attente';
  return stored;
}

export function requestStatutLabel(statut) {
  return BESOIN_REQUEST_STATUTS.find((s) => s.value === statut)?.label || statut;
}

export function deriveRequestStatutLabel(request, coverage = null) {
  return requestStatutLabel(deriveRequestStatut(request, coverage));
}

export function emitRhAssignmentsUpdated(projectId) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('citymo:rh-assignments-updated', {
    detail: { projectId: projectId ? String(projectId) : null },
  }));
}

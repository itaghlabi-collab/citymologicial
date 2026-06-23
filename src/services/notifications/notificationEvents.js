/**
 * notificationEvents.js — Helpers métier (paiements, tâches, congés, caisse)
 */
import {
  notifySuperAdmins,
  notifySuperAdminsOnceDaily,
  notifyExecutivesAndRh,
  notifyUser,
  NOTIFICATION_TYPES,
  NOTIFICATION_PRIORITIES,
  formatMad,
  moduleActionUrl,
} from './notifications';
import { findProfileById, findProfileByAssigneeName } from './notificationRecipients';
import { FINANCE_SOURCE_TYPES } from '../finance/financeSync';

const PAYMENT_HIGH_THRESHOLD = 5000;

const SOURCE_LABELS = {
  [FINANCE_SOURCE_TYPES.WORKER_PAYMENT]: 'Paiement ouvrier',
  [FINANCE_SOURCE_TYPES.WORKER_WEEKLY_PAYMENT]: 'Paiement ouvrier',
  [FINANCE_SOURCE_TYPES.SUBCONTRACTOR_PAYMENT]: 'Paiement sous-traitant',
  [FINANCE_SOURCE_TYPES.PAYMENT_ORDER]: 'Ordre de paiement',
  [FINANCE_SOURCE_TYPES.CHARGE]: 'Charge',
};

const MODULE_BY_SOURCE = {
  [FINANCE_SOURCE_TYPES.WORKER_PAYMENT]: 'paiement-hebdo',
  [FINANCE_SOURCE_TYPES.WORKER_WEEKLY_PAYMENT]: 'paiement-hebdo',
  [FINANCE_SOURCE_TYPES.SUBCONTRACTOR_PAYMENT]: 'sous-traitants',
  [FINANCE_SOURCE_TYPES.PAYMENT_ORDER]: 'ordres-paiement',
  [FINANCE_SOURCE_TYPES.CHARGE]: 'charges',
};

/** Cas A — Paiement réalisé (sync caisse, action created uniquement). */
export async function notifyPaymentRealized({ sourceType, sourceId, entity, montant, beneficiaire }) {
  const amount = Number(montant) || 0;
  if (!amount || !sourceId) return;
  const label = SOURCE_LABELS[sourceType] || 'Paiement';
  const name = beneficiaire || entity?.ouvrier || entity?.subcontractorName || entity?.contrepartie || entity?.beneficiaire || '—';
  const priority = amount >= PAYMENT_HIGH_THRESHOLD
    ? NOTIFICATION_PRIORITIES.HIGH
    : NOTIFICATION_PRIORITIES.NORMAL;

  return notifySuperAdmins({
    title: 'Paiement réalisé',
    message: `Un paiement de ${formatMad(amount)} a été réalisé pour ${name} — ${label}.`,
    type: NOTIFICATION_TYPES.PAYMENT,
    priority,
    entityType: sourceType,
    entityId: sourceId,
    actionUrl: moduleActionUrl(MODULE_BY_SOURCE[sourceType] || 'feuille-caisse'),
  });
}

/** Cas B — Tâche DG créée : notification uniquement pour l'assigné. */
export async function notifyDgTaskCreated(task) {
  if (!task?.id || !task.is_dg_task) return;
  const assignee = await findProfileByAssigneeName(task.assigne);
  if (!assignee?.id) return;
  return notifyUser(assignee.id, {
    title: 'Tâche DG',
    message: `La Direction vous a assigné la tâche « ${task.titre} »${task.dateLimite ? ` — échéance ${task.dateLimite}` : ''}.`,
    type: NOTIFICATION_TYPES.TASK,
    priority: NOTIFICATION_PRIORITIES.HIGH,
    entityType: 'internal_task_dg_assign',
    entityId: task.id,
    actionUrl: moduleActionUrl('taches'),
  });
}

/** Cas B — Tâche créée (tâches classiques uniquement). */
export async function notifyTaskCreated(task) {
  if (!task?.id) return;
  if (task.is_dg_task) {
    return notifyDgTaskCreated(task);
  }
  return notifySuperAdmins({
    title: 'Nouvelle tâche',
    message: `Tâche « ${task.titre} » créée${task.assigne ? ` — assignée à ${task.assigne}` : ''}.`,
    type: NOTIFICATION_TYPES.TASK,
    priority: task.dg_push ? NOTIFICATION_PRIORITIES.URGENT : NOTIFICATION_PRIORITIES.NORMAL,
    entityType: 'internal_task',
    entityId: task.id,
    actionUrl: moduleActionUrl('taches'),
  });
}

/** Cas B — Tâche urgente DG (Push DG). */
export async function notifyTaskDgUrgent(task) {
  if (!task?.id) return;
  return notifySuperAdmins({
    title: 'Tâche urgente DG',
    message: `Tâche « ${task.titre} » marquée urgente pour la Direction.${task.dg_note ? ` Note : ${task.dg_note}` : ''}`,
    type: NOTIFICATION_TYPES.TASK,
    priority: NOTIFICATION_PRIORITIES.URGENT,
    entityType: 'internal_task_dg',
    entityId: task.id,
    actionUrl: moduleActionUrl('taches'),
  });
}

/** Cas B — Tâche terminée. */
export async function notifyTaskCompleted(task) {
  if (!task?.id) return;
  return notifySuperAdmins({
    title: 'Tâche terminée',
    message: `La tâche « ${task.titre} » est terminée.`,
    type: NOTIFICATION_TYPES.TASK,
    priority: NOTIFICATION_PRIORITIES.LOW,
    entityType: 'internal_task_done',
    entityId: task.id,
    actionUrl: moduleActionUrl('taches'),
  });
}

/** Cas C — Feuille de caisse à valider. */
export async function notifyCashReviewPending({ reviewDate, opsCount = 0 }) {
  if (!reviewDate) return;
  const entityType = `cash_review_pending_${reviewDate}`;
  return notifySuperAdminsOnceDaily(entityType, {
    title: 'Validation caisse requise',
    message: opsCount > 0
      ? `Veuillez valider la caisse du ${reviewDate} — ${opsCount} opération(s).`
      : `Veuillez valider la caisse du ${reviewDate} (clôture).`,
    type: NOTIFICATION_TYPES.CASH_REVIEW,
    priority: NOTIFICATION_PRIORITIES.HIGH,
    entityType,
    entityId: null,
    actionUrl: moduleActionUrl('feuille-caisse'),
  });
}

/** Cas C — Feuille de caisse validée. */
export async function notifyCashReviewCompleted({ reviewDate, entrees = 0, sorties = 0, soldeFin = 0 }) {
  if (!reviewDate) return;
  const entityType = `cash_review_done_${reviewDate}`;
  return notifySuperAdmins({
    title: 'Caisse validée',
    message: `Caisse du ${reviewDate} validée — entrées ${formatMad(entrees)}, sorties ${formatMad(sorties)}, solde fin ${formatMad(soldeFin)}.`,
    type: NOTIFICATION_TYPES.CASH_REVIEW,
    priority: NOTIFICATION_PRIORITIES.NORMAL,
    entityType,
    entityId: null,
    actionUrl: moduleActionUrl('feuille-caisse'),
  });
}

/** Cas D — Demande de congé créée. */
export async function notifyLeaveCreated(leave) {
  if (!leave?.id) return;
  const name = leave.employe || 'Employé';
  const debut = leave.dateDebut || leave.date_debut || '—';
  const fin = leave.dateFin || leave.date_fin || '—';
  return notifyExecutivesAndRh({
    title: 'Nouvelle demande de congé',
    message: `Demande de congé de ${name} du ${debut} au ${fin}.`,
    type: NOTIFICATION_TYPES.LEAVE_REQUEST,
    priority: NOTIFICATION_PRIORITIES.HIGH,
    entityType: 'leave_request',
    entityId: leave.id,
    actionUrl: moduleActionUrl('conges'),
  });
}

/** Cas D — Congé approuvé / refusé → notifier le demandeur. */
export async function notifyLeaveStatusChanged(leave, statut) {
  if (!leave?.id) return;
  const requesterId = leave.created_by;
  if (!requesterId) return;
  const approved = statut === 'Approuve' || statut === 'Approuvé';
  const refused = statut === 'Refuse' || statut === 'Refusé';
  if (!approved && !refused) return;

  const profile = await findProfileById(requesterId);
  const name = leave.employe || profile?.nom || 'Employé';

  return notifyUser(requesterId, {
    title: approved ? 'Congé approuvé' : 'Congé refusé',
    message: approved
      ? `Votre demande de congé (${leave.dateDebut || leave.date_debut} → ${leave.dateFin || leave.date_fin}) a été approuvée.`
      : `Votre demande de congé (${leave.dateDebut || leave.date_debut} → ${leave.dateFin || leave.date_fin}) a été refusée.`,
    type: NOTIFICATION_TYPES.LEAVE_REQUEST,
    priority: NOTIFICATION_PRIORITIES.NORMAL,
    entityType: 'leave_status',
    entityId: leave.id,
    actionUrl: moduleActionUrl('conges'),
  });
}

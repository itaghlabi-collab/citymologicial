/**
 * notificationEvents.js — Helpers métier (paiements, tâches, congés, caisse)
 */
import {
  notifySuperAdmins,
  notifyRhUsers,
  notifyFinanceUsers,
  notifyInventaireUsers,
  notifyUser,
  notifyTargeted,
  hasNotificationForUserToday,
  NOTIFICATION_TYPES,
  NOTIFICATION_PRIORITIES,
  formatMad,
  moduleActionUrl,
} from './notifications';
import { findProfileById, findProfileByAssigneeName } from './notificationRecipients';
import { NOTIFICATION_SUBMODULES } from './notificationTargeting';
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

/** Paiement réalisé → Finance & Trésorerie ; montants élevés → DG en plus. */
export async function notifyPaymentRealized({ sourceType, sourceId, entity, montant, beneficiaire }) {
  const amount = Number(montant) || 0;
  if (!amount || !sourceId) return;
  const label = SOURCE_LABELS[sourceType] || 'Paiement';
  const name = beneficiaire || entity?.ouvrier || entity?.subcontractorName || entity?.contrepartie || entity?.beneficiaire || '—';
  const priority = amount >= PAYMENT_HIGH_THRESHOLD
    ? NOTIFICATION_PRIORITIES.HIGH
    : NOTIFICATION_PRIORITIES.NORMAL;
  const submodule = MODULE_BY_SOURCE[sourceType] || NOTIFICATION_SUBMODULES.FEUILLE_CAISSE;

  const payload = {
    title: 'Paiement réalisé',
    message: `Un paiement de ${formatMad(amount)} a été réalisé pour ${name} — ${label}.`,
    type: NOTIFICATION_TYPES.PAYMENT,
    priority,
    entityType: sourceType,
    entityId: sourceId,
    actionUrl: moduleActionUrl(submodule),
    submoduleCode: submodule,
  };

  await notifyFinanceUsers(payload, submodule);
  if (amount >= PAYMENT_HIGH_THRESHOLD) {
    await notifySuperAdmins(payload);
  }
}

/** Tâche DG créée : notification uniquement pour l'assigné. */
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
    submoduleCode: NOTIFICATION_SUBMODULES.TACHES,
  });
}

/** Tâche créée : assigné uniquement, sinon utilisateurs module Tâches. */
export async function notifyTaskCreated(task) {
  if (!task?.id) return;
  if (task.is_dg_task) {
    return notifyDgTaskCreated(task);
  }
  const payload = {
    title: 'Nouvelle tâche',
    message: `Tâche « ${task.titre} » créée${task.assigne ? ` — assignée à ${task.assigne}` : ''}.`,
    type: NOTIFICATION_TYPES.TASK,
    priority: task.dg_push ? NOTIFICATION_PRIORITIES.URGENT : NOTIFICATION_PRIORITIES.NORMAL,
    entityType: 'internal_task',
    entityId: task.id,
    actionUrl: moduleActionUrl('taches'),
    submoduleCode: NOTIFICATION_SUBMODULES.TACHES,
  };
  const assignee = await findProfileByAssigneeName(task.assigne);
  if (assignee?.id) {
    return notifyUser(assignee.id, payload);
  }
  return notifyTargeted({ submoduleCode: NOTIFICATION_SUBMODULES.TACHES }, payload);
}

/** Relance Directeur → notification à l'assigné uniquement. */
export async function notifyTaskDgRelance(task, customMessage) {
  if (!task?.id) return;
  const assignee = await findProfileByAssigneeName(task.assigne);
  if (!assignee?.id) return;
  let message = `Le Directeur vous demande une mise à jour concernant la tâche :\n${task.titre}`;
  if (customMessage?.trim()) {
    message += `\n\n${customMessage.trim()}`;
  }
  return notifyUser(assignee.id, {
    title: 'Relance Directeur',
    message,
    type: NOTIFICATION_TYPES.TASK,
    priority: NOTIFICATION_PRIORITIES.HIGH,
    entityType: 'internal_task_dg_relance',
    entityId: task.id,
    actionUrl: moduleActionUrl('taches'),
    submoduleCode: NOTIFICATION_SUBMODULES.TACHES,
  });
}

/** Tâche urgente DG → Direction uniquement. */
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
    submoduleCode: NOTIFICATION_SUBMODULES.TACHES,
  });
}

/** Tâche terminée → créateur et assigné. */
export async function notifyTaskCompleted(task) {
  if (!task?.id) return;
  const payload = {
    title: 'Tâche terminée',
    message: `La tâche « ${task.titre} » est terminée.`,
    type: NOTIFICATION_TYPES.TASK,
    priority: NOTIFICATION_PRIORITIES.LOW,
    entityType: 'internal_task_done',
    entityId: task.id,
    actionUrl: moduleActionUrl('taches'),
    submoduleCode: NOTIFICATION_SUBMODULES.TACHES,
  };
  const recipients = new Set();
  if (task.created_by) recipients.add(task.created_by);
  const assignee = await findProfileByAssigneeName(task.assigne);
  if (assignee?.id) recipients.add(assignee.id);
  if (!recipients.size) {
    return notifyTargeted({ submoduleCode: NOTIFICATION_SUBMODULES.TACHES }, payload);
  }
  return Promise.all([...recipients].map((id) => notifyUser(id, payload)));
}

/** Feuille de caisse à valider → Finance (une fois par jour). */
export async function notifyCashReviewPending({ reviewDate, opsCount = 0 }) {
  if (!reviewDate) return;
  const entityType = `cash_review_pending_${reviewDate}`;
  const { NOTIFICATION_DEPARTMENTS, NOTIFICATION_SUBMODULES, resolveNotificationRecipients } = await import('./notificationTargeting');
  const userIds = await resolveNotificationRecipients({
    departmentId: NOTIFICATION_DEPARTMENTS.COMPTABILITE,
    submoduleCode: NOTIFICATION_SUBMODULES.FEUILLE_CAISSE,
  });
  const payload = {
    title: 'Validation caisse requise',
    message: opsCount > 0
      ? `Veuillez valider la caisse du ${reviewDate} — ${opsCount} opération(s).`
      : `Veuillez valider la caisse du ${reviewDate} (clôture).`,
    type: NOTIFICATION_TYPES.CASH_REVIEW,
    priority: NOTIFICATION_PRIORITIES.HIGH,
    entityType,
    entityId: null,
    actionUrl: moduleActionUrl('feuille-caisse'),
    submoduleCode: NOTIFICATION_SUBMODULES.FEUILLE_CAISSE,
  };
  const results = [];
  for (const id of userIds) {
    const exists = await hasNotificationForUserToday(id, payload.type, entityType);
    if (exists) continue;
    const n = await notifyUser(id, payload);
    if (n) results.push(n);
  }
  return results;
}

/** Feuille de caisse validée → Finance. */
export async function notifyCashReviewCompleted({ reviewDate, entrees = 0, sorties = 0, soldeFin = 0 }) {
  if (!reviewDate) return;
  const entityType = `cash_review_done_${reviewDate}`;
  return notifyFinanceUsers({
    title: 'Caisse validée',
    message: `Caisse du ${reviewDate} validée — entrées ${formatMad(entrees)}, sorties ${formatMad(sorties)}, solde fin ${formatMad(soldeFin)}.`,
    type: NOTIFICATION_TYPES.CASH_REVIEW,
    priority: NOTIFICATION_PRIORITIES.NORMAL,
    entityType,
    entityId: null,
    actionUrl: moduleActionUrl('feuille-caisse'),
    submoduleCode: NOTIFICATION_SUBMODULES.FEUILLE_CAISSE,
  }, NOTIFICATION_SUBMODULES.FEUILLE_CAISSE);
}

/** Demande de congé → RH uniquement. */
export async function notifyLeaveCreated(leave) {
  if (!leave?.id) return;
  const name = leave.employe || 'Employé';
  const debut = leave.dateDebut || leave.date_debut || '—';
  const fin = leave.dateFin || leave.date_fin || '—';
  return notifyRhUsers({
    title: 'Nouvelle demande de congé',
    message: `Demande de congé de ${name} du ${debut} au ${fin}.`,
    type: NOTIFICATION_TYPES.LEAVE_REQUEST,
    priority: NOTIFICATION_PRIORITIES.HIGH,
    entityType: 'leave_request',
    entityId: leave.id,
    actionUrl: moduleActionUrl('conges'),
    submoduleCode: NOTIFICATION_SUBMODULES.CONGES,
  });
}

/** Congé approuvé / refusé → demandeur uniquement. */
export async function notifyLeaveStatusChanged(leave, statut) {
  if (!leave?.id) return;
  const requesterId = leave.created_by;
  if (!requesterId) return;
  const approved = statut === 'Approuve' || statut === 'Approuvé';
  const refused = statut === 'Refuse' || statut === 'Refusé';
  if (!approved && !refused) return;

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
    submoduleCode: NOTIFICATION_SUBMODULES.CONGES,
  });
}

/** Demande de ressources chantier → RH. */
export async function notifyResourceRequestCreated(request) {
  if (!request?.id) return;
  const projet = request.project_name || request.project_ref || 'Projet';
  return notifyRhUsers({
    title: 'Demande de ressources chantier',
    message: `${projet} — ${request.quantite} × ${request.fonction} (${request.priorite || 'Normale'}).`,
    type: NOTIFICATION_TYPES.RESOURCE_REQUEST,
    priority: request.priorite === 'Urgente'
      ? NOTIFICATION_PRIORITIES.URGENT
      : NOTIFICATION_PRIORITIES.HIGH,
    entityType: 'resource_request',
    entityId: request.id,
    actionUrl: moduleActionUrl('demandes-ressources'),
    submoduleCode: NOTIFICATION_SUBMODULES.DEMANDES_RESSOURCES,
  });
}

/** Demande de ressources validée → demandeur. */
export async function notifyResourceRequestValidated(request) {
  if (!request?.id || !request.requested_by) return;
  return notifyUser(request.requested_by, {
    title: 'Ressources affectées',
    message: `Votre demande ${request.ref || ''} — ${request.fonction} a été traitée. Les ouvriers sont affectés au projet.`,
    type: NOTIFICATION_TYPES.RESOURCE_REQUEST,
    priority: NOTIFICATION_PRIORITIES.NORMAL,
    entityType: 'resource_request_validated',
    entityId: request.id,
    actionUrl: moduleActionUrl('projets'),
    submoduleCode: NOTIFICATION_SUBMODULES.DEMANDES_RESSOURCES,
  });
}

/** Demande chantier soumise → logistique / inventaire. */
export async function notifySiteRequestSubmitted(request) {
  if (!request?.id) return;
  return notifyInventaireUsers({
    title: 'Nouvelle demande chantier',
    message: `${request.ref} — ${request.project_name || 'Projet'} (${request.priorite}). ${request.distinct_articles || 0} article(s) demandé(s).`,
    type: NOTIFICATION_TYPES.SITE_MATERIAL_REQUEST,
    priority: request.priorite === 'Critique'
      ? NOTIFICATION_PRIORITIES.URGENT
      : request.priorite === 'Urgente'
        ? NOTIFICATION_PRIORITIES.HIGH
        : NOTIFICATION_PRIORITIES.NORMAL,
    entityType: 'site_material_request',
    entityId: request.id,
    actionUrl: moduleActionUrl('demandes-chantier'),
    submoduleCode: NOTIFICATION_SUBMODULES.DEMANDES_CHANTIER,
  });
}

/** Demande chantier — validation DG. */
export async function notifySiteRequestDgRequired(request) {
  if (!request?.id) return;
  return notifySuperAdmins({
    title: 'Demande chantier — validation DG',
    message: `La demande ${request.ref} (${request.project_name}) nécessite votre validation.`,
    type: NOTIFICATION_TYPES.SITE_MATERIAL_REQUEST,
    priority: NOTIFICATION_PRIORITIES.HIGH,
    entityType: 'site_material_request_dg',
    entityId: request.id,
    actionUrl: moduleActionUrl('demandes-chantier'),
    submoduleCode: NOTIFICATION_SUBMODULES.DEMANDES_CHANTIER,
  });
}

/** Matériel prêt → chef de chantier (demandeur). */
export async function notifySiteRequestReady(request) {
  if (!request?.id || !request.requested_by) return;
  return notifyUser(request.requested_by, {
    title: 'Matériel prêt',
    message: `Votre demande ${request.ref} est prête au dépôt pour le chantier ${request.project_name || ''}.`,
    type: NOTIFICATION_TYPES.SITE_MATERIAL_REQUEST,
    priority: NOTIFICATION_PRIORITIES.NORMAL,
    entityType: 'site_material_request_ready',
    entityId: request.id,
    actionUrl: moduleActionUrl('demandes-chantier'),
    submoduleCode: NOTIFICATION_SUBMODULES.DEMANDES_CHANTIER,
  });
}

/** Demande livrée → chef de chantier. */
export async function notifySiteRequestDelivered(request) {
  if (!request?.id || !request.requested_by) return;
  const bon = request.movement_ref ? ` Bon de sortie : ${request.movement_ref}.` : '';
  return notifyUser(request.requested_by, {
    title: 'Matériel livré',
    message: `Votre demande ${request.ref} a été livrée.${bon}`,
    type: NOTIFICATION_TYPES.SITE_MATERIAL_REQUEST,
    priority: NOTIFICATION_PRIORITIES.NORMAL,
    entityType: 'site_material_request_delivered',
    entityId: request.id,
    actionUrl: moduleActionUrl('demandes-chantier'),
    submoduleCode: NOTIFICATION_SUBMODULES.DEMANDES_CHANTIER,
  });
}

/** Accusé réception → demandeur. */
export async function notifySiteRequestReceived(request) {
  if (!request?.id || !request.requested_by) return;
  return notifyUser(request.requested_by, {
    title: 'Demande reçue',
    message: `Votre demande ${request.ref} a bien été reçue par le magasin.`,
    type: NOTIFICATION_TYPES.SITE_MATERIAL_REQUEST,
    priority: NOTIFICATION_PRIORITIES.LOW,
    entityType: 'site_material_request_received',
    entityId: request.id,
    actionUrl: moduleActionUrl('demandes-chantier'),
    submoduleCode: NOTIFICATION_SUBMODULES.DEMANDES_CHANTIER,
  });
}

/** Demande chantier traitée par le magasinier. */
export async function notifySiteRequestPrepared(request, { partial = false } = {}) {
  if (!request?.id || !request.requested_by) return;
  const title = partial ? 'Demande chantier — préparation partielle' : 'Demande chantier — en préparation';
  const message = partial
    ? `Votre demande ${request.ref} a été partiellement préparée. Certains articles peuvent nécessiter un achat.`
    : `Votre demande ${request.ref} est en cours de préparation au dépôt.`;
  return notifyUser(request.requested_by, {
    title,
    message,
    type: NOTIFICATION_TYPES.SITE_MATERIAL_REQUEST,
    priority: NOTIFICATION_PRIORITIES.NORMAL,
    entityType: partial ? 'site_material_request_partial' : 'site_material_request_prepared',
    entityId: request.id,
    actionUrl: moduleActionUrl('demandes-chantier'),
    submoduleCode: NOTIFICATION_SUBMODULES.DEMANDES_CHANTIER,
  });
}

/** Rupture stock → demandeur + Achats. */
export async function notifySiteRequestPurchaseCreated(siteRequest, purchaseRequest) {
  if (!siteRequest?.id || !purchaseRequest?.id) return;
  const results = [];
  if (siteRequest.requested_by) {
    results.push(await notifyUser(siteRequest.requested_by, {
      title: 'Demande d\'achat générée',
      message: `Rupture de stock sur ${siteRequest.ref} — demande d'achat ${purchaseRequest.ref || ''} créée pour le projet ${siteRequest.project_name || ''}.`,
      type: NOTIFICATION_TYPES.PURCHASE_REQUEST,
      priority: NOTIFICATION_PRIORITIES.HIGH,
      entityType: 'purchase_request_from_site',
      entityId: purchaseRequest.id,
      actionUrl: moduleActionUrl('demandes-achat'),
      submoduleCode: NOTIFICATION_SUBMODULES.DEMANDES_ACHAT,
    }));
  }
  const { notifyAchatsUsers } = await import('./notifications');
  results.push(...await notifyAchatsUsers({
    title: 'Demande d\'achat générée (stock)',
    message: `${purchaseRequest.ref || ''} — ${siteRequest.project_name || 'Projet'} (rupture ${siteRequest.ref}).`,
    type: NOTIFICATION_TYPES.PURCHASE_REQUEST,
    priority: NOTIFICATION_PRIORITIES.HIGH,
    entityType: 'purchase_request_from_site_achats',
    entityId: purchaseRequest.id,
    actionUrl: moduleActionUrl('demandes-achat'),
    submoduleCode: NOTIFICATION_SUBMODULES.DEMANDES_ACHAT,
  }));
  return results.filter(Boolean);
}

/**
 * purchaseWorkflowNotifications.js — Notifications workflow Achats (ciblées)
 */
import {
  notifyUser,
  notifySuperAdmins,
  notifyAchatsUsers,
  notifyFinanceUsers,
  notifyInventaireUsers,
  NOTIFICATION_TYPES,
  NOTIFICATION_PRIORITIES,
} from './notifications';
import { NOTIFICATION_SUBMODULES } from './notificationTargeting';
import { getSupabase } from '../../lib/supabase';
import { PURCHASE_ASSIGNEE } from '../../constants/purchaseWorkflow';

function purchaseRequestDetailUrl(requestId) {
  return `/?module=achats&tab=demandes-achat&requestId=${requestId}`;
}

function moduleUrl(requestId) {
  if (requestId) return purchaseRequestDetailUrl(requestId);
  return '/?module=achats&tab=demandes-achat';
}

async function findChargeeAchatsUserIds() {
  const { data: employees } = await getSupabase()
    .from('employees')
    .select('id, firstname, lastname, email')
    .or('lastname.ilike.%WOTFI%,firstname.ilike.%LAILA%');
  const emails = (employees || [])
    .filter((e) => {
      const n = `${e.firstname || ''} ${e.lastname || ''}`.toUpperCase();
      return n.includes('LAILA') && n.includes('WOTFI');
    })
    .map((e) => (e.email || '').toLowerCase())
    .filter(Boolean);

  if (!emails.length) return [];

  const { data: profiles } = await getSupabase()
    .from('profiles')
    .select('id, email')
    .in('email', emails);
  return (profiles || []).map((p) => p.id);
}

async function notifyChargeeAchats(payload) {
  const ids = await findChargeeAchatsUserIds();
  if (ids.length) {
    return Promise.all(ids.map((userId) => notifyUser(userId, {
      ...payload,
      submoduleCode: NOTIFICATION_SUBMODULES.DEMANDES_ACHAT,
    })));
  }
  return notifyAchatsUsers(payload);
}

async function notifyDg(payload) {
  return notifySuperAdmins({
    ...payload,
    submoduleCode: NOTIFICATION_SUBMODULES.DEMANDES_ACHAT,
  });
}

async function notifyRequester(request, payload) {
  if (!request?.requester_user_id) return null;
  return notifyUser(request.requester_user_id, {
    ...payload,
    submoduleCode: NOTIFICATION_SUBMODULES.DEMANDES_ACHAT,
  });
}

export async function notifyPurchaseRequestSubmitted(request) {
  if (!request?.id) return;
  await notifyChargeeAchats({
    title: 'Nouvelle demande d\'achat',
    message: `${request.ref} — ${request.titre}\nProjet : ${request.project_name || '—'}\nDemandeur : ${request.requester_name || '—'}`,
    type: NOTIFICATION_TYPES.PURCHASE_REQUEST,
    priority: NOTIFICATION_PRIORITIES.HIGH,
    entityType: 'purchase_request_submitted',
    entityId: request.id,
    actionUrl: moduleUrl(request.id),
  });
}

export async function notifyPurchaseQuoteAdded(request) {
  if (!request?.id) return;
  await notifyDg({
    title: 'Devis prêts à valider',
    message: `La demande ${request.ref} dispose de devis fournisseurs à comparer.\n${PURCHASE_ASSIGNEE.label}`,
    type: NOTIFICATION_TYPES.PURCHASE_REQUEST,
    priority: NOTIFICATION_PRIORITIES.HIGH,
    entityType: 'purchase_quotes_ready',
    entityId: request.id,
    actionUrl: purchaseRequestDetailUrl(request.id),
  });
}

export async function notifyPurchaseReadyForDg(request) {
  if (!request?.id) return;
  await notifyDg({
    title: 'Validation fournisseur requise',
    message: `La demande ${request.ref} est en attente de validation DG.`,
    type: NOTIFICATION_TYPES.PURCHASE_REQUEST,
    priority: NOTIFICATION_PRIORITIES.URGENT,
    entityType: 'purchase_dg_validation',
    entityId: request.id,
    actionUrl: moduleUrl(request.id),
  });
}

export async function notifyPurchaseSupplierValidated(request, { quote, oa, op } = {}) {
  if (!request?.id) return;
  await notifyRequester(request, {
    title: 'Devis validé',
    message: `Votre demande ${request.ref} a été validée.\nFournisseur : ${quote?.supplier_name || '—'}\nOA : ${oa?.ref || '—'}`,
    type: NOTIFICATION_TYPES.PURCHASE_REQUEST,
    priority: NOTIFICATION_PRIORITIES.NORMAL,
    entityType: 'purchase_validated',
    entityId: request.id,
    actionUrl: moduleUrl(request.id),
  });
  await notifyChargeeAchats({
    title: 'Devis validé par le DG',
    message: `${request.ref} — OA ${oa?.ref || ''} / OP ${op?.ref || ''} créés automatiquement.`,
    type: NOTIFICATION_TYPES.PURCHASE_REQUEST,
    priority: NOTIFICATION_PRIORITIES.NORMAL,
    entityType: 'purchase_oa_created',
    entityId: request.id,
    actionUrl: '/?module=achats&tab=ordres-achat',
  });
}

export async function notifyOaCreated(request, oa) {
  if (!request?.id) return;
  await notifyChargeeAchats({
    title: 'Ordre d\'achat créé',
    message: `OA ${oa?.ref || ''} créé pour la demande ${request.ref}.`,
    type: NOTIFICATION_TYPES.PURCHASE_REQUEST,
    priority: NOTIFICATION_PRIORITIES.NORMAL,
    entityType: 'purchase_oa_created',
    entityId: request.id,
    actionUrl: '/?module=achats&tab=ordres-achat',
  });
}

export async function notifyPaymentOrderCreated(request, oa, op) {
  await notifyFinanceUsers({
    title: 'Ordre de paiement à préparer',
    message: `OP ${op?.ref || ''} — OA ${oa?.ref || ''} — Demande ${request?.ref || ''}.`,
    type: NOTIFICATION_TYPES.PAYMENT,
    priority: NOTIFICATION_PRIORITIES.HIGH,
    entityType: 'purchase_payment_created',
    entityId: op?.id,
    actionUrl: 'module:ordres-paiement',
    submoduleCode: NOTIFICATION_SUBMODULES.ORDRES_PAIEMENT,
  }, NOTIFICATION_SUBMODULES.ORDRES_PAIEMENT);
}

export async function notifyPaymentValidated(op) {
  await notifyChargeeAchats({
    title: 'Paiement validé',
    message: `L'ordre de paiement ${op?.ref || ''} a été validé par le DG.`,
    type: NOTIFICATION_TYPES.PAYMENT,
    priority: NOTIFICATION_PRIORITIES.NORMAL,
    entityType: 'purchase_payment_validated',
    entityId: op?.id,
    actionUrl: 'module:ordres-paiement',
  });
  await notifyFinanceUsers({
    title: 'Paiement validé',
    message: `L'ordre de paiement ${op?.ref || ''} a été validé.`,
    type: NOTIFICATION_TYPES.PAYMENT,
    priority: NOTIFICATION_PRIORITIES.NORMAL,
    entityType: 'purchase_payment_validated_finance',
    entityId: op?.id,
    actionUrl: 'module:ordres-paiement',
    submoduleCode: NOTIFICATION_SUBMODULES.ORDRES_PAIEMENT,
  }, NOTIFICATION_SUBMODULES.ORDRES_PAIEMENT);
}

export async function notifyPurchaseReceived(request) {
  if (!request?.id) return;
  await notifyRequester(request, {
    title: 'Commande réceptionnée',
    message: `La commande liée à ${request.ref} a été réceptionnée.`,
    type: NOTIFICATION_TYPES.PURCHASE_REQUEST,
    priority: NOTIFICATION_PRIORITIES.NORMAL,
    entityType: 'purchase_received',
    entityId: request.id,
    actionUrl: moduleUrl(request.id),
  });
  await notifyInventaireUsers({
    title: 'Réception achat',
    message: `Commande réceptionnée — demande ${request.ref} (${request.project_name || ''}).`,
    type: NOTIFICATION_TYPES.PURCHASE_REQUEST,
    priority: NOTIFICATION_PRIORITIES.NORMAL,
    entityType: 'purchase_received_magasin',
    entityId: request.id,
    actionUrl: moduleUrl(request.id),
    submoduleCode: NOTIFICATION_SUBMODULES.DEMANDES_CHANTIER,
  });
}

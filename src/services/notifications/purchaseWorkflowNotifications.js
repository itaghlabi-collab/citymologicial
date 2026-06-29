/**
 * purchaseWorkflowNotifications.js — Notifications workflow Achats
 */
import { notifyUser } from './notifications';
import { NOTIFICATION_TYPES, NOTIFICATION_PRIORITIES } from './notifications';
import { listSuperAdminAndDGRecipients } from './notificationRecipients';
import { getSupabase } from '../../lib/supabase';
import { PURCHASE_ASSIGNEE } from '../../constants/purchaseWorkflow';

function moduleUrl() {
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
  if (!ids.length) return [];
  return Promise.all(ids.map((userId) => notifyUser(userId, payload)));
}

async function notifyDg(payload) {
  const recipients = await listSuperAdminAndDGRecipients();
  return Promise.all(recipients.map((p) => notifyUser(p.id, payload)));
}

async function notifyRequester(request, payload) {
  if (!request?.requester_user_id) return null;
  return notifyUser(request.requester_user_id, payload);
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
    actionUrl: moduleUrl(),
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
    actionUrl: moduleUrl(),
  });
  await notifyRequester(request, {
    title: 'Devis reçus',
    message: `Des devis ont été enregistrés pour votre demande ${request.ref}.`,
    type: NOTIFICATION_TYPES.PURCHASE_REQUEST,
    priority: NOTIFICATION_PRIORITIES.NORMAL,
    entityType: 'purchase_quotes_added',
    entityId: request.id,
    actionUrl: moduleUrl(),
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
    actionUrl: moduleUrl(),
  });
}

export async function notifyPurchaseSupplierValidated(request, { quote, oa, op } = {}) {
  if (!request?.id) return;
  await notifyRequester(request, {
    title: 'Demande validée',
    message: `Votre demande ${request.ref} a été validée.\nFournisseur : ${quote?.supplier_name || '—'}\nOA : ${oa?.ref || '—'}`,
    type: NOTIFICATION_TYPES.PURCHASE_REQUEST,
    priority: NOTIFICATION_PRIORITIES.NORMAL,
    entityType: 'purchase_validated',
    entityId: request.id,
    actionUrl: moduleUrl(),
  });
  await notifyChargeeAchats({
    title: 'Fournisseur validé par le DG',
    message: `${request.ref} — OA ${oa?.ref || ''} / OP ${op?.ref || ''} créés automatiquement.`,
    type: NOTIFICATION_TYPES.PURCHASE_REQUEST,
    priority: NOTIFICATION_PRIORITIES.NORMAL,
    entityType: 'purchase_oa_created',
    entityId: request.id,
    actionUrl: moduleUrl(),
  });
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
    actionUrl: moduleUrl(),
  });
  const { listInventaireRecipients } = await import('./notificationRecipients');
  const magasiniers = await listInventaireRecipients();
  await Promise.all(magasiniers.map((p) => notifyUser(p.id, {
    title: 'Réception achat',
    message: `Commande réceptionnée — demande ${request.ref} (${request.project_name || ''}).`,
    type: NOTIFICATION_TYPES.PURCHASE_REQUEST,
    priority: NOTIFICATION_PRIORITIES.NORMAL,
    entityType: 'purchase_received_magasin',
    entityId: request.id,
    actionUrl: moduleUrl(),
  })));
}

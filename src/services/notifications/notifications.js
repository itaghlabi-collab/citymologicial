/**
 * notifications.js — Service central notifications ERP (ciblage par utilisateur)
 */
import { getSupabase } from '../../lib/supabase';
import {
  listSuperAdminAndDGRecipients,
  listRhRecipients,
  listInventaireRecipients,
} from './notificationRecipients';
import { resolveNotificationRecipients } from './notificationTargeting';
import { queueWhatsappNotification } from './whatsappNotifications';

const TABLE = 'notifications';

export const NOTIFICATION_TYPES = {
  PAYMENT: 'payment',
  TASK: 'task',
  APPOINTMENT: 'appointment',
  CASH_REVIEW: 'cash_review',
  LEAVE_REQUEST: 'leave_request',
  PURCHASE_REQUEST: 'purchase_request',
  RESOURCE_REQUEST: 'resource_request',
  SITE_MATERIAL_REQUEST: 'site_material_request',
  DOCUMENT: 'document',
  SYSTEM: 'system',
};

/** Types métier déclenchant un son à la réception. */
export const SOUND_NOTIFICATION_TYPES = new Set([
  NOTIFICATION_TYPES.TASK,
  NOTIFICATION_TYPES.RESOURCE_REQUEST,
  NOTIFICATION_TYPES.APPOINTMENT,
]);

export const NOTIFICATION_PRIORITIES = {
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
  URGENT: 'urgent',
};

export function normalizeNotification(row) {
  if (!row) return null;
  return {
    id: row.id,
    recipientUserId: row.recipient_user_id,
    recipientRole: row.recipient_role,
    recipientRoleId: row.recipient_role_id,
    recipientDepartmentId: row.recipient_department_id,
    submoduleCode: row.submodule_code,
    isGlobal: Boolean(row.is_global),
    title: row.title,
    message: row.message || '',
    type: row.type || 'system',
    priority: row.priority || 'normal',
    entityType: row.entity_type,
    entityId: row.entity_id,
    actionUrl: row.action_url,
    isRead: Boolean(row.is_read),
    readAt: row.read_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

async function getCurrentUserId() {
  const { data: { user } } = await getSupabase().auth.getUser();
  return user?.id || null;
}

function buildNotificationRow(payload, recipientUserId) {
  const {
    recipientRole = null,
    roleId = null,
    departmentId = null,
    submoduleCode = null,
    isGlobal = false,
    title,
    message = '',
    type = NOTIFICATION_TYPES.SYSTEM,
    priority = NOTIFICATION_PRIORITIES.NORMAL,
    entityType = null,
    entityId = null,
    actionUrl = null,
    createdBy = null,
  } = payload;

  return {
    recipient_user_id: recipientUserId || null,
    recipient_role: recipientUserId ? null : recipientRole,
    recipient_role_id: roleId || null,
    recipient_department_id: departmentId || null,
    submodule_code: submoduleCode || null,
    is_global: Boolean(isGlobal),
    title: title.trim(),
    message: message?.trim() || null,
    type,
    priority,
    entity_type: entityType,
    entity_id: entityId || null,
    action_url: actionUrl,
    is_read: false,
    created_by: createdBy,
  };
}

/**
 * Crée une notification pour un destinataire précis (anti-doublon via index unique).
 */
export async function createNotification(payload) {
  const {
    recipientUserId = null,
    recipientRole = null,
    isGlobal = false,
    title,
    createdBy = null,
  } = payload;

  if (!title?.trim()) return null;
  if (!isGlobal && !recipientUserId && !recipientRole) return null;

  const uid = createdBy || (await getCurrentUserId());
  const row = buildNotificationRow({ ...payload, createdBy: uid }, recipientUserId);

  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([row])
    .select()
    .single();

  if (error) {
    if (error.code === '23505') return null;
    console.warn('[CITYMO] createNotification', error);
    return null;
  }

  const normalized = normalizeNotification(data);

  if (recipientUserId) {
    queueWhatsappNotification({
      notificationId: normalized.id,
      userId: recipientUserId,
      title: normalized.title,
      message: normalized.message,
    }).catch(() => {});
  }

  return normalized;
}

export async function notifyUser(userId, payload) {
  if (!userId) return null;
  return createNotification({ ...payload, recipientUserId: userId, recipientRole: null });
}

/** Notification globale explicite (tous les utilisateurs connectés). */
export async function notifyGlobal(payload) {
  return createNotification({ ...payload, isGlobal: true, recipientUserId: null, recipientRole: null });
}

export async function notifyRole(role, payload) {
  if (!role) return null;
  return createNotification({ ...payload, recipientUserId: null, recipientRole: role });
}

/**
 * Cible plusieurs utilisateurs selon département, rôle, rubrique ou liste d'IDs.
 * Une ligne par utilisateur (lecture / compteur / son individuels).
 */
export async function notifyTargeted(targeting, payload) {
  const userIds = await resolveNotificationRecipients(targeting);
  if (!userIds.length) return [];

  const meta = {
    roleId: targeting.roleId || null,
    departmentId: targeting.departmentId || null,
    submoduleCode: targeting.submoduleCode || payload.submoduleCode || null,
  };

  const results = await Promise.all(
    userIds.map((id) => notifyUser(id, { ...payload, ...meta })),
  );
  return results.filter(Boolean);
}

/** Notifie DG / Super Admin uniquement (pas tous les utilisateurs). */
export async function notifySuperAdmins(payload) {
  const recipients = await listSuperAdminAndDGRecipients();
  const results = await Promise.all(
    recipients.map((p) => notifyUser(p.id, payload)),
  );
  return results.filter(Boolean);
}

export async function hasNotificationForUserToday(userId, type, entityType) {
  if (!userId || !entityType) return false;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const { count, error } = await getSupabase()
    .from(TABLE)
    .select('*', { count: 'exact', head: true })
    .eq('recipient_user_id', userId)
    .eq('type', type)
    .eq('entity_type', entityType)
    .gte('created_at', start.toISOString());
  if (error) return false;
  return (count || 0) > 0;
}

export async function notifySuperAdminsOnceDaily(entityType, payload) {
  const recipients = await listSuperAdminAndDGRecipients();
  const results = [];
  for (const p of recipients) {
    const exists = await hasNotificationForUserToday(p.id, payload.type, entityType);
    if (exists) continue;
    const n = await notifyUser(p.id, { ...payload, entityType });
    if (n) results.push(n);
  }
  return results;
}

/** RH uniquement (département + rubrique congés). */
export async function notifyRhUsers(payload) {
  const { NOTIFICATION_DEPARTMENTS, NOTIFICATION_SUBMODULES } = await import('./notificationTargeting');
  return notifyTargeted({
    departmentId: NOTIFICATION_DEPARTMENTS.RH,
    submoduleCode: NOTIFICATION_SUBMODULES.CONGES,
  }, payload);
}

/** Finance & Trésorerie. */
export async function notifyFinanceUsers(payload, submoduleCode) {
  const { NOTIFICATION_DEPARTMENTS, NOTIFICATION_SUBMODULES } = await import('./notificationTargeting');
  return notifyTargeted({
    departmentId: NOTIFICATION_DEPARTMENTS.COMPTABILITE,
    submoduleCode: submoduleCode || NOTIFICATION_SUBMODULES.ORDRES_PAIEMENT,
  }, payload);
}

/** Achats uniquement. */
export async function notifyAchatsUsers(payload) {
  const { NOTIFICATION_DEPARTMENTS, NOTIFICATION_SUBMODULES } = await import('./notificationTargeting');
  return notifyTargeted({
    departmentId: NOTIFICATION_DEPARTMENTS.ACHATS,
    submoduleCode: NOTIFICATION_SUBMODULES.DEMANDES_ACHAT,
  }, payload);
}

/** Logistique / inventaire. */
export async function notifyInventaireUsers(payload) {
  const { NOTIFICATION_DEPARTMENTS, NOTIFICATION_SUBMODULES } = await import('./notificationTargeting');
  return notifyTargeted({
    departmentId: NOTIFICATION_DEPARTMENTS.LOGISTIQUE,
    submoduleCode: NOTIFICATION_SUBMODULES.DEMANDES_CHANTIER,
  }, payload);
}

/** SAV uniquement. */
export async function notifySavUsers(payload) {
  const { NOTIFICATION_DEPARTMENTS, NOTIFICATION_SUBMODULES } = await import('./notificationTargeting');
  return notifyTargeted({
    departmentId: NOTIFICATION_DEPARTMENTS.SAV,
    submoduleCode: NOTIFICATION_SUBMODULES.SAV,
  }, payload);
}

/** @deprecated Préférer notifyRhUsers — conservé pour compatibilité interne. */
export async function notifyExecutivesAndRh(payload) {
  return notifyRhUsers(payload);
}

/** @deprecated Préférer notifyInventaireUsers */
export async function notifyInventaireAndAdmins(payload) {
  return notifyInventaireUsers(payload);
}

export async function listNotificationsForUser(user, { limit = 80 } = {}) {
  if (!user?.id) return [];
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .or(`recipient_user_id.eq.${user.id},is_global.eq.true`)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.warn('[CITYMO] listNotifications', error);
    return [];
  }
  return (data || []).map(normalizeNotification);
}

export async function countUnreadNotifications(user) {
  if (!user?.id) return 0;
  const { count, error } = await getSupabase()
    .from(TABLE)
    .select('*', { count: 'exact', head: true })
    .or(`recipient_user_id.eq.${user.id},is_global.eq.true`)
    .eq('is_read', false);
  if (error) {
    console.warn('[CITYMO] countUnreadNotifications', error);
    return 0;
  }
  return count || 0;
}

export async function markNotificationRead(id) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return normalizeNotification(data);
}

export async function markAllNotificationsRead(user) {
  if (!user?.id) return 0;
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('recipient_user_id', user.id)
    .eq('is_read', false)
    .select('id');
  if (error) throw error;
  return (data || []).length;
}

export function formatMad(amount) {
  return `${Number(amount || 0).toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MAD`;
}

export function moduleActionUrl(moduleId) {
  return `module:${moduleId}`;
}

export function parseActionUrl(actionUrl) {
  if (!actionUrl) return null;
  if (actionUrl.startsWith('module:')) return actionUrl.slice(7);
  return actionUrl;
}

/**
 * notifications.js — Service central notifications ERP
 */
import { getSupabase } from '../../lib/supabase';
import {
  listSuperAdminAndDGRecipients,
  listRhRecipients,
} from './notificationRecipients';

const TABLE = 'notifications';

export const NOTIFICATION_TYPES = {
  PAYMENT: 'payment',
  TASK: 'task',
  CASH_REVIEW: 'cash_review',
  LEAVE_REQUEST: 'leave_request',
  PURCHASE_REQUEST: 'purchase_request',
  RESOURCE_REQUEST: 'resource_request',
  DOCUMENT: 'document',
  SYSTEM: 'system',
};

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

/**
 * Crée une notification (anti-doublon via index unique Supabase).
 * @returns {Promise<object|null>}
 */
export async function createNotification(payload) {
  const {
    recipientUserId = null,
    recipientRole = null,
    title,
    message = '',
    type = NOTIFICATION_TYPES.SYSTEM,
    priority = NOTIFICATION_PRIORITIES.NORMAL,
    entityType = null,
    entityId = null,
    actionUrl = null,
    createdBy = null,
  } = payload;

  if (!title?.trim()) return null;
  if (!recipientUserId && !recipientRole) return null;

  const uid = createdBy || (await getCurrentUserId());
  const row = {
    recipient_user_id: recipientUserId,
    recipient_role: recipientRole,
    title: title.trim(),
    message: message?.trim() || null,
    type,
    priority,
    entity_type: entityType,
    entity_id: entityId || null,
    action_url: actionUrl,
    is_read: false,
    created_by: uid,
  };

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
  return normalizeNotification(data);
}

export async function notifyUser(userId, payload) {
  if (!userId) return null;
  return createNotification({ ...payload, recipientUserId: userId, recipientRole: null });
}

export async function notifyRole(role, payload) {
  if (!role) return null;
  return createNotification({ ...payload, recipientUserId: null, recipientRole: role });
}

/** Notifie tous les Super Admin + DG (une ligne par utilisateur). */
export async function notifySuperAdmins(payload) {
  const recipients = await listSuperAdminAndDGRecipients();
  const results = await Promise.all(
    recipients.map((p) => notifyUser(p.id, payload)),
  );
  return results.filter(Boolean);
}

async function hasNotificationForUserToday(userId, type, entityType) {
  if (!userId || !entityType) return false;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('id')
    .eq('recipient_user_id', userId)
    .eq('type', type)
    .eq('entity_type', entityType)
    .gte('created_at', start.toISOString())
    .limit(1);
  if (error) return false;
  return (data || []).length > 0;
}

/** Notifie Super Admin + DG une seule fois par jour pour un entityType donné. */
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

/** Notifie Super Admin + DG + profils RH. */
export async function notifyExecutivesAndRh(payload) {
  const exec = await listSuperAdminAndDGRecipients();
  const rh = await listRhRecipients();
  const map = new Map();
  [...exec, ...rh].forEach((p) => map.set(p.id, p));
  const results = await Promise.all(
    [...map.values()].map((p) => notifyUser(p.id, payload)),
  );
  return results.filter(Boolean);
}

export async function listNotificationsForUser(user, { limit = 80 } = {}) {
  if (!user?.id) return [];
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.warn('[CITYMO] listNotifications', error);
    return [];
  }
  return (data || []).map(normalizeNotification);
}

export async function countUnreadNotifications(user) {
  const list = await listNotificationsForUser(user, { limit: 200 });
  return list.filter((n) => !n.isRead).length;
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
  const list = await listNotificationsForUser(user, { limit: 200 });
  const unreadIds = list.filter((n) => !n.isRead).map((n) => n.id);
  if (!unreadIds.length) return 0;
  const { error } = await getSupabase()
    .from(TABLE)
    .update({ is_read: true, read_at: new Date().toISOString() })
    .in('id', unreadIds);
  if (error) throw error;
  return unreadIds.length;
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

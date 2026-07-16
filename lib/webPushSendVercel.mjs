/**
 * Envoi Web Push (serveur uniquement) — canal d'affichage, sans logique métier ERP.
 * Les payloads métier sont construits UNIQUEMENT depuis public.notifications.
 */

import webpush from 'web-push';
import { getSupabaseAdmin } from './supabaseAdminVercel.mjs';
import { getVapidCredentials, isVapidConfigured } from './vapidConfigVercel.mjs';

const TABLE = 'push_subscriptions';
const NOTIFICATIONS_TABLE = 'notifications';

export const PUSH_ICON_DEFAULT = '/icons/icon-192.png';
export const PUSH_BADGE_DEFAULT = '/icons/icon-192.png';

/** Payload de test fixe (étape 6) — aucun événement métier. */
export const TEST_PUSH_PAYLOAD = Object.freeze({
  title: 'CITYMO TEST',
  body: 'Votre configuration Web Push fonctionne correctement.',
  icon: PUSH_ICON_DEFAULT,
  badge: PUSH_BADGE_DEFAULT,
  tag: 'test',
  action_url: '/dashboard',
  data: Object.freeze({
    type: 'test',
    action_url: '/dashboard',
  }),
});

let vapidConfiguredForProcess = false;

export function ensureWebPushVapid() {
  const creds = getVapidCredentials();
  if (!vapidConfiguredForProcess) {
    webpush.setVapidDetails(creds.subject, creds.publicKey, creds.privateKey);
    vapidConfiguredForProcess = true;
  }
  return creds;
}

function safeHost(endpoint) {
  try {
    return new URL(endpoint).host;
  } catch {
    return null;
  }
}

const SUB_SELECT = 'id, user_id, endpoint, p256dh, auth_key, device_name, browser, platform, is_active, updated_at';

/**
 * Tous les abonnements actifs d'un utilisateur (clés incluses, serveur uniquement).
 */
export async function fetchActiveSubscriptionsForUser(userId, admin = getSupabaseAdmin()) {
  const { data, error } = await admin
    .from(TABLE)
    .select(SUB_SELECT)
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false });

  if (error) {
    const err = new Error(error.message || 'Échec lecture abonnements Push.');
    err.status = 500;
    throw err;
  }
  return data || [];
}

/** Abonnement actif le plus récent (étape 6 — test). */
export async function fetchLatestActiveSubscription(userId, admin = getSupabaseAdmin()) {
  const rows = await fetchActiveSubscriptionsForUser(userId, admin);
  return rows[0] || null;
}

export function toWebPushSubscription(row) {
  if (!row?.endpoint || !row?.p256dh || !row?.auth_key) {
    const err = new Error('Abonnement Push incomplet (endpoint / clés).');
    err.status = 500;
    throw err;
  }
  return {
    endpoint: row.endpoint,
    keys: {
      p256dh: row.p256dh,
      auth: row.auth_key,
    },
  };
}

export function buildTestPushPayload() {
  return {
    title: TEST_PUSH_PAYLOAD.title,
    body: TEST_PUSH_PAYLOAD.body,
    icon: TEST_PUSH_PAYLOAD.icon,
    badge: TEST_PUSH_PAYLOAD.badge,
    tag: TEST_PUSH_PAYLOAD.tag,
    action_url: TEST_PUSH_PAYLOAD.action_url,
    data: { ...TEST_PUSH_PAYLOAD.data },
  };
}

/**
 * Payload Web Push depuis une ligne public.notifications (source de vérité).
 * icon / badge absents en base → défauts CITYMO.
 */
export function buildPayloadFromNotificationRow(row) {
  if (!row || typeof row !== 'object') {
    const err = new Error('Notification introuvable.');
    err.status = 404;
    throw err;
  }
  const actionUrl = row.action_url || '/';
  const title = String(row.title || 'CITYMO');
  const body = String(row.message || '');
  const type = String(row.type || 'system');
  const icon = String(row.icon || PUSH_ICON_DEFAULT);
  const badge = String(row.badge || PUSH_BADGE_DEFAULT);

  return {
    title,
    body,
    icon,
    badge,
    tag: type,
    action_url: actionUrl,
    url: actionUrl,
    data: {
      id: row.id,
      type,
      entity_id: row.entity_id || null,
      priority: row.priority || 'normal',
      action_url: actionUrl,
      recipient_user_id: row.recipient_user_id || null,
      url: actionUrl,
    },
  };
}

export async function revokeSubscriptionById(userId, subscriptionId, admin = getSupabaseAdmin()) {
  if (!subscriptionId) return;
  const now = new Date().toISOString();
  await admin
    .from(TABLE)
    .update({
      is_active: false,
      revoked_at: now,
      last_used_at: now,
    })
    .eq('id', subscriptionId)
    .eq('user_id', userId);
}

export async function touchSubscriptionLastUsed(userId, subscriptionId, admin = getSupabaseAdmin()) {
  if (!subscriptionId) return;
  const now = new Date().toISOString();
  await admin
    .from(TABLE)
    .update({ last_used_at: now })
    .eq('id', subscriptionId)
    .eq('user_id', userId);
}

/**
 * Envoi vers un abonnement. Soft-revoke sur 404/410.
 * @returns {{ ok: boolean, statusCode: number|null, subscriptionId: string, endpointHost: string|null, error?: string }}
 */
export async function sendPushPayloadToSubscription(row, payload, admin = getSupabaseAdmin()) {
  ensureWebPushVapid();
  const subscription = toWebPushSubscription(row);
  const body = JSON.stringify(payload);

  try {
    const result = await webpush.sendNotification(subscription, body, {
      TTL: 60 * 60,
      urgency: 'normal',
    });
    try {
      await touchSubscriptionLastUsed(row.user_id, row.id, admin);
    } catch {
      /* non bloquant */
    }
    return {
      ok: true,
      statusCode: result?.statusCode ?? 201,
      subscriptionId: row.id,
      endpointHost: safeHost(row.endpoint),
    };
  } catch (sendErr) {
    const statusCode = Number(sendErr?.statusCode) || 0;
    if (statusCode === 404 || statusCode === 410) {
      try {
        await revokeSubscriptionById(row.user_id, row.id, admin);
      } catch {
        /* ignore */
      }
    }
    return {
      ok: false,
      statusCode: statusCode || null,
      subscriptionId: row.id,
      endpointHost: safeHost(row.endpoint),
      error: sendErr?.body
        ? String(sendErr.body).slice(0, 400)
        : (sendErr?.message || 'Échec envoi Push.'),
    };
  }
}

/**
 * Notification de test (étape 6) — un seul abonnement (le plus récent).
 */
export async function sendTestPushToUser(userId, admin = getSupabaseAdmin()) {
  if (!isVapidConfigured()) {
    const err = new Error('Notifications push non configurées sur le serveur.');
    err.status = 503;
    throw err;
  }

  const row = await fetchLatestActiveSubscription(userId, admin);
  if (!row) {
    const err = new Error('Aucun abonnement Push actif pour cet utilisateur.');
    err.status = 404;
    throw err;
  }

  const payload = buildTestPushPayload();
  const result = await sendPushPayloadToSubscription(row, payload, admin);
  if (!result.ok) {
    const err = new Error(
      result.statusCode
        ? `Échec envoi Push (${result.statusCode}): ${result.error || ''}`
        : (result.error || 'Échec envoi Push.'),
    );
    err.status = result.statusCode >= 400 && result.statusCode < 600 ? result.statusCode : 502;
    err.details = {
      statusCode: result.statusCode,
      endpointHost: result.endpointHost,
      subscriptionId: result.subscriptionId,
    };
    throw err;
  }

  return {
    success: true,
    payload,
    subscriptionId: row.id,
    endpointHost: result.endpointHost,
    deviceName: row.device_name || null,
    browser: row.browser || null,
    platform: row.platform || null,
    statusCode: result.statusCode,
  };
}

export async function loadNotificationById(notificationId, admin = getSupabaseAdmin()) {
  const { data, error } = await admin
    .from(NOTIFICATIONS_TABLE)
    .select('id, recipient_user_id, title, message, type, priority, entity_id, action_url, created_by, created_at')
    .eq('id', notificationId)
    .maybeSingle();

  if (error) {
    const err = new Error(error.message || 'Échec lecture notification.');
    err.status = 500;
    throw err;
  }
  return data || null;
}

/**
 * Diffuse une notification ERP existante vers tous les abonnements actifs du destinataire.
 * Ne crée aucune notification — lit public.notifications uniquement.
 */
export async function deliverPushForExistingNotification(notificationId, callerUserId, admin = getSupabaseAdmin()) {
  if (!notificationId) {
    const err = new Error('notificationId requis.');
    err.status = 400;
    throw err;
  }
  if (!callerUserId) {
    const err = new Error('Session requise.');
    err.status = 401;
    throw err;
  }
  if (!isVapidConfigured()) {
    return {
      success: true,
      sent: 0,
      failed: 0,
      skipped: 'vapid_not_configured',
      payload: null,
    };
  }

  const row = await loadNotificationById(notificationId, admin);
  if (!row) {
    const err = new Error('Notification introuvable.');
    err.status = 404;
    throw err;
  }

  // Empêche d'envoyer le push d'une notification d'un autre utilisateur
  if (row.created_by && row.created_by !== callerUserId) {
    const err = new Error('Diffusion Push non autorisée pour cette notification.');
    err.status = 403;
    throw err;
  }

  if (!row.recipient_user_id) {
    return {
      success: true,
      sent: 0,
      failed: 0,
      skipped: 'no_recipient',
      notificationId: row.id,
      payload: null,
    };
  }

  const payload = buildPayloadFromNotificationRow(row);
  const subscriptions = await fetchActiveSubscriptionsForUser(row.recipient_user_id, admin);
  if (!subscriptions.length) {
    return {
      success: true,
      sent: 0,
      failed: 0,
      skipped: 'no_subscriptions',
      notificationId: row.id,
      recipientUserId: row.recipient_user_id,
      payload,
    };
  }

  const results = await Promise.all(
    subscriptions.map((sub) => sendPushPayloadToSubscription(sub, payload, admin)),
  );

  const sent = results.filter((r) => r.ok).length;
  const failed = results.length - sent;

  return {
    success: true,
    sent,
    failed,
    notificationId: row.id,
    recipientUserId: row.recipient_user_id,
    payload,
    results: results.map((r) => ({
      ok: r.ok,
      subscriptionId: r.subscriptionId,
      endpointHost: r.endpointHost,
      statusCode: r.statusCode,
      error: r.error || undefined,
    })),
  };
}

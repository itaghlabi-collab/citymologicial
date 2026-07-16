/**
 * Helpers abonnements Web Push — Vercel / Node uniquement.
 * Ne gère PAS l'envoi de notifications (étape ultérieure).
 */

import { verifySupabaseAccessTokenVercel } from './verifySupabaseTokenVercel.mjs';
import { getSupabaseAdmin } from './supabaseAdminVercel.mjs';
import { isVapidConfigured } from './vapidConfigVercel.mjs';

const TABLE = 'push_subscriptions';

export function extractBearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice(7).trim();
  }
  return '';
}

export async function requireAuthenticatedUser(req) {
  const token = extractBearerToken(req);
  if (!token) {
    const err = new Error('Session requise.');
    err.status = 401;
    throw err;
  }
  const clientApiKey = req.headers?.apikey || req.headers?.Apikey || '';
  const user = await verifySupabaseAccessTokenVercel(token, clientApiKey);
  if (!user?.id) {
    const err = new Error('Session invalide.');
    err.status = 401;
    throw err;
  }
  return user;
}

function asTrimmedString(value, maxLen = 4096) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

/**
 * Normalise le body subscribe (PushSubscription JSON ou champs plats).
 * @throws {{ status: number, message: string }}
 */
export function parseSubscribePayload(body) {
  const raw = body && typeof body === 'object' ? body : {};
  const endpoint = asTrimmedString(raw.endpoint, 2048);
  const keys = raw.keys && typeof raw.keys === 'object' ? raw.keys : {};
  const p256dh = asTrimmedString(raw.p256dh ?? keys.p256dh, 512);
  const authKey = asTrimmedString(raw.auth_key ?? raw.auth ?? keys.auth, 512);

  if (!endpoint || !/^https:\/\//i.test(endpoint)) {
    const err = new Error('endpoint Push invalide (https requis).');
    err.status = 400;
    throw err;
  }
  if (!p256dh || !authKey) {
    const err = new Error('Clés Push manquantes (p256dh / auth).');
    err.status = 400;
    throw err;
  }

  let expirationTime = null;
  const exp = raw.expirationTime ?? raw.expiration_time;
  if (exp != null && exp !== '') {
    const n = Number(exp);
    if (!Number.isFinite(n)) {
      const err = new Error('expiration_time invalide.');
      err.status = 400;
      throw err;
    }
    expirationTime = Math.trunc(n);
  }

  return {
    endpoint,
    p256dh,
    auth_key: authKey,
    expiration_time: expirationTime,
    device_name: asTrimmedString(raw.device_name ?? raw.deviceName, 120),
    browser: asTrimmedString(raw.browser, 80),
    platform: asTrimmedString(raw.platform, 80),
    user_agent: asTrimmedString(raw.user_agent ?? raw.userAgent, 512),
  };
}

export function parseUnsubscribePayload(body, query = {}) {
  const endpoint = asTrimmedString(
    body?.endpoint ?? query?.endpoint,
    2048,
  );
  if (!endpoint || !/^https:\/\//i.test(endpoint)) {
    const err = new Error('endpoint Push requis.');
    err.status = 400;
    throw err;
  }
  return { endpoint };
}

/** Réponse sûre (sans p256dh / auth_key). */
export function sanitizeSubscriptionRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    endpoint: row.endpoint,
    deviceName: row.device_name || null,
    browser: row.browser || null,
    platform: row.platform || null,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    lastUsedAt: row.last_used_at || null,
    revokedAt: row.revoked_at || null,
  };
}

/**
 * Upsert sur endpoint — user_id toujours issu du JWT (jamais du body).
 */
export async function upsertPushSubscription(userId, payload, admin = getSupabaseAdmin()) {
  const now = new Date().toISOString();
  const row = {
    user_id: userId,
    endpoint: payload.endpoint,
    p256dh: payload.p256dh,
    auth_key: payload.auth_key,
    expiration_time: payload.expiration_time,
    device_name: payload.device_name,
    browser: payload.browser,
    platform: payload.platform,
    user_agent: payload.user_agent,
    is_active: true,
    revoked_at: null,
    last_used_at: now,
  };

  const { data, error } = await admin
    .from(TABLE)
    .upsert(row, { onConflict: 'endpoint' })
    .select('id, user_id, endpoint, device_name, browser, platform, is_active, created_at, updated_at, last_used_at, revoked_at')
    .maybeSingle();

  if (error) {
    const err = new Error(error.message || 'Échec enregistrement abonnement.');
    err.status = 500;
    throw err;
  }
  if (data && data.user_id !== userId) {
    const err = new Error('Abonnement non rattaché à l’utilisateur authentifié.');
    err.status = 500;
    throw err;
  }
  return data;
}

/** Soft-revoke : is_active=false, revoked_at=now (uniquement si owner). */
export async function revokePushSubscription(userId, endpoint, admin = getSupabaseAdmin()) {
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from(TABLE)
    .update({
      is_active: false,
      revoked_at: now,
      last_used_at: now,
    })
    .eq('endpoint', endpoint)
    .eq('user_id', userId)
    .select('id, user_id, endpoint, device_name, browser, platform, is_active, created_at, updated_at, last_used_at, revoked_at')
    .maybeSingle();

  if (error) {
    const err = new Error(error.message || 'Échec désabonnement.');
    err.status = 500;
    throw err;
  }
  return data;
}

export async function getPushSubscriptionStatus(userId, admin = getSupabaseAdmin()) {
  const { data, error } = await admin
    .from(TABLE)
    .select('id, endpoint, device_name, browser, platform, is_active, created_at, updated_at, last_used_at, revoked_at')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false });

  if (error) {
    const err = new Error(error.message || 'Échec lecture statut Push.');
    err.status = 500;
    throw err;
  }

  const subscriptions = (data || []).map(sanitizeSubscriptionRow);
  return {
    vapidConfigured: isVapidConfigured(),
    subscribed: subscriptions.length > 0,
    activeCount: subscriptions.length,
    subscriptions,
  };
}

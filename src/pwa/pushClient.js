/**
 * Client Web Push — abonnement / désabonnement appareil courant.
 * Aucune permission demandée automatiquement.
 * Ne stocke pas la PushSubscription en localStorage.
 */

import { ENV, resolveApiBaseUrl } from '../config/env';
import { getAuthToken } from '../services/auth';

function isDev() {
  try {
    return import.meta.env?.DEV === true;
  } catch {
    return false;
  }
}

function safeLog(...args) {
  if (isDev()) {
    // eslint-disable-next-line no-console
    console.info('[CITYMO push]', ...args);
  }
}

/** Détection standalone (PWA écran d'accueil). */
export function isStandaloneDisplay() {
  try {
    if (typeof window === 'undefined') return false;
    if (window.matchMedia?.('(display-mode: standalone)')?.matches) return true;
    if (typeof navigator !== 'undefined' && navigator.standalone === true) return true;
  } catch {
    /* ignore */
  }
  return false;
}

/** iOS / iPadOS — UA indispensable faute d'API Push hors Home Screen. */
export function isIosDevice() {
  try {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    if (/iPad|iPhone|iPod/i.test(ua)) return true;
    if (navigator.platform === 'MacIntel' && Number(navigator.maxTouchPoints || 0) > 1) {
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export function isPushApiSupported() {
  try {
    return Boolean(
      typeof window !== 'undefined'
      && 'Notification' in window
      && 'serviceWorker' in navigator
      && 'PushManager' in window,
    );
  } catch {
    return false;
  }
}

/**
 * États UI possibles (sans demander de permission).
 * @returns {'unsupported'|'ios_needs_install'|'denied'|'prompt'|'granted'}
 */
export function getPermissionSnapshot() {
  if (!isPushApiSupported()) {
    if (isIosDevice() && !isStandaloneDisplay()) return 'ios_needs_install';
    return 'unsupported';
  }
  try {
    const p = Notification.permission;
    if (p === 'denied') return 'denied';
    if (p === 'granted') return 'granted';
    return 'prompt';
  } catch {
    return 'unsupported';
  }
}

/** Convertit une clé VAPID base64 URL-safe en Uint8Array. */
export function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

async function authHeaders() {
  const token = await getAuthToken();
  if (!token) {
    const err = new Error('Session requise.');
    err.code = 'auth_required';
    throw err;
  }
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  if (ENV.SUPABASE_ANON_KEY) headers.apikey = ENV.SUPABASE_ANON_KEY;
  return headers;
}

async function apiFetch(path, options = {}) {
  const base = resolveApiBaseUrl().replace(/\/+$/, '');
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      ...(await authHeaders()),
      ...(options.headers || {}),
    },
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err = new Error(data?.error || `Erreur API (${res.status})`);
    err.status = res.status;
    err.code = 'api_error';
    throw err;
  }
  return data;
}

export async function fetchVapidPublicKey() {
  const data = await apiFetch('/push/vapid-public-key', { method: 'GET' });
  if (!data?.publicKey) {
    const err = new Error('Clé VAPID publique indisponible.');
    err.code = 'vapid_missing';
    throw err;
  }
  return data.publicKey;
}

export async function fetchPushStatus() {
  return apiFetch('/push/status', { method: 'GET' });
}

export async function postPushSubscribe(subscriptionJson) {
  return apiFetch('/push/subscribe', {
    method: 'POST',
    body: JSON.stringify(subscriptionJson),
  });
}

export async function deletePushUnsubscribe(endpoint) {
  return apiFetch('/push/unsubscribe', {
    method: 'DELETE',
    body: JSON.stringify({ endpoint }),
  });
}

/** Envoie une notification Push de test (aucun événement métier). */
export async function requestTestPush() {
  return apiFetch('/push/test', { method: 'POST' });
}

export async function getServiceWorkerRegistration() {
  if (!('serviceWorker' in navigator)) return null;
  return navigator.serviceWorker.ready;
}

export async function getLocalPushSubscription() {
  try {
    const reg = await getServiceWorkerRegistration();
    if (!reg?.pushManager) return null;
    return reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

function subscriptionToPayload(subscription) {
  const json = subscription.toJSON();
  return {
    endpoint: json.endpoint,
    expirationTime: json.expirationTime ?? null,
    keys: {
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
    },
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    platform: typeof navigator !== 'undefined' ? navigator.platform : null,
    browser: detectBrowserLabel(),
  };
}

function detectBrowserLabel() {
  try {
    const ua = navigator.userAgent || '';
    if (/Edg\//i.test(ua)) return 'Edge';
    if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) return 'Chrome';
    if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) return 'Safari';
    if (/Firefox\//i.test(ua)) return 'Firefox';
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Active les notifications sur CET appareil (gesture utilisateur requis).
 * @returns {{ ok: true, subscription: object } | never}
 */
export async function enablePushNotifications() {
  if (!isPushApiSupported()) {
    const err = new Error(
      isIosDevice() && !isStandaloneDisplay()
        ? 'Ajoutez CITYMO à l’écran d’accueil pour activer les notifications.'
        : 'Ce navigateur ne prend pas en charge les notifications Web Push.',
    );
    err.code = isIosDevice() && !isStandaloneDisplay() ? 'ios_needs_install' : 'unsupported';
    throw err;
  }

  if (Notification.permission === 'denied') {
    const err = new Error('Les notifications sont bloquées dans les réglages de votre navigateur.');
    err.code = 'denied';
    throw err;
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    const err = new Error(
      permission === 'denied'
        ? 'Les notifications sont bloquées dans les réglages de votre navigateur.'
        : 'Permission non accordée.',
    );
    err.code = permission === 'denied' ? 'denied' : 'permission_dismissed';
    throw err;
  }

  const reg = await getServiceWorkerRegistration();
  if (!reg?.pushManager) {
    const err = new Error('Service Worker indisponible.');
    err.code = 'sw_unavailable';
    throw err;
  }

  const publicKey = await fetchVapidPublicKey();
  const applicationServerKey = urlBase64ToUint8Array(publicKey);

  let subscription = await reg.pushManager.getSubscription();
  if (!subscription) {
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });
  }

  const payload = subscriptionToPayload(subscription);
  if (!payload.endpoint || !payload.keys?.p256dh || !payload.keys?.auth) {
    try {
      await subscription.unsubscribe();
    } catch {
      /* ignore */
    }
    const err = new Error('Abonnement navigateur incomplet.');
    err.code = 'invalid_subscription';
    throw err;
  }

  try {
    const result = await postPushSubscribe(payload);
    if (!result?.ok) {
      throw Object.assign(new Error('Enregistrement serveur refusé.'), { code: 'subscribe_rejected' });
    }
    safeLog('subscribe OK');
    return { ok: true, subscription: result.subscription };
  } catch (err) {
    // Pas de faux succès : si le serveur échoue, on retire l'abonnement local créé
    try {
      const current = await reg.pushManager.getSubscription();
      if (current) await current.unsubscribe();
    } catch {
      /* ignore */
    }
    throw err;
  }
}

/**
 * Désactive uniquement l'abonnement de CET appareil.
 */
export async function disablePushNotifications() {
  const local = await getLocalPushSubscription();
  const endpoint = local?.endpoint || null;

  if (endpoint) {
    try {
      await deletePushUnsubscribe(endpoint);
    } catch (err) {
      // 404 = déjà absent côté serveur → continuer le cleanup local
      if (err.status !== 404) throw err;
    }
  }

  if (local) {
    try {
      await local.unsubscribe();
    } catch {
      /* ignore */
    }
  }

  safeLog('unsubscribe OK');
  return { ok: true };
}

/**
 * Lecture d'état sans demander de permission ni créer d'abonnement.
 */
export async function readPushActivationState() {
  const permission = getPermissionSnapshot();

  if (permission === 'unsupported' || permission === 'ios_needs_install' || permission === 'denied') {
    return {
      permission,
      localSubscribed: false,
      serverSubscribed: false,
      active: false,
    };
  }

  const local = await getLocalPushSubscription();
  const localSubscribed = Boolean(local?.endpoint);

  let serverSubscribed = false;
  try {
    const status = await fetchPushStatus();
    serverSubscribed = Boolean(status?.subscribed);
  } catch {
    serverSubscribed = false;
  }

  return {
    permission,
    localSubscribed,
    serverSubscribed,
    active: localSubscribed && (permission === 'granted') && serverSubscribed,
  };
}

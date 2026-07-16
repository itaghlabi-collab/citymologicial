/**
 * Parsing payload Web Push — logique pure (testable), sans métier ERP.
 * Utilisé uniquement par le Service Worker pour l'affichage système.
 */

export const PUSH_DEFAULTS = Object.freeze({
  title: 'CITYMO',
  body: 'Nouvelle notification',
  icon: '/icons/icon-192.png',
  badge: '/icons/icon-192.png',
  tag: 'citymo-notification',
});

/**
 * @param {string|ArrayBuffer|null|undefined} raw
 * @returns {{ title: string, body: string, icon: string, badge: string, tag: string, data: object, url: string }}
 */
export function parsePushPayload(raw) {
  let parsed = {};
  try {
    if (raw == null) {
      parsed = {};
    } else if (typeof raw === 'string') {
      parsed = raw.trim() ? JSON.parse(raw) : {};
    } else if (raw instanceof ArrayBuffer) {
      const text = new TextDecoder('utf-8').decode(raw);
      parsed = text.trim() ? JSON.parse(text) : {};
    } else if (typeof raw === 'object') {
      parsed = raw;
    }
  } catch {
    parsed = {};
  }

  const data = (parsed.data && typeof parsed.data === 'object') ? { ...parsed.data } : {};
  const title = String(parsed.title || data.title || PUSH_DEFAULTS.title);
  const body = String(
    parsed.body
    || parsed.message
    || data.body
    || data.message
    || PUSH_DEFAULTS.body,
  );
  const icon = String(parsed.icon || data.icon || PUSH_DEFAULTS.icon);
  const badge = String(parsed.badge || data.badge || PUSH_DEFAULTS.badge);
  const tag = String(
    parsed.tag
    || data.tag
    || (data.type && data.entityId ? `${data.type}-${data.entityId}` : '')
    || (data.type && data.entity_id ? `${data.type}-${data.entity_id}` : '')
    || PUSH_DEFAULTS.tag,
  );

  const url = String(
    parsed.url
    || parsed.action_url
    || data.url
    || data.action_url
    || data.actionUrl
    || '/',
  );

  return {
    title,
    body,
    icon,
    badge,
    tag,
    url,
    data: {
      ...data,
      url,
      action_url: data.action_url || data.actionUrl || parsed.action_url || url,
    },
  };
}

/**
 * Convertit action_url / url push en URL absolue ouvrable.
 * - module:taches → https://origin/?module=taches
 * - /?module=… → origin + path
 * - https://… → tel quel
 */
export function resolvePushOpenUrl(urlOrAction, origin) {
  const base = String(origin || '').replace(/\/+$/, '') || '';
  const raw = String(urlOrAction || '').trim();
  if (!raw || raw === '/') return `${base}/`;

  if (raw.startsWith('module:')) {
    const moduleId = raw.slice(7).trim();
    if (!moduleId) return `${base}/`;
    return `${base}/?module=${encodeURIComponent(moduleId)}`;
  }

  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      if (base && u.origin === new URL(base).origin) return u.href;
      // Hors origine : ouvrir quand même l'URL (même app / domaine alternatif)
      return u.href;
    } catch {
      return `${base}/`;
    }
  }

  if (raw.startsWith('/')) {
    return `${base}${raw}`;
  }

  return `${base}/?module=${encodeURIComponent(raw)}`;
}

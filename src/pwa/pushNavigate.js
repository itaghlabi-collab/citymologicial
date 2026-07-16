/**
 * Navigation depuis un clic notification Push (côté page).
 * Réutilise parseActionUrl — ne modifie pas NotificationCenter.
 */
import { parseActionUrl } from '../services/notifications/notifications';

/**
 * @param {string|null|undefined} urlOrAction
 * @param {(moduleId: string) => void} onNavigate
 */
export function navigateFromPushUrl(urlOrAction, onNavigate) {
  if (!onNavigate) return;

  let action = urlOrAction || '';
  try {
    if (typeof action === 'string' && /^https?:\/\//i.test(action)) {
      const u = new URL(action);
      if (u.origin === window.location.origin) {
        const moduleParam = u.searchParams.get('module');
        const tab = u.searchParams.get('tab');
        const requestId = u.searchParams.get('requestId');
        if (requestId) {
          try {
            sessionStorage.setItem('citymo_purchase_request_detail', requestId);
          } catch {
            /* ignore */
          }
        }
        if (tab || moduleParam) {
          onNavigate(tab || moduleParam);
          return;
        }
        action = `${u.pathname}${u.search}` || '/';
      }
    }
  } catch {
    /* fall through */
  }

  const mod = parseActionUrl(action);
  if (!mod) return;

  // Chemin SPA type /dashboard → module dashboard (payload test étape 6)
  if (typeof mod === 'string' && mod.startsWith('/') && !mod.includes('?') && !mod.startsWith('//')) {
    const path = mod.replace(/^\/+|\/+$/g, '') || 'dashboard';
    if (path && !path.includes('/')) {
      onNavigate(path);
      return;
    }
  }

  if (mod.startsWith('/?') || mod.startsWith('http')) {
    try {
      const url = new URL(mod, window.location.origin);
      const tab = url.searchParams.get('tab');
      const moduleParam = url.searchParams.get('module');
      const requestId = url.searchParams.get('requestId');
      if (requestId) {
        try {
          sessionStorage.setItem('citymo_purchase_request_detail', requestId);
        } catch {
          /* ignore */
        }
      }
      onNavigate(tab || moduleParam || 'dashboard');
    } catch {
      onNavigate('dashboard');
    }
    return;
  }

  onNavigate(mod);
}

/** Module initial depuis ?module= / ?tab= (ouverture via openWindow). */
export function parseModuleFromSearch(search = typeof window !== 'undefined' ? window.location.search : '') {
  try {
    const params = new URLSearchParams(search);
    const moduleParam = params.get('module');
    const tab = params.get('tab');
    const requestId = params.get('requestId');
    if (requestId) {
      try {
        sessionStorage.setItem('citymo_purchase_request_detail', requestId);
      } catch {
        /* ignore */
      }
    }
    return tab || moduleParam || null;
  } catch {
    return null;
  }
}

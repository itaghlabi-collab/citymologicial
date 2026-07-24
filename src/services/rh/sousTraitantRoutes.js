/**
 * Deep-link fiche sous-traitant (SPA, sans react-router).
 * Ex. /sous-traitants/:id  ou  /sous-traitants/:id/situation-financiere
 */

export const ST_FICHE_TABS = [
  { id: 'finance', label: 'Situation financière', path: 'situation-financiere' },
  { id: 'travaux', label: 'Travaux réalisés', path: 'travaux-realises' },
  { id: 'documents', label: 'Documents', path: 'documents' },
  { id: 'historique', label: 'Historique', path: 'historique' },
  { id: 'analyse', label: 'Analyse et performance', path: 'analyse' },
];

const TAB_BY_PATH = Object.fromEntries(ST_FICHE_TABS.map((t) => [t.path, t.id]));
const PATH_BY_TAB = Object.fromEntries(ST_FICHE_TABS.map((t) => [t.id, t.path]));

export function tabIdFromPathSegment(seg) {
  if (!seg) return 'finance';
  return TAB_BY_PATH[String(seg).toLowerCase()] || 'finance';
}

export function pathSegmentFromTabId(tabId) {
  return PATH_BY_TAB[tabId] || 'situation-financiere';
}

/**
 * @returns {{ id: string, tab: string } | null}
 */
export function parseSousTraitantPath(pathname) {
  const path = pathname || (typeof window !== 'undefined' ? window.location.pathname : '');
  const m = String(path).match(/^\/sous-traitants\/([^/]+)(?:\/([^/]+))?\/?$/i);
  if (!m) return null;
  let id;
  try {
    id = decodeURIComponent(m[1]);
  } catch {
    id = m[1];
  }
  if (!id || id === 'new') return null;
  return { id, tab: tabIdFromPathSegment(m[2]) };
}

export function getSousTraitantSharePath(id, tabId = 'finance') {
  if (!id) return '/';
  const seg = pathSegmentFromTabId(tabId);
  return `/sous-traitants/${encodeURIComponent(id)}/${seg}`;
}

export function syncSousTraitantRoute(id, tabId = 'finance', { replace = false } = {}) {
  if (typeof window === 'undefined') return;
  if (!id) {
    if (window.location.pathname.startsWith('/sous-traitants/')) {
      window.history.replaceState({}, '', '/');
    }
    return;
  }
  const next = getSousTraitantSharePath(id, tabId);
  if (window.location.pathname === next) return;
  if (replace) window.history.replaceState({}, '', next);
  else window.history.pushState({}, '', next);
}

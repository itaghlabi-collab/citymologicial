/**
 * Logique partagée d'installation PWA (beforeinstallprompt).
 * Snapshot référentiellement stable : getPwaInstallState() ne recalcule jamais.
 */

const SESSION_LATER_KEY = 'citymo_pwa_install_later';

const EMPTY_SNAPSHOT = Object.freeze({
  canInstall: false,
  installed: false,
  showBanner: false,
  showButton: false,
});

let initialized = false;
let deferredPrompt = null;
let installed = false;
const listeners = new Set();

/** Référence stable — remplacée uniquement après un vrai changement d'état. */
let cachedSnapshot = EMPTY_SNAPSHOT;

function safeStandalone() {
  try {
    if (typeof window === 'undefined') return false;
    if (window.matchMedia?.('(display-mode: standalone)')?.matches) return true;
    if (typeof navigator !== 'undefined' && navigator.standalone === true) return true;
  } catch {
    /* ignore */
  }
  return false;
}

function safeSessionLater() {
  try {
    return sessionStorage.getItem(SESSION_LATER_KEY) === '1';
  } catch {
    return false;
  }
}

function computeSnapshot() {
  try {
    const standalone = safeStandalone() || installed;
    const canInstall = !standalone && Boolean(deferredPrompt);
    return {
      canInstall,
      installed: standalone,
      showBanner: canInstall && !safeSessionLater(),
      showButton: canInstall,
    };
  } catch {
    return EMPTY_SNAPSHOT;
  }
}

function snapshotsEqual(a, b) {
  return (
    a.canInstall === b.canInstall
    && a.installed === b.installed
    && a.showBanner === b.showBanner
    && a.showButton === b.showButton
  );
}

/**
 * Recalcule et notifie UNIQUEMENT si l'état a changé.
 * Jamais appelé depuis getPwaInstallState.
 */
function commitSnapshot() {
  const next = computeSnapshot();
  if (snapshotsEqual(cachedSnapshot, next)) return false;
  cachedSnapshot = next;
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      /* never break the app */
    }
  });
  return true;
}

export function initPwaInstall() {
  try {
    if (typeof window === 'undefined' || initialized) return;
    initialized = true;

    if (safeStandalone()) {
      installed = true;
      deferredPrompt = null;
      commitSnapshot();
      return;
    }

    window.addEventListener('beforeinstallprompt', (event) => {
      try {
        event.preventDefault();
        if (safeStandalone() || installed) return;
        deferredPrompt = event;
        commitSnapshot();
      } catch {
        /* ignore */
      }
    });

    window.addEventListener('appinstalled', () => {
      try {
        installed = true;
        deferredPrompt = null;
        commitSnapshot();
      } catch {
        /* ignore */
      }
    });

    commitSnapshot();
  } catch {
    cachedSnapshot = EMPTY_SNAPSHOT;
  }
}

export function subscribePwaInstall(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Retourne TOUJOURS la même référence tant que l'état n'a pas changé. */
export function getPwaInstallState() {
  return cachedSnapshot;
}

/** @internal test helper — force un commit après mutation manuelle du prompt (tests). */
export function __testSetDeferredPrompt(event) {
  deferredPrompt = event || null;
  return commitSnapshot();
}

/** @internal test helper */
export function __testResetPwaInstallStore() {
  deferredPrompt = null;
  installed = false;
  cachedSnapshot = EMPTY_SNAPSHOT;
  try {
    sessionStorage.removeItem(SESSION_LATER_KEY);
  } catch {
    /* ignore */
  }
}

/** Lance le prompt natif. */
export async function promptInstall() {
  try {
    if (!deferredPrompt || safeStandalone() || installed) {
      return { outcome: 'unavailable' };
    }

    const promptEvent = deferredPrompt;
    deferredPrompt = null;

    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice?.outcome === 'accepted') {
      installed = true;
      deferredPrompt = null;
      commitSnapshot();
      return { outcome: 'accepted' };
    }
    commitSnapshot();
    return { outcome: choice?.outcome || 'dismissed' };
  } catch {
    try {
      commitSnapshot();
    } catch {
      /* ignore */
    }
    return { outcome: 'unavailable' };
  }
}

/** Masque la bannière pour la session courante (icône header reste). */
export function dismissInstallBannerForSession() {
  try {
    sessionStorage.setItem(SESSION_LATER_KEY, '1');
  } catch {
    /* private mode */
  }
  try {
    commitSnapshot();
  } catch {
    /* ignore */
  }
}

if (typeof window !== 'undefined') {
  try {
    initPwaInstall();
  } catch {
    cachedSnapshot = EMPTY_SNAPSHOT;
  }
}

/**
 * Logique partagée d'installation PWA (état réel du store uniquement).
 * Snapshot référentiellement stable : getPwaInstallState() ne recalcule jamais.
 */

const SESSION_LATER_KEY = 'citymo_pwa_install_later';

const EMPTY_SNAPSHOT = Object.freeze({
  canInstall: false,
  installed: false,
  showBanner: false,
  showButton: false,
  showIosHelp: false,
  showBrowserHelp: false,
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

/**
 * iOS : pas de beforeinstallprompt — UA indispensable faute d'API alternative.
 * Conservé pour le flux Partager → Ajouter à l'écran d'accueil existant.
 */
function safeIsIos() {
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

function safeIsMobileTouch() {
  try {
    return Number(navigator?.maxTouchPoints || 0) > 0;
  } catch {
    return false;
  }
}

/**
 * Source de vérité unique : deferredPrompt réel et exploitable.
 * — event existe
 * — prompt est une fonction
 * — userChoice existe
 */
export function isDeferredPromptUsable(event) {
  try {
    if (!event) return false;
    if (typeof event.prompt !== 'function') return false;
    if (event.userChoice == null) return false;
    return true;
  } catch {
    return false;
  }
}

export function canUseNativeInstallPrompt() {
  return isDeferredPromptUsable(deferredPrompt);
}

/**
 * Action d'installation recommandée pour l'UI.
 * @returns {'native'|'ios'|'browser'|'none'}
 */
export function getInstallAction() {
  try {
    const state = cachedSnapshot;
    if (state.canInstall) return 'native';
    if (state.showIosHelp) return 'ios';
    if (state.showBrowserHelp) return 'browser';
    return 'none';
  } catch {
    return 'none';
  }
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
    if (standalone) {
      return {
        canInstall: false,
        installed: true,
        showBanner: false,
        showButton: false,
        showIosHelp: false,
        showBrowserHelp: false,
      };
    }

    const later = safeSessionLater();
    const canInstall = canUseNativeInstallPrompt();
    const showIosHelp = !canInstall && safeIsIos();
    // Pas de prompt exploitable → aide navigateur (mobile). Jamais basé sur la présence d'une API.
    const showBrowserHelp = !canInstall && !showIosHelp && safeIsMobileTouch();
    const showBanner = !later && (canInstall || showIosHelp || showBrowserHelp);

    return {
      canInstall,
      installed: false,
      showBanner,
      showButton: canInstall,
      showIosHelp,
      showBrowserHelp,
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
    && a.showIosHelp === b.showIosHelp
    && a.showBrowserHelp === b.showBrowserHelp
  );
}

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
        deferredPrompt = isDeferredPromptUsable(event) ? event : null;
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

export function getPwaInstallState() {
  return cachedSnapshot;
}

export function __testSetDeferredPrompt(event) {
  deferredPrompt = isDeferredPromptUsable(event) ? event : null;
  return commitSnapshot();
}

export function __testResetPwaInstallStore() {
  deferredPrompt = null;
  installed = false;
  cachedSnapshot = EMPTY_SNAPSHOT;
  try {
    sessionStorage.removeItem(SESSION_LATER_KEY);
  } catch {
    /* ignore */
  }
  commitSnapshot();
}

export function __testForceCommit() {
  return commitSnapshot();
}

export async function copyCurrentPageUrl() {
  try {
    if (typeof window === 'undefined') return false;
    const url = window.location.href;
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      return true;
    }
    const ta = document.createElement('textarea');
    ta.value = url;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** Lance le prompt natif uniquement si le store a un deferredPrompt exploitable. */
export async function promptInstall() {
  try {
    if (!canUseNativeInstallPrompt() || safeStandalone() || installed) {
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

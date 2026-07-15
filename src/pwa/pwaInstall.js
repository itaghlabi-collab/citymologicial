/**
 * Logique partagée d'installation PWA (beforeinstallprompt).
 * Une seule source pour bannière + icône header.
 */

const SESSION_LATER_KEY = 'citymo_pwa_install_later';

let initialized = false;
let deferredPrompt = null;
let installed = false;
const listeners = new Set();

function isStandalone() {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  // iOS Safari (legacy)
  if (typeof navigator !== 'undefined' && navigator.standalone === true) return true;
  return false;
}

function getSnapshot() {
  const standalone = isStandalone() || installed;
  const canInstall = !standalone && Boolean(deferredPrompt);
  return {
    canInstall,
    installed: standalone,
    showBanner: canInstall && sessionStorage.getItem(SESSION_LATER_KEY) !== '1',
    showButton: canInstall,
  };
}

function emit() {
  const snapshot = getSnapshot();
  listeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch {
      /* ignore subscriber errors */
    }
  });
}

export function initPwaInstall() {
  if (typeof window === 'undefined' || initialized) return;
  initialized = true;

  if (isStandalone()) {
    installed = true;
    deferredPrompt = null;
    return;
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    if (isStandalone() || installed) return;
    deferredPrompt = event;
    emit();
  });

  window.addEventListener('appinstalled', () => {
    installed = true;
    deferredPrompt = null;
    emit();
  });
}

export function subscribePwaInstall(listener) {
  listeners.add(listener);
  listener(getSnapshot());
  return () => listeners.delete(listener);
}

export function getPwaInstallState() {
  return getSnapshot();
}

/** Lance le prompt natif. Retourne { outcome: 'accepted' | 'dismissed' | 'unavailable' }. */
export async function promptInstall() {
  if (!deferredPrompt || isStandalone() || installed) {
    return { outcome: 'unavailable' };
  }

  const promptEvent = deferredPrompt;
  deferredPrompt = null;

  try {
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice?.outcome === 'accepted') {
      installed = true;
      deferredPrompt = null;
      emit();
      return { outcome: 'accepted' };
    }
    // Refusé : on n'a plus l'événement — plus rien à proposer jusqu'au prochain beforeinstallprompt
    emit();
    return { outcome: choice?.outcome || 'dismissed' };
  } catch {
    emit();
    return { outcome: 'unavailable' };
  }
}

/** Masque la bannière pour la session courante uniquement (icône header reste). */
export function dismissInstallBannerForSession() {
  try {
    sessionStorage.setItem(SESSION_LATER_KEY, '1');
  } catch {
    /* private mode */
  }
  emit();
}

if (typeof window !== 'undefined') {
  initPwaInstall();
}

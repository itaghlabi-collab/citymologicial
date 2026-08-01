import { useEffect, useRef, useState } from 'react';
import './pwa-update.css';

const IDLE_MS = 1200;
/** Même si l’utilisateur est « occupé », on propose quand même après ce délai. */
const MAX_DEFER_MS = 8_000;
const UPDATE_POLL_MS = 30_000;
const SNOOZE_KEY = 'citymo_pwa_update_snooze_until';
const SNOOZE_MS = 30 * 60 * 1000; // 30 min après « Plus tard »

function isEditableField(el) {
  if (!el || el === document.body || el === document.documentElement) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  return false;
}

function isUserBusy() {
  // Uniquement dialog HTML ouvert — pas tous les [aria-modal] (souvent laissés dans le DOM)
  if (document.querySelector('dialog[open]')) return true;
  const active = document.activeElement;
  if (isEditableField(active)) return true;
  return false;
}

function readSnoozeUntil() {
  try {
    const raw = sessionStorage.getItem(SNOOZE_KEY);
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function writeSnooze() {
  try {
    sessionStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
  } catch {
    /* ignore */
  }
}

function clearSnooze() {
  try {
    sessionStorage.removeItem(SNOOZE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Bannière de mise à jour PWA.
 * - Pas de skipWaiting / clientsClaim / reload automatiques.
 * - Affichage forcé au plus tard après MAX_DEFER_MS (timer unique, non reset par l’activité).
 * - « Plus tard » = snooze 30 min (session), pas un dismiss définitif.
 */
export default function PwaUpdateBanner() {
  const [visible, setVisible] = useState(false);
  const [updating, setUpdating] = useState(false);
  const registrationRef = useRef(null);
  const waitingRef = useRef(null);
  const reloadingRef = useRef(false);
  const ignoreActivityRef = useRef(false);
  const lastActivityRef = useRef(Date.now());
  const firstOfferAtRef = useRef(0);
  const idleTimerRef = useRef(null);
  const forceTimerRef = useRef(null);

  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return undefined;

    let cancelled = false;

    const isSnoozed = () => Date.now() < readSnoozeUntil();

    const canOfferSoft = () => {
      if (reloadingRef.current || isSnoozed()) return false;
      if (isUserBusy()) return false;
      if (Date.now() - lastActivityRef.current < IDLE_MS) return false;
      return true;
    };

    const showBanner = () => {
      if (cancelled || !waitingRef.current || reloadingRef.current) return;
      if (isSnoozed()) return;
      setVisible(true);
    };

    const showIfReady = ({ force = false } = {}) => {
      if (cancelled || !waitingRef.current || reloadingRef.current) return;
      if (isSnoozed()) return;
      if (!force && !canOfferSoft()) return;
      showBanner();
    };

    const scheduleOffer = () => {
      if (!waitingRef.current || reloadingRef.current || isSnoozed()) return;

      // Timer forcé : une seule fois (ne pas le clear à chaque clic — sinon la bannière
      // ne s’affiche jamais tant que l’utilisateur reste actif).
      if (!firstOfferAtRef.current) {
        firstOfferAtRef.current = Date.now();
        if (forceTimerRef.current) clearTimeout(forceTimerRef.current);
        forceTimerRef.current = setTimeout(() => showIfReady({ force: true }), MAX_DEFER_MS);
      }

      // Soft : après courte inactivité
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => showIfReady({ force: false }), IDLE_MS);
    };

    const offerWaiting = (sw) => {
      if (!sw || reloadingRef.current) return;
      waitingRef.current = sw;
      scheduleOffer();
    };

    const syncWaitingFromRegistration = (registration) => {
      if (!registration || cancelled) return;
      if (registration.waiting) {
        offerWaiting(registration.waiting);
      }
    };

    const checkForUpdates = () => {
      const registration = registrationRef.current;
      if (!registration) return;
      syncWaitingFromRegistration(registration);
      registration.update().catch(() => {});
    };

    const markActivity = () => {
      if (ignoreActivityRef.current) return;
      lastActivityRef.current = Date.now();
      // Ne reschedule que le délai soft — le force timer reste intact
      if (waitingRef.current && !isSnoozed()) {
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        idleTimerRef.current = setTimeout(() => showIfReady({ force: false }), IDLE_MS);
      }
    };

    const onUpdateFound = (registration) => {
      const installing = registration.installing;
      if (!installing) return;
      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed') {
          offerWaiting(registration.waiting || installing);
        }
      });
    };

    const onActivity = (event) => {
      if (event?.target?.closest?.('.pwa-update-banner')) return;
      markActivity();
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') checkForUpdates();
    };

    window.addEventListener('pointerdown', onActivity, true);
    window.addEventListener('keydown', onActivity, true);
    window.addEventListener('input', onActivity, true);
    window.addEventListener('focus', checkForUpdates);
    document.addEventListener('visibilitychange', onVisibility);

    const pollId = window.setInterval(checkForUpdates, UPDATE_POLL_MS);

    // sw.js buildé par vite-plugin-pwa = script classique (bundle), pas ES module
    const bindRegistration = (registration) => {
      if (cancelled || !registration) return;
      registrationRef.current = registration;
      syncWaitingFromRegistration(registration);
      registration.addEventListener('updatefound', () => onUpdateFound(registration));
      registration.update().catch(() => {});
    };

    navigator.serviceWorker
      .getRegistration()
      .then((existing) => {
        if (cancelled) return null;
        if (existing) {
          bindRegistration(existing);
          return existing;
        }
        return navigator.serviceWorker.register('/sw.js').then((registration) => {
          bindRegistration(registration);
          return registration;
        });
      })
      .catch(() => {
        /* enregistrement non bloquant */
      });

    return () => {
      cancelled = true;
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (forceTimerRef.current) clearTimeout(forceTimerRef.current);
      window.clearInterval(pollId);
      window.removeEventListener('pointerdown', onActivity, true);
      window.removeEventListener('keydown', onActivity, true);
      window.removeEventListener('input', onActivity, true);
      window.removeEventListener('focus', checkForUpdates);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const handleLater = () => {
    writeSnooze();
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (forceTimerRef.current) clearTimeout(forceTimerRef.current);
    firstOfferAtRef.current = 0;
    setVisible(false);
  };

  const handleUpdate = async () => {
    const waiting = waitingRef.current || registrationRef.current?.waiting;
    if (!waiting || reloadingRef.current) return;

    ignoreActivityRef.current = true;
    clearSnooze();
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (forceTimerRef.current) clearTimeout(forceTimerRef.current);
    setUpdating(true);

    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('timeout')), 15000);

        const onControllerChange = () => {
          clearTimeout(timeout);
          navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
          resolve();
        };

        navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
        waiting.postMessage({ type: 'SKIP_WAITING' });

        window.setTimeout(() => {
          if (reloadingRef.current) return;
          clearTimeout(timeout);
          navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
          resolve();
        }, 1200);
      });

      if (reloadingRef.current) return;
      reloadingRef.current = true;
      window.location.reload();
    } catch {
      ignoreActivityRef.current = false;
      setUpdating(false);
      window.location.reload();
    }
  };

  if (!visible) return null;

  return (
    <div className="pwa-update-banner" role="status" aria-live="polite">
      <p className="pwa-update-banner__message">
        Une nouvelle version de CITYMO est disponible.
      </p>
      <div className="pwa-update-banner__actions">
        <button
          type="button"
          className="pwa-update-banner__btn pwa-update-banner__btn--primary"
          onClick={handleUpdate}
          disabled={updating}
        >
          {updating ? 'Mise à jour…' : 'Mettre à jour'}
        </button>
        <button
          type="button"
          className="pwa-update-banner__btn pwa-update-banner__btn--ghost"
          onClick={handleLater}
          disabled={updating}
        >
          Plus tard
        </button>
      </div>
    </div>
  );
}

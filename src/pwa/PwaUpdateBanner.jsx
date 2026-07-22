import { useEffect, useRef, useState } from 'react';
import './pwa-update.css';

const IDLE_MS = 1500;
const UPDATE_POLL_MS = 60_000;

function isEditableField(el) {
  if (!el || el === document.body || el === document.documentElement) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  return false;
}

function isUserBusy() {
  if (document.querySelector('dialog[open], [aria-modal="true"]')) return true;

  const active = document.activeElement;
  if (isEditableField(active)) return true;

  return false;
}

/**
 * Bannière de mise à jour PWA.
 * - Pas de skipWaiting / clientsClaim / reload automatiques.
 * - Proposition différée si saisie formulaire / activité utilisateur.
 * - Le bouton "Mettre à jour" est une exception (jamais différé).
 * - Vérifie régulièrement (focus / intervalle) qu’un SW en attente existe.
 */
export default function PwaUpdateBanner() {
  const [visible, setVisible] = useState(false);
  const [updating, setUpdating] = useState(false);
  const registrationRef = useRef(null);
  const waitingRef = useRef(null);
  const dismissedRef = useRef(false);
  const pendingOfferRef = useRef(false);
  const reloadingRef = useRef(false);
  const ignoreActivityRef = useRef(false);
  const lastActivityRef = useRef(Date.now());
  const idleTimerRef = useRef(null);

  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return undefined;

    let cancelled = false;

    const canOfferNow = () => {
      if (dismissedRef.current || reloadingRef.current) return false;
      if (isUserBusy()) return false;
      if (Date.now() - lastActivityRef.current < IDLE_MS) return false;
      return true;
    };

    const showIfReady = () => {
      if (cancelled || !waitingRef.current || dismissedRef.current) return;
      if (!canOfferNow()) {
        pendingOfferRef.current = true;
        return;
      }
      pendingOfferRef.current = false;
      setVisible(true);
    };

    const scheduleOffer = () => {
      if (!waitingRef.current || dismissedRef.current) return;
      pendingOfferRef.current = true;
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        showIfReady();
      }, IDLE_MS);
    };

    const offerWaiting = (sw) => {
      if (!sw || dismissedRef.current) return;
      waitingRef.current = sw;
      scheduleOffer();
    };

    const syncWaitingFromRegistration = (registration) => {
      if (!registration || cancelled) return;
      const waiting = registration.waiting;
      if (waiting && navigator.serviceWorker.controller) {
        offerWaiting(waiting);
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
      if (waitingRef.current && !dismissedRef.current) {
        scheduleOffer();
      } else if (pendingOfferRef.current) {
        scheduleOffer();
      }
    };

    const onUpdateFound = (registration) => {
      const installing = registration.installing;
      if (!installing) return;
      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
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

    navigator.serviceWorker
      .register('/sw.js', { type: 'module' })
      .then((registration) => {
        if (cancelled) return;
        registrationRef.current = registration;

        syncWaitingFromRegistration(registration);
        registration.addEventListener('updatefound', () => onUpdateFound(registration));
        // Force une vérif dès l’arrivée sur l’app
        registration.update().catch(() => {});
      })
      .catch(() => {
        /* enregistrement non bloquant */
      });

    return () => {
      cancelled = true;
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      window.clearInterval(pollId);
      window.removeEventListener('pointerdown', onActivity, true);
      window.removeEventListener('keydown', onActivity, true);
      window.removeEventListener('input', onActivity, true);
      window.removeEventListener('focus', checkForUpdates);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const handleLater = () => {
    dismissedRef.current = true;
    pendingOfferRef.current = false;
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    setVisible(false);
  };

  const handleUpdate = async () => {
    const waiting = waitingRef.current || registrationRef.current?.waiting;
    if (!waiting || reloadingRef.current) return;

    ignoreActivityRef.current = true;
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
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

        // Fallback si controllerchange n’arrive pas assez vite
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
      // Dernier recours : recharger quand même pour tenter de prendre la nouvelle version
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

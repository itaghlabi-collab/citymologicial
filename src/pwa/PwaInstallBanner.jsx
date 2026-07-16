import { useEffect, useState } from 'react';
import { usePwaInstall } from './usePwaInstall';
import PwaBrowserInstallHint from './PwaBrowserInstallHint';
import './pwa-install.css';

/**
 * Bannière d'installation PWA — décision centralisée via getInstallAction() :
 * - native : Installer + prompt()
 * - ios : consigne Partager → Ajouter à l'écran d'accueil
 * - browser : aide Chrome (pas de prompt())
 */
export default function PwaInstallBanner() {
  const {
    showBanner,
    installAction,
    promptInstall,
    dismissBannerForSession,
  } = usePwaInstall();
  const [busy, setBusy] = useState(false);
  const [iosTipOpen, setIosTipOpen] = useState(false);
  const [browserTipOpen, setBrowserTipOpen] = useState(false);

  useEffect(() => {
    if (!showBanner) return undefined;
    document.body.classList.add('pwa-install-banner-active');

    const syncLoginAboveBanner = () => {
      try {
        const loginBtn = document.querySelector('.btn-login')
          || [...document.querySelectorAll('button')].find((b) => /connecter/i.test(b.textContent || ''));
        const banner = document.querySelector('.pwa-install-banner');
        const page = document.querySelector('.login-page');
        if (!loginBtn || !banner || !page) return;
        const lr = loginBtn.getBoundingClientRect();
        const br = banner.getBoundingClientRect();
        const gap = 10;
        if (lr.bottom > br.top - gap) {
          page.scrollBy({ top: lr.bottom - br.top + gap, left: 0, behavior: 'instant' });
        }
      } catch {
        /* ignore */
      }
    };

    const id = window.requestAnimationFrame(() => {
      syncLoginAboveBanner();
      window.requestAnimationFrame(syncLoginAboveBanner);
    });

    return () => {
      window.cancelAnimationFrame(id);
      document.body.classList.remove('pwa-install-banner-active');
    };
  }, [showBanner, iosTipOpen, browserTipOpen]);

  if (!showBanner) return null;

  const dismiss = () => {
    try {
      dismissBannerForSession();
    } catch {
      /* ignore */
    }
  };

  const handleInstall = async () => {
    if (busy) return;
    if (installAction === 'browser') {
      setBrowserTipOpen(true);
      return;
    }
    if (installAction === 'ios') {
      setIosTipOpen(true);
      return;
    }
    if (installAction !== 'native') return;
    setBusy(true);
    try {
      const { outcome } = await promptInstall();
      if (outcome !== 'accepted') setBusy(false);
    } catch {
      setBusy(false);
    }
  };

  const tipOpen = iosTipOpen || browserTipOpen;

  return (
    <div
      className={`pwa-install-banner${installAction === 'ios' ? ' pwa-install-banner--ios' : ''}${tipOpen ? ' pwa-install-banner--ios-tip' : ''}${browserTipOpen ? ' pwa-install-banner--browser-tip' : ''}`}
      role="status"
      aria-live="polite"
    >
      <div className="pwa-install-banner__text">
        <p className="pwa-install-banner__title">Installez CITYMO</p>
        {browserTipOpen ? null : installAction === 'ios' && iosTipOpen ? (
          <p className="pwa-install-banner__subtitle">
            Partager → Ajouter à l&apos;écran d&apos;accueil
          </p>
        ) : !tipOpen ? (
          <p className="pwa-install-banner__subtitle">Accédez plus rapidement !</p>
        ) : null}
      </div>
      {browserTipOpen ? (
        <PwaBrowserInstallHint variant="inline" onClose={() => setBrowserTipOpen(false)} />
      ) : (
        <div className="pwa-install-banner__actions">
          {installAction === 'ios' && iosTipOpen ? (
            <button
              type="button"
              className="pwa-install-banner__btn pwa-install-banner__btn--primary"
              onClick={dismiss}
            >
              Compris
            </button>
          ) : (
            <button
              type="button"
              className="pwa-install-banner__btn pwa-install-banner__btn--primary"
              onClick={handleInstall}
              disabled={busy}
            >
              {busy ? 'Installation…' : 'Installer'}
            </button>
          )}
          <button
            type="button"
            className="pwa-install-banner__btn pwa-install-banner__btn--ghost"
            onClick={dismiss}
            disabled={busy}
          >
            Plus tard
          </button>
        </div>
      )}
    </div>
  );
}

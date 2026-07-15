import { useEffect, useState } from 'react';
import { usePwaInstall } from './usePwaInstall';
import './pwa-install.css';

/**
 * Bannière d'installation PWA :
 * - Android/Chrome : Installer + Plus tard (beforeinstallprompt)
 * - iOS/Safari : consignes Partager + Compris / Plus tard
 */
export default function PwaInstallBanner() {
  const {
    showBanner,
    showIosHelp,
    promptInstall,
    dismissBannerForSession,
  } = usePwaInstall();
  const [busy, setBusy] = useState(false);

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
  }, [showBanner]);

  if (!showBanner) return null;

  const dismiss = () => {
    try {
      dismissBannerForSession();
    } catch {
      /* ignore */
    }
  };

  const handleInstall = async () => {
    if (busy || showIosHelp) return;
    setBusy(true);
    try {
      const { outcome } = await promptInstall();
      if (outcome !== 'accepted') setBusy(false);
    } catch {
      setBusy(false);
    }
  };

  return (
    <div
      className={`pwa-install-banner${showIosHelp ? ' pwa-install-banner--ios' : ''}`}
      role="status"
      aria-live="polite"
    >
      <div className="pwa-install-banner__text">
        <p className="pwa-install-banner__title">Installez CITYMO</p>
        {showIosHelp ? (
          <p className="pwa-install-banner__subtitle">
            Pour ajouter l&apos;application à votre écran d&apos;accueil :
            appuyez sur Partager puis sur « Ajouter à l&apos;écran d&apos;accueil ».
          </p>
        ) : (
          <p className="pwa-install-banner__subtitle">Accédez plus rapidement !</p>
        )}
      </div>
      <div className="pwa-install-banner__actions">
        {showIosHelp ? (
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
    </div>
  );
}

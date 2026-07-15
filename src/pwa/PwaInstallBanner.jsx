import { useState } from 'react';
import { usePwaInstall } from './usePwaInstall';
import './pwa-install.css';

/**
 * Bannière discrète d'installation PWA (beforeinstallprompt).
 * Indépendante de PwaUpdateBanner.
 */
export default function PwaInstallBanner() {
  const { showBanner, promptInstall, dismissBannerForSession } = usePwaInstall();
  const [busy, setBusy] = useState(false);

  if (!showBanner) return null;

  const handleInstall = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { outcome } = await promptInstall();
      if (outcome !== 'accepted') setBusy(false);
      // accepted → état partagé masque bannière + icône sans reload
    } catch {
      setBusy(false);
    }
  };

  const handleLater = () => {
    dismissBannerForSession();
  };

  return (
    <div className="pwa-install-banner" role="status" aria-live="polite">
      <div className="pwa-install-banner__text">
        <p className="pwa-install-banner__title">Installez CITYMO</p>
        <p className="pwa-install-banner__subtitle">Accédez plus rapidement !</p>
      </div>
      <div className="pwa-install-banner__actions">
        <button
          type="button"
          className="pwa-install-banner__btn pwa-install-banner__btn--primary"
          onClick={handleInstall}
          disabled={busy}
        >
          {busy ? 'Installation…' : 'Installer'}
        </button>
        <button
          type="button"
          className="pwa-install-banner__btn pwa-install-banner__btn--ghost"
          onClick={handleLater}
          disabled={busy}
        >
          Plus tard
        </button>
      </div>
    </div>
  );
}

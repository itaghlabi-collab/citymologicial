import { useState } from 'react';
import { copyCurrentPageUrl } from './pwaInstall';

const BROWSER_HINT_TEXT =
  "L'installation n'est pas disponible sur ce navigateur. Ouvrez CITYMO dans Google Chrome, puis appuyez sur Installer.";

/**
 * Aide navigateur incompatible — affichée quand aucun prompt() natif n'est exploitable.
 * @param {'inline'|'modal'} variant
 */
export default function PwaBrowserInstallHint({ variant = 'inline', onClose }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      const ok = await copyCurrentPageUrl();
      if (ok) {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      /* ignore */
    }
  };

  if (variant === 'modal') {
    return (
      <div
        className="pwa-browser-hint-overlay"
        role="dialog"
        aria-label="Installation via Chrome"
        onClick={onClose}
      >
        <div
          className="pwa-browser-hint-modal"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="pwa-browser-hint-modal__text">{BROWSER_HINT_TEXT}</p>
          <div className="pwa-browser-hint-modal__actions">
            <button
              type="button"
              className="pwa-install-banner__btn pwa-install-banner__btn--primary"
              onClick={handleCopy}
            >
              {copied ? 'Lien copié' : 'Copier le lien'}
            </button>
            <button
              type="button"
              className="pwa-install-banner__btn pwa-install-banner__btn--ghost"
              onClick={onClose}
            >
              Fermer
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <p className="pwa-install-banner__subtitle">{BROWSER_HINT_TEXT}</p>
      <div className="pwa-install-banner__actions">
        <button
          type="button"
          className="pwa-install-banner__btn pwa-install-banner__btn--primary"
          onClick={handleCopy}
        >
          {copied ? 'Lien copié' : 'Copier le lien'}
        </button>
        <button
          type="button"
          className="pwa-install-banner__btn pwa-install-banner__btn--ghost"
          onClick={onClose}
        >
          Fermer
        </button>
      </div>
    </>
  );
}

import { useState } from 'react';
import { Download } from 'lucide-react';
import { usePwaInstall } from './usePwaInstall';
import PwaBrowserInstallHint from './PwaBrowserInstallHint';
import './pwa-install.css';

/**
 * Icône d'installation PWA dans le header ERP.
 * Visible uniquement quand un prompt natif exploitable est disponible.
 */
export default function PwaInstallButton() {
  const { showButton, installAction, promptInstall } = usePwaInstall();
  const [busy, setBusy] = useState(false);
  const [browserHintOpen, setBrowserHintOpen] = useState(false);

  if (!showButton) return null;

  const handleClick = async () => {
    if (busy) return;
    if (installAction === 'browser') {
      setBrowserHintOpen(true);
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

  return (
    <>
      <button
        type="button"
        className="icon-btn pwa-install-btn"
        aria-label="Installer CITYMO"
        title="Installer CITYMO"
        onClick={handleClick}
        disabled={busy}
      >
        <Download size={18} />
      </button>
      {browserHintOpen && (
        <PwaBrowserInstallHint
          variant="modal"
          onClose={() => setBrowserHintOpen(false)}
        />
      )}
    </>
  );
}

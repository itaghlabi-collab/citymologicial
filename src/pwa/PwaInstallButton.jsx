import { useState } from 'react';
import { Download } from 'lucide-react';
import { usePwaInstall } from './usePwaInstall';
import './pwa-install.css';

/**
 * Icône d'installation PWA dans le header ERP.
 * Même beforeinstallprompt que PwaInstallBanner.
 */
export default function PwaInstallButton() {
  const { showButton, promptInstall } = usePwaInstall();
  const [busy, setBusy] = useState(false);

  if (!showButton) return null;

  const handleClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { outcome } = await promptInstall();
      if (outcome !== 'accepted') setBusy(false);
    } catch {
      setBusy(false);
    }
  };

  return (
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
  );
}

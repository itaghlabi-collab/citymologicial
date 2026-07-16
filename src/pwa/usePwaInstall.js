import { useEffect, useState } from 'react';
import {
  initPwaInstall,
  getPwaInstallState,
  subscribePwaInstall,
  promptInstall,
  dismissInstallBannerForSession,
  getInstallAction,
} from './pwaInstall';

const SAFE = {
  canInstall: false,
  installed: false,
  showBanner: false,
  showButton: false,
  showIosHelp: false,
  showBrowserHelp: false,
};

/**
 * Accès React à l'état d'installation PWA.
 * useState + subscribe (pas useSyncExternalStore) pour éviter toute boucle.
 */
export function usePwaInstall() {
  const [state, setState] = useState(() => {
    try {
      initPwaInstall();
      return getPwaInstallState();
    } catch {
      return SAFE;
    }
  });

  useEffect(() => {
    let unsub = () => {};
    try {
      initPwaInstall();
      setState(getPwaInstallState());
      unsub = subscribePwaInstall(() => {
        try {
          setState(getPwaInstallState());
        } catch {
          setState(SAFE);
        }
      });
    } catch {
      setState(SAFE);
    }
    return () => {
      try {
        unsub();
      } catch {
        /* ignore */
      }
    };
  }, []);

  return {
    canInstall: state.canInstall,
    installed: state.installed,
    showBanner: state.showBanner,
    showButton: state.showButton,
    showIosHelp: state.showIosHelp,
    showBrowserHelp: state.showBrowserHelp,
    installAction: getInstallAction(),
    promptInstall,
    dismissBannerForSession: dismissInstallBannerForSession,
  };
}

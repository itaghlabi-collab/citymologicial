import { useSyncExternalStore } from 'react';
import {
  getPwaInstallState,
  subscribePwaInstall,
  promptInstall,
  dismissInstallBannerForSession,
} from './pwaInstall';

/**
 * Accès React à l'état d'installation PWA partagé.
 */
export function usePwaInstall() {
  const state = useSyncExternalStore(subscribePwaInstall, getPwaInstallState, getPwaInstallState);

  return {
    ...state,
    promptInstall,
    dismissBannerForSession: dismissInstallBannerForSession,
  };
}

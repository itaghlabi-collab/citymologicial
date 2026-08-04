import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import PublicSharePage from './components/documents/PublicSharePage';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './utils/toast';
import PwaUpdateBanner from './pwa/PwaUpdateBanner';
import PwaInstallBanner from './pwa/PwaInstallBanner';
import PwaSafeBoundary from './pwa/PwaSafeBoundary';
import { clearSnooze, markUpdateAvailable } from './pwa/updateSignal';
import './index.css';

const BUILD_ID = import.meta.env.VITE_BUILD_ID || 'dev';
const BUILD_STORAGE_KEY = 'citymo_build_id';

if (import.meta.env.PROD) {
  const previousBuild = localStorage.getItem(BUILD_STORAGE_KEY);
  if (previousBuild && previousBuild !== BUILD_ID) {
    // Signale à PwaUpdateBanner qu’une MAJ est disponible (même sans SW waiting).
    markUpdateAvailable(BUILD_ID);
    clearSnooze();
    localStorage.setItem(BUILD_STORAGE_KEY, BUILD_ID);
    localStorage.removeItem('citymo_notif_sound_rev');
  } else if (!previousBuild) {
    localStorage.setItem(BUILD_STORAGE_KEY, BUILD_ID);
  }
  console.info(`[CITYMO] build ${BUILD_ID}`);
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');

function getShareToken() {
  const match = window.location.pathname.match(/^\/share\/([^/]+)\/?$/);
  return match ? decodeURIComponent(match[1]) : null;
}

const shareToken = getShareToken();

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <AuthProvider>
      <ToastProvider>
        {shareToken ? <PublicSharePage token={shareToken} /> : <App />}
        <PwaUpdateBanner />
        <PwaSafeBoundary>
          <PwaInstallBanner />
        </PwaSafeBoundary>
      </ToastProvider>
    </AuthProvider>
  </React.StrictMode>,
);

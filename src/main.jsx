import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import PublicSharePage from './components/documents/PublicSharePage';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './utils/toast';
import './index.css';

if (import.meta.env.PROD && import.meta.env.VITE_BUILD_ID) {
  console.info(`[CITYMO] build ${import.meta.env.VITE_BUILD_ID}`);
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
      </ToastProvider>
    </AuthProvider>
  </React.StrictMode>,
);

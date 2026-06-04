import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './utils/toast';
import { logCitymoEnv, logEnvDiagnostics } from './config/env';
import './index.css';

logCitymoEnv();
logEnvDiagnostics();

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <AuthProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </AuthProvider>
  </React.StrictMode>,
);

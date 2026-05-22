/**
 * toast.jsx — CITYMO Global Toast System
 *
 * Usage:
 *   import { useToast, ToastContainer } from '../utils/toast';
 *
 *   // In your root component, add <ToastContainer />
 *   // In any component:
 *   const toast = useToast();
 *   toast.success('Enregistrement sauvegarde.');
 *   toast.error('Une erreur est survenue.');
 *   toast.warning('Verifiez les champs obligatoires.');
 *   toast.info('Chargement en cours...');
 */

import { useState, useCallback, useRef, createContext, useContext } from 'react';

const ToastContext = createContext(null);

let _toastId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current[id]);
    delete timers.current[id];
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const show = useCallback((type, message, duration = 3500) => {
    const id = ++_toastId;
    setToasts(prev => [...prev, { id, type, message }]);
    timers.current[id] = setTimeout(() => dismiss(id), duration);
    return id;
  }, [dismiss]);

  const api = {
    success: (msg, dur) => show('success', msg, dur),
    error:   (msg, dur) => show('error',   msg, dur || 5000),
    warning: (msg, dur) => show('warning', msg, dur),
    info:    (msg, dur) => show('info',    msg, dur),
    dismiss,
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

const TOAST_STYLES = {
  success: { bg: '#2E7D32', icon: '✓' },
  error:   { bg: '#C62828', icon: '✕' },
  warning: { bg: '#E65100', icon: '!' },
  info:    { bg: '#1565C0', icon: 'i' },
};

function ToastContainer({ toasts, onDismiss }) {
  if (!toasts.length) return null;
  return (
    <div style={{
      position: 'fixed',
      bottom: 24,
      right: 24,
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      maxWidth: 360,
      width: '100%',
      pointerEvents: 'none',
    }}>
      {toasts.map(t => {
        const cfg = TOAST_STYLES[t.type] || TOAST_STYLES.info;
        return (
          <div
            key={t.id}
            onClick={() => onDismiss(t.id)}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              background: cfg.bg,
              color: '#fff',
              borderRadius: 10,
              padding: '12px 16px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.22)',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
              pointerEvents: 'all',
              animation: 'slideInRight 0.2s ease',
              userSelect: 'none',
            }}
          >
            <span style={{
              width: 20, height: 20, borderRadius: '50%',
              background: 'rgba(255,255,255,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.75rem', fontWeight: 800, flexShrink: 0,
            }}>
              {cfg.icon}
            </span>
            <span style={{ flex: 1, lineHeight: 1.4 }}>{t.message}</span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Standalone Toast component for modules not yet using ToastProvider.
 * Drop-in replacement for existing per-component Toast components.
 *
 * Usage:
 *   const [toast, setToast] = useState(null);
 *   <StandaloneToast toast={toast} />
 *   setToast({ type: 'success', msg: 'Enregistre.' });
 */
export function StandaloneToast({ toast }) {
  if (!toast) return null;
  const bg = toast.type === 'success' ? '#2E7D32' : toast.type === 'warning' ? '#E65100' : '#C62828';
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      background: bg, color: '#fff', padding: '12px 20px',
      borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.22)',
      fontSize: '0.88rem', fontWeight: 600, maxWidth: 340,
    }}>
      {toast.msg}
    </div>
  );
}

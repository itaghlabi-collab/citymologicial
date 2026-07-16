/**
 * Hook React — état d'activation Web Push (cet appareil uniquement).
 */
import { useCallback, useEffect, useState } from 'react';
import {
  disablePushNotifications,
  enablePushNotifications,
  getPermissionSnapshot,
  readPushActivationState,
  requestTestPush,
} from './pushClient';

const INITIAL = {
  loading: true,
  busy: false,
  permission: 'unsupported',
  active: false,
  localSubscribed: false,
  serverSubscribed: false,
  error: null,
  message: null,
};

export function usePushNotifications({ enabled = true } = {}) {
  const [state, setState] = useState(INITIAL);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }
    try {
      const snap = await readPushActivationState();
      setState((s) => ({
        ...s,
        loading: false,
        busy: false,
        permission: snap.permission,
        active: snap.active,
        localSubscribed: snap.localSubscribed,
        serverSubscribed: snap.serverSubscribed,
        error: null,
      }));
    } catch {
      setState((s) => ({
        ...s,
        loading: false,
        busy: false,
        permission: getPermissionSnapshot(),
        active: false,
        error: null,
      }));
    }
  }, [enabled]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const enable = useCallback(async () => {
    setState((s) => ({ ...s, busy: true, error: null, message: null }));
    try {
      await enablePushNotifications();
      const snap = await readPushActivationState();
      const ok = Boolean(snap.active);
      setState((s) => ({
        ...s,
        loading: false,
        busy: false,
        permission: snap.permission,
        active: ok,
        localSubscribed: snap.localSubscribed,
        serverSubscribed: snap.serverSubscribed,
        message: ok ? 'Notifications activées' : null,
        error: ok ? null : 'L’abonnement n’a pas pu être confirmé par le serveur.',
      }));
      return ok;
    } catch (err) {
      let snap = null;
      try {
        snap = await readPushActivationState();
      } catch {
        snap = null;
      }
      setState((s) => ({
        ...s,
        loading: false,
        busy: false,
        active: false,
        permission: err?.code === 'denied'
          ? 'denied'
          : (snap?.permission || s.permission),
        localSubscribed: snap?.localSubscribed || false,
        serverSubscribed: snap?.serverSubscribed || false,
        error: err?.message || 'Activation impossible.',
        message: null,
      }));
      return false;
    }
  }, []);

  const disable = useCallback(async () => {
    setState((s) => ({ ...s, busy: true, error: null, message: null }));
    try {
      await disablePushNotifications();
      await refresh();
      setState((s) => ({
        ...s,
        busy: false,
        active: false,
        message: 'Notifications désactivées sur cet appareil',
        error: null,
      }));
      return true;
    } catch (err) {
      await refresh();
      setState((s) => ({
        ...s,
        busy: false,
        error: err?.message || 'Désactivation impossible.',
        message: null,
      }));
      return false;
    }
  }, [refresh]);

  const sendTest = useCallback(async () => {
    setState((s) => ({ ...s, busy: true, error: null, message: null }));
    try {
      const data = await requestTestPush();
      setState((s) => ({
        ...s,
        busy: false,
        message: data?.success
          ? 'Notification de test envoyée — vérifiez cet appareil.'
          : null,
        error: data?.success ? null : (data?.error || 'Échec envoi test.'),
      }));
      return Boolean(data?.success);
    } catch (err) {
      setState((s) => ({
        ...s,
        busy: false,
        error: err?.message || 'Échec envoi de la notification de test.',
        message: null,
      }));
      return false;
    }
  }, []);

  return {
    ...state,
    refresh,
    enable,
    disable,
    sendTest,
  };
}

import { createContext, useState, useEffect, useCallback } from 'react';
import {
  loginWithCredentials,
  restoreSession,
  logout as authLogout,
  clearLegacyAuthStorage,
  handleUnauthorized,
} from '../services/auth';
import { subscribeToAuthChanges } from '../services/supabase/auth';
import { isSupabaseConfigured } from '../lib/supabase';
import { logEnvDiagnostics } from '../config/env';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    clearLegacyAuthStorage();
    logEnvDiagnostics();

    if (!isSupabaseConfigured()) {
      console.error('[CITYMO] Supabase requis — configurez .env puis redémarrez le serveur.');
      setLoading(false);
      return;
    }

    let active = true;

    (async () => {
      try {
        const restored = await restoreSession();
        if (active) setUser(restored || null);
      } catch (err) {
        console.error('[CITYMO] restoreSession failed', err);
        if (active) setUser(null);
      } finally {
        if (active) setLoading(false);
      }
    })();

    const unsubscribe = subscribeToAuthChanges((nextUser) => {
      if (active) setUser(nextUser);
    });

    const onUnauthorized = () => {
      setUser(null);
    };
    window.addEventListener('citymo:unauthorized', onUnauthorized);

    return () => {
      active = false;
      unsubscribe();
      window.removeEventListener('citymo:unauthorized', onUnauthorized);
    };
  }, []);

  const login = useCallback(async (email, password) => {
    try {
      const result = await loginWithCredentials(email, password);
      if (result.success) {
        setUser(result.user);
      }
      return result;
    } catch (err) {
      console.error('[CITYMO] login exception', err);
      return { success: false, error: err.message || 'Erreur de connexion.' };
    }
  }, []);

  const logout = useCallback(async () => {
    await authLogout();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

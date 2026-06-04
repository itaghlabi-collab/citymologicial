import { createContext, useState, useEffect, useCallback } from 'react';
import {
  loginWithCredentials,
  logout as authLogout,
  clearLegacyAuthStorage,
  handleUnauthorized,
} from '../services/auth';
import { subscribeToAuthChanges } from '../services/supabase/auth';
import { isSupabaseConfigured } from '../lib/supabase';
import { logEnvDiagnostics, logCitymoEnv } from '../config/env';

export const AuthContext = createContext(null);

function finishLoading(setLoading) {
  setLoading(false);
  console.info('[CITYMO] auth loading false');
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    clearLegacyAuthStorage();
    logCitymoEnv();
    logEnvDiagnostics();

    if (!isSupabaseConfigured()) {
      console.error('[CITYMO] Supabase requis — configurez .env puis redémarrez le serveur.');
      finishLoading(setLoading);
      return;
    }

    let active = true;

    const unsubscribe = subscribeToAuthChanges((nextUser) => {
      if (!active) return;
      setUser(nextUser);
      finishLoading(setLoading);
    });

    const safetyTimer = setTimeout(() => {
      if (active) finishLoading(setLoading);
    }, 8000);

    const onUnauthorized = () => {
      setUser(null);
    };
    window.addEventListener('citymo:unauthorized', onUnauthorized);

    return () => {
      active = false;
      clearTimeout(safetyTimer);
      unsubscribe();
      window.removeEventListener('citymo:unauthorized', onUnauthorized);
    };
  }, []);

  const login = useCallback(async (email, password) => {
    try {
      const result = await loginWithCredentials(email, password);
      if (result.success) {
        setUser(result.user);
        finishLoading(setLoading);
      }
      return result;
    } catch (err) {
      console.error('[CITYMO] login exception', err);
      finishLoading(setLoading);
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

import { createContext, useState, useEffect, useCallback } from 'react';
import {
  loginWithCredentials,
  logout as authLogout,
  clearLegacyAuthStorage,
  handleUnauthorized,
} from '../services/auth';
import { subscribeToAuthChanges, getSupabaseSessionUser } from '../services/supabase/auth';
import { isSupabaseConfigured } from '../lib/supabase';
import { logAuth, logAuthError } from '../utils/authLog';

export const AuthContext = createContext(null);

function finishLoading(setLoading) {
  setLoading(false);
  logAuth('AuthContext loading → false');
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    clearLegacyAuthStorage();
    logAuth('AuthContext mount', { supabaseConfigured: isSupabaseConfigured() });

    if (!isSupabaseConfigured()) {
      logAuthError('AuthContext: Supabase not configured', {
        message: 'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing',
      });
      finishLoading(setLoading);
      return;
    }

    let active = true;

    const unsubscribe = subscribeToAuthChanges((nextUser) => {
      if (!active) return;
      logAuth('AuthContext setUser', {
        authenticated: Boolean(nextUser),
        userId: nextUser?.id ?? null,
        email: nextUser?.email ?? null,
        role: nextUser?.role ?? null,
      });
      setUser(nextUser);
      finishLoading(setLoading);
    });

    const safetyTimer = setTimeout(() => {
      if (active) {
        logAuth('AuthContext safety timeout (8s) — force loading false');
        finishLoading(setLoading);
      }
    }, 8000);

    const onUnauthorized = () => {
      logAuth('AuthContext citymo:unauthorized → clear user');
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
    logAuth('AuthContext login →', { email: email?.trim().toLowerCase() });
    try {
      const result = await loginWithCredentials(email, password);
      logAuth('AuthContext login result', {
        success: result.success,
        error: result.error ?? null,
        errorCode: result.errorCode ?? null,
        userId: result.user?.id ?? null,
      });
      if (result.success) {
        setUser(result.user);
        finishLoading(setLoading);
      }
      return result;
    } catch (err) {
      logAuthError('AuthContext login exception', err);
      finishLoading(setLoading);
      return {
        success: false,
        error: err?.message || 'Erreur de connexion.',
        errorCode: err?.code ?? null,
        errorStatus: err?.status ?? null,
      };
    }
  }, []);

  const logout = useCallback(async () => {
    logAuth('AuthContext logout →');
    await authLogout();
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const next = await getSupabaseSessionUser();
    setUser(next);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

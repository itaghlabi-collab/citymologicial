import { createContext, useState, useEffect, useCallback, useRef } from 'react';
import { loginWithCredentials, logout as authLogout, clearLegacyAuthStorage, handleUnauthorized } from '../services/auth';
import { subscribeToAuthChanges, getSupabaseSessionUser } from '../services/supabase/auth';
import { isSupabaseConfigured } from '../lib/supabase';
import { logAuth, logAuthError } from '../utils/authLog';
import { warmAccessibleRoutes, clearPermissionCache } from '../services/admin/permissions';
import { clearProfileAccessCache } from '../services/admin/accountAccess';

export const AuthContext = createContext(null);

const USER_KEYS = [
  'id', 'nom', 'email', 'role', 'role_id', 'initiales',
  'department_id', 'created_at', 'statut', 'must_change_password',
];

function sameUser(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return USER_KEYS.every((k) => a[k] === b[k]);
}

function finishLoading(setLoading) {
  setLoading(false);
  logAuth('AuthContext loading → false');
}

export function AuthProvider({ children }) {
  const [user, setUserState] = useState(null);
  const [loading, setLoading] = useState(true);
  const warmedUserIdRef = useRef('');

  // Même utilisateur, mêmes données : on garde l'objet existant (évite de relancer toute l'app).
  const setUser = useCallback((next) => {
    setUserState((prev) => (sameUser(prev, next) ? prev : next));
  }, []);

  const warmRoutesOnce = useCallback((nextUser) => {
    if (!nextUser?.id || warmedUserIdRef.current === nextUser.id) return;
    warmedUserIdRef.current = nextUser.id;
    warmAccessibleRoutes(nextUser).catch(() => {});
  }, []);

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
      if (nextUser?.id) {
        warmRoutesOnce(nextUser);
      } else {
        warmedUserIdRef.current = '';
        clearPermissionCache();
        clearProfileAccessCache();
      }
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
        warmRoutesOnce(result.user);
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
  }, [setUser, warmRoutesOnce]);

  const logout = useCallback(async () => {
    logAuth('AuthContext logout →');
    clearPermissionCache();
    clearProfileAccessCache();
    warmedUserIdRef.current = '';
    await authLogout();
    setUser(null);
  }, [setUser]);

  const refreshUser = useCallback(async () => {
    clearProfileAccessCache();
    const next = await getSupabaseSessionUser();
    setUser(next);
  }, [setUser]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

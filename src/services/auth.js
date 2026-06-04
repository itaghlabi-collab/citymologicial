/**
 * auth.js — CITYMO Auth (Supabase Auth uniquement)
 */
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';
import { ENV } from '../config/env';
import {
  mapSupabaseUser,
  ensureProfile,
  getSupabaseSessionUser,
} from './supabase/auth';
import {
  authErrorPayload,
  logAuth,
  logAuthError,
} from '../utils/authLog';

const LEGACY_KEYS = ['citymo_session', 'citymo_token', 'citymo_user'];

export function clearLegacyAuthStorage() {
  LEGACY_KEYS.forEach((k) => localStorage.removeItem(k));
}

function assertSupabaseConfigured() {
  if (!isSupabaseConfigured()) {
    throw new Error(
      'Supabase non configuré. Vérifiez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY.',
    );
  }
}

export async function loginWithCredentials(email, password) {
  assertSupabaseConfigured();
  clearLegacyAuthStorage();

  const supabase = getSupabase();
  const normalizedEmail = email.trim().toLowerCase();

  logAuth('signInWithPassword →', {
    email: normalizedEmail,
    urlHost: (() => {
      try {
        return new URL(ENV.SUPABASE_URL).host;
      } catch {
        return ENV.SUPABASE_URL || '—';
      }
    })(),
  });

  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  });

  if (error) {
    logAuthError('signInWithPassword failed', error);
    return { success: false, ...authErrorPayload(error) };
  }

  if (!data?.user || !data?.session) {
    logAuthError('signInWithPassword: session manquante', { message: 'no user/session in response' });
    return {
      success: false,
      error: 'Réponse Supabase invalide (session manquante).',
      errorCode: 'session_missing',
      errorStatus: null,
    };
  }

  logAuth('signInWithPassword OK', {
    userId: data.user.id,
    email: data.user.email,
    expiresAt: data.session.expires_at,
  });

  logAuth('ensureProfile (login) →', { userId: data.user.id });
  const profile = await ensureProfile(data.user);
  if (profile) {
    logAuth('profile loaded (login)', {
      userId: profile.id,
      email: profile.email,
      role: profile.role,
    });
  } else {
    logAuth('profile fallback (login)', { email: data.user.email });
  }

  const user = mapSupabaseUser(data.user, profile);
  return { success: true, user };
}

export async function restoreSession() {
  if (!isSupabaseConfigured()) {
    clearLegacyAuthStorage();
    return null;
  }

  clearLegacyAuthStorage();
  logAuth('restoreSession → getSupabaseSessionUser');
  return getSupabaseSessionUser();
}

export async function logout() {
  logAuth('logout →');
  clearLegacyAuthStorage();
  if (!isSupabaseConfigured()) return;

  const { error } = await getSupabase().auth.signOut();
  if (error) logAuthError('signOut failed', error);
  else logAuth('signOut OK');
}

/** JWT access_token (Supabase) pour Authorization header */
export async function getAuthToken() {
  if (!isSupabaseConfigured()) return null;

  const { data: { session }, error } = await getSupabase().auth.getSession();
  if (error) {
    logAuthError('getSession (token)', error);
    return null;
  }
  logAuth('getSession (token)', { hasSession: Boolean(session), userId: session?.user?.id });
  return session?.access_token || null;
}

export async function getCurrentSession() {
  if (!isSupabaseConfigured()) return null;
  const { data: { session }, error } = await getSupabase().auth.getSession();
  if (error) {
    logAuthError('getSession', error);
    return null;
  }
  return session;
}

/** Appelé quand l'API Express renvoie 401 */
export async function handleUnauthorized() {
  logAuth('handleUnauthorized → signOut');
  await logout();
  window.dispatchEvent(new CustomEvent('citymo:unauthorized'));
}

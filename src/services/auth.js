/**
 * auth.js — CITYMO Auth (Supabase Auth uniquement)
 */
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';
import { ENV, logEnvDiagnostics } from '../config/env';
import {
  mapSupabaseUser,
  ensureProfile,
  getSupabaseSessionUser,
} from './supabase/auth';

const LEGACY_KEYS = ['citymo_session', 'citymo_token', 'citymo_user'];

export function clearLegacyAuthStorage() {
  LEGACY_KEYS.forEach((k) => localStorage.removeItem(k));
}

function assertSupabaseConfigured() {
  if (!isSupabaseConfigured()) {
    logEnvDiagnostics();
    throw new Error(
      'Supabase non configuré. Vérifiez .env (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY) puis redémarrez npm run dev.',
    );
  }
}

function logSupabaseAuthError(context, error) {
  console.error(`[CITYMO] Supabase Auth — ${context}`, {
    message: error?.message,
    status: error?.status,
    code: error?.code,
    name: error?.name,
    details: error,
    supabaseUrl: ENV.SUPABASE_URL,
  });
}

export async function loginWithCredentials(email, password) {
  assertSupabaseConfigured();
  clearLegacyAuthStorage();

  const supabase = getSupabase();
  const normalizedEmail = email.trim().toLowerCase();

  console.info('[CITYMO] signInWithPassword →', {
    email: normalizedEmail,
    url: ENV.SUPABASE_URL,
  });

  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  });

  if (error) {
    logSupabaseAuthError('signInWithPassword failed', error);
    return {
      success: false,
      error: error.message || 'Email ou mot de passe incorrect.',
    };
  }

  if (!data?.user || !data?.session) {
    console.error('[CITYMO] signInWithPassword: session manquante', data);
    return { success: false, error: 'Réponse Supabase invalide (session manquante).' };
  }

  console.info('[CITYMO] signInWithPassword OK', {
    userId: data.user.id,
    email: data.user.email,
    expiresAt: data.session.expires_at,
  });

  const profile = await ensureProfile(data.user);
  const user = mapSupabaseUser(data.user, profile);
  return { success: true, user };
}

export async function restoreSession() {
  if (!isSupabaseConfigured()) {
    logEnvDiagnostics();
    clearLegacyAuthStorage();
    return null;
  }

  clearLegacyAuthStorage();
  return getSupabaseSessionUser();
}

export async function logout() {
  clearLegacyAuthStorage();
  if (!isSupabaseConfigured()) return;

  const { error } = await getSupabase().auth.signOut();
  if (error) logSupabaseAuthError('signOut failed', error);
}

/** JWT access_token (Supabase) pour Authorization header */
export async function getAuthToken() {
  if (!isSupabaseConfigured()) return null;

  const { data: { session }, error } = await getSupabase().auth.getSession();
  if (error) {
    logSupabaseAuthError('getSession failed', error);
    return null;
  }
  return session?.access_token || null;
}

export async function getCurrentSession() {
  if (!isSupabaseConfigured()) return null;
  const { data: { session }, error } = await getSupabase().auth.getSession();
  if (error) return null;
  return session;
}

/** Appelé quand l'API Express renvoie 401 */
export async function handleUnauthorized() {
  await logout();
  window.dispatchEvent(new CustomEvent('citymo:unauthorized'));
}

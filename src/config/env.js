/**
 * env.js — CITYMO Environment Configuration
 * Variables Supabase : uniquement VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY
 */
import { CITYMO_SUPABASE_URL, assertCitymoSupabaseUrl } from './supabaseProject';

function trimEnv(value) {
  if (value == null) return '';
  return String(value).trim();
}

/** Lecture stricte — pas d'alias (NEXT_PUBLIC_*, VITE_SUPABASE_KEY, etc.) */
function readSupabaseFromVite() {
  const url = trimEnv(import.meta.env.VITE_SUPABASE_URL);
  const key = trimEnv(import.meta.env.VITE_SUPABASE_ANON_KEY);
  return { url, key };
}

const MODE = import.meta.env.MODE || 'development';
const supabaseEnv = readSupabaseFromVite();

export const ENV = {
  API_URL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api',
  SUPABASE_URL: supabaseEnv.url,
  SUPABASE_ANON_KEY: supabaseEnv.key,
  STORAGE_URL: import.meta.env.VITE_STORAGE_URL || '',
  MODE,
  DEBUG: import.meta.env.VITE_DEBUG === 'true' || MODE === 'development',
};

export const IS_PROD = ENV.MODE === 'production';
export const HAS_BACKEND = ENV.API_URL !== 'http://localhost:3000/api' || IS_PROD;
export const HAS_SUPABASE = Boolean(ENV.SUPABASE_URL && ENV.SUPABASE_ANON_KEY);

/** Diagnostic sécurisé (login / debug Vercel) — jamais la clé complète */
export function getSupabaseEnvDiagnostics() {
  const url = trimEnv(import.meta.env.VITE_SUPABASE_URL);
  const key = trimEnv(import.meta.env.VITE_SUPABASE_ANON_KEY);
  let urlHost = '—';
  if (url) {
    try {
      urlHost = new URL(url).host;
    } catch {
      urlHost = '(URL invalide)';
    }
  }
  return {
    hasUrl: Boolean(url),
    keyLength: key.length,
    mode: ENV.MODE,
    prod: Boolean(import.meta.env.PROD),
    viteMode: import.meta.env.MODE ?? '(missing)',
    configured: Boolean(url && key),
    urlHost,
  };
}

/** Log console sécurisé — dev et production */
export function logCitymoEnv() {
  const d = getSupabaseEnvDiagnostics();
  console.log('[CITYMO ENV]', {
    mode: d.viteMode,
    hasUrl: d.hasUrl,
    keyLength: d.keyLength,
    prod: d.prod,
    configured: d.configured,
  });
}

/** URL API joignable depuis mobile (proxy Vite /api en dev réseau). */
export function resolveApiBaseUrl() {
  const configured = import.meta.env.VITE_API_URL;
  if (typeof window !== 'undefined' && window.location?.origin) {
    if (import.meta.env.DEV || !configured || /localhost|127\.0\.0\.1/.test(String(configured))) {
      return `${window.location.origin}/api`;
    }
  }
  return configured || '/api';
}

export function logEnvDiagnostics() {
  logCitymoEnv();

  const urlOk = assertCitymoSupabaseUrl(ENV.SUPABASE_URL);

  console.info('[CITYMO] Supabase configuration', {
    MODE: ENV.MODE,
    PROD: Boolean(import.meta.env.PROD),
    expectedUrl: CITYMO_SUPABASE_URL,
    loadedUrl: ENV.SUPABASE_URL || '(missing)',
    urlMatchesProject: urlOk,
    anonKey: ENV.SUPABASE_ANON_KEY ? `set (${ENV.SUPABASE_ANON_KEY.length} chars)` : '(missing)',
    HAS_SUPABASE,
  });

  if (ENV.SUPABASE_URL && !urlOk) {
    console.warn(
      '[CITYMO] VITE_SUPABASE_URL ne correspond pas au projet CITYMO attendu (npddbwsskaojcawaxygh).',
    );
  }
}

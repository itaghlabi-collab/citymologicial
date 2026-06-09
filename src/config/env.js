/**
 * env.js — CITYMO Environment Configuration
 * Variables Supabase : uniquement VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY
 */

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

/** URL API joignable depuis mobile (proxy Vite /api en dev) et Vercel (same-origin /api). */
export function resolveApiBaseUrl() {
  const configured = trimEnv(import.meta.env.VITE_API_URL);
  const isLocalConfigured = configured && /localhost|127\.0\.0\.1/.test(configured);

  if (typeof window !== 'undefined' && window.location?.origin) {
    if (import.meta.env.DEV || !configured || isLocalConfigured) {
      return `${window.location.origin}/api`;
    }
    if (/^https?:\/\//i.test(configured)) {
      return configured.replace(/\/+$/, '');
    }
    return `${window.location.origin}/api`;
  }
  return configured ? configured.replace(/\/+$/, '') : '/api';
}

/**
 * env.js — CITYMO Environment Configuration
 *
 * All environment variables centralized here.
 * Never hardcode URLs, keys, or secrets directly in components.
 *
 * To configure:
 *   1. Create a .env file at project root
 *   2. Set the VITE_* variables below
 *   3. Vite exposes VITE_* vars at build time
 *
 * Production (Vercel / Railway):
 *   Set these in the dashboard environment variables panel.
 */

/* Safe accessor — works in Vite builds, SSR, and sandbox environments */
function viteEnv(key, fallback) {
  try {
    /* eslint-disable no-undef */
    if (typeof __VITE_ENV__ !== 'undefined' && __VITE_ENV__[key] !== undefined) {
      return __VITE_ENV__[key];
    }
  } catch (_) { /* ignore */ }
  try {
    const meta = new Function('return import.meta')();
    if (meta && meta.env && meta.env[key] !== undefined) {
      return meta.env[key];
    }
  } catch (_) { /* ignore */ }
  return fallback;
}

function viteMode() {
  try {
    const meta = new Function('return import.meta')();
    if (meta && meta.env && meta.env.MODE) return meta.env.MODE;
  } catch (_) { /* ignore */ }
  return 'development';
}

const MODE = viteMode();

export const ENV = {
  /** Backend REST API base URL — set VITE_API_URL in .env */
  API_URL: viteEnv('VITE_API_URL', 'http://localhost:3000/api'),

  /** Supabase project URL — set VITE_SUPABASE_URL in .env */
  SUPABASE_URL: viteEnv('VITE_SUPABASE_URL', ''),

  /** Supabase anon/public key — set VITE_SUPABASE_ANON_KEY in .env */
  SUPABASE_ANON_KEY: viteEnv('VITE_SUPABASE_ANON_KEY', ''),

  /** Cloud storage base URL for uploaded files */
  STORAGE_URL: viteEnv('VITE_STORAGE_URL', ''),

  /** App environment: development | staging | production */
  MODE,

  /** Enable verbose API logging in dev */
  DEBUG: viteEnv('VITE_DEBUG', 'false') === 'true' || MODE === 'development',
};

/** True when running in production */
export const IS_PROD = ENV.MODE === 'production';

/** True when a real backend URL is configured */
export const HAS_BACKEND = ENV.API_URL !== 'http://localhost:3000/api' || IS_PROD;

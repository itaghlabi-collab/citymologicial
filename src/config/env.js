/**
 * env.js — CITYMO Environment Configuration
 */
import { CITYMO_SUPABASE_URL, assertCitymoSupabaseUrl } from './supabaseProject';

const MODE = import.meta.env.MODE || 'development';

export const ENV = {
  API_URL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api',
  SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL || '',
  SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
  STORAGE_URL: import.meta.env.VITE_STORAGE_URL || '',
  MODE,
  DEBUG: import.meta.env.VITE_DEBUG === 'true' || MODE === 'development',
};

export const IS_PROD = ENV.MODE === 'production';
export const HAS_BACKEND = ENV.API_URL !== 'http://localhost:3000/api' || IS_PROD;
export const HAS_SUPABASE = Boolean(ENV.SUPABASE_URL && ENV.SUPABASE_ANON_KEY);

export function logEnvDiagnostics() {
  if (!import.meta.env.DEV) return;

  const urlOk = assertCitymoSupabaseUrl(ENV.SUPABASE_URL);

  console.info('[CITYMO] Supabase configuration', {
    MODE: ENV.MODE,
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

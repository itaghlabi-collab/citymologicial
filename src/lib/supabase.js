/**
 * supabase.js — Client Supabase global unique (CITYMO).
 */
import { createClient } from '@supabase/supabase-js';
import { ENV } from '../config/env';
import { CITYMO_SUPABASE_URL, assertCitymoSupabaseUrl } from '../config/supabaseProject';

/** @type {import('@supabase/supabase-js').SupabaseClient | null} */
let client = null;

export const SUPABASE_AUTH_STORAGE_KEY = 'citymo-supabase-auth';

export function isSupabaseConfigured() {
  return Boolean(ENV.SUPABASE_URL && ENV.SUPABASE_ANON_KEY);
}

export function getSupabase() {
  if (!isSupabaseConfigured()) {
    throw new Error(
      'Supabase non configuré : VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY requis dans .env',
    );
  }

  if (!assertCitymoSupabaseUrl(ENV.SUPABASE_URL)) {
    console.warn(
      `[CITYMO] URL Supabase inattendue : ${ENV.SUPABASE_URL} (attendu ${CITYMO_SUPABASE_URL})`,
    );
  }

  if (!client) {
    client = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: SUPABASE_AUTH_STORAGE_KEY,
      },
      global: {
        headers: { 'x-client-info': 'citymo-erp-web' },
      },
    });

    if (import.meta.env.DEV) {
      console.info('[CITYMO] Supabase client ready →', ENV.SUPABASE_URL);
    }
  }

  return client;
}

/** @deprecated Préférer getSupabase() — lève une erreur si non configuré */
export function getSupabaseOrNull() {
  if (!isSupabaseConfigured()) return null;
  return getSupabase();
}

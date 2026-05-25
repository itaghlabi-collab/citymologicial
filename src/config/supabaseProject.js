/**
 * Référence projet Supabase CITYMO (validation runtime).
 */
export const CITYMO_SUPABASE_PROJECT_REF = 'npddbwsskaojcawaxygh';

export const CITYMO_SUPABASE_URL = `https://${CITYMO_SUPABASE_PROJECT_REF}.supabase.co`;

export function assertCitymoSupabaseUrl(url) {
  if (!url) return false;
  return url.replace(/\/$/, '') === CITYMO_SUPABASE_URL;
}

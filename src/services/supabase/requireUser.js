/**
 * requireUser.js — Session Supabase requise pour les lectures/écritures RLS.
 */
import { getSupabase } from '../../lib/supabase';

/** Session locale d’abord (évite un aller-retour auth.getUser qui peut rester pendu). */
export async function getSessionUser() {
  const client = getSupabase();
  const { data: { session } } = await client.auth.getSession();
  if (session?.user) return session.user;

  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) {
    const err = new Error('Session requise.');
    err.code = 'AUTH';
    throw err;
  }
  return user;
}

export async function requireSupabaseUserId() {
  return (await getSessionUser()).id;
}

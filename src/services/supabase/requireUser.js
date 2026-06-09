/**
 * requireUser.js — Session Supabase requise pour les lectures/écritures RLS.
 */
import { getSupabase } from '../../lib/supabase';

export async function requireSupabaseUserId() {
  const client = getSupabase();
  const { data: { session } } = await client.auth.getSession();
  if (session?.user?.id) return session.user.id;

  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) {
    const err = new Error('Session requise.');
    err.code = 'AUTH';
    throw err;
  }
  return user.id;
}

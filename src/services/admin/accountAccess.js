/**
 * accountAccess.js — Vérification statut compte après auth Supabase.
 */
import { getSupabase } from '../../lib/supabase';
import { DISABLED_ACCOUNT_MSG, isProfileActive } from './users';

/** Login, événement SIGNED_IN et restauration demandent le même profil au même moment : une seule requête. */
const PROFILE_ACCESS_SHARE_MS = 5_000;
const profileAccessCache = new Map();

async function queryProfileAccess(userId) {
  const { data, error } = await getSupabase()
    .from('profiles')
    .select(`
      id, nom, email, role, role_id, initiales, department_id, created_at,
      statut, must_change_password,
      erp_roles ( code, nom, est_admin )
    `)
    .eq('id', userId)
    .maybeSingle();
  if (error) return null;
  return data;
}

export function clearProfileAccessCache() {
  profileAccessCache.clear();
}

export async function fetchProfileAccess(userId) {
  if (!userId) return null;
  const cached = profileAccessCache.get(userId);
  if (cached && Date.now() - cached.at < PROFILE_ACCESS_SHARE_MS) return cached.promise;

  const promise = queryProfileAccess(userId);
  profileAccessCache.set(userId, { at: Date.now(), promise });
  const data = await promise;
  if (!data) profileAccessCache.delete(userId);
  return data;
}

/** Retourne { ok, profile, error } — déconnecte si compte inactif */
export async function validateAccountAccess(authUser) {
  const profile = await fetchProfileAccess(authUser.id);
  if (profile && !isProfileActive(profile)) {
    await getSupabase().auth.signOut();
    return { ok: false, profile: null, error: DISABLED_ACCOUNT_MSG };
  }
  return { ok: true, profile, error: null };
}

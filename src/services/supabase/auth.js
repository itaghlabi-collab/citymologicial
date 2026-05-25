/**
 * auth.js — Helpers session Supabase (profil + abonnements).
 */
import { getSupabase } from '../../lib/supabase';

const PROFILE_TIMEOUT_MS = 5000;

export function mapSupabaseUser(user, profile = null) {
  const meta = user.user_metadata || {};
  const nom =
    profile?.nom ||
    meta.nom ||
    meta.full_name ||
    user.email?.split('@')[0] ||
    'Utilisateur';

  const parts = nom.trim().split(/\s+/).filter(Boolean);
  const initiales =
    profile?.initiales ||
    meta.initiales ||
    parts.map((p) => p[0]).join('').slice(0, 2).toUpperCase();

  return {
    id: user.id,
    nom,
    email: user.email || profile?.email || '',
    role: profile?.role || meta.role || 'commercial',
    initiales,
    department_id: profile?.department_id ?? null,
  };
}

export async function fetchProfile(userId) {
  if (!userId) return null;

  const { data, error } = await getSupabase()
    .from('profiles')
    .select('id, nom, email, role, initiales, department_id')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.warn('[CITYMO] profiles fetch:', error.message, error.code);
    return null;
  }
  return data;
}

async function ensureProfileInternal(authUser) {
  const existing = await fetchProfile(authUser.id);
  if (existing) return existing;

  const meta = authUser.user_metadata || {};
  const nom = meta.nom || authUser.email?.split('@')[0] || 'Utilisateur';
  const parts = nom.trim().split(/\s+/).filter(Boolean);

  const { data, error } = await getSupabase()
    .from('profiles')
    .upsert({
      id: authUser.id,
      nom,
      email: authUser.email,
      role: meta.role || 'Super Admin',
      initiales: meta.initiales || parts.map((p) => p[0]).join('').slice(0, 2).toUpperCase(),
    })
    .select('id, nom, email, role, initiales, department_id')
    .single();

  if (error) {
    console.warn('[CITYMO] profiles upsert:', error.message, error.code);
    return null;
  }
  return data;
}

/** Crée le profil si absent — timeout pour ne jamais bloquer l'UI. */
export async function ensureProfile(authUser, timeoutMs = PROFILE_TIMEOUT_MS) {
  try {
    const profile = await Promise.race([
      ensureProfileInternal(authUser),
      new Promise((resolve) => {
        setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
    return profile;
  } catch (err) {
    console.warn('[CITYMO] ensureProfile error', err);
    return null;
  }
}

/** Charge le profil en arrière-plan, met à jour l'utilisateur si succès. */
export function loadProfileInBackground(authUser, onUpdate) {
  setTimeout(async () => {
    try {
      const profile = await ensureProfile(authUser);
      if (profile) {
        console.info('[CITYMO] profile loaded', profile.email || authUser.email);
        onUpdate(mapSupabaseUser(authUser, profile));
      } else {
        console.info('[CITYMO] fallback profile', authUser.email);
      }
    } catch (err) {
      console.warn('[CITYMO] fallback profile', authUser.email, err);
    }
  }, 0);
}

export async function getSupabaseSessionUser() {
  const { data: { session }, error } = await getSupabase().auth.getSession();

  if (error) {
    console.error('[CITYMO] getSession', error);
    return null;
  }
  if (!session?.user) return null;

  const profile = await ensureProfile(session.user);
  if (profile) {
    console.info('[CITYMO] profile loaded', profile.email);
  } else {
    console.info('[CITYMO] fallback profile', session.user.email);
  }
  return mapSupabaseUser(session.user, profile);
}

export function subscribeToAuthChanges(onUser) {
  const { data: { subscription } } = getSupabase().auth.onAuthStateChange(
    (event, session) => {
      if (import.meta.env.DEV) {
        console.info('[CITYMO] onAuthStateChange', event, session?.user?.email || 'no user');
      }

      if (!session?.user) {
        if (event === 'SIGNED_OUT' || event === 'INITIAL_SESSION') {
          onUser(null);
        }
        return;
      }

      const fallbackUser = mapSupabaseUser(session.user, null);
      console.info('[CITYMO] fallback profile', session.user.email);
      onUser(fallbackUser);

      loadProfileInBackground(session.user, onUser);
    },
  );

  return () => subscription.unsubscribe();
}

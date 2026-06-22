/**
 * auth.js — Helpers session Supabase (profil + abonnements).
 */
import { getSupabase } from '../../lib/supabase';
import { logAuth, logAuthError } from '../../utils/authLog';
import { validateAccountAccess } from '../admin/accountAccess';

const PROFILE_TIMEOUT_MS = 5000;

async function recordLastSignIn(userId) {
  if (!userId) return;
  try {
    await getSupabase()
      .from('profiles')
      .update({ last_sign_in_at: new Date().toISOString() })
      .eq('id', userId);
  } catch {
    /* colonne absente si migration Administration non appliquée */
  }
}

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
    role: profile?.erp_roles?.code || profile?.role || meta.role || 'commercial',
    role_id: profile?.role_id ?? null,
    initiales,
    department_id: profile?.department_id ?? null,
    created_at: profile?.created_at ?? null,
    statut: profile?.statut || 'actif',
    must_change_password: Boolean(profile?.must_change_password),
  };
}

export async function fetchProfile(userId) {
  if (!userId) return null;

  logAuth('fetchProfile →', { userId });

  const { data, error } = await getSupabase()
    .from('profiles')
    .select(`
      id, nom, email, role, role_id, initiales, department_id, created_at,
      statut, must_change_password,
      erp_roles ( code, nom )
    `)
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    logAuthError('fetchProfile failed', error, { userId, pgCode: error.code });
    return null;
  }

  logAuth('fetchProfile OK', {
    userId,
    found: Boolean(data),
    role: data?.role,
  });
  return data;
}

async function ensureProfileInternal(authUser) {
  const existing = await fetchProfile(authUser.id);
  if (existing) return existing;

  logAuth('ensureProfile upsert →', { userId: authUser.id, email: authUser.email });

  const meta = authUser.user_metadata || {};
  const nom = meta.nom || authUser.email?.split('@')[0] || 'Utilisateur';
  const parts = nom.trim().split(/\s+/).filter(Boolean);

  const { data, error } = await getSupabase()
    .from('profiles')
    .upsert({
      id: authUser.id,
      nom,
      email: authUser.email,
      role: meta.role || 'employe',
      initiales: meta.initiales || parts.map((p) => p[0]).join('').slice(0, 2).toUpperCase(),
    })
    .select('id, nom, email, role, initiales, department_id')
    .single();

  if (error) {
    logAuthError('ensureProfile upsert failed', error, {
      userId: authUser.id,
      pgCode: error.code,
      hint: error.hint,
    });
    return null;
  }

  logAuth('ensureProfile upsert OK', { userId: data.id, role: data.role });
  return data;
}

/** Crée le profil si absent — timeout pour ne jamais bloquer l'UI. */
export async function ensureProfile(authUser, timeoutMs = PROFILE_TIMEOUT_MS) {
  try {
    const profile = await Promise.race([
      ensureProfileInternal(authUser),
      new Promise((resolve) => {
        setTimeout(() => {
          logAuth('ensureProfile timeout', { userId: authUser.id, timeoutMs });
          resolve(null);
        }, timeoutMs);
      }),
    ]);
    return profile;
  } catch (err) {
    logAuthError('ensureProfile exception', err, { userId: authUser?.id });
    return null;
  }
}

/** Charge le profil en arrière-plan, met à jour l'utilisateur si succès. */
export function loadProfileInBackground(authUser, onUpdate) {
  setTimeout(async () => {
    try {
      logAuth('loadProfileInBackground →', { userId: authUser.id });
      const access = await validateAccountAccess(authUser);
      if (!access.ok) {
        await getSupabase().auth.signOut();
        onUpdate(null);
        return;
      }
      const profile = access.profile || await ensureProfile(authUser);
      if (profile) {
        logAuth('profile loaded (background)', {
          email: profile.email || authUser.email,
          role: profile.role,
        });
        onUpdate(mapSupabaseUser(authUser, profile));
      } else {
        logAuth('profile fallback (background)', { email: authUser.email });
      }
    } catch (err) {
      logAuthError('loadProfileInBackground failed', err, { email: authUser.email });
    }
  }, 0);
}

export async function getSupabaseSessionUser() {
  logAuth('getSession →');

  const { data: { session }, error } = await getSupabase().auth.getSession();

  if (error) {
    logAuthError('getSession failed', error);
    return null;
  }

  logAuth('getSession OK', {
    hasSession: Boolean(session),
    userId: session?.user?.id ?? null,
    email: session?.user?.email ?? null,
    expiresAt: session?.expires_at ?? null,
  });

  if (!session?.user) {
    logAuth('getSession: no active session');
    return null;
  }

  const access = await validateAccountAccess(session.user);
  if (!access.ok) {
    logAuth('getSession: account disabled', { userId: session.user.id });
    await getSupabase().auth.signOut();
    return null;
  }

  const profile = access.profile || await ensureProfile(session.user);
  if (profile) {
    logAuth('profile loaded (session restore)', {
      email: profile.email,
      role: profile.role,
    });
  } else {
    logAuth('profile fallback (session restore)', { email: session.user.email });
  }

  return mapSupabaseUser(session.user, profile);
}

export function subscribeToAuthChanges(onUser) {
  logAuth('subscribeToAuthChanges → onAuthStateChange');

  const { data: { subscription } } = getSupabase().auth.onAuthStateChange(
    (event, session) => {
      logAuth('onAuthStateChange', {
        event,
        hasSession: Boolean(session),
        userId: session?.user?.id ?? null,
        email: session?.user?.email ?? null,
      });

      if (!session?.user) {
        if (event === 'SIGNED_OUT' || event === 'INITIAL_SESSION') {
          logAuth('onAuthStateChange → user null', { event });
          onUser(null);
        }
        return;
      }

      (async () => {
        const access = await validateAccountAccess(session.user);
        if (!access.ok) {
          await getSupabase().auth.signOut();
          onUser(null);
          return;
        }

        const fallbackUser = mapSupabaseUser(session.user, access.profile);
        logAuth('onAuthStateChange → user (fallback, profile loading)', {
          event,
          userId: fallbackUser.id,
          email: fallbackUser.email,
        });
        onUser(fallbackUser);

        if (event === 'SIGNED_IN') {
          recordLastSignIn(session.user.id);
        }

        loadProfileInBackground(session.user, onUser);
      })();
    },
  );

  return () => {
    logAuth('subscribeToAuthChanges unsubscribe');
    subscription.unsubscribe();
  };
}

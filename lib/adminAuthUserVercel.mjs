/**
 * Sync auth.users email + optional password (service_role, Vercel only).
 */
import { getSupabaseAdmin } from './supabaseAdminVercel.mjs';

export async function syncAuthUserEmail(admin, userId, email) {
  const target = String(email || '').trim().toLowerCase();
  if (!target) {
    throw new Error('Email requis pour synchroniser le compte de connexion.');
  }

  const { data: authData, error: getErr } = await admin.auth.admin.getUserById(userId);
  if (getErr) throw new Error(getErr.message);
  if (!authData?.user) throw new Error('Compte Auth introuvable pour cet utilisateur.');

  const current = (authData.user.email || '').toLowerCase();
  if (current === target) return { synced: false, email: target };

  const { error: updErr } = await admin.auth.admin.updateUserById(userId, {
    email: target,
    email_confirm: true,
  });
  if (updErr) throw new Error(updErr.message);

  return { synced: true, email: target, previous: current };
}

export async function setAuthUserPassword(admin, userId, password) {
  const pwd = String(password || '');
  if (pwd.length < 6) {
    throw new Error('Mot de passe requis (6 caractères minimum).');
  }
  const { error } = await admin.auth.admin.updateUserById(userId, { password: pwd });
  if (error) throw new Error(error.message);
}

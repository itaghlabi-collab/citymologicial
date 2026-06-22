/**
 * permissions.js — Vérification des droits ERP (héritage du rôle utilisateur).
 * N’altère pas les contrôles existants (isSuperAdmin, cashAccess, etc.).
 */
import { getSupabase } from '../../lib/supabase';
import { isSuperAdmin } from '../rh/isSuperAdmin';

let cache = { userId: null, at: 0, perms: null, estAdmin: false };

const CACHE_MS = 60_000;

async function loadUserPermissions(userId) {
  if (!userId) return { estAdmin: false, perms: [] };

  const now = Date.now();
  if (cache.userId === userId && cache.at + CACHE_MS > now) {
    return { estAdmin: cache.estAdmin, perms: cache.perms };
  }

  const sb = getSupabase();
  const { data: profile } = await sb
    .from('profiles')
    .select('role_id, role, erp_roles ( code, est_admin, statut )')
    .eq('id', userId)
    .maybeSingle();

  if (!profile?.role_id) {
    cache = { userId, at: now, perms: [], estAdmin: false };
    return cache;
  }

  const role = profile.erp_roles;
  if (role?.est_admin) {
    cache = { userId, at: now, perms: null, estAdmin: true };
    return cache;
  }

  const { data: rows } = await sb
    .from('role_permissions')
    .select('module_code, action_code, granted')
    .eq('role_id', profile.role_id)
    .eq('granted', true);

  cache = { userId, at: now, perms: rows || [], estAdmin: false };
  return cache;
}

export function clearPermissionCache() {
  cache = { userId: null, at: 0, perms: null, estAdmin: false };
}

/** module_code + action_code : ex. can(user, 'rh', 'voir') */
export async function can(user, moduleCode, actionCode) {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;

  const { estAdmin, perms } = await loadUserPermissions(user.id);
  if (estAdmin) return true;
  if (!perms) return false;

  return perms.some(
    (p) => p.module_code === moduleCode && p.action_code === actionCode,
  );
}

export async function getUserPermissionsMatrix(user) {
  if (!user) return [];
  if (isSuperAdmin(user)) return [{ module_code: '*', action_code: '*', granted: true }];

  const { estAdmin, perms } = await loadUserPermissions(user.id);
  if (estAdmin) return [{ module_code: '*', action_code: '*', granted: true }];
  return perms || [];
}

export async function getRolePermissionsForUser(userId) {
  const sb = getSupabase();
  const { data: profile } = await sb
    .from('profiles')
    .select('role_id, erp_roles ( nom, est_admin )')
    .eq('id', userId)
    .maybeSingle();

  if (!profile?.role_id) return { role: null, permissions: [] };

  const { data: rows } = await sb
    .from('role_permissions')
    .select('module_code, action_code, granted')
    .eq('role_id', profile.role_id);

  return {
    role: profile.erp_roles,
    permissions: (rows || []).filter((r) => r.granted),
  };
}

/**
 * permissions.js — Droits ERP par sous-rubrique + exceptions utilisateur.
 */
import { getSupabase } from '../../lib/supabase';
import { isSuperAdmin } from '../rh/isSuperAdmin';
import { canAccessExecutiveCalendar } from '../auth/executiveCalendarAccess';
import { ERP_ACTIONS, allSubmoduleCodes, ERP_RUBRIQUES } from '../../config/menuRegistry';

let cache = {
  userId: null,
  at: 0,
  estAdmin: false,
  legacy: false,
  rolePerms: {},
  exceptions: {},
};

const CACHE_MS = 60_000;

function permKey(submoduleCode, actionCode) {
  return `${submoduleCode}:${actionCode}`;
}

async function loadUserAccess(userId) {
  if (!userId) {
    return { estAdmin: false, legacy: true, rolePerms: {}, exceptions: {} };
  }

  const now = Date.now();
  if (cache.userId === userId && cache.at + CACHE_MS > now) {
    return cache;
  }

  const sb = getSupabase();
  const { data: profile } = await sb
    .from('profiles')
    .select('role_id, role, erp_roles ( code, est_admin, statut )')
    .eq('id', userId)
    .maybeSingle();

  if (!profile?.role_id) {
    cache = { userId, at: now, estAdmin: false, legacy: true, rolePerms: {}, exceptions: {} };
    return cache;
  }

  const role = profile.erp_roles;
  if (role?.est_admin) {
    cache = { userId, at: now, estAdmin: true, legacy: false, rolePerms: {}, exceptions: {} };
    return cache;
  }

  const [{ data: rows }, { data: exc }] = await Promise.all([
    sb.from('role_permissions')
      .select('submodule_code, module_code, action_code, granted')
      .eq('role_id', profile.role_id)
      .eq('granted', true),
    sb.from('user_permission_exceptions')
      .select('submodule_code, action_code, granted')
      .eq('user_id', userId),
  ]);

  const rolePerms = {};
  (rows || []).forEach((r) => {
    const code = r.submodule_code || r.module_code;
    if (code) rolePerms[permKey(code, r.action_code)] = true;
  });

  const exceptions = {};
  (exc || []).forEach((r) => {
    exceptions[permKey(r.submodule_code, r.action_code)] = r.granted;
  });

  cache = { userId, at: now, estAdmin: false, legacy: false, rolePerms, exceptions };
  return cache;
}

export function clearPermissionCache() {
  cache = { userId: null, at: 0, estAdmin: false, legacy: true, rolePerms: {}, exceptions: {} };
}

function hasAccess(access, submoduleCode, actionCode) {
  const key = permKey(submoduleCode, actionCode);
  if (key in access.exceptions) return access.exceptions[key];
  return Boolean(access.rolePerms[key]);
}

/** Accès lecture à une route (sous-rubrique) */
export async function canAccessRoute(user, routeId) {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;

  if (routeId === 'agenda-direction') {
    return canAccessExecutiveCalendar(user);
  }

  const access = await loadUserAccess(user.id);
  if (access.estAdmin) return true;
  if (access.legacy) return true;

  return hasAccess(access, routeId, 'voir');
}

export async function can(user, submoduleCode, actionCode) {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;

  const access = await loadUserAccess(user.id);
  if (access.estAdmin) return true;
  if (access.legacy) return true;

  return hasAccess(access, submoduleCode, actionCode);
}

export async function getAccessibleRouteIds(user) {
  if (!user) return [];
  if (isSuperAdmin(user)) return null;

  const access = await loadUserAccess(user.id);
  if (access.estAdmin) return null;
  if (access.legacy) return null;

  const codes = allSubmoduleCodes();
  const allowed = codes.filter((code) => hasAccess(access, code, 'voir'));

  if (canAccessExecutiveCalendar(user) && !allowed.includes('agenda-direction')) {
    allowed.push('agenda-direction');
  }

  return allowed;
}

export async function getRolePermissionsForUser(userId) {
  const sb = getSupabase();
  const { data: profile } = await sb
    .from('profiles')
    .select('role_id, erp_roles ( nom, est_admin, department_id )')
    .eq('id', userId)
    .maybeSingle();

  if (!profile?.role_id) return { role: null, permissions: [], exceptions: [] };

  const [{ data: rows }, { data: exc }] = await Promise.all([
    sb.from('role_permissions')
      .select('module_code, submodule_code, action_code, granted')
      .eq('role_id', profile.role_id)
      .eq('granted', true),
    sb.from('user_permission_exceptions')
      .select('submodule_code, action_code, granted')
      .eq('user_id', userId),
  ]);

  return {
    role: profile.erp_roles,
    permissions: rows || [],
    exceptions: exc || [],
  };
}

export async function listUserExceptions(userId) {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('user_permission_exceptions')
    .select('*')
    .eq('user_id', userId);
  if (error) throw error;
  return data || [];
}

export async function saveUserExceptions(userId, exceptionMap) {
  const sb = getSupabase();
  const { error: delErr } = await sb
    .from('user_permission_exceptions')
    .delete()
    .eq('user_id', userId);
  if (delErr) throw delErr;

  const rows = [];
  Object.entries(exceptionMap || {}).forEach(([submoduleCode, actions]) => {
    ERP_ACTIONS.forEach((act) => {
      if (actions?.[act.code] !== undefined && actions[act.code] !== null) {
        rows.push({
          user_id: userId,
          submodule_code: submoduleCode,
          action_code: act.code,
          granted: Boolean(actions[act.code]),
        });
      }
    });
  });

  if (rows.length) {
    const { error } = await sb.from('user_permission_exceptions').insert(rows);
    if (error) throw error;
  }

  clearPermissionCache();
}

export async function saveUserRubriqueAccess(userId, rubriqueCodes) {
  const sb = getSupabase();
  const { error: delErr } = await sb
    .from('user_permission_exceptions')
    .delete()
    .eq('user_id', userId);
  if (delErr) throw delErr;

  const codes = Array.isArray(rubriqueCodes) ? rubriqueCodes : [];
  const rows = [];
  ERP_RUBRIQUES.forEach((rub) => {
    if (!codes.includes(rub.code)) return;
    rub.submodules.forEach((sub) => {
      if (sub.executiveOnly) return;
      ['voir', 'creer', 'modifier', 'exporter'].forEach((action) => {
        rows.push({
          user_id: userId,
          submodule_code: sub.code,
          action_code: action,
          granted: true,
        });
      });
    });
  });

  if (rows.length) {
    const { error } = await sb.from('user_permission_exceptions').insert(rows);
    if (error) throw error;
  }

  clearPermissionCache();
}

/** Rubriques cochées dérivées des permissions effectives utilisateur */
export async function loadUserRubriqueCodes(userId) {
  const data = await getRolePermissionsForUser(userId);
  if (data?.role?.est_admin) {
    return ERP_RUBRIQUES.map((r) => r.code);
  }

  const effective = {};
  (data?.permissions || []).forEach((p) => {
    const code = p.submodule_code || p.module_code;
    if (code && p.action_code === 'voir' && p.granted) {
      effective[code] = true;
    }
  });
  (data?.exceptions || []).forEach((p) => {
    if (p.action_code === 'voir') {
      effective[p.submodule_code] = p.granted;
    }
  });

  return ERP_RUBRIQUES.filter((rub) =>
    rub.submodules.some((sub) => effective[sub.code]),
  ).map((r) => r.code);
}

export async function loadRoleSubmodulePermissions(roleId) {
  const sb = getSupabase();
  const { data } = await sb
    .from('role_permissions')
    .select('module_code, submodule_code, action_code, granted')
    .eq('role_id', roleId);
  return data || [];
}

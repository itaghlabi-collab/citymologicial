/**
 * roles.js — CRUD rôles ERP + permissions par sous-rubrique (Supabase).
 */
import { getSupabase } from '../../lib/supabase';
import { DEPT_DISPLAY } from '../../config/menuRegistry';
import {
  permissionsToSubmoduleMap,
  submoduleMapToPermissionRows,
  STATUT_ROLE_DB,
  STATUT_ROLE_UI,
  fullSubmodulePermissions,
  emptySubmodulePermissions,
} from './constants';

const ROLES_TABLE = 'erp_roles';
const PERMS_TABLE = 'role_permissions';

function mapRole(row, permissions) {
  const subPerms = row.est_admin
    ? fullSubmodulePermissions()
    : permissionsToSubmoduleMap(permissions);

  return {
    id: row.id,
    code: row.code,
    nom: row.nom,
    description: row.description || '',
    statut: STATUT_ROLE_DB[row.statut] || 'Actif',
    est_admin: Boolean(row.est_admin),
    department_id: row.department_id ?? null,
    departement: row.department_id ? (DEPT_DISPLAY[row.department_id] || '—') : '—',
    date_creation: row.created_at?.slice(0, 10) || '',
    submodulePermissions: subPerms,
    permissions: subPerms,
    _permissionsRaw: permissions || [],
  };
}

export async function listRoles() {
  const sb = getSupabase();
  const { data: roles, error } = await sb
    .from(ROLES_TABLE)
    .select('*')
    .order('nom', { ascending: true });

  if (error) throw error;
  if (!roles?.length) return [];

  const ids = roles.map((r) => r.id);
  const { data: perms, error: pErr } = await sb
    .from(PERMS_TABLE)
    .select('role_id, module_code, submodule_code, action_code, granted')
    .in('role_id', ids);

  if (pErr) throw pErr;

  const byRole = {};
  (perms || []).forEach((p) => {
    if (!byRole[p.role_id]) byRole[p.role_id] = [];
    byRole[p.role_id].push(p);
  });

  return roles.map((r) => mapRole(r, byRole[r.id]));
}

export async function createRole({
  nom, description, statut, est_admin, department_id,
  submodulePermissions, permissions,
}) {
  const sb = getSupabase();
  const code = nom
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40) || `role_${Date.now()}`;

  const { data: role, error } = await sb
    .from(ROLES_TABLE)
    .insert({
      code,
      nom: nom.trim(),
      description: description?.trim() || null,
      statut: STATUT_ROLE_UI[statut] || 'actif',
      est_admin: Boolean(est_admin),
      department_id: department_id ? Number(department_id) : null,
    })
    .select('*')
    .single();

  if (error) throw error;

  const map = est_admin
    ? fullSubmodulePermissions()
    : (submodulePermissions || permissions || emptySubmodulePermissions());

  await saveRolePermissions(role.id, map, Boolean(est_admin));

  return mapRole(role, submoduleMapToPermissionRows(role.id, map));
}

export async function updateRole(roleId, {
  nom, description, statut, est_admin, department_id,
  submodulePermissions, permissions,
}) {
  const sb = getSupabase();
  const { data: role, error } = await sb
    .from(ROLES_TABLE)
    .update({
      nom: nom?.trim(),
      description: description?.trim() || null,
      statut: STATUT_ROLE_UI[statut] || 'actif',
      est_admin: Boolean(est_admin),
      department_id: department_id ? Number(department_id) : null,
    })
    .eq('id', roleId)
    .select('*')
    .single();

  if (error) throw error;

  const map = est_admin
    ? fullSubmodulePermissions()
    : (submodulePermissions || permissions || emptySubmodulePermissions());

  await saveRolePermissions(roleId, map, Boolean(est_admin));

  return mapRole(role, submoduleMapToPermissionRows(roleId, map));
}

async function saveRolePermissions(roleId, map, allGranted) {
  const sb = getSupabase();
  const rows = submoduleMapToPermissionRows(roleId, map).map((r) => ({
    ...r,
    granted: allGranted ? true : r.granted,
  }));

  const { error: delErr } = await sb.from(PERMS_TABLE).delete().eq('role_id', roleId);
  if (delErr) throw delErr;

  if (rows.length) {
    const { error } = await sb.from(PERMS_TABLE).insert(rows);
    if (error) throw error;
  }
}

export async function toggleRoleStatut(roleId, currentStatut) {
  const next = currentStatut === 'Actif' ? 'inactif' : 'actif';
  const sb = getSupabase();
  const { error } = await sb.from(ROLES_TABLE).update({ statut: next }).eq('id', roleId);
  if (error) throw error;
  return STATUT_ROLE_DB[next];
}

export async function deleteRole(roleId) {
  const sb = getSupabase();
  const { count, error: cErr } = await sb
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role_id', roleId);

  if (cErr) throw cErr;
  if (count > 0) {
    throw new Error(`Ce rôle est assigné à ${count} utilisateur(s). Réassignez-les avant suppression.`);
  }

  const { error } = await sb.from(ROLES_TABLE).delete().eq('id', roleId);
  if (error) throw error;
}

export async function duplicateRole(role) {
  return createRole({
    nom: `${role.nom} (copie)`,
    description: role.description,
    statut: role.statut,
    est_admin: role.est_admin,
    department_id: role.department_id,
    submodulePermissions: role.submodulePermissions || role.permissions,
  });
}

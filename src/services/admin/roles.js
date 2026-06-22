/**
 * roles.js — CRUD rôles ERP + matrice permissions (Supabase).
 */
import { getSupabase } from '../../lib/supabase';
import {
  permissionsToMatrix,
  matrixToPermissionRows,
  STATUT_ROLE_DB,
  STATUT_ROLE_UI,
  fullPermissionMatrix,
  emptyPermissionMatrix,
} from './constants';

const ROLES_TABLE = 'erp_roles';
const PERMS_TABLE = 'role_permissions';

function mapRole(row, permissions) {
  return {
    id: row.id,
    code: row.code,
    nom: row.nom,
    description: row.description || '',
    statut: STATUT_ROLE_DB[row.statut] || 'Actif',
    est_admin: Boolean(row.est_admin),
    date_creation: row.created_at?.slice(0, 10) || '',
    permissions: row.est_admin ? fullPermissionMatrix() : permissionsToMatrix(permissions),
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
    .select('role_id, module_code, action_code, granted')
    .in('role_id', ids);

  if (pErr) throw pErr;

  const byRole = {};
  (perms || []).forEach((p) => {
    if (!byRole[p.role_id]) byRole[p.role_id] = [];
    byRole[p.role_id].push(p);
  });

  return roles.map((r) => mapRole(r, byRole[r.id]));
}

export async function getRoleById(roleId) {
  const roles = await listRoles();
  return roles.find((r) => r.id === roleId) || null;
}

export async function createRole({ nom, description, statut, est_admin, permissions }) {
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
    })
    .select('*')
    .single();

  if (error) throw error;

  const matrix = est_admin ? fullPermissionMatrix() : (permissions || emptyPermissionMatrix());
  await saveRolePermissions(role.id, matrix, Boolean(est_admin));

  return mapRole(role, matrixToPermissionRows(role.id, matrix));
}

export async function updateRole(roleId, { nom, description, statut, est_admin, permissions }) {
  const sb = getSupabase();
  const { data: role, error } = await sb
    .from(ROLES_TABLE)
    .update({
      nom: nom?.trim(),
      description: description?.trim() || null,
      statut: STATUT_ROLE_UI[statut] || 'actif',
      est_admin: Boolean(est_admin),
    })
    .eq('id', roleId)
    .select('*')
    .single();

  if (error) throw error;

  const matrix = est_admin ? fullPermissionMatrix() : (permissions || emptyPermissionMatrix());
  await saveRolePermissions(roleId, matrix, Boolean(est_admin));

  return mapRole(role, matrixToPermissionRows(roleId, matrix));
}

async function saveRolePermissions(roleId, matrix, allGranted) {
  const sb = getSupabase();
  const rows = matrixToPermissionRows(roleId, matrix).map((r) => ({
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
    permissions: role.permissions,
  });
}

/**
 * users.js — Gestion utilisateurs ERP liés aux employés RH (Supabase).
 */
import { getSupabase } from '../../lib/supabase';
import { getDeptName } from '../../data/departments';
import { employeeFullName } from '../rh/employees';
import { STATUT_USER_DB, STATUT_USER_UI } from './constants';
import { clearPermissionCache } from './permissions';
import { resolveApiBaseUrl } from '../../config/env';
import { getAuthToken } from '../auth';

const TABLE = 'profiles';

export const DISABLED_ACCOUNT_MSG = 'Compte désactivé, contactez l\'administrateur.';

export function isProfileActive(profile) {
  if (!profile) return true;
  return (profile.statut || 'actif') === 'actif';
}

export async function clearMustChangePassword(userId) {
  const sb = getSupabase();
  const { error } = await sb
    .from(TABLE)
    .update({ must_change_password: false })
    .eq('id', userId);
  if (error) throw error;
  clearPermissionCache();
}

function splitNom(nom) {
  const parts = (nom || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { prenom: parts[0] || '', nom: '' };
  return { prenom: parts[0], nom: parts.slice(1).join(' ') };
}

function mapAdminUser(row) {
  const emp = row.employees;
  const role = row.erp_roles;
  const fromEmp = splitNom(employeeFullName(emp));
  const fromProfile = splitNom(row.nom);

  const prenom = row.prenom || emp?.firstname || fromEmp.prenom || fromProfile.prenom;
  const nom = emp?.lastname || (row.prenom ? (fromProfile.nom || row.nom?.replace(row.prenom, '').trim()) : fromProfile.nom) || row.nom;

  const deptLabel = emp?.department
    || getDeptName(emp?.department_id ?? row.department_id)
    || getDeptName(row.department_id);

  return {
    id: row.id,
    employee_id: row.employee_id || emp?.id || null,
    prenom,
    nom: emp?.lastname || nom,
    email: row.email || emp?.email || '',
    telephone: row.telephone || emp?.telephone || '',
    poste: emp?.poste || '',
    departement: deptLabel,
    department_id: row.department_id ?? emp?.department_id ?? null,
    role_id: row.role_id || null,
    role_code: role?.code || row.role || '',
    role_nom: role?.nom || row.role || '',
    statut: STATUT_USER_DB[row.statut] || 'Actif',
    must_change_password: Boolean(row.must_change_password),
    date_creation: row.created_at?.slice(0, 10) || '',
    derniere_connexion: row.last_sign_in_at
      ? new Date(row.last_sign_in_at).toLocaleString('fr-FR')
      : '',
    last_sign_in_at: row.last_sign_in_at,
    notes: row.notes || '',
    initiales: row.initiales,
    employee: emp || null,
  };
}

export async function listAdminUsers() {
  const sb = getSupabase();
  const { data, error } = await sb
    .from(TABLE)
    .select(`
      id, nom, prenom, email, role, role_id, statut, telephone, notes,
      department_id, employee_id, initiales, created_at, last_sign_in_at,
      must_change_password,
      employees ( id, firstname, lastname, email, telephone, poste, department, department_id, statut ),
      erp_roles ( id, code, nom, est_admin, statut )
    `)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(mapAdminUser);
}

export async function listEmployeesForLink() {
  const sb = getSupabase();
  const [{ data: employees, error: eErr }, { data: profiles, error: pErr }] = await Promise.all([
    sb.from('employees').select('id, firstname, lastname, email, telephone, poste, department, department_id, statut').order('lastname'),
    sb.from(TABLE).select('employee_id').not('employee_id', 'is', null),
  ]);

  if (eErr) throw eErr;
  if (pErr) throw pErr;

  const linked = new Set((profiles || []).map((p) => p.employee_id));
  return (employees || []).map((e) => ({
    ...e,
    label: employeeFullName(e),
    linked: linked.has(e.id),
  }));
}

function profilePayloadFromForm(form, employee) {
  const useForm = !employee;
  const prenom = useForm ? form.prenom?.trim() : (employee?.firstname || form.prenom?.trim());
  const nom = useForm ? form.nom?.trim() : (employee?.lastname || form.nom?.trim());
  const fullName = [prenom, nom].filter(Boolean).join(' ').trim();

  return {
    nom: fullName || form.email?.split('@')[0] || 'Utilisateur',
    prenom: prenom || null,
    email: (useForm ? form.email : (employee?.email || form.email))?.trim()?.toLowerCase(),
    telephone: (useForm ? form.telephone?.trim() : (employee?.telephone || form.telephone?.trim())) || null,
    role_id: form.role_id || null,
    department_id: form.department_id
      ? Number(form.department_id)
      : (employee?.department_id ?? form.department_id ?? null),
    employee_id: employee?.id ?? form.employee_id ?? null,
    statut: STATUT_USER_UI[form.statut] || 'actif',
    notes: form.notes?.trim() || null,
    initiales: [prenom?.[0], nom?.[0]].filter(Boolean).join('').toUpperCase().slice(0, 2) || null,
    must_change_password: form.must_change_password ?? undefined,
  };
}

export async function updateAdminUser(userId, form, employee) {
  const sb = getSupabase();
  const payload = profilePayloadFromForm(form, employee);
  if (payload.must_change_password === undefined) {
    delete payload.must_change_password;
  }

  const { data, error } = await sb
    .from(TABLE)
    .update(payload)
    .eq('id', userId)
    .select(`
      id, nom, prenom, email, role, role_id, statut, telephone, notes,
      department_id, employee_id, initiales, created_at, last_sign_in_at,
      must_change_password,
      employees ( id, firstname, lastname, email, telephone, poste, department, department_id ),
      erp_roles ( id, code, nom, est_admin )
    `)
    .single();

  if (error) throw error;
  clearPermissionCache();
  return mapAdminUser(data);
}

export async function setUserStatut(userId, statutUi) {
  const sb = getSupabase();
  const statut = STATUT_USER_UI[statutUi] || 'actif';
  const { error } = await sb.from(TABLE).update({ statut }).eq('id', userId);
  if (error) throw error;
  return statutUi;
}

export async function linkExistingProfileByEmail(email, form, employee) {
  const sb = getSupabase();
  const { data: profile, error: fErr } = await sb
    .from(TABLE)
    .select('id')
    .ilike('email', email.trim())
    .maybeSingle();

  if (fErr) throw fErr;
  if (!profile) {
    throw new Error('Aucun compte auth existant pour cet email. Créez le compte dans Supabase Auth ou utilisez l’invitation.');
  }

  return updateAdminUser(profile.id, form, employee);
}

export async function createUserFromEmployee({
  employee, role_id, department_id, statut, password, notes, mustChangePassword = true,
}) {
  const sb = getSupabase();
  const email = employee.email?.trim()?.toLowerCase();
  if (!email) throw new Error('L’employé doit avoir un email.');

  const { data: { session: adminSession } } = await sb.auth.getSession();

  const form = {
    role_id,
    department_id,
    statut: statut || 'Actif',
    notes,
    email,
    prenom: employee.firstname,
    nom: employee.lastname,
    telephone: employee.telephone,
    must_change_password: mustChangePassword,
  };

  const { data: existing } = await sb.from(TABLE).select('id').ilike('email', email).maybeSingle();
  if (existing) {
    return updateAdminUser(existing.id, form, employee);
  }

  if (!password || password.length < 6) {
    throw new Error('Mot de passe requis (6 caractères minimum) pour créer le compte.');
  }

  const { data: signUpData, error: signUpErr } = await sb.auth.signUp({
    email,
    password,
    options: {
      data: {
        nom: employeeFullName(employee),
        prenom: employee.firstname,
        role: 'employe',
        must_change_password: mustChangePassword,
        statut: STATUT_USER_UI[statut || 'Actif'] || 'actif',
      },
    },
  });

  if (adminSession) {
    await sb.auth.setSession({
      access_token: adminSession.access_token,
      refresh_token: adminSession.refresh_token,
    });
  }

  if (signUpErr) {
    if (signUpErr.message?.toLowerCase().includes('registered')) {
      return linkExistingProfileByEmail(email, form, employee);
    }
    throw signUpErr;
  }

  const userId = signUpData.user?.id;
  if (!userId) {
    throw new Error('Compte créé mais identifiant introuvable. Vérifiez la confirmation email Supabase.');
  }

  const saved = await updateAdminUser(userId, form, employee);
  if (mustChangePassword) {
    await sb.from(TABLE).update({ must_change_password: true }).eq('id', userId);
    saved.must_change_password = true;
  }
  return saved;
}

export async function adminResetPassword(userId, email) {
  const sb = getSupabase();
  await requestPasswordReset(email);
  await sb.from(TABLE).update({ must_change_password: true }).eq('id', userId);
}

/** Définir le mot de passe manuellement via backend Railway (pas d'email). */
export async function adminSetPassword(userId, password, { mustChangePassword = false } = {}) {
  const token = await getAuthToken();
  if (!token) throw new Error('Session expirée. Reconnectez-vous.');

  const res = await fetch(`${resolveApiBaseUrl()}/admin/users/${userId}/password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      password,
      must_change_password: mustChangePassword,
    }),
  });

  if (!res.ok) {
    let msg = `Erreur ${res.status}`;
    try {
      const err = await res.json();
      msg = err.error || err.message || msg;
    } catch { /* ignore */ }
    throw new Error(msg);
  }

  clearPermissionCache();
  return res.json();
}

function resolveRoleId(roles, { estSuperAdmin }) {
  const list = roles || [];
  if (estSuperAdmin) {
    return list.find((r) => r.est_admin || r.code === 'super_admin' || /super\s*admin/i.test(r.nom || ''))?.id
      || list.find((r) => r.est_admin)?.id
      || null;
  }
  return list.find((r) => r.code === 'employe' || /employé|employe/i.test(r.nom || ''))?.id
    || list.find((r) => !r.est_admin && r.statut === 'Actif')?.id
    || list[0]?.id
    || null;
}

export { resolveRoleId };

export async function requestPasswordReset(email) {
  const sb = getSupabase();
  const redirectTo = `${window.location.origin}/`;
  const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo });
  if (error) throw error;
}

export async function touchLastSignIn(userId) {
  const sb = getSupabase();
  await sb.from(TABLE).update({ last_sign_in_at: new Date().toISOString() }).eq('id', userId);
}

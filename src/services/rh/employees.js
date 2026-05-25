/**
 * employees.js — RH employees CRUD (Supabase).
 */
import { getSupabase } from '../../lib/supabase';
import { DEPARTMENTS } from '../../data/departments';

const TABLE = 'employees';

/** Map form payload → DB row (RH.jsx fields) */
export function toEmployeeRow(form) {
  const dept = DEPARTMENTS.find(
    (d) => d.nom === form.department || d.code === form.department,
  );

  return {
    firstname: form.firstname?.trim(),
    lastname: form.lastname?.trim(),
    email: form.email?.trim(),
    poste: form.poste?.trim(),
    department: form.department || null,
    department_id: dept?.id ?? null,
    telephone: form.telephone?.trim() || null,
    salaire: Number(form.salaire) || 0,
    statut: form.statut || 'Actif',
    date_embauche: form.date_embauche || null,
  };
}

export async function listEmployees() {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function createEmployee(form) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([toEmployeeRow(form)])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateEmployee(id, form) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(toEmployeeRow(form))
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteEmployee(id) {
  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) throw error;
}

/** KPI stats for RH dashboard cards */
export function computeEmployeeStats(employees) {
  const list = employees || [];
  return {
    total: list.length,
    actifs: list.filter((e) => e.statut === 'Actif').length,
    conge: list.filter((e) => e.statut === 'Conge').length,
    inactifs: list.filter((e) => e.statut === 'Inactif').length,
  };
}

/** Client-side search + optional statut filter */
export function filterEmployees(employees, { search = '', statut = '' } = {}) {
  const q = search.toLowerCase().trim();
  return (employees || []).filter((emp) => {
    if (statut && emp.statut !== statut) return false;
    if (!q) return true;
    const full = `${emp.firstname || ''} ${emp.lastname || ''}`.toLowerCase();
    return (
      full.includes(q) ||
      (emp.poste || '').toLowerCase().includes(q) ||
      (emp.email || '').toLowerCase().includes(q) ||
      (emp.department || '').toLowerCase().includes(q)
    );
  });
}

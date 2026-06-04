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

  const trimOrNull = (v) => {
    const s = v == null ? '' : String(v).trim();
    return s || null;
  };

  return {
    firstname: form.firstname?.trim(),
    lastname: form.lastname?.trim(),
    email: form.email?.trim(),
    poste: form.poste?.trim(),
    department: form.department || null,
    department_id: dept?.id ?? null,
    telephone: trimOrNull(form.telephone),
    salaire: Number(form.salaire) || 0,
    statut: form.statut || 'Actif',
    date_embauche: form.date_embauche || null,
    adresse: trimOrNull(form.adresse),
    numero_cin: trimOrNull(form.numero_cin)?.toUpperCase() || null,
    cnss: trimOrNull(form.cnss),
    rib: trimOrNull(form.rib),
    banque: trimOrNull(form.banque),
    situation_familiale: trimOrNull(form.situation_familiale),
  };
}

export function employeeFullName(emp) {
  if (!emp) return '';
  return [emp.firstname, emp.lastname].filter(Boolean).join(' ').trim();
}

function isChefChantierPoste(poste) {
  const p = (poste || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  return p.includes('chef') && p.includes('chantier');
}

function mapChefChantierRow(e) {
  return {
    id: e.id,
    label: employeeFullName(e),
    poste: e.poste || '',
    statut: e.statut || '',
    telephone: e.telephone || '',
  };
}

/** Chefs de chantier (employés RH) pour saisie présence */
export async function listChefsChantier() {
  const sb = getSupabase();

  const { data, error } = await sb
    .from(TABLE)
    .select('id, firstname, lastname, poste, statut, telephone')
    .ilike('poste', '%chef%chantier%')
    .order('lastname', { ascending: true });

  if (error) throw error;

  let rows = (data || []).filter((e) => isChefChantierPoste(e.poste));

  if (rows.length === 0) {
    const { data: all, error: allErr } = await sb
      .from(TABLE)
      .select('id, firstname, lastname, poste, statut, telephone')
      .order('lastname', { ascending: true });
    if (allErr) throw allErr;
    rows = (all || []).filter((e) => isChefChantierPoste(e.poste));
  }

  return rows.map(mapChefChantierRow);
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
      (emp.department || '').toLowerCase().includes(q) ||
      (emp.numero_cin || '').toLowerCase().includes(q) ||
      (emp.telephone || '').toLowerCase().includes(q)
    );
  });
}

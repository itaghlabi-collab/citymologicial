/**
 * employees.js — RH employees CRUD (Supabase).
 */
import { getSupabase } from '../../lib/supabase';
import { DEPARTMENTS } from '../../data/departments';
import { purgeEmployeeDocuments } from './employeeDocuments';

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

function employeeDepartmentCode(emp) {
  if (!emp) return '';
  const dept = DEPARTMENTS.find(
    (d) => d.id === emp.department_id || d.nom === emp.department || d.code === emp.department,
  );
  return dept?.code || '';
}

/** Libellé select : NOM PRÉNOM — CODE_DEPT / Fonction */
export function employeeSelectLabel(emp) {
  if (!emp) return '';
  const name = [emp.lastname, emp.firstname].filter(Boolean).join(' ').toUpperCase();
  const deptCode = employeeDepartmentCode(emp);
  const poste = (emp.poste || '').trim();
  let suffix = '—';
  if (deptCode && poste) suffix = `${deptCode} / ${poste}`;
  else if (deptCode) suffix = deptCode;
  else if (poste) suffix = poste;
  return `${name} — ${suffix}`;
}

function normEmployeeText(s) {
  return (s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

/** Retrouve un employé à partir du texte stocké en fiche projet. */
export function findEmployeeByStoredLabel(employees, stored) {
  const s = (stored || '').trim();
  if (!s || !employees?.length) return null;
  const exact = employees.find((e) => employeeSelectLabel(e) === s);
  if (exact) return exact;
  const target = normEmployeeText(s);
  return employees.find((e) => {
    const label = normEmployeeText(employeeSelectLabel(e));
    const name = normEmployeeText(employeeFullName(e));
    const nameUp = normEmployeeText([e.lastname, e.firstname].filter(Boolean).join(' '));
    return label === target || target.startsWith(name) || target.startsWith(nameUp);
  }) || null;
}

export async function listActiveEmployees() {
  const rows = await listEmployees();
  return (rows || []).filter((e) => {
    const st = (e.statut || 'Actif').toLowerCase();
    return st === 'actif';
  });
}

function normPoste(poste) {
  return (poste || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

/** Chef de projet : Chef de projet, Project manager, Responsable projet */
export function isChefProjetPoste(poste) {
  const p = normPoste(poste);
  if (!p) return false;
  if (p.includes('project manager')) return true;
  if (p.includes('chef') && p.includes('projet')) return true;
  if (p.includes('responsable') && p.includes('projet')) return true;
  return false;
}

/** Chef de chantier : Chef de chantier, Conducteur de travaux, Responsable chantier */
export function isChefChantierPoste(poste) {
  const p = normPoste(poste);
  if (!p) return false;
  if (p.includes('chef') && p.includes('chantier')) return true;
  if (p.includes('conducteur') && p.includes('travaux')) return true;
  if (p.includes('responsable') && p.includes('chantier')) return true;
  return false;
}

export function filterChefsProjet(employees) {
  return (employees || []).filter((e) => isChefProjetPoste(e.poste));
}

export function filterChefsChantierEmployees(employees) {
  return (employees || []).filter((e) => isChefChantierPoste(e.poste));
}

/** Responsables planning : chef de projet, chef de chantier, conducteur de travaux, responsable chantier. */
export function isPlanningResponsablePoste(poste) {
  return isChefProjetPoste(poste) || isChefChantierPoste(poste);
}

export function filterPlanningResponsables(employees) {
  return (employees || []).filter((e) => isPlanningResponsablePoste(e.poste));
}

/** Inclut l'employé sélectionné même si son poste ne correspond plus au filtre. */
export function withSelectedEmployee(filtered, allEmployees, selectedId) {
  const list = filtered || [];
  if (!selectedId) return list;
  const sid = String(selectedId);
  if (list.some((e) => String(e.id) === sid)) return list;
  const extra = (allEmployees || []).find((e) => String(e.id) === sid);
  return extra ? [extra, ...list] : list;
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
  await purgeEmployeeDocuments(id);
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

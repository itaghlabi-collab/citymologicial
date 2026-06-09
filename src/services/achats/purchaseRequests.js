/**
 * purchaseRequests.js — Demandes d'achat (Supabase purchase_requests)
 */
import { getSupabase } from '../../lib/supabase';
import { employeeFullName } from '../rh/employees';
import { listProjects } from '../projects/projects';

const TABLE = 'purchase_requests';
const ACHATS_DEPARTMENT_ID = 3;

export function projectOptionLabel(p) {
  if (!p) return '';
  const client = p.client || p.client_nom || '';
  return [p.ref, p.nom, client].filter(Boolean).join(' — ');
}

export function normalizePurchaseRequest(row) {
  if (!row) return null;
  const projectLabel = row.project_ref && row.project_name
    ? projectOptionLabel({ ref: row.project_ref, nom: row.project_name, client: '' })
    : row.project_name || row.project_ref || '';

  return {
    id: row.id,
    ref: row.ref_demande || '',
    titre: row.titre || '',
    priorite: row.priorite || 'Normale',
    statut: row.statut || 'Brouillon',
    date_debut: row.date_debut || '',
    date_limite: row.date_limite || '',
    description: row.description || '',
    department: row.department || 'ACHATS',
    departement: row.department || 'ACHATS',
    project_id: row.project_id || null,
    project_ref: row.project_ref || '',
    project_name: row.project_name || '',
    projet_lie: projectLabel,
    assigned_employee_id: row.assigned_employee_id || null,
    assigned_employee_name: row.assigned_employee_name || '',
    assignes: row.assigned_employee_name || '',
    date_creation: row.created_at ? String(row.created_at).slice(0, 10) : '',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function toPurchaseRequestRow(form) {
  return {
    ref_demande: form.ref || form.ref_demande || null,
    titre: (form.titre || '').trim(),
    priorite: form.priorite || 'Normale',
    statut: form.statut || 'Brouillon',
    date_debut: form.date_debut || null,
    date_limite: form.date_limite || null,
    description: form.description?.trim() || null,
    department: 'ACHATS',
    project_id: form.project_id || null,
    project_ref: form.project_ref || null,
    project_name: form.project_name || null,
    assigned_employee_id: form.assigned_employee_id || null,
    assigned_employee_name: form.assigned_employee_name || null,
  };
}

async function requireUser() {
  const { data: { user }, error } = await getSupabase().auth.getUser();
  if (error || !user) throw new Error('Session requise.');
  return user.id;
}

export async function generatePurchaseRequestRef() {
  const year = new Date().getFullYear();
  const prefix = `DA-${year}-`;
  const { count, error } = await getSupabase()
    .from(TABLE)
    .select('*', { count: 'exact', head: true })
    .like('ref_demande', `${prefix}%`);
  if (error) throw error;
  const seq = String((count || 0) + 1).padStart(3, '0');
  return `${prefix}${seq}`;
}

export async function listPurchaseRequests() {
  await requireUser();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(normalizePurchaseRequest);
}

export async function createPurchaseRequest(form) {
  const uid = await requireUser();
  const row = toPurchaseRequestRow(form);
  if (!row.ref_demande) row.ref_demande = await generatePurchaseRequestRef();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([{ ...row, created_by: uid }])
    .select()
    .single();
  if (error) throw error;
  return normalizePurchaseRequest(data);
}

export async function updatePurchaseRequest(id, form) {
  await requireUser();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(toPurchaseRequestRow(form))
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return normalizePurchaseRequest(data);
}

export async function deletePurchaseRequest(id) {
  await requireUser();
  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) throw error;
}

export async function listAchatsEmployees() {
  await requireUser();
  const { data, error } = await getSupabase()
    .from('employees')
    .select('id, firstname, lastname, poste, department, department_id, statut')
    .or(`department_id.eq.${ACHATS_DEPARTMENT_ID},department.ilike.%ACHAT%`)
    .order('lastname', { ascending: true });
  if (error) throw error;
  return (data || []).filter((e) => {
    if (e.statut === 'Inactif') return false;
    const dept = (e.department || '').toUpperCase();
    return e.department_id === ACHATS_DEPARTMENT_ID || dept.includes('ACHAT');
  });
}

export function employeeOptionLabel(emp) {
  const name = employeeFullName(emp);
  return `${name}${emp.poste ? ` — ${emp.poste}` : ''}`;
}

export async function loadPurchaseRequestFormOptions() {
  const [projects, employees] = await Promise.all([
    listProjects().catch(() => []),
    listAchatsEmployees().catch(() => []),
  ]);
  return { projects, employees };
}

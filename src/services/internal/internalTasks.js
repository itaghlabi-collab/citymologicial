/**
 * internalTasks.js — CRUD Tâches organisation interne (Supabase internal_tasks)
 */
import { getSupabase } from '../../lib/supabase';

const TABLE = 'internal_tasks';

export const TASK_STATUTS = ['a_faire', 'en_cours', 'terminee'];
export const TASK_PRIORITES = ['basse', 'normale', 'haute', 'urgente'];

export function normalizeInternalTask(row) {
  if (!row) return null;
  return {
    id: row.id,
    titre: row.titre || '',
    description: row.description || '',
    priorite: row.priorite || 'normale',
    statut: row.statut || 'a_faire',
    assigne: row.responsable || '',
    responsable: row.responsable || '',
    dateLimite: row.date_echeance || '',
    date_echeance: row.date_echeance || '',
    module_lie: row.module_lie || '',
    commentaire: row.commentaire || '',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function toInternalTaskRow(form) {
  return {
    titre: form.titre?.trim() || '',
    description: form.description?.trim() || null,
    priorite: form.priorite || 'normale',
    statut: form.statut || 'a_faire',
    responsable: (form.assigne || form.responsable || '').trim() || null,
    date_echeance: form.dateLimite || form.date_echeance || null,
    module_lie: form.module_lie?.trim() || null,
    commentaire: form.commentaire?.trim() || null,
  };
}

async function getAuthUserId() {
  const { data: { user }, error } = await getSupabase().auth.getUser();
  if (error || !user) {
    const err = new Error('Session requise.');
    err.code = 'AUTH';
    throw err;
  }
  return user.id;
}

export async function listInternalTasks() {
  await getAuthUserId();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .order('date_echeance', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(normalizeInternalTask);
}

export async function createInternalTask(form) {
  await getAuthUserId();
  const row = toInternalTaskRow(form);
  if (!row.titre) {
    const err = new Error('Le titre est requis.');
    err.code = 'VALIDATION';
    throw err;
  }
  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([row])
    .select('*')
    .single();
  if (error) throw error;
  return normalizeInternalTask(data);
}

export async function updateInternalTask(id, form) {
  await getAuthUserId();
  const row = toInternalTaskRow(form);
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(row)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return normalizeInternalTask(data);
}

export async function deleteInternalTask(id) {
  await getAuthUserId();
  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) throw error;
}

export async function toggleInternalTaskDone(id, done) {
  return updateInternalTask(id, { statut: done ? 'terminee' : 'a_faire' });
}

export function filterInternalTasks(tasks, filters = {}) {
  let rows = [...(tasks || [])];
  const { statut, priorite, responsable, dateFrom, dateTo, search } = filters;

  if (statut && statut !== 'all') {
    rows = rows.filter((t) => t.statut === statut);
  }
  if (priorite && priorite !== 'all') {
    rows = rows.filter((t) => t.priorite === priorite);
  }
  if (responsable && responsable !== 'all') {
    rows = rows.filter((t) => t.assigne === responsable);
  }
  if (dateFrom) {
    rows = rows.filter((t) => !t.dateLimite || t.dateLimite >= dateFrom);
  }
  if (dateTo) {
    rows = rows.filter((t) => !t.dateLimite || t.dateLimite <= dateTo);
  }
  if (search?.trim()) {
    const q = search.trim().toLowerCase();
    rows = rows.filter((t) =>
      `${t.titre} ${t.description} ${t.assigne} ${t.module_lie}`.toLowerCase().includes(q),
    );
  }
  return rows;
}

export function computeInternalTaskStats(tasks) {
  const list = tasks || [];
  return {
    total: list.length,
    a_faire: list.filter((t) => t.statut === 'a_faire').length,
    en_cours: list.filter((t) => t.statut === 'en_cours').length,
    terminee: list.filter((t) => t.statut === 'terminee').length,
    overdue: list.filter((t) =>
      t.statut !== 'terminee' && t.dateLimite && t.dateLimite < new Date().toISOString().slice(0, 10),
    ).length,
  };
}

export function collectTaskResponsables(tasks) {
  return [...new Set((tasks || []).map((t) => t.assigne).filter(Boolean))].sort();
}

/** Shape for Dashboard widget */
export function toDashboardTask(task) {
  const today = new Date().toISOString().slice(0, 10);
  const overdue = task.statut !== 'terminee' && task.dateLimite && task.dateLimite < today;
  return {
    id: task.id,
    title: task.titre,
    due: task.dateLimite || '—',
    priority: task.priorite,
    status: overdue ? 'blocked' : task.statut,
    responsable: task.assigne,
  };
}

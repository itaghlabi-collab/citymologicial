/**
 * internalTasks.js — CRUD Tâches organisation interne (Supabase internal_tasks)
 */
import { getSupabase } from '../../lib/supabase';

const TABLE = 'internal_tasks';

export const TASK_STATUTS = ['a_faire', 'en_cours', 'en_attente', 'terminee', 'annulee'];
export const TASK_PRIORITES = ['basse', 'normale', 'haute', 'urgente'];

export const TASK_STATUT_LABELS = {
  a_faire: 'À faire',
  en_cours: 'En cours',
  en_attente: 'En attente',
  terminee: 'Terminée',
  annulee: 'Annulée',
};

export const TASK_STATUT_BADGES = {
  a_faire: 'badge-orange',
  en_cours: 'badge-blue',
  en_attente: 'badge-purple',
  terminee: 'badge-green',
  annulee: 'badge-grey',
};

export const TASK_STATUT_SELECT_STYLE = {
  a_faire: { borderColor: '#F57F17', background: '#FFF8E1', color: '#E65100' },
  en_cours: { borderColor: '#1565C0', background: '#EBF3FF', color: '#0D47A1' },
  en_attente: { borderColor: '#6A1B9A', background: '#F3E5F5', color: '#4A148C' },
  terminee: { borderColor: '#2E7D32', background: '#E8F5E9', color: '#1B5E20' },
  annulee: { borderColor: '#9E9E9E', background: '#F5F5F5', color: '#616161' },
};

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
    dg_push: Boolean(row.dg_push),
    pushed_at: row.pushed_at || null,
    pushed_by: row.pushed_by || null,
    dg_note: row.dg_note || '',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function toInternalTaskRow(form) {
  const row = {
    titre: form.titre?.trim() || '',
    description: form.description?.trim() || null,
    priorite: form.priorite || 'normale',
    statut: form.statut || 'a_faire',
    responsable: (form.assigne || form.responsable || '').trim() || null,
    date_echeance: form.dateLimite || form.date_echeance || null,
    module_lie: form.module_lie?.trim() || null,
    commentaire: form.commentaire?.trim() || null,
  };
  if (form.dg_push !== undefined) row.dg_push = Boolean(form.dg_push);
  if (form.pushed_at !== undefined) row.pushed_at = form.pushed_at;
  if (form.pushed_by !== undefined) row.pushed_by = form.pushed_by;
  if (form.dg_note !== undefined) row.dg_note = form.dg_note?.trim() || null;
  return row;
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
    .order('dg_push', { ascending: false })
    .order('date_echeance', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return sortInternalTasks((data || []).map(normalizeInternalTask));
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
  const task = normalizeInternalTask(data);
  import('../notifications/notificationEvents').then(({ notifyTaskCreated }) => {
    notifyTaskCreated(task).catch(() => {});
  });
  return task;
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

export async function patchInternalTask(id, patch) {
  await getAuthUserId();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return normalizeInternalTask(data);
}

export async function setInternalTaskStatut(id, statut) {
  if (!TASK_STATUTS.includes(statut)) {
    const err = new Error('Statut invalide.');
    err.code = 'VALIDATION';
    throw err;
  }
  const task = await patchInternalTask(id, { statut });
  if (statut === 'terminee') {
    import('../notifications/notificationEvents').then(({ notifyTaskCompleted }) => {
      notifyTaskCompleted(task).catch(() => {});
    });
  }
  return task;
}

export async function setInternalTaskDgPush(id, enabled, userId, dgNote) {
  const patch = {
    dg_push: Boolean(enabled),
    pushed_at: enabled ? new Date().toISOString() : null,
    pushed_by: enabled ? userId : null,
    dg_note: enabled ? (dgNote?.trim() || null) : null,
  };
  if (enabled) {
    const { data: current } = await getSupabase().from(TABLE).select('priorite').eq('id', id).single();
    if (current && !['urgente', 'haute'].includes(current.priorite)) {
      patch.priorite = 'urgente';
    }
  }
  const task = await patchInternalTask(id, patch);
  if (enabled) {
    import('../notifications/notificationEvents').then(({ notifyTaskDgUrgent }) => {
      notifyTaskDgUrgent(task).catch(() => {});
    });
  }
  return task;
}

export async function deleteInternalTask(id) {
  await getAuthUserId();
  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) throw error;
}

export async function toggleInternalTaskDone(id, done) {
  return setInternalTaskStatut(id, done ? 'terminee' : 'a_faire');
}

export function sortInternalTasks(tasks) {
  const prioRank = { urgente: 0, haute: 1, normale: 2, basse: 3 };
  return [...(tasks || [])].sort((a, b) => {
    if (a.dg_push !== b.dg_push) return a.dg_push ? -1 : 1;
    const pr = (prioRank[a.priorite] ?? 2) - (prioRank[b.priorite] ?? 2);
    if (pr !== 0) return pr;
    const da = a.dateLimite || '9999-99-99';
    const db = b.dateLimite || '9999-99-99';
    return da.localeCompare(db);
  });
}

export function filterInternalTasks(tasks, filters = {}) {
  let rows = [...(tasks || [])];
  const { statut, priorite, responsable, dateFrom, dateTo, search, dgPushOnly } = filters;

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
  if (dgPushOnly) {
    rows = rows.filter((t) => t.dg_push);
  }
  if (search?.trim()) {
    const q = search.trim().toLowerCase();
    rows = rows.filter((t) =>
      `${t.titre} ${t.description} ${t.assigne} ${t.module_lie}`.toLowerCase().includes(q),
    );
  }
  return sortInternalTasks(rows);
}

export function computeInternalTaskStats(tasks) {
  const list = tasks || [];
  return {
    total: list.length,
    a_faire: list.filter((t) => t.statut === 'a_faire').length,
    en_cours: list.filter((t) => t.statut === 'en_cours').length,
    en_attente: list.filter((t) => t.statut === 'en_attente').length,
    terminee: list.filter((t) => t.statut === 'terminee').length,
    annulee: list.filter((t) => t.statut === 'annulee').length,
    dg_push: list.filter((t) => t.dg_push).length,
    overdue: list.filter((t) =>
      !['terminee', 'annulee'].includes(t.statut) && t.dateLimite && t.dateLimite < new Date().toISOString().slice(0, 10),
    ).length,
  };
}

export function collectTaskResponsables(tasks) {
  return [...new Set((tasks || []).map((t) => t.assigne).filter(Boolean))].sort();
}

/** Shape for Dashboard widget */
export function toDashboardTask(task) {
  const today = new Date().toISOString().slice(0, 10);
  const overdue = !['terminee', 'annulee'].includes(task.statut) && task.dateLimite && task.dateLimite < today;
  return {
    id: task.id,
    title: task.titre,
    due: task.dateLimite || '—',
    priority: task.dg_push ? 'urgente' : task.priorite,
    status: overdue ? 'blocked' : task.statut,
    responsable: task.assigne,
    dg_push: task.dg_push,
  };
}

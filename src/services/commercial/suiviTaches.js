/**
 * suiviTaches.js — Commercial / Marketing › Suivi des tâches
 * Tables dédiées : commercial_tasks, commercial_task_comments, commercial_task_history
 */
import { getSupabase } from '../../lib/supabase';
import { listProjectsForSelect } from '../projects/projects';

const TABLE = 'commercial_tasks';
const COMMENTS = 'commercial_task_comments';
const HISTORY = 'commercial_task_history';

export const TASK_STATUTS = ['a_faire', 'en_cours', 'en_attente_validation', 'termine'];

export const TASK_STATUT_LABEL = {
  a_faire: 'À faire',
  en_cours: 'En cours',
  en_attente_validation: 'En attente / Validation',
  termine: 'Terminé',
};

export const TASK_PRIORITES = ['urgente', 'haute', 'normale', 'faible'];

export const TASK_PRIORITE_META = {
  urgente: { label: 'Urgente', dot: '🔴', color: '#C62828', bg: '#FFEBEE' },
  haute: { label: 'Haute', dot: '🟠', color: '#E65100', bg: '#FFF3E0' },
  normale: { label: 'Normale', dot: '🔵', color: '#1565C0', bg: '#E3F2FD' },
  faible: { label: 'Faible', dot: '⚪', color: '#4A5060', bg: '#F0F1F4' },
};

export const TASK_CATEGORIES = [
  'prospection', 'client', 'devis', 'relance', 'marketing', 'communication', 'administratif', 'autre',
];

export const TASK_CATEGORIE_LABEL = {
  prospection: 'Prospection',
  client: 'Client',
  devis: 'Devis',
  relance: 'Relance',
  marketing: 'Marketing',
  communication: 'Communication',
  administratif: 'Administratif',
  autre: 'Autre',
};

export const EMPTY_TASK_FORM = {
  titre: '',
  description: '',
  categorie: 'autre',
  societe: '',
  project_id: '',
  responsable_id: '',
  echeance: '',
  priorite: 'normale',
  statut: 'a_faire',
  bloque: false,
  bloque_motif: '',
  relance_dg: false,
  relance_dg_date: '',
  relance_dg_objet: '',
  notes: '',
};

export function todayIso(d = new Date()) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function dateOnly(raw) {
  return raw ? String(raw).slice(0, 10) : '';
}

export function normalizeTask(row) {
  if (!row) return null;
  return {
    id: row.id,
    titre: row.titre || '',
    description: row.description || '',
    categorie: row.categorie || 'autre',
    societe: row.societe || '',
    project_id: row.project_id || '',
    responsable_id: row.responsable_id || '',
    priorite: row.priorite || 'normale',
    statut: row.statut || 'a_faire',
    bloque: Boolean(row.bloque),
    bloque_motif: row.bloque_motif || '',
    echeance: dateOnly(row.echeance),
    relance_dg: Boolean(row.relance_dg),
    relance_dg_date: dateOnly(row.relance_dg_date),
    relance_dg_objet: row.relance_dg_objet || '',
    notes: row.notes || '',
    position: Number(row.position) || 0,
    created_by: row.created_by || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    completed_at: row.completed_at,
  };
}

export function toTaskRow(form) {
  const relance = Boolean(form.relance_dg);
  const bloque = Boolean(form.bloque);
  return {
    titre: form.titre?.trim() || '',
    description: form.description?.trim() || null,
    categorie: form.categorie || 'autre',
    societe: form.societe?.trim() || null,
    project_id: form.project_id || null,
    responsable_id: form.responsable_id || null,
    priorite: form.priorite || 'normale',
    statut: form.statut || 'a_faire',
    bloque,
    bloque_motif: bloque ? (form.bloque_motif?.trim() || null) : null,
    echeance: form.echeance || null,
    relance_dg: relance,
    relance_dg_date: relance ? (form.relance_dg_date || null) : null,
    relance_dg_objet: relance ? (form.relance_dg_objet?.trim() || null) : null,
    notes: form.notes?.trim() || null,
  };
}

/** Indicateurs calculés à l'affichage — ne modifient jamais le statut. */
export function isTaskEnRetard(task, today = todayIso()) {
  return Boolean(task?.echeance) && task.statut !== 'termine' && task.echeance < today;
}

export function relanceDgState(task, today = todayIso()) {
  if (!task?.relance_dg || task.statut === 'termine') return null;
  if (!task.relance_dg_date) return 'active';
  if (task.relance_dg_date < today) return 'retard';
  if (task.relance_dg_date === today) return 'aujourdhui';
  return 'active';
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

export async function getCurrentUserId() {
  try {
    return await getAuthUserId();
  } catch {
    return null;
  }
}

export async function listTasks() {
  await getAuthUserId();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .order('position', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[CITYMO] suiviTaches list', error);
    throw error;
  }
  return (data || []).map(normalizeTask);
}

export async function createTask(form, position = 0) {
  await getAuthUserId();
  const row = { ...toTaskRow(form), position };
  if (!row.titre) {
    const err = new Error('Titre requis.');
    err.code = 'VALIDATION';
    throw err;
  }
  if (!row.responsable_id) {
    const err = new Error('Responsable requis.');
    err.code = 'VALIDATION';
    throw err;
  }
  const { data, error } = await getSupabase().from(TABLE).insert([row]).select('*').single();
  if (error) {
    console.error('[CITYMO] suiviTaches insert', error, row);
    throw error;
  }
  return normalizeTask(data);
}

/** Mise à jour partielle (patch) : seules les colonnes fournies sont envoyées. */
export async function patchTask(id, patch) {
  await getAuthUserId();
  const { data, error } = await getSupabase().from(TABLE).update(patch).eq('id', id).select('*').single();
  if (error) {
    console.error('[CITYMO] suiviTaches update', error, { id, patch });
    throw error;
  }
  return normalizeTask(data);
}

export async function updateTask(id, form) {
  const row = toTaskRow(form);
  if (!row.titre) {
    const err = new Error('Titre requis.');
    err.code = 'VALIDATION';
    throw err;
  }
  if (!row.responsable_id) {
    const err = new Error('Responsable requis.');
    err.code = 'VALIDATION';
    throw err;
  }
  return patchTask(id, row);
}

export async function deleteTask(id) {
  await getAuthUserId();
  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) {
    console.error('[CITYMO] suiviTaches delete', error, { id });
    throw error;
  }
}

export async function listTaskComments(taskId) {
  const { data, error } = await getSupabase()
    .from(COMMENTS)
    .select('id, task_id, author_id, author_nom, contenu, created_at')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function addTaskComment(taskId, contenu) {
  await getAuthUserId();
  const text = String(contenu || '').trim();
  if (!text) {
    const err = new Error('Commentaire vide.');
    err.code = 'VALIDATION';
    throw err;
  }
  const { data, error } = await getSupabase()
    .from(COMMENTS)
    .insert([{ task_id: taskId, contenu: text }])
    .select('id, task_id, author_id, author_nom, contenu, created_at')
    .single();
  if (error) throw error;
  return data;
}

export async function listTaskHistory(taskId) {
  const { data, error } = await getSupabase()
    .from(HISTORY)
    .select('id, event, old_value, new_value, actor_nom, created_at')
    .eq('task_id', taskId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function listTaskAssignees() {
  const { data, error } = await getSupabase().rpc('list_commercial_task_assignees');
  if (error) {
    console.warn('[CITYMO] list_commercial_task_assignees', error.message);
    return [];
  }
  return (data || []).map((u) => ({ id: u.id, nom: u.nom || u.email || '—', email: u.email || '' }));
}

export async function listTaskProjects() {
  try {
    const rows = await listProjectsForSelect();
    return (rows || []).map((p) => ({
      id: p.id,
      label: [p.ref, p.nom].filter(Boolean).join(' — ') || p.nom || p.ref || '—',
    }));
  } catch (err) {
    console.warn('[CITYMO] suiviTaches projects', err);
    return [];
  }
}

export function filterTasks(tasks, filters = {}, ctx = {}) {
  const {
    search = '',
    responsable = '',
    priorite = '',
    categorie = '',
    statut = '',
    echeance = '',
    quick = 'toutes',
  } = filters;
  const today = ctx.today || todayIso();
  const userId = ctx.userId || null;
  const projectLabel = ctx.projectLabel || (() => '');
  const userLabel = ctx.userLabel || (() => '');

  const weekEnd = (() => {
    const d = new Date(`${today}T00:00:00`);
    d.setDate(d.getDate() + 7);
    return todayIso(d);
  })();

  return (tasks || []).filter((t) => {
    if (quick === 'mes' && t.responsable_id !== userId) return false;
    if (quick === 'urgentes' && t.priorite !== 'urgente') return false;
    if (quick === 'retard' && !isTaskEnRetard(t, today)) return false;
    if (quick === 'relance' && !relanceDgState(t, today)) return false;

    if (responsable && t.responsable_id !== responsable) return false;
    if (priorite && t.priorite !== priorite) return false;
    if (categorie && t.categorie !== categorie) return false;
    if (statut && t.statut !== statut) return false;

    if (echeance === 'retard' && !isTaskEnRetard(t, today)) return false;
    if (echeance === 'aujourdhui' && t.echeance !== today) return false;
    if (echeance === 'semaine' && !(t.echeance && t.echeance >= today && t.echeance <= weekEnd)) return false;
    if (echeance === 'sans' && t.echeance) return false;

    if (search) {
      const q = search.toLowerCase();
      const hay = [
        t.titre, t.description, t.societe, t.notes,
        projectLabel(t.project_id), userLabel(t.responsable_id),
      ].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function computeTaskKpis(tasks, today = todayIso()) {
  const list = tasks || [];
  return {
    aFaire: list.filter((t) => t.statut === 'a_faire').length,
    enCours: list.filter((t) => t.statut === 'en_cours').length,
    enRetard: list.filter((t) => isTaskEnRetard(t, today)).length,
    relancesDg: list.filter((t) => relanceDgState(t, today)).length,
  };
}

/**
 * projectPlanningMilestones.js — Jalons planning projet
 */
import { getSupabase } from '../../lib/supabase';

const TABLE = 'project_planning_milestones';

function fmtDate(raw) {
  if (!raw) return '';
  return String(raw).slice(0, 10);
}

function emptyToNull(v) {
  if (v === '' || v === undefined) return null;
  return v;
}

export function normalizeMilestone(row) {
  if (!row) return null;
  return {
    id: row.id,
    project_id: row.project_id,
    nom: row.nom || '',
    date_jalon: fmtDate(row.date_jalon),
    statut: row.statut || 'a_venir',
    notes: row.notes || '',
    ordre: Number(row.ordre ?? 0),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toRow(form) {
  return {
    nom: form.nom?.trim() || '',
    date_jalon: fmtDate(form.date_jalon),
    statut: form.statut || 'a_venir',
    notes: emptyToNull(form.notes?.trim()),
    ordre: Number(form.ordre) || 0,
  };
}

async function getAuthUserId() {
  const { data: { user }, error } = await getSupabase().auth.getUser();
  if (error || !user) throw new Error('Session requise.');
  return user.id;
}

export async function listProjectMilestones(projectId) {
  await getAuthUserId();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .eq('project_id', projectId)
    .order('date_jalon', { ascending: true })
    .order('ordre', { ascending: true });
  if (error) throw error;
  return (data || []).map(normalizeMilestone);
}

export async function createProjectMilestone(projectId, form) {
  await getAuthUserId();
  const payload = { project_id: projectId, ...toRow(form) };
  if (!payload.nom || !payload.date_jalon) throw new Error('Nom et date du jalon requis.');
  const { data, error } = await getSupabase().from(TABLE).insert([payload]).select('*').single();
  if (error) throw error;
  return normalizeMilestone(data);
}

export async function updateProjectMilestone(id, form) {
  await getAuthUserId();
  const { data, error } = await getSupabase().from(TABLE).update(toRow(form)).eq('id', id).select('*').single();
  if (error) throw error;
  return normalizeMilestone(data);
}

export async function deleteProjectMilestone(id) {
  await getAuthUserId();
  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) throw error;
}

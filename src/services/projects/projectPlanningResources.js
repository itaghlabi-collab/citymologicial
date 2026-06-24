/**
 * projectPlanningResources.js — Ressources planning (équipe, coûts)
 */
import { getSupabase } from '../../lib/supabase';

const TABLE = 'project_planning_resources';

function emptyToNull(v) {
  if (v === '' || v === undefined) return null;
  return v;
}

export function resourceTotalCost(row) {
  const taux = Number(row.taux_horaire) || 0;
  const heures = Number(row.heures_prevues) || 0;
  return Math.round(taux * heures * 100) / 100;
}

export function normalizeResource(row) {
  if (!row) return null;
  const r = {
    id: row.id,
    project_id: row.project_id,
    task_id: row.task_id || '',
    nom: row.nom || '',
    email: row.email || '',
    type_ressource: row.type_ressource || 'travail',
    taux_horaire: Number(row.taux_horaire ?? 0),
    heures_prevues: Number(row.heures_prevues ?? 0),
    notes: row.notes || '',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
  r.cout_total = resourceTotalCost(r);
  return r;
}

function toRow(form) {
  return {
    task_id: emptyToNull(form.task_id),
    nom: form.nom?.trim() || '',
    email: emptyToNull(form.email?.trim()),
    type_ressource: form.type_ressource || 'travail',
    taux_horaire: Number(form.taux_horaire) || 0,
    heures_prevues: Number(form.heures_prevues) || 0,
    notes: emptyToNull(form.notes?.trim()),
  };
}

async function getAuthUserId() {
  const { data: { user }, error } = await getSupabase().auth.getUser();
  if (error || !user) throw new Error('Session requise.');
  return user.id;
}

export async function listProjectPlanningResources(projectId) {
  await getAuthUserId();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .eq('project_id', projectId)
    .order('nom', { ascending: true });
  if (error) throw error;
  return (data || []).map(normalizeResource);
}

export async function createProjectPlanningResource(projectId, form) {
  await getAuthUserId();
  const payload = { project_id: projectId, ...toRow(form) };
  if (!payload.nom) throw new Error('Nom de la ressource requis.');
  const { data, error } = await getSupabase().from(TABLE).insert([payload]).select('*').single();
  if (error) throw error;
  return normalizeResource(data);
}

export async function updateProjectPlanningResource(id, form) {
  await getAuthUserId();
  const { data, error } = await getSupabase().from(TABLE).update(toRow(form)).eq('id', id).select('*').single();
  if (error) throw error;
  return normalizeResource(data);
}

export async function deleteProjectPlanningResource(id) {
  await getAuthUserId();
  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) throw error;
}

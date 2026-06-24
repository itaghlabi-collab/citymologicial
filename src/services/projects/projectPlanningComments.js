/**
 * projectPlanningComments.js — Collaboration planning (commentaires équipe)
 */
import { getSupabase } from '../../lib/supabase';

const TABLE = 'project_planning_comments';

export function normalizeComment(row) {
  if (!row) return null;
  return {
    id: row.id,
    project_id: row.project_id,
    task_id: row.task_id || '',
    auteur: row.auteur || '',
    message: row.message || '',
    created_at: row.created_at,
  };
}

async function getAuthUserId() {
  const { data: { user }, error } = await getSupabase().auth.getUser();
  if (error || !user) throw new Error('Session requise.');
  return user.id;
}

export async function listProjectPlanningComments(projectId, limit = 50) {
  await getAuthUserId();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map(normalizeComment);
}

export async function addProjectPlanningComment(projectId, { auteur, message, task_id }) {
  await getAuthUserId();
  if (!auteur?.trim() || !message?.trim()) throw new Error('Auteur et message requis.');
  const payload = {
    project_id: projectId,
    auteur: auteur.trim(),
    message: message.trim(),
    task_id: task_id || null,
  };
  const { data, error } = await getSupabase().from(TABLE).insert([payload]).select('*').single();
  if (error) throw error;
  return normalizeComment(data);
}

export async function deleteProjectPlanningComment(id) {
  await getAuthUserId();
  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) throw error;
}

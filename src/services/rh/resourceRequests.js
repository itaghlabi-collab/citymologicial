/**
 * resourceRequests.js — Demandes de ressources RH (workflow Chef projet ↔ RH)
 */
import { getSupabase } from '../../lib/supabase';
import {
  listWorkersByProject,
  saveProjectWorkerAssignments,
} from '../rh/workerProjectAssignments';
import { listWorkers } from '../rh/workers';
import { workerFullName } from '../rh/attendance';
import {
  BESOIN_REQUEST_STATUTS,
  isChefChantierFonction,
  isChefProjetFonction,
  isOuvrierFonction,
  normBesoinFonction,
} from '../../constants/projectBesoins';

const TABLE = 'resource_requests';
const WORKERS_TABLE = 'resource_request_workers';
const HISTORY_TABLE = 'resource_request_history';

function normFonction(s) {
  return normBesoinFonction(s);
}

export function requestStatutLabel(statut) {
  return BESOIN_REQUEST_STATUTS.find((s) => s.value === statut)?.label || statut;
}

export function requestStatutColor(statut) {
  return BESOIN_REQUEST_STATUTS.find((s) => s.value === statut)?.color || '#757575';
}

function normalizeRequest(row, workers = [], history = []) {
  if (!row) return null;
  return {
    id: row.id,
    ref: row.ref_demande || '',
    project_id: row.project_id,
    project_ref: row.project_ref || '',
    project_name: row.project_name || '',
    fonction: row.fonction,
    quantite: row.quantite,
    date_souhaitee: row.date_souhaitee || '',
    priorite: row.priorite || 'Normale',
    commentaire: row.commentaire || '',
    statut: row.statut || 'en_attente',
    statutLabel: requestStatutLabel(row.statut),
    requested_by: row.requested_by,
    requested_by_name: row.requested_by_name || '',
    assigned_by: row.assigned_by,
    assigned_by_name: row.assigned_by_name || '',
    staff_need_id: row.staff_need_id || null,
    workers,
    history,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function requireUser() {
  const { data: { user }, error } = await getSupabase().auth.getUser();
  if (error || !user) throw new Error('Session requise.');
  return user;
}

async function getProfileName(userId) {
  if (!userId) return '';
  const { data } = await getSupabase()
    .from('profiles')
    .select('nom, prenom, email')
    .eq('id', userId)
    .maybeSingle();
  if (!data) return '';
  return [data.prenom, data.nom].filter(Boolean).join(' ').trim() || data.email || '';
}

export async function generateResourceRequestRef() {
  const year = new Date().getFullYear();
  const prefix = `DR-${year}-`;
  const { count, error } = await getSupabase()
    .from(TABLE)
    .select('*', { count: 'exact', head: true })
    .like('ref_demande', `${prefix}%`);
  if (error) throw error;
  return `${prefix}${String((count || 0) + 1).padStart(3, '0')}`;
}

async function logHistory(requestId, action, details, actorId, actorName) {
  const { error } = await getSupabase().from(HISTORY_TABLE).insert([{
    request_id: requestId,
    action,
    details: details || null,
    actor_id: actorId || null,
    actor_name: actorName || null,
  }]);
  if (error) console.warn('[CITYMO] resource_request_history', error);
}

async function loadRequestWorkers(requestId) {
  const { data, error } = await getSupabase()
    .from(WORKERS_TABLE)
    .select('worker_id, assigned_at, workers(id, prenom, nom, fonction, statut)')
    .eq('request_id', requestId);
  if (error) throw error;
  return (data || []).map((r) => ({
    worker_id: r.worker_id,
    workerName: workerFullName(r.workers) || '',
    fonction: r.workers?.fonction || '',
    statut: r.workers?.statut || '',
    assigned_at: r.assigned_at,
  }));
}

async function loadRequestHistory(requestId) {
  const { data, error } = await getSupabase()
    .from(HISTORY_TABLE)
    .select('*')
    .eq('request_id', requestId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function listResourceRequests({ statut = '', projectId = '' } = {}) {
  await requireUser();
  let q = getSupabase().from(TABLE).select('*').order('created_at', { ascending: false });
  if (statut) q = q.eq('statut', statut);
  if (projectId) q = q.eq('project_id', projectId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map((row) => normalizeRequest(row));
}

export async function getResourceRequest(id) {
  await requireUser();
  const { data, error } = await getSupabase().from(TABLE).select('*').eq('id', id).single();
  if (error) throw error;
  const [workers, history] = await Promise.all([
    loadRequestWorkers(id),
    loadRequestHistory(id),
  ]);
  return normalizeRequest(data, workers, history);
}

export async function createResourceRequest({
  project,
  fonction,
  quantite,
  date_souhaitee,
  priorite,
  commentaire,
  staff_need_id,
}) {
  const user = await requireUser();
  if (!project?.id || !fonction?.trim()) throw new Error('Projet et fonction requis.');
  const qty = Math.max(1, Number(quantite) || 1);
  const actorName = await getProfileName(user.id);
  const ref = await generateResourceRequestRef();

  const payload = {
    ref_demande: ref,
    project_id: project.id,
    project_ref: project.ref || '',
    project_name: project.nom || '',
    fonction: fonction.trim(),
    quantite: qty,
    date_souhaitee: date_souhaitee || null,
    priorite: priorite || 'Normale',
    commentaire: commentaire?.trim() || null,
    staff_need_id: staff_need_id || null,
    statut: 'en_attente',
    requested_by: user.id,
    requested_by_name: actorName,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await getSupabase().from(TABLE).insert([payload]).select().single();
  if (error) throw error;

  await logHistory(
    data.id,
    'created',
    `Demande créée — ${fonction} × ${qty}`,
    user.id,
    actorName,
  );

  try {
    const { notifyResourceRequestCreated } = await import('../notifications/notificationEvents');
    await notifyResourceRequestCreated(normalizeRequest(data));
  } catch (err) {
    console.warn('[CITYMO] notify resource request', err);
  }

  return normalizeRequest(data);
}

export async function updateResourceRequestStatus(id, statut) {
  const user = await requireUser();
  const actorName = await getProfileName(user.id);
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update({ statut, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  await logHistory(id, 'status_changed', `Statut → ${requestStatutLabel(statut)}`, user.id, actorName);
  return getResourceRequest(id);
}

export async function setResourceRequestWorkers(id, workerIds = []) {
  const user = await requireUser();
  const actorName = await getProfileName(user.id);
  const ids = [...new Set((workerIds || []).map(String))];

  const { error: delErr } = await getSupabase().from(WORKERS_TABLE).delete().eq('request_id', id);
  if (delErr) throw delErr;

  if (ids.length) {
    const { error: insErr } = await getSupabase().from(WORKERS_TABLE).insert(
      ids.map((worker_id) => ({ request_id: id, worker_id })),
    );
    if (insErr) throw insErr;
  }

  const { error: updErr } = await getSupabase()
    .from(TABLE)
    .update({
      statut: ids.length ? 'en_cours' : 'en_attente',
      assigned_by: user.id,
      assigned_by_name: actorName,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (updErr) throw updErr;

  await logHistory(
    id,
    'workers_assigned',
    `${ids.length} ouvrier(s) sélectionné(s)`,
    user.id,
    actorName,
  );

  return getResourceRequest(id);
}

export async function validateResourceRequest(id) {
  const user = await requireUser();
  const actorName = await getProfileName(user.id);
  const request = await getResourceRequest(id);
  if (!request) throw new Error('Demande introuvable.');

  const workerIds = (request.workers || []).map((w) => w.worker_id);
  if (!workerIds.length) throw new Error('Sélectionnez au moins un ouvrier.');

  const current = await listWorkersByProject(request.project_id);
  const merged = [...new Set([...current.map((a) => String(a.workerId)), ...workerIds.map(String)])];
  await saveProjectWorkerAssignments(request.project_id, merged);

  const { error } = await getSupabase()
    .from(TABLE)
    .update({
      statut: 'affectee',
      assigned_by: user.id,
      assigned_by_name: actorName,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw error;

  await logHistory(
    id,
    'validated',
    `Affectation validée — ${workerIds.length} ouvrier(s) sur le projet`,
    user.id,
    actorName,
  );

  try {
    const { notifyResourceRequestValidated } = await import('../notifications/notificationEvents');
    await notifyResourceRequestValidated(request);
  } catch (err) {
    console.warn('[CITYMO] notify resource validated', err);
  }

  if (request.staff_need_id) {
    try {
      const { syncProjectStaffNeedsCoverage } = await import('../projects/projectBesoins');
      await syncProjectStaffNeedsCoverage(request.project_id);
    } catch (err) {
      console.warn('[CITYMO] sync staff need after RH', err);
    }
  }

  return getResourceRequest(id);
}

export async function closeResourceRequest(id) {
  const user = await requireUser();
  const actorName = await getProfileName(user.id);
  const { error } = await getSupabase()
    .from(TABLE)
    .update({ statut: 'cloturee', updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
  await logHistory(id, 'closed', 'Demande clôturée', user.id, actorName);
  return getResourceRequest(id);
}

/** Ouvriers / ressources disponibles pour un type de besoin RH. */
export async function listAvailableWorkersForFonction(fonction, projectId) {
  const all = await listWorkers();
  const f = (fonction || '').trim();
  const onProject = projectId
    ? new Set((await listWorkersByProject(projectId)).map((a) => String(a.workerId)))
    : new Set();

  if (f === 'Sous-traitants') return [];

  return (all || []).filter((w) => {
    if (w.statut === 'inactif') return false;
    if (onProject.has(String(w.id))) return false;
    if (f === 'Ouvriers') return isOuvrierFonction(w.fonction);
    if (f === 'Chef de chantier') return isChefChantierFonction(w.fonction);
    if (f === 'Chef de projet') return isChefProjetFonction(w.fonction);
    return normFonction(w.fonction) === normFonction(f);
  });
}

export function workerDisplayName(w) {
  return workerFullName(w) || `${w.prenom || ''} ${w.nom || ''}`.trim();
}

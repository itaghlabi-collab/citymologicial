/**
 * workerProjectAssignments.js — Affectation N-N ouvriers / projets
 */
import { getSupabase } from '../../lib/supabase';
import { workerFullName } from './attendance';
import { emitRhAssignmentsUpdated } from './resourceRequestCoverage';
import {
  listRhWorkersForProject,
  collectRhWorkerIdsForProject,
} from './projectRhLink';

const TABLE = 'worker_project_assignments';

export function normalizeWorkerAssignment(row) {
  if (!row) return null;
  const w = row.workers;
  return {
    id: row.id,
    workerId: row.worker_id,
    projectId: row.project_id ? String(row.project_id) : '',
    status: row.status || 'active',
    assignedAt: row.assigned_at || row.created_at,
    workerName: workerFullName(w) || '',
    workerFonction: w?.fonction || '',
    workerStatut: w?.statut || '',
    projectName: row.projects?.nom || '',
    projectRef: row.projects?.ref || '',
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

const ASSIGN_SELECT = `
  *,
  workers ( id, prenom, nom, fonction, statut, tarif, tarif_unite ),
  projects ( id, nom, ref )
`;

/** Toutes les affectations actives (pour enrichir listWorkers). */
export async function listActiveWorkerProjectAssignments() {
  await getAuthUserId();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select(ASSIGN_SELECT)
    .eq('status', 'active')
    .order('assigned_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(normalizeWorkerAssignment);
}

/** Ouvriers affectés à un projet. */
export async function listWorkersByProject(projectId) {
  if (!projectId) return [];
  await getAuthUserId();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select(ASSIGN_SELECT)
    .eq('project_id', projectId)
    .eq('status', 'active')
    .order('assigned_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(normalizeWorkerAssignment);
}

/** @deprecated utilise listRhWorkersForProject */
export async function listRhAssignedWorkersForProject(projectId, projectRef = '', projectName = '') {
  return listRhWorkersForProject(projectId, { projectRef, projectName });
}

/** Map workerId → [projectId, ...] */
export function buildWorkerProjectIdsMap(assignments) {
  const map = new Map();
  (assignments || []).forEach((a) => {
    if (!a.workerId || !a.projectId || a.status !== 'active') return;
    const wid = String(a.workerId);
    if (!map.has(wid)) map.set(wid, []);
    const list = map.get(wid);
    if (!list.includes(String(a.projectId))) list.push(String(a.projectId));
  });
  return map;
}

/** Map `${workerId}|${projectId}` → date d'affectation (YYYY-MM-DD) */
export function buildAssignmentLookup(assignments) {
  const map = new Map();
  (assignments || []).forEach((a) => {
    if (!a.workerId || !a.projectId || a.status !== 'active') return;
    const key = `${a.workerId}|${a.projectId}`;
    const assignedDate = (a.assignedAt || a.assigned_at || '').toString().slice(0, 10);
    if (!assignedDate) return;
    const prev = map.get(key);
    if (!prev || assignedDate < prev) map.set(key, assignedDate);
  });
  return map;
}

export function assignmentKey(workerId, projectId) {
  if (!workerId || !projectId) return '';
  return `${workerId}|${projectId}`;
}

export function enrichWorkersWithProjectIds(workers, assignmentMap) {
  return (workers || []).map((w) => {
    const fromJunction = assignmentMap.get(String(w.id)) || [];
    const legacy = w.project_id ? [String(w.project_id)] : [];
    const assigned_project_ids = [...new Set([...fromJunction, ...legacy])];
    return { ...w, assigned_project_ids };
  });
}

/**
 * Synchronise les ouvriers affectés à un projet (checkbox modale).
 * workerIds = liste complète des ouvriers actifs cochés.
 */
export async function saveProjectWorkerAssignments(projectId, workerIds = [], { notify = false } = {}) {
  if (!projectId) {
    const err = new Error('Projet requis.');
    err.code = 'VALIDATION';
    throw err;
  }
  await getAuthUserId();
  const pid = String(projectId);
  const desired = new Set((workerIds || []).map(String));

  const { data: existing, error: listErr } = await getSupabase()
    .from(TABLE)
    .select('id, worker_id, status')
    .eq('project_id', pid);
  if (listErr) throw listErr;

  const byWorker = new Map((existing || []).map((r) => [String(r.worker_id), r]));

  for (const workerId of desired) {
    const row = byWorker.get(workerId);
    if (row) {
      if (row.status !== 'active') {
        const { error } = await getSupabase()
          .from(TABLE)
          .update({ status: 'active', assigned_at: new Date().toISOString() })
          .eq('id', row.id);
        if (error) throw error;
      }
    } else {
      const { error } = await getSupabase()
        .from(TABLE)
        .insert([{ worker_id: workerId, project_id: pid, status: 'active' }]);
      if (error) throw error;
    }
  }

  for (const row of existing || []) {
    const wid = String(row.worker_id);
    if (!desired.has(wid) && row.status === 'active') {
      const { error } = await getSupabase()
        .from(TABLE)
        .update({ status: 'ended' })
        .eq('id', row.id);
      if (error) throw error;
    }
  }

  await syncStaffNeedsAfterAssignment(pid);
  if (notify) emitRhAssignmentsUpdated(pid);
  return listWorkersByProject(pid);
}

/**
 * Ajoute / réactive UNE affectation sans retirer les autres ouvriers du projet.
 * Utilisé par l’import Excel (« Affecter maintenant »).
 */
export async function ensureWorkerAssignedToProject(projectId, workerId) {
  if (!projectId || !workerId) {
    const err = new Error('Projet et ouvrier requis.');
    err.code = 'VALIDATION';
    throw err;
  }
  await getAuthUserId();
  const pid = String(projectId);
  const wid = String(workerId);

  const { data: existing, error: listErr } = await getSupabase()
    .from(TABLE)
    .select('id, status')
    .eq('project_id', pid)
    .eq('worker_id', wid)
    .maybeSingle();
  if (listErr) throw listErr;

  if (existing?.id) {
    if (existing.status !== 'active') {
      const { error } = await getSupabase()
        .from(TABLE)
        .update({ status: 'active', assigned_at: new Date().toISOString() })
        .eq('id', existing.id);
      if (error) throw error;
    }
  } else {
    const { error } = await getSupabase()
      .from(TABLE)
      .insert([{ worker_id: wid, project_id: pid, status: 'active' }]);
    if (error) throw error;
  }

  await syncStaffNeedsAfterAssignment(pid);
  return true;
}

export async function removeWorkersFromProject(projectId, workerIds = []) {
  for (const workerId of workerIds) {
    await removeWorkerFromProject(projectId, workerId);
  }
  await syncStaffNeedsAfterAssignment(projectId);
  return listWorkersByProject(projectId);
}

async function syncStaffNeedsAfterAssignment(projectId) {
  try {
    const { syncProjectStaffNeedsCoverage } = await import('../projects/projectBesoins');
    await syncProjectStaffNeedsCoverage(projectId);
  } catch (err) {
    console.warn('[CITYMO] sync staff needs', err);
  }
}

/**
 * Recalcule worker_project_assignments depuis resource_request_workers (miroir pour planning / paie).
 */
export async function syncProjectTeamFromRhRequests(projectId, projectRef = '', projectName = '') {
  if (!projectId) return [];
  await getAuthUserId();

  const workerIds = await collectRhWorkerIdsForProject(projectId, { projectRef, projectName });
  if (workerIds === null) {
    return listWorkersByProject(projectId);
  }

  try {
    return await saveProjectWorkerAssignments(projectId, workerIds, { notify: false });
  } catch (err) {
    console.warn('[CITYMO] sync WPA from RH — table absente ou erreur, lecture RH seule', err);
    return listRhWorkersForProject(projectId, { projectRef, projectName });
  }
}

export async function removeWorkerFromProject(projectId, workerId) {
  if (!projectId || !workerId) return;
  await getAuthUserId();
  const { error } = await getSupabase()
    .from(TABLE)
    .update({ status: 'ended' })
    .eq('project_id', projectId)
    .eq('worker_id', workerId)
    .eq('status', 'active');
  if (error) throw error;
  await syncStaffNeedsAfterAssignment(projectId);
}

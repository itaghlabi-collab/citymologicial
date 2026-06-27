/**
 * workerProjectAssignments.js — Affectation N-N ouvriers / projets
 */
import { getSupabase } from '../../lib/supabase';
import { workerFullName } from './attendance';
import { emitRhAssignmentsUpdated } from './resourceRequestCoverage';

const TABLE = 'worker_project_assignments';
const RH_REQUESTS = 'resource_requests';
const RH_WORKERS = 'resource_request_workers';

/** Demandes RH ouvertes dont les affectations alimentent l'équipe projet */
const SYNCABLE_RH_STATUTS = ['en_cours', 'partielle', 'affectee', 'recrutement_en_cours'];
const CLOSED_RH_STATUTS = ['cloturee', 'refusee'];

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

async function loadOpenRhRequestIds(projectId, projectRef) {
  const base = () => getSupabase()
    .from(RH_REQUESTS)
    .select('id, statut, project_id, project_ref')
    .or('request_type.eq.ressource,request_type.is.null')
    .is('parent_request_id', null)
    .not('statut', 'in', '("cloturee","refusee")');

  let { data, error } = await base().eq('project_id', projectId);
  if (error) throw error;

  if (!(data || []).length && projectRef) {
    const byRef = await base().eq('project_ref', projectRef);
    if (byRef.error) throw byRef.error;
    data = byRef.data || [];
  }

  return (data || []).map((r) => r.id).filter(Boolean);
}

/**
 * Ouvriers affectés via demandes RH — source de vérité (resource_request_workers).
 */
export async function listRhAssignedWorkersForProject(projectId, projectRef = '') {
  if (!projectId) return [];
  await getAuthUserId();

  const { data: requests, error: reqErr } = await getSupabase()
    .from(RH_REQUESTS)
    .select('id, statut, ref_demande, fonction, project_id, project_ref')
    .or('request_type.eq.ressource,request_type.is.null')
    .is('parent_request_id', null)
    .not('statut', 'in', '("cloturee","refusee")')
    .eq('project_id', projectId);
  if (reqErr) throw reqErr;

  let requestRows = requests || [];
  if (!requestRows.length && projectRef) {
    const { data: byRef, error: refErr } = await getSupabase()
      .from(RH_REQUESTS)
      .select('id, statut, ref_demande, fonction, project_id, project_ref')
      .or('request_type.eq.ressource,request_type.is.null')
      .is('parent_request_id', null)
      .not('statut', 'in', '("cloturee","refusee")')
      .eq('project_ref', projectRef);
    if (refErr) throw refErr;
    requestRows = byRef || [];
  }

  const requestMap = new Map(requestRows.map((r) => [r.id, r]));
  const requestIds = [...requestMap.keys()];
  if (!requestIds.length) return [];

  const { data: rows, error } = await getSupabase()
    .from(RH_WORKERS)
    .select('worker_id, assigned_at, request_id, workers(id, prenom, nom, fonction, statut)')
    .in('request_id', requestIds);
  if (error) throw error;

  const seen = new Map();
  (rows || []).forEach((row) => {
    if (!row.worker_id) return;
    const wid = String(row.worker_id);
    const req = requestMap.get(row.request_id);
    if (!req) return;
    const entry = {
      id: `rh-${row.request_id}-${wid}`,
      workerId: wid,
      projectId: String(projectId),
      status: 'active',
      assignedAt: row.assigned_at,
      workerName: workerFullName(row.workers) || '—',
      workerFonction: row.workers?.fonction || req.fonction || '',
      workerStatut: row.workers?.statut || '',
      requestRef: req.ref_demande || '',
      requestFonction: req.fonction || '',
      requestStatut: req.statut || '',
      source: 'rh',
    };
    if (!seen.has(wid)) seen.set(wid, entry);
  });
  return [...seen.values()];
}
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
export async function saveProjectWorkerAssignments(projectId, workerIds = []) {
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
  emitRhAssignmentsUpdated(pid);
  return listWorkersByProject(pid);
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
export async function syncProjectTeamFromRhRequests(projectId, projectRef = '') {
  if (!projectId) return [];
  await getAuthUserId();

  const requestIds = await loadOpenRhRequestIds(projectId, projectRef);
  if (!requestIds.length) {
    return listWorkersByProject(projectId);
  }

  const { data: requestRows, error: statErr } = await getSupabase()
    .from(RH_REQUESTS)
    .select('id, statut')
    .in('id', requestIds);
  if (statErr) throw statErr;

  const syncableIds = (requestRows || [])
    .filter((r) => SYNCABLE_RH_STATUTS.includes(r.statut))
    .map((r) => r.id);

  if (!syncableIds.length) {
    return listWorkersByProject(projectId);
  }

  const { data: workerRows, error: wErr } = await getSupabase()
    .from(RH_WORKERS)
    .select('worker_id')
    .in('request_id', syncableIds);
  if (wErr) throw wErr;

  const workerIds = [...new Set((workerRows || []).map((r) => String(r.worker_id)).filter(Boolean))];
  try {
    return await saveProjectWorkerAssignments(projectId, workerIds);
  } catch (err) {
    console.warn('[CITYMO] sync WPA from RH — table absente ou erreur, lecture RH seule', err);
    return listRhAssignedWorkersForProject(projectId, projectRef);
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

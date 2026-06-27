/**
 * projectRhLink.js — Lier un projet à ses demandes RH (multi-critères + besoins)
 */
import { getSupabase } from '../../lib/supabase';
import { workerFullName } from './attendance';

const RH_REQUESTS = 'resource_requests';
const RH_WORKERS = 'resource_request_workers';
const STAFF_NEEDS = 'project_staff_needs';

async function requireUser() {
  const { data: { user }, error } = await getSupabase().auth.getUser();
  if (error || !user) throw new Error('Session requise.');
  return user;
}

function openParentRequestsQuery() {
  return getSupabase()
    .from(RH_REQUESTS)
    .select('*')
    .or('request_type.eq.ressource,request_type.is.null')
    .is('parent_request_id', null)
    .not('statut', 'in', '("cloturee","refusee")');
}

/** Retrouve toutes les demandes RH liées à un projet (id, ref, nom, besoins). */
export async function findProjectRhRequestRows(projectId, { projectRef = '', projectName = '' } = {}) {
  await requireUser();
  const merged = new Map();

  const add = (rows) => {
    (rows || []).forEach((r) => {
      if (r?.id) merged.set(r.id, r);
    });
  };

  if (projectId) {
    const { data, error } = await openParentRequestsQuery().eq('project_id', projectId);
    if (error) throw error;
    add(data);
  }

  if (projectRef) {
    const { data, error } = await openParentRequestsQuery().eq('project_ref', projectRef);
    if (error) throw error;
    add(data);
  }

  const name = (projectName || '').trim();
  if (name) {
    const { data, error } = await openParentRequestsQuery().ilike('project_name', name);
    if (error) throw error;
    add(data);
  }

  if (projectId) {
    const { data: needs, error: needErr } = await getSupabase()
      .from(STAFF_NEEDS)
      .select('resource_request_id')
      .eq('project_id', projectId)
      .not('resource_request_id', 'is', null);
    if (needErr) throw needErr;

    const ids = [...new Set((needs || []).map((n) => n.resource_request_id).filter(Boolean))];
    if (ids.length) {
      const { data, error } = await getSupabase()
        .from(RH_REQUESTS)
        .select('*')
        .in('id', ids)
        .not('statut', 'in', '("cloturee","refusee")');
      if (error) throw error;
      add(data);
    }
  }

  const rows = [...merged.values()];

  // Réparer project_id manquant sur demandes trouvées via besoin/ref/nom
  const toRepair = rows.filter((r) => projectId && !r.project_id);
  if (toRepair.length) {
    await Promise.all(
      toRepair.map((r) =>
        getSupabase()
          .from(RH_REQUESTS)
          .update({ project_id: projectId, updated_at: new Date().toISOString() })
          .eq('id', r.id),
      ),
    );
    toRepair.forEach((r) => { r.project_id = projectId; });
  }

  return rows;
}

/** Ouvriers affectés (resource_request_workers) pour un projet. */
export async function listRhWorkersForProject(projectId, { projectRef = '', projectName = '' } = {}) {
  if (!projectId) return [];
  await requireUser();

  const requestRows = await findProjectRhRequestRows(projectId, { projectRef, projectName });
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

export async function collectRhWorkerIdsForProject(projectId, opts = {}) {
  const requests = await findProjectRhRequestRows(projectId, opts);
  if (!requests.length) return null;

  const ids = requests.map((r) => r.id);
  const { data: workerRows, error } = await getSupabase()
    .from(RH_WORKERS)
    .select('worker_id')
    .in('request_id', ids);
  if (error) throw error;

  const workerIds = [...new Set((workerRows || []).map((r) => String(r.worker_id)).filter(Boolean))];
  if (!workerIds.length) return null;
  return workerIds;
}

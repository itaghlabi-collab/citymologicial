/**
 * resourceRequests.js — Demandes de ressources RH (workflow Chef projet ↔ RH)
 */
import { getSupabase } from '../../lib/supabase';
import {
  syncProjectTeamFromRhRequests,
  listWorkersByProject,
} from '../rh/workerProjectAssignments';
import { findProjectRhRequestRows, listRhWorkersForProject } from './projectRhLink';
import { listWorkers } from '../rh/workers';
import { workerFullName } from '../rh/attendance';
import {
  countAssignedWorkers,
  computeRequestCoverage,
  deriveRequestStatut,
  emitRhAssignmentsUpdated,
} from './resourceRequestCoverage';
import {
  BESOIN_REQUEST_STATUTS,
  RECRUITMENT_STATUTS,
  recruitmentStatutLabel,
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

function normalizeRequest(row, workers = [], history = [], recruitments = [], projectMeta = {}) {
  if (!row) return null;
  const isRecruitment = row.request_type === 'recrutement';
  return {
    id: row.id,
    ref: row.ref_demande || '',
    project_id: row.project_id,
    project_ref: row.project_ref || projectMeta.project_ref || '',
    project_name: row.project_name || projectMeta.project_nom || '',
    client_name: projectMeta.client_name || '',
    fonction: row.fonction,
    quantite: row.quantite,
    date_souhaitee: row.date_souhaitee || '',
    priorite: row.priorite || 'Normale',
    commentaire: row.commentaire || '',
    statut: row.statut || 'en_attente',
    statutLabel: isRecruitment
      ? recruitmentStatutLabel(row.recruitment_statut || 'cree')
      : requestStatutLabel(row.statut),
    request_type: row.request_type || 'ressource',
    parent_request_id: row.parent_request_id || null,
    recruitment_statut: row.recruitment_statut || null,
    recruitment_statutLabel: recruitmentStatutLabel(row.recruitment_statut),
    requested_by: row.requested_by,
    requested_by_name: row.requested_by_name || '',
    assigned_by: row.assigned_by,
    assigned_by_name: row.assigned_by_name || '',
    staff_need_id: row.staff_need_id || null,
    workers,
    recruitments,
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
    .select('worker_id, assigned_at, workers(id, prenom, nom, fonction, statut, telephone)')
    .eq('request_id', requestId);
  if (error) throw error;
  return (data || []).map((r) => ({
    worker_id: r.worker_id,
    workerName: workerFullName(r.workers) || '',
    fonction: r.workers?.fonction || '',
    statut: r.workers?.statut || '',
    telephone: r.workers?.telephone || '',
    assigned_at: r.assigned_at,
  }));
}

async function loadChildRecruitments(parentId) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .eq('parent_request_id', parentId)
    .eq('request_type', 'recrutement')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((row) => normalizeRequest(row));
}

async function loadWorkerCounts(requestIds = []) {
  if (!requestIds.length) return {};
  const { data, error } = await getSupabase()
    .from(WORKERS_TABLE)
    .select('request_id')
    .in('request_id', requestIds);
  if (error) return {};
  const counts = {};
  (data || []).forEach((r) => {
    counts[r.request_id] = (counts[r.request_id] || 0) + 1;
  });
  return counts;
}

async function loadOpenRecruitmentCounts(requestIds = []) {
  if (!requestIds.length) return {};
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('parent_request_id')
    .in('parent_request_id', requestIds)
    .eq('request_type', 'recrutement')
    .not('recruitment_statut', 'in', '("cloture","annule","valide")');
  if (error) return {};
  const counts = {};
  (data || []).forEach((r) => {
    if (!r.parent_request_id) return;
    counts[r.parent_request_id] = (counts[r.parent_request_id] || 0) + 1;
  });
  return counts;
}

async function syncRequestCoverageStatut(requestId) {
  if (!requestId) return;
  const request = await getResourceRequest(requestId);
  if (!request || request.request_type === 'recrutement') return;
  const assigned = countAssignedWorkers(request);
  const needed = Number(request.quantite) || 0;
  const openRecruitments = (request.recruitments || []).filter(
    (r) => !['cloture', 'annule', 'valide'].includes(r.recruitment_statut),
  );
  let statut = request.statut;
  if (['refusee', 'cloturee'].includes(statut)) return;
  if (openRecruitments.length > 0 && assigned < needed) statut = 'recrutement_en_cours';
  else if (assigned >= needed && needed > 0) statut = 'affectee';
  else if (assigned > 0 && assigned < needed) statut = 'partielle';
  else if (assigned === 0 && statut === 'affectee') statut = 'en_attente';
  if (statut !== request.statut) {
    await getSupabase().from(TABLE).update({ statut, updated_at: new Date().toISOString() }).eq('id', requestId);
  }
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

export async function listResourceRequests({ statut = '', projectId = '', projectRef = '', projectName = '' } = {}) {
  await requireUser();

  let rows = [];
  if (projectId || projectRef || projectName) {
    rows = await findProjectRhRequestRows(projectId, { projectRef, projectName });
    if (statut) rows = rows.filter((r) => r.statut === statut);
    rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  } else {
    let q = getSupabase()
      .from(TABLE)
      .select('*')
      .or('request_type.eq.ressource,request_type.is.null')
      .is('parent_request_id', null)
      .order('created_at', { ascending: false });
    if (statut) q = q.eq('statut', statut);
    const { data, error } = await q;
    if (error) throw error;
    rows = data || [];
  }

  const [counts, openRecruitments] = await Promise.all([
    loadWorkerCounts(rows.map((r) => r.id)),
    loadOpenRecruitmentCounts(rows.map((r) => r.id)),
  ]);
  return rows.map((row) => {
    const req = normalizeRequest(row);
    req.workers_count = counts[row.id] || 0;
    req.open_recruitments_count = openRecruitments[row.id] || 0;
    return req;
  });
}

export async function listProjectRecruitments(projectId) {
  if (!projectId) return [];
  await requireUser();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .eq('project_id', projectId)
    .eq('request_type', 'recrutement')
    .not('recruitment_statut', 'in', '("cloture","annule","valide")')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((row) => normalizeRequest(row));
}

/** Vue unifiée équipe projet : ouvriers RH + postes manquants / recrutements */
export async function listProjectEquipeOverview(projectId, { projectRef = '', projectName = '', syncMirror = false } = {}) {
  if (!projectId) return { workers: [], uncoveredPosts: [], recruitments: [], linkedRequests: [] };
  await requireUser();

  const linkOpts = { projectRef, projectName };

  const [rhWorkers, requests, recruitments] = await Promise.all([
    listRhWorkersForProject(projectId, linkOpts).catch((err) => {
      console.warn('[CITYMO] listRhWorkersForProject', err);
      return [];
    }),
    listResourceRequests({ projectId, projectRef, projectName }),
    listProjectRecruitments(projectId),
  ]);

  try {
    if (syncMirror) {
      await syncProjectTeamFromRhRequests(projectId, projectRef, projectName);
    }
  } catch (err) {
    console.warn('[CITYMO] syncProjectTeamFromRhRequests', err);
  }

  let wpaWorkers = [];
  try {
    wpaWorkers = await listWorkersByProject(projectId);
  } catch (err) {
    console.warn('[CITYMO] listWorkersByProject', err);
  }

  const workers = rhWorkers.length > 0 ? rhWorkers : wpaWorkers;

  const recruitmentByParent = new Map();
  (recruitments || []).forEach((r) => {
    if (r.parent_request_id) recruitmentByParent.set(r.parent_request_id, r);
  });

  const uncoveredPosts = [];
  (requests || []).forEach((req) => {
    const cov = computeRequestCoverage(req);
    const derived = deriveRequestStatut(req, cov);
    if (['cloturee', 'refusee'].includes(derived)) return;
    if (cov.manque <= 0) return;
    const recruitment = recruitmentByParent.get(req.id) || null;
    uncoveredPosts.push({
      requestId: req.id,
      ref: req.ref,
      fonction: req.fonction,
      demanded: cov.demanded,
      assigned: cov.assigned,
      manque: cov.manque,
      priorite: req.priorite,
      date_souhaitee: req.date_souhaitee,
      recruitment,
      hasRecruitment: !!recruitment,
    });
  });

  return {
    workers,
    uncoveredPosts,
    recruitments: recruitments || [],
    linkedRequests: requests || [],
    rhWorkers,
    wpaWorkers,
  };
}

export async function getResourceRequest(id) {
  await requireUser();
  const { data, error } = await getSupabase().from(TABLE).select('*').eq('id', id).single();
  if (error) throw error;
  const [workers, history, recruitments, projectMeta] = await Promise.all([
    data.request_type === 'recrutement' ? Promise.resolve([]) : loadRequestWorkers(id),
    loadRequestHistory(id),
    data.request_type === 'recrutement' ? Promise.resolve([]) : loadChildRecruitments(id),
    loadProjectMeta(data.project_id),
  ]);
  const req = normalizeRequest(data, workers, history, recruitments, projectMeta);
  req.workers_count = workers.length;
  req.open_recruitments_count = (recruitments || []).filter(
    (r) => !['cloture', 'annule', 'valide'].includes(r.recruitment_statut),
  ).length;
  return req;
}

async function loadProjectMeta(projectId) {
  if (!projectId) return {};
  const { data, error } = await getSupabase()
    .from('projects')
    .select('nom, ref, client_nom, clients(nom, prenom)')
    .eq('id', projectId)
    .maybeSingle();
  if (error || !data) return {};
  const client = data.client_nom
    || [data.clients?.prenom, data.clients?.nom].filter(Boolean).join(' ').trim()
    || '';
  return { client_name: client, project_nom: data.nom, project_ref: data.ref };
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

  const request = normalizeRequest(data);
  if (statut === 'en_cours' && request.staff_need_id) {
    try {
      const { syncNeedFromRhRequest } = await import('../projects/projectBesoins');
      await syncNeedFromRhRequest(request, {
        statut: 'en_recherche_rh',
        details: 'Prise en charge par le service RH',
        actorId: user.id,
        actorName,
      });
    } catch (err) {
      console.warn('[CITYMO] sync need take charge', err);
    }
  }

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

export async function validateResourceRequest(id, { allowPartial = true } = {}) {
  const user = await requireUser();
  const actorName = await getProfileName(user.id);
  const request = await getResourceRequest(id);
  if (!request) throw new Error('Demande introuvable.');

  const workerIds = (request.workers || []).map((w) => w.worker_id);
  if (!workerIds.length) throw new Error('Sélectionnez au moins un ouvrier.');

  const needed = Number(request.quantite) || 1;
  const assignedCount = workerIds.length;
  if (!allowPartial && assignedCount < needed) {
    throw new Error(`Il manque ${needed - assignedCount} ressource(s) pour valider complètement.`);
  }

  const isPartial = assignedCount > 0 && assignedCount < needed;
  const newStatut = isPartial ? 'partielle' : 'affectee';

  const { error } = await getSupabase()
    .from(TABLE)
    .update({
      statut: newStatut,
      assigned_by: user.id,
      assigned_by_name: actorName,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw error;

  await syncProjectTeamFromRhRequests(request.project_id, request.project_ref);
  emitRhAssignmentsUpdated(request.project_id);

  const detailMsg = isPartial
    ? `Affectation partielle — ${assignedCount}/${needed} ouvrier(s) affecté(s)`
    : `Affectation validée — ${assignedCount} ouvrier(s) sur le projet`;
  await logHistory(id, isPartial ? 'partial_assignment' : 'validated', detailMsg, user.id, actorName);

  try {
    const { notifyResourceRequestValidated } = await import('../notifications/notificationEvents');
    await notifyResourceRequestValidated(request);
  } catch (err) {
    console.warn('[CITYMO] notify resource validated', err);
  }

  if (request.staff_need_id) {
    try {
      const { syncNeedFromRhRequest } = await import('../projects/projectBesoins');
      await syncNeedFromRhRequest(request, {
        details: detailMsg,
        actorId: user.id,
        actorName,
      });
    } catch (err) {
      console.warn('[CITYMO] sync staff need after RH', err);
    }
  }

  await syncRequestCoverageStatut(id);
  return getResourceRequest(id);
}

export async function refuseResourceRequest(id, reason = '') {
  const user = await requireUser();
  const actorName = await getProfileName(user.id);
  const request = await getResourceRequest(id);
  if (!request) throw new Error('Demande introuvable.');

  const { error } = await getSupabase()
    .from(TABLE)
    .update({ statut: 'refusee', updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;

  const details = reason?.trim() ? `Refusée : ${reason.trim()}` : 'Demande refusée par le service RH';
  await logHistory(id, 'refused', details, user.id, actorName);

  if (request.staff_need_id) {
    try {
      const { syncNeedFromRhRequest } = await import('../projects/projectBesoins');
      await syncNeedFromRhRequest(request, {
        statut: 'refuse',
        details,
        actorId: user.id,
        actorName,
      });
    } catch (err) {
      console.warn('[CITYMO] sync need refuse', err);
    }
  }

  return getResourceRequest(id);
}

export async function createRecruitmentRequestFromRequest(id) {
  const user = await requireUser();
  const actorName = await getProfileName(user.id);
  const request = await getResourceRequest(id);
  if (!request) throw new Error('Demande introuvable.');
  if (request.request_type === 'recrutement') throw new Error('Impossible depuis une demande de recrutement.');

  const assigned = countAssignedWorkers(request);
  const manque = Math.max(0, (Number(request.quantite) || 0) - assigned);
  if (manque <= 0) throw new Error('Aucun poste manquant — recrutement non nécessaire.');

  const ref = await generateResourceRequestRef();
  const payload = {
    ref_demande: ref,
    project_id: request.project_id,
    project_ref: request.project_ref || '',
    project_name: request.project_name || '',
    fonction: request.fonction,
    quantite: manque,
    date_souhaitee: request.date_souhaitee || null,
    priorite: request.priorite || 'Normale',
    commentaire: `Recrutement — ${manque} ${request.fonction}(s) pour ${request.project_name}`,
    staff_need_id: request.staff_need_id || null,
    parent_request_id: request.id,
    request_type: 'recrutement',
    recruitment_statut: 'cree',
    statut: 'en_attente',
    requested_by: user.id,
    requested_by_name: actorName,
    assigned_by: user.id,
    assigned_by_name: actorName,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await getSupabase().from(TABLE).insert([payload]).select().single();
  if (error) throw error;

  await getSupabase()
    .from(TABLE)
    .update({ statut: 'recrutement_en_cours', updated_at: new Date().toISOString() })
    .eq('id', request.id);

  await logHistory(id, 'recruitment_created', `Demande recrutement ${ref} pour ${manque} poste(s)`, user.id, actorName);
  await logHistory(data.id, 'created', `Recrutement lié à ${request.ref}`, user.id, actorName);
  emitRhAssignmentsUpdated(request.project_id);

  if (request.staff_need_id) {
    try {
      const { syncNeedFromRhRequest } = await import('../projects/projectBesoins');
      await syncNeedFromRhRequest(request, {
        statut: 'recrutement_en_cours',
        details: `Demande de recrutement ${ref} créée pour ${manque} poste(s)`,
        actorId: user.id,
        actorName,
      });
    } catch (err) {
      console.warn('[CITYMO] sync need recruitment', err);
    }
  }

  return normalizeRequest(data);
}

export async function updateRecruitmentStatut(id, recruitmentStatut) {
  const user = await requireUser();
  const actorName = await getProfileName(user.id);
  const valid = RECRUITMENT_STATUTS.some((s) => s.value === recruitmentStatut);
  if (!valid) throw new Error('Statut recrutement invalide.');

  const { data, error } = await getSupabase()
    .from(TABLE)
    .update({
      recruitment_statut: recruitmentStatut,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;

  await logHistory(id, 'recruitment_status', `Recrutement → ${recruitmentStatutLabel(recruitmentStatut)}`, user.id, actorName);
  await syncRequestCoverageStatut(data.parent_request_id);
  return getResourceRequest(id);
}

export async function closeRecruitmentRequest(id) {
  return updateRecruitmentStatut(id, 'cloture');
}

export async function removeWorkerFromResourceRequest(requestId, workerId) {
  const user = await requireUser();
  const actorName = await getProfileName(user.id);
  const request = await getResourceRequest(requestId);
  if (!request) throw new Error('Demande introuvable.');

  const { error: delErr } = await getSupabase()
    .from(WORKERS_TABLE)
    .delete()
    .eq('request_id', requestId)
    .eq('worker_id', workerId);
  if (delErr) throw delErr;

  const updated = await getResourceRequest(requestId);
  const count = countAssignedWorkers(updated);
  const needed = Number(request.quantite) || 0;
  let newStatut = 'en_cours';
  if (count === 0) newStatut = 'en_attente';
  else if (count < needed) newStatut = 'partielle';
  else newStatut = 'affectee';

  await getSupabase()
    .from(TABLE)
    .update({ statut: newStatut, updated_at: new Date().toISOString() })
    .eq('id', requestId);

  try {
    await syncProjectTeamFromRhRequests(request.project_id, request.project_ref);
    emitRhAssignmentsUpdated(request.project_id);
  } catch (err) {
    console.warn('[CITYMO] sync project team after remove worker', err);
  }

  await logHistory(requestId, 'worker_removed', `Ouvrier retiré de la demande`, user.id, actorName);

  if (request.staff_need_id) {
    try {
      const { syncNeedFromRhRequest } = await import('../projects/projectBesoins');
      await syncNeedFromRhRequest(request, { actorId: user.id, actorName });
    } catch (err) {
      console.warn('[CITYMO] sync after remove worker', err);
    }
  }

  await syncRequestCoverageStatut(requestId);
  if (request.parent_request_id) await syncRequestCoverageStatut(request.parent_request_id);
  return getResourceRequest(requestId);
}

/** Supprime une demande RH et ses recrutements enfants (cascade workers/historique). */
export async function deleteResourceRequestTree(requestId) {
  if (!requestId) return;
  await requireUser();
  const { data: row } = await getSupabase()
    .from(TABLE)
    .select('project_id, project_ref')
    .eq('id', requestId)
    .maybeSingle();
  const projectId = row?.project_id;
  const projectRef = row?.project_ref || '';

  const { data: children, error: childQ } = await getSupabase()
    .from(TABLE)
    .select('id')
    .eq('parent_request_id', requestId);
  if (childQ) throw childQ;
  for (const child of children || []) {
    await deleteResourceRequestTree(child.id);
  }
  const { error } = await getSupabase().from(TABLE).delete().eq('id', requestId);
  if (error) throw error;

  if (projectId) {
    try {
      await syncProjectTeamFromRhRequests(projectId, projectRef);
      emitRhAssignmentsUpdated(projectId);
    } catch (err) {
      console.warn('[CITYMO] sync project team after delete request', err);
    }
  }
}

/** Supprime toutes les demandes RH liées à un besoin projet. */
export async function deleteResourceRequestsForStaffNeed(staffNeedId, { primaryRequestId = null } = {}) {
  if (!staffNeedId && !primaryRequestId) return;
  await requireUser();
  const ids = new Set();
  if (primaryRequestId) ids.add(primaryRequestId);
  if (staffNeedId) {
    const { data, error } = await getSupabase()
      .from(TABLE)
      .select('id')
      .eq('staff_need_id', staffNeedId);
    if (error) throw error;
    (data || []).forEach((r) => ids.add(r.id));
  }
  for (const id of ids) {
    await deleteResourceRequestTree(id);
  }
}

/** Suppression définitive depuis le module RH (demande + besoin projet lié). */
export async function deleteResourceRequest(id) {
  await requireUser();
  const request = await getResourceRequest(id);
  if (!request) throw new Error('Demande introuvable.');

  const staffNeedId = request.staff_need_id;
  const projectId = request.project_id;

  await deleteResourceRequestTree(id);

  if (staffNeedId) {
    const { error } = await getSupabase()
      .from('project_staff_needs')
      .delete()
      .eq('id', staffNeedId);
    if (error) console.warn('[CITYMO] delete staff need after RH request', error);
  }

  if (projectId) {
    try {
      const { syncProjectStaffNeedsCoverage } = await import('../projects/projectBesoins');
      await syncProjectStaffNeedsCoverage(projectId);
    } catch (err) {
      console.warn('[CITYMO] sync besoins after delete request', err);
    }
  }
}

export async function closeResourceRequest(id) {
  const user = await requireUser();
  const actorName = await getProfileName(user.id);
  const request = await getResourceRequest(id);
  const { error } = await getSupabase()
    .from(TABLE)
    .update({ statut: 'cloturee', updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
  await logHistory(id, 'closed', 'Demande clôturée', user.id, actorName);

  if (request?.staff_need_id) {
    try {
      const { syncNeedFromRhRequest } = await import('../projects/projectBesoins');
      await syncNeedFromRhRequest(request, {
        statut: 'clos',
        details: 'Besoin clôturé par le service RH',
        actorId: user.id,
        actorName,
      });
    } catch (err) {
      console.warn('[CITYMO] sync need close', err);
    }
  }

  return getResourceRequest(id);
}

/** Ouvriers disponibles pour affectation RH (tous actifs, filtrés par fonction). */
export async function listAvailableWorkersForFonction(fonction, projectId) {
  const all = await listWorkers();
  const f = (fonction || '').trim();

  if (f === 'Sous-traitants') return [];

  return (all || []).filter((w) => {
    if (w.statut === 'inactif') return false;
    if (f === 'Ouvriers') return isOuvrierFonction(w.fonction);
    if (f === 'Chef de chantier') return isChefChantierFonction(w.fonction);
    if (f === 'Chef de projet') return isChefProjetFonction(w.fonction);
    return normFonction(w.fonction) === normFonction(f)
      || normFonction(w.fonction).includes(normFonction(f));
  });
}

export function workerDisplayName(w) {
  return workerFullName(w) || `${w.prenom || ''} ${w.nom || ''}`.trim();
}

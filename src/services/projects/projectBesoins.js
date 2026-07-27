/**
 * projectBesoins.js — Demandes de ressources RH chantier (workflow complet)
 */
import { getSupabase } from '../../lib/supabase';
import { formatProfileDisplayName } from '../admin/users';
import { listWorkersByProject } from '../rh/workerProjectAssignments';
import { listAssignmentsByProject } from '../rh/subcontractors';
import {
  besoinStatutBadge,
  besoinStatutLabel,
  besoinFonctionLabel,
  canDeleteProjectNeed,
  deleteProjectNeedWarnMessage,
  canEditProjectNeed,
  isChefChantierFonction,
  isChefProjetFonction,
  isConducteurTravauxFonction,
  normBesoinFonction,
} from '../../constants/projectBesoins';

const TABLE = 'project_staff_needs';
const HISTORY = 'project_staff_need_history';

function matchWorkerToNeed(need, assignment) {
  const type = need.type_besoin || need.fonction;
  const wf = assignment.workerFonction || '';
  if (type === 'Ouvriers') {
    if (!need.corps_metier) return isOuvrierFonction(wf);
    return normBesoinFonction(wf) === normBesoinFonction(need.corps_metier);
  }
  if (type === 'Chef de chantier') return isChefChantierFonction(wf);
  if (type === 'Chef de projet') return isChefProjetFonction(wf);
  if (type === 'Conducteur de travaux') return isConducteurTravauxFonction(wf);
  if (type === 'Sous-traitants') return false;
  return normBesoinFonction(wf) === normBesoinFonction(type);
}

function isOuvrierFonction(f) {
  return !isChefChantierFonction(f) && !isChefProjetFonction(f) && !isConducteurTravauxFonction(f);
}

function countAssigned(need, ctx) {
  const { assignments, subAssignments, projectMeta } = ctx;
  const type = need.type_besoin || need.fonction;
  if (type === 'Chef de chantier' && projectMeta?.chef_chantier) return 1;
  if (type === 'Chef de projet' && projectMeta?.chef_projet) return 1;
  if (type === 'Sous-traitants') return (subAssignments || []).length;
  return (assignments || []).filter((a) => matchWorkerToNeed(need, a)).length;
}

function listAffected(need, ctx) {
  const { assignments, subAssignments, projectMeta } = ctx;
  const type = need.type_besoin || need.fonction;
  if (type === 'Chef de chantier' && projectMeta?.chef_chantier) return [projectMeta.chef_chantier];
  if (type === 'Chef de projet' && projectMeta?.chef_projet) return [projectMeta.chef_projet];
  if (type === 'Sous-traitants') {
    return (subAssignments || []).map((s) => s.subcontractorName).filter(Boolean);
  }
  return (assignments || [])
    .filter((a) => matchWorkerToNeed(need, a))
    .map((a) => a.workerName)
    .filter(Boolean);
}

function resolveCoverageStatut(need, assigned, manque) {
  if (['refuse', 'annule', 'clos', 'brouillon'].includes(need.statut)) return need.statut;
  if (manque === 0 && assigned > 0) return 'couvert';
  if (assigned > 0 && manque > 0) return 'partiellement_couvert';
  if (need.resource_request_id) return 'en_recherche_rh';
  return need.statut || 'brouillon';
}

export function enrichNeedRow(row, ctx, history = []) {
  const assigned = countAssigned(row, ctx);
  const need = Number(row.quantite_necessaire) || 0;
  const manque = Math.max(0, need - assigned);
  const statut = resolveCoverageStatut(row, assigned, manque);
  return {
    id: row.id,
    ref_besoin: row.ref_besoin || '',
    project_id: row.project_id,
    type_besoin: row.type_besoin || row.fonction || 'Ouvriers',
    fonction: besoinFonctionLabel(row),
    corps_metier: row.corps_metier || '',
    specialite: row.specialite || '',
    quantite_necessaire: need,
    quantite_affectee: assigned,
    manque,
    date_debut_souhaitee: row.date_debut_souhaitee || '',
    date_fin_estimee: row.date_fin_estimee || '',
    date_souhaitee: row.date_debut_souhaitee || '',
    duree_prevue: row.duree_prevue || '',
    priorite: row.priorite || 'Normale',
    responsable_demande: row.responsable_demande || '',
    description_travaux: row.description_travaux || '',
    competences: row.competences || '',
    epi_obligatoires: row.epi_obligatoires || '',
    observation: row.observation || row.notes || '',
    notes: row.notes || '',
    statut,
    statutLabel: besoinStatutLabel(statut),
    statutBadge: besoinStatutBadge(statut),
    resource_request_id: row.resource_request_id || null,
    ressources_affectees: listAffected(row, ctx),
    ouvriers_affectes: listAffected(row, ctx),
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
  return formatProfileDisplayName(data) || data.email || '';
}

async function loadHistory(needId) {
  const { data, error } = await getSupabase()
    .from(HISTORY)
    .select('*')
    .eq('need_id', needId)
    .order('created_at', { ascending: true });
  if (error) console.warn('[CITYMO] project_staff_need_history', error);
  return data || [];
}

async function logHistory(needId, action, details, actorId, actorName) {
  const { error } = await getSupabase().from(HISTORY).insert([{
    need_id: needId,
    action,
    details: details || null,
    actor_id: actorId || null,
    actor_name: actorName || null,
  }]);
  if (error) console.warn('[CITYMO] log need history', error);
}

export async function generateBesoinRef() {
  const year = new Date().getFullYear();
  const prefix = `BR-${year}-`;
  const { count, error } = await getSupabase()
    .from(TABLE)
    .select('*', { count: 'exact', head: true })
    .like('ref_besoin', `${prefix}%`);
  if (error) throw error;
  return `${prefix}${String((count || 0) + 1).padStart(3, '0')}`;
}

async function loadContext(projectId, projectMeta) {
  const [assignments, subAssignments] = await Promise.all([
    listWorkersByProject(projectId),
    listAssignmentsByProject(projectId).catch(() => []),
  ]);
  return { assignments, subAssignments, projectMeta };
}

export async function listProjectStaffNeeds(projectId, projectMeta = null) {
  if (!projectId) return [];
  await requireUser();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const ctx = await loadContext(projectId, projectMeta);
  return (data || []).map((row) => enrichNeedRow(row, ctx));
}

export async function getProjectStaffNeed(id, projectMeta = null) {
  await requireUser();
  const { data, error } = await getSupabase().from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const ctx = await loadContext(data.project_id, projectMeta);
  const history = await loadHistory(id);
  return enrichNeedRow(data, ctx, history);
}

function toDbPayload(projectId, form, userId) {
  const type = form.type_besoin?.trim() || 'Ouvriers';
  const corps = form.corps_metier?.trim() || null;
  return {
    project_id: projectId,
    type_besoin: type,
    fonction: type === 'Ouvriers' ? (corps || 'Ouvrier') : type,
    corps_metier: type === 'Ouvriers' ? corps : null,
    specialite: form.specialite?.trim() || null,
    quantite_necessaire: Math.max(1, Number(form.quantite_necessaire) || 1),
    date_debut_souhaitee: form.date_debut_souhaitee || null,
    date_fin_estimee: form.date_fin_estimee || null,
    duree_prevue: form.duree_prevue?.trim() || null,
    priorite: form.priorite || 'Normale',
    responsable_demande: form.responsable_demande?.trim() || null,
    description_travaux: form.description_travaux?.trim() || null,
    competences: form.competences?.trim() || null,
    epi_obligatoires: form.epi_obligatoires?.trim() || null,
    observation: form.observation?.trim() || null,
    notes: form.observation?.trim() || null,
    statut: form.statut || 'brouillon',
    updated_at: new Date().toISOString(),
    created_by: userId,
  };
}

async function findOpenDuplicateNeed(projectId, form) {
  const type = form.type_besoin || form.fonction || 'Ouvriers';
  const corps = (form.corps_metier || '').trim();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('id, ref_besoin, type_besoin, corps_metier, statut, resource_request_id, date_debut_souhaitee')
    .eq('project_id', projectId)
    .not('statut', 'in', '("clos","annule","refuse","couvert")');
  if (error) throw error;
  const date = form.date_debut_souhaitee || null;
  return (data || []).find((row) => {
    if ((row.type_besoin || '') !== type) return false;
    if (type === 'Ouvriers' && normBesoinFonction(row.corps_metier) !== normBesoinFonction(corps)) return false;
    if (type !== 'Ouvriers' && corps && normBesoinFonction(row.corps_metier) !== normBesoinFonction(corps)) return false;
    if (date && row.date_debut_souhaitee && String(row.date_debut_souhaitee).slice(0, 10) !== String(date).slice(0, 10)) {
      return false;
    }
    return true;
  }) || null;
}

export async function createProjectStaffNeed(projectId, form, { submit = false, projet = null } = {}) {
  if (!projectId) throw new Error('Projet requis.');
  const user = await requireUser();
  const actorName = await getProfileName(user.id);

  const dup = await findOpenDuplicateNeed(projectId, form);
  if (dup) {
    throw new Error(
      `Un besoin ouvert existe déjà (${dup.ref_besoin || 'sans réf'}) pour cette fonction. `
      + 'Modifiez-le ou soumettez-le à la RH au lieu d’en créer un second.',
    );
  }

  const ref = await generateBesoinRef();
  const payload = {
    ...toDbPayload(projectId, form, user.id),
    ref_besoin: ref,
    statut: submit ? 'soumis' : (form.statut || 'brouillon'),
  };
  const { data, error } = await getSupabase().from(TABLE).insert([payload]).select().single();
  if (error) throw error;
  await logHistory(
    data.id,
    submit ? 'soumis' : 'created',
    submit ? 'Besoin soumis au service RH' : 'Besoin créé en brouillon',
    user.id,
    actorName,
  );
  let need = await getProjectStaffNeed(data.id);
  if (submit && projet) {
    try {
      need = await submitNeedToRh(need, projet, user.id, actorName);
    } catch (err) {
      // Évite les orphelins / doublons : rollback si la transmission RH échoue
      await getSupabase().from(TABLE).delete().eq('id', data.id);
      throw new Error(
        `Transmission RH impossible (${err.message || 'erreur'}). `
        + 'Le besoin n’a pas été enregistré — vérifiez les droits « Demandes ressources ».',
      );
    }
  } else if (submit && !projet) {
    await getSupabase().from(TABLE).delete().eq('id', data.id);
    throw new Error('Projet manquant — impossible de transmettre le besoin à la RH.');
  }
  return need;
}

export async function updateProjectStaffNeed(id, form, { submit = false, projet = null } = {}) {
  const user = await requireUser();
  const actorName = await getProfileName(user.id);
  const existing = await getProjectStaffNeed(id);
  if (!existing) throw new Error('Besoin introuvable.');
  if (!canEditProjectNeed(existing) && !submit) {
    throw new Error('Ce besoin ne peut plus être modifié — traitement RH en cours.');
  }
  if (['clos', 'refuse', 'annule', 'couvert'].includes(existing.statut)) {
    throw new Error('Ce besoin ne peut plus être modifié.');
  }
  const payload = {
    ...toDbPayload(existing.project_id, form, user.id),
    statut: submit ? 'soumis' : (form.statut || existing.statut),
  };
  delete payload.created_by;
  const { error } = await getSupabase().from(TABLE).update(payload).eq('id', id);
  if (error) throw error;
  await logHistory(id, submit ? 'soumis' : 'updated', submit ? 'Besoin soumis au service RH' : 'Besoin modifié', user.id, actorName);
  let need = await getProjectStaffNeed(id);
  if (submit && projet) {
    try {
      need = await submitNeedToRh(need, projet, user.id, actorName);
    } catch (err) {
      await getSupabase()
        .from(TABLE)
        .update({ statut: existing.statut === 'brouillon' ? 'brouillon' : existing.statut, updated_at: new Date().toISOString() })
        .eq('id', id);
      throw new Error(
        `Transmission RH impossible (${err.message || 'erreur'}). `
        + 'Le besoin n’a pas été transmis — réessayez ou contactez un admin.',
      );
    }
  } else if (submit && !projet) {
    throw new Error('Projet manquant — impossible de transmettre le besoin à la RH.');
  } else {
    await syncProjectStaffNeedsCoverage(existing.project_id);
  }
  return need;
}

async function submitNeedToRh(need, projet, userId, actorName) {
  if (need.resource_request_id) return need;
  const req = await createRhRequestFromNeed(need, projet);
  await logHistory(need.id, 'rh_request', `Demande RH ${req.ref || req.ref_demande || ''} générée automatiquement`, userId, actorName);
  return getProjectStaffNeed(need.id);
}

export async function submitProjectStaffNeed(id, projet = null) {
  const existing = await getProjectStaffNeed(id);
  if (!existing) throw new Error('Besoin introuvable.');
  if (existing.statut !== 'brouillon') throw new Error('Seuls les brouillons peuvent être soumis.');
  return updateProjectStaffNeed(id, existing, { submit: true, projet });
}

export async function updateProjectStaffNeedStatut(id, statut, details = '') {
  const user = await requireUser();
  const actorName = await getProfileName(user.id);
  const { data: row, error } = await getSupabase()
    .from(TABLE)
    .update({ statut, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('project_id')
    .single();
  if (error) throw error;
  await logHistory(id, 'status_changed', details || `Statut → ${besoinStatutLabel(statut)}`, user.id, actorName);
  return getProjectStaffNeed(id);
}

export async function deleteProjectStaffNeed(id) {
  await requireUser();
  const existing = await getProjectStaffNeed(id);
  if (!existing) throw new Error('Besoin introuvable.');
  if (!canDeleteProjectNeed(existing)) {
    throw new Error('Ce besoin ne peut pas être supprimé.');
  }

  const { deleteResourceRequestsForStaffNeed } = await import('../rh/resourceRequests');
  await deleteResourceRequestsForStaffNeed(existing.id, {
    primaryRequestId: existing.resource_request_id || null,
  });

  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) throw error;

  try {
    const { syncProjectTeamFromRhRequests } = await import('../rh/workerProjectAssignments');
    await syncProjectTeamFromRhRequests(existing.project_id);
  } catch (err) {
    console.warn('[CITYMO] sync project team after delete need', err);
  }
}

export async function syncProjectStaffNeedsCoverage(projectId, projectMeta = null) {
  if (!projectId) return [];
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .eq('project_id', projectId);
  if (error) throw error;
  const ctx = await loadContext(projectId, projectMeta);
  for (const row of data || []) {
    if (['refuse', 'annule', 'clos', 'brouillon'].includes(row.statut)) continue;
    const assigned = countAssigned(row, ctx);
    const manque = Math.max(0, (Number(row.quantite_necessaire) || 0) - assigned);
    const newStatut = resolveCoverageStatut(row, assigned, manque);
    if (newStatut !== row.statut) {
      await getSupabase()
        .from(TABLE)
        .update({ statut: newStatut, updated_at: new Date().toISOString() })
        .eq('id', row.id);
      await logHistory(row.id, 'auto_sync', `Couverture mise à jour — ${assigned} affecté(s), manque ${manque}`);
    }
  }
  return listProjectStaffNeeds(projectId, projectMeta);
}

export async function createRhRequestFromNeed(need, projet) {
  // Préférer la RPC SECURITY DEFINER (contourne le blocage RLS demandes-ressources)
  try {
    const { data: rpcData, error: rpcError } = await getSupabase()
      .rpc('submit_staff_need_to_rh', { p_need_id: need.id });
    if (!rpcError && rpcData?.id) {
      return {
        id: rpcData.id,
        ref: rpcData.ref_demande || '',
        ref_demande: rpcData.ref_demande || '',
      };
    }
    if (rpcError && !/function|does not exist|404/i.test(rpcError.message || '')) {
      throw rpcError;
    }
  } catch (err) {
    if (!/function|does not exist|404/i.test(err.message || '')) throw err;
  }

  const { createResourceRequest } = await import('../rh/resourceRequests');
  const commentaire = [
    need.description_travaux,
    need.competences ? `Compétences : ${need.competences}` : '',
    need.epi_obligatoires ? `EPI : ${need.epi_obligatoires}` : '',
    need.observation,
  ].filter(Boolean).join('\n');

  const req = await createResourceRequest({
    project: projet || { id: need.project_id },
    fonction: need.type_besoin === 'Ouvriers' ? (need.corps_metier || 'Ouvrier') : need.type_besoin,
    quantite: need.quantite_necessaire,
    date_souhaitee: need.date_debut_souhaitee,
    priorite: need.priorite,
    commentaire,
    staff_need_id: need.id,
  });

  await getSupabase()
    .from(TABLE)
    .update({
      resource_request_id: req.id,
      statut: 'en_recherche_rh',
      updated_at: new Date().toISOString(),
    })
    .eq('id', need.id);

  return req;
}

/**
 * Relie les besoins "soumis" sans resource_request_id vers Demandes ressources.
 * À appeler au chargement RH / projets pour réparer les orphelins.
 */
export async function repairOrphanStaffNeedsToRh({ projectId = null } = {}) {
  await requireUser();
  let q = getSupabase()
    .from(TABLE)
    .select('id, project_id, ref_besoin, type_besoin, corps_metier, quantite_necessaire, date_debut_souhaitee, priorite, description_travaux, competences, epi_obligatoires, observation, statut, resource_request_id')
    .is('resource_request_id', null)
    .in('statut', ['soumis', 'en_recherche_rh']);
  if (projectId) q = q.eq('project_id', projectId);
  const { data, error } = await q.order('created_at', { ascending: true });
  if (error) throw error;

  const repaired = [];
  const failures = [];
  for (const row of data || []) {
    try {
      let projet = { id: row.project_id };
      const { data: proj } = await getSupabase()
        .from('projects')
        .select('id, nom, ref')
        .eq('id', row.project_id)
        .maybeSingle();
      if (proj) projet = proj;
      const req = await createRhRequestFromNeed(
        enrichNeedRow(row, { assignments: [], subAssignments: [], projectMeta: {} }),
        projet,
      );
      repaired.push({ needId: row.id, ref: row.ref_besoin, requestId: req.id, requestRef: req.ref || req.ref_demande });
    } catch (err) {
      failures.push({ needId: row.id, ref: row.ref_besoin, error: err.message || String(err) });
    }
  }
  return { repaired, failures, scanned: (data || []).length };
}

export async function syncNeedFromRhRequest(request, { statut, details, actorId, actorName } = {}) {
  if (!request?.staff_need_id) return;
  const updates = { updated_at: new Date().toISOString() };
  if (statut) updates.statut = statut;
  await getSupabase().from(TABLE).update(updates).eq('id', request.staff_need_id);
  if (details) {
    await logHistory(request.staff_need_id, 'rh_sync', details, actorId, actorName);
  }
  if (request.project_id) {
    await syncProjectStaffNeedsCoverage(request.project_id);
  }
}

export function computeBesoinStats(needs = []) {
  const open = needs.filter((n) => !['clos', 'annule', 'refuse'].includes(n.statut));
  const totalDemandes = open.reduce((s, n) => s + (Number(n.quantite_necessaire) || 0), 0);
  const totalAffectes = open.reduce((s, n) => s + (Number(n.quantite_affectee) || 0), 0);
  const ouverts = open.length;
  const urgents = needs.filter((n) => ['Urgente', 'Critique'].includes(n.priorite) && !['clos', 'annule', 'couvert'].includes(n.statut)).length;
  const taux = totalDemandes > 0 ? Math.round((totalAffectes / totalDemandes) * 100) : 0;
  return { total: needs.length, totalDemandes, totalAffectes, ouverts, urgents, taux };
}

/** @deprecated */
export async function upsertProjectStaffNeed(projectId, form) {
  return createProjectStaffNeed(projectId, form);
}

export function computeStaffNeedStatus(q, a) {
  const manque = Math.max(0, (Number(q) || 0) - (Number(a) || 0));
  return { quantite_affectee: a, manque, statut: manque === 0 ? 'couvert' : (a > 0 ? 'partiel' : 'manque') };
}

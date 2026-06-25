/**
 * projectBesoins.js — Besoins RH projet (chefs, ouvriers, sous-traitants)
 */
import { getSupabase } from '../../lib/supabase';
import { listWorkersByProject } from '../rh/workerProjectAssignments';
import { listAssignmentsByProject } from '../rh/subcontractors';
import {
  BESOIN_STAFF_STATUTS,
  isChefChantierFonction,
  isChefProjetFonction,
  isOuvrierFonction,
  normBesoinFonction,
} from '../../constants/projectBesoins';

const STAFF_TABLE = 'project_staff_needs';

export function computeStaffNeedStatus(quantiteNecessaire, quantiteAffectee) {
  const need = Number(quantiteNecessaire) || 0;
  const assigned = Number(quantiteAffectee) || 0;
  const manque = Math.max(0, need - assigned);
  let key = 'couvert';
  if (manque > 0 && assigned > 0) key = 'partiel';
  else if (manque > 0) key = 'manque';
  return {
    quantite_affectee: assigned,
    manque,
    statut: key,
    statutLabel: BESOIN_STAFF_STATUTS[key]?.label || key,
    statutBadge: BESOIN_STAFF_STATUTS[key]?.badge || 'badge-grey',
  };
}

function countAssignedForRhType(fonction, { assignments, subAssignments, projectMeta }) {
  const f = (fonction || '').trim();
  if (f === 'Chef de chantier') {
    if (projectMeta?.chef_chantier) return 1;
    return assignments.filter((a) => isChefChantierFonction(a.workerFonction)).length;
  }
  if (f === 'Chef de projet') {
    if (projectMeta?.chef_projet) return 1;
    return assignments.filter((a) => isChefProjetFonction(a.workerFonction)).length;
  }
  if (f === 'Ouvriers') {
    return assignments.filter((a) => isOuvrierFonction(a.workerFonction)).length;
  }
  if (f === 'Sous-traitants') {
    return (subAssignments || []).length;
  }
  return assignments.filter((a) => normBesoinFonction(a.workerFonction) === normBesoinFonction(f)).length;
}

function listAffectedForRhType(fonction, { assignments, subAssignments, projectMeta }) {
  const f = (fonction || '').trim();
  if (f === 'Chef de chantier') {
    if (projectMeta?.chef_chantier) return [projectMeta.chef_chantier];
    return assignments.filter((a) => isChefChantierFonction(a.workerFonction)).map((a) => a.workerName).filter(Boolean);
  }
  if (f === 'Chef de projet') {
    if (projectMeta?.chef_projet) return [projectMeta.chef_projet];
    return assignments.filter((a) => isChefProjetFonction(a.workerFonction)).map((a) => a.workerName).filter(Boolean);
  }
  if (f === 'Ouvriers') {
    return assignments.filter((a) => isOuvrierFonction(a.workerFonction)).map((a) => a.workerName).filter(Boolean);
  }
  if (f === 'Sous-traitants') {
    return (subAssignments || []).map((s) => s.subcontractorName).filter(Boolean);
  }
  return assignments
    .filter((a) => normBesoinFonction(a.workerFonction) === normBesoinFonction(f))
    .map((a) => a.workerName)
    .filter(Boolean);
}

async function requireUser() {
  const { data: { user }, error } = await getSupabase().auth.getUser();
  if (error || !user) throw new Error('Session requise.');
  return user;
}

export async function listProjectStaffNeeds(projectId, projectMeta = null) {
  if (!projectId) return [];
  await requireUser();
  const [needsRes, assignments, subAssignments] = await Promise.all([
    getSupabase().from(STAFF_TABLE).select('*').eq('project_id', projectId).order('fonction'),
    listWorkersByProject(projectId),
    listAssignmentsByProject(projectId).catch(() => []),
  ]);
  if (needsRes.error) throw needsRes.error;

  const ctx = { assignments, subAssignments, projectMeta };

  return (needsRes.data || []).map((row) => {
    const assigned = countAssignedForRhType(row.fonction, ctx);
    const calc = computeStaffNeedStatus(row.quantite_necessaire, assigned);
    return {
      id: row.id,
      project_id: row.project_id,
      fonction: row.fonction,
      quantite_necessaire: row.quantite_necessaire,
      notes: row.notes || '',
      ressources_affectees: listAffectedForRhType(row.fonction, ctx),
      ouvriers_affectes: listAffectedForRhType(row.fonction, ctx),
      ...calc,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  });
}

export async function upsertProjectStaffNeed(projectId, { fonction, quantite_necessaire, notes }) {
  if (!projectId || !fonction?.trim()) throw new Error('Projet et type de besoin requis.');
  const user = await requireUser();
  const payload = {
    project_id: projectId,
    fonction: fonction.trim(),
    quantite_necessaire: Math.max(0, Number(quantite_necessaire) || 0),
    notes: notes?.trim() || null,
    updated_at: new Date().toISOString(),
    created_by: user.id,
  };
  const { data, error } = await getSupabase()
    .from(STAFF_TABLE)
    .upsert(payload, { onConflict: 'project_id,fonction' })
    .select()
    .single();
  if (error) throw error;
  const list = await listProjectStaffNeeds(projectId);
  return list.find((n) => n.id === data.id) || data;
}

export async function deleteProjectStaffNeed(id, projectId, projectMeta = null) {
  await requireUser();
  const { error } = await getSupabase().from(STAFF_TABLE).delete().eq('id', id);
  if (error) throw error;
  return listProjectStaffNeeds(projectId, projectMeta);
}

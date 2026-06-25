/**
 * projectBesoins.js — Besoins chantier (RH, matériels, matériaux)
 */
import { getSupabase } from '../../lib/supabase';
import { listWorkersByProject } from '../rh/workerProjectAssignments';
import { BESOIN_STAFF_STATUTS } from '../../constants/projectBesoins';

const STAFF_TABLE = 'project_staff_needs';
const EQUIP_TABLE = 'project_equipment_needs';
const MAT_TABLE = 'project_material_needs';

function normFonction(s) {
  return (s || '').trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}

function countAssignedByFonction(assignments, fonction) {
  const target = normFonction(fonction);
  return (assignments || []).filter(
    (a) => normFonction(a.workerFonction) === target,
  ).length;
}

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

async function requireUser() {
  const { data: { user }, error } = await getSupabase().auth.getUser();
  if (error || !user) throw new Error('Session requise.');
  return user;
}

export async function listProjectStaffNeeds(projectId) {
  if (!projectId) return [];
  await requireUser();
  const [needsRes, assignments] = await Promise.all([
    getSupabase().from(STAFF_TABLE).select('*').eq('project_id', projectId).order('fonction'),
    listWorkersByProject(projectId),
  ]);
  if (needsRes.error) throw needsRes.error;

  const workersByFonction = {};
  (assignments || []).forEach((a) => {
    const f = a.workerFonction || '—';
    if (!workersByFonction[f]) workersByFonction[f] = [];
    workersByFonction[f].push(a.workerName);
  });

  return (needsRes.data || []).map((row) => {
    const assigned = countAssignedByFonction(assignments, row.fonction);
    const calc = computeStaffNeedStatus(row.quantite_necessaire, assigned);
    return {
      id: row.id,
      project_id: row.project_id,
      fonction: row.fonction,
      quantite_necessaire: row.quantite_necessaire,
      notes: row.notes || '',
      ouvriers_affectes: workersByFonction[row.fonction] || [],
      ...calc,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  });
}

export async function upsertProjectStaffNeed(projectId, { fonction, quantite_necessaire, notes }) {
  if (!projectId || !fonction?.trim()) throw new Error('Projet et fonction requis.');
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

export async function deleteProjectStaffNeed(id, projectId) {
  await requireUser();
  const { error } = await getSupabase().from(STAFF_TABLE).delete().eq('id', id);
  if (error) throw error;
  return listProjectStaffNeeds(projectId);
}

export async function listProjectEquipmentNeeds(projectId) {
  if (!projectId) return [];
  await requireUser();
  const { data, error } = await getSupabase()
    .from(EQUIP_TABLE)
    .select('*')
    .eq('project_id', projectId)
    .order('equipement');
  if (error) throw error;
  return (data || []).map((row) => ({
    id: row.id,
    project_id: row.project_id,
    equipement: row.equipement,
    quantite_necessaire: row.quantite_necessaire,
    quantite_disponible: row.quantite_disponible,
    manque: Math.max(0, Number(row.quantite_necessaire) - Number(row.quantite_disponible)),
    notes: row.notes || '',
    created_at: row.created_at,
  }));
}

export async function saveProjectEquipmentNeed(projectId, form, id = null) {
  if (!projectId || !form.equipement?.trim()) throw new Error('Équipement requis.');
  const user = await requireUser();
  const payload = {
    project_id: projectId,
    equipement: form.equipement.trim(),
    quantite_necessaire: Math.max(0, Number(form.quantite_necessaire) || 0),
    quantite_disponible: Math.max(0, Number(form.quantite_disponible) || 0),
    notes: form.notes?.trim() || null,
    updated_at: new Date().toISOString(),
    created_by: user.id,
  };
  if (id) {
    const { error } = await getSupabase().from(EQUIP_TABLE).update(payload).eq('id', id);
    if (error) throw error;
  } else {
    const { error } = await getSupabase().from(EQUIP_TABLE).insert([payload]);
    if (error) throw error;
  }
  return listProjectEquipmentNeeds(projectId);
}

export async function deleteProjectEquipmentNeed(id, projectId) {
  await requireUser();
  const { error } = await getSupabase().from(EQUIP_TABLE).delete().eq('id', id);
  if (error) throw error;
  return listProjectEquipmentNeeds(projectId);
}

export async function listProjectMaterialNeeds(projectId) {
  if (!projectId) return [];
  await requireUser();
  const { data, error } = await getSupabase()
    .from(MAT_TABLE)
    .select('*')
    .eq('project_id', projectId)
    .order('materiau');
  if (error) throw error;
  return data || [];
}

export async function saveProjectMaterialNeed(projectId, form, id = null) {
  if (!projectId || !form.materiau?.trim()) throw new Error('Matériau requis.');
  const user = await requireUser();
  const payload = {
    project_id: projectId,
    materiau: form.materiau.trim(),
    quantite_necessaire: Number(form.quantite_necessaire) || 0,
    unite: form.unite?.trim() || 'u',
    devis_ref: form.devis_ref?.trim() || null,
    statut: form.statut || 'prevu',
    notes: form.notes?.trim() || null,
    updated_at: new Date().toISOString(),
    created_by: user.id,
  };
  if (id) {
    const { error } = await getSupabase().from(MAT_TABLE).update(payload).eq('id', id);
    if (error) throw error;
  } else {
    const { error } = await getSupabase().from(MAT_TABLE).insert([payload]);
    if (error) throw error;
  }
  return listProjectMaterialNeeds(projectId);
}

export async function deleteProjectMaterialNeed(id, projectId) {
  await requireUser();
  const { error } = await getSupabase().from(MAT_TABLE).delete().eq('id', id);
  if (error) throw error;
  return listProjectMaterialNeeds(projectId);
}

/**
 * fabricationLibrary.js — Bibliothèque « Plans / Projets » (plans réutilisables)
 */
import { getSupabase } from '../../lib/supabase';
import { formatProfileDisplayName } from '../admin/users';
import { formatSupabaseError } from '../supabase/formatError';
import { FAB_SUIVI_STATUTS } from '../../constants/fabrication';
import {
  uploadLibraryPlanFile,
  removeFabricationStorage,
  signFabricationPaths,
} from './fabricationStorage';

const LIB = 'fabrication_library_plans';
const FILES = 'fabrication_library_files';
const PROD = 'fabrication_plans';

const SCHEMA_HINT = 'Tables Fabrication V2 absentes — exécutez supabase/RUN_FABRICATION_V2.sql dans Supabase (SQL Editor).';

function libError(error) {
  if (error?.code === '42P01') {
    const err = new Error(SCHEMA_HINT);
    err.code = 'SCHEMA';
    return err;
  }
  return new Error(formatSupabaseError(error, 'Erreur bibliothèque de plans.'));
}

async function requireUser() {
  const { data: { user }, error } = await getSupabase().auth.getUser();
  if (error || !user) {
    const err = new Error('Session requise.');
    err.code = 'AUTH';
    throw err;
  }
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

/** Disponible / En production / Terminé — calculé depuis les productions liées (brouillons exclus). */
export function computeLibraryStatut(productions = []) {
  const active = productions.filter((p) => p.statut !== 'brouillon');
  if (active.some((p) => FAB_SUIVI_STATUTS.includes(p.statut))) return 'en_production';
  if (active.some((p) => p.statut === 'termine')) return 'termine';
  return 'disponible';
}

function normalizeFile(row, url = '') {
  return {
    id: row.id,
    library_plan_id: row.library_plan_id,
    storage_path: row.storage_path,
    file_name: row.file_name || '',
    mime_type: row.mime_type || '',
    file_size: Number(row.file_size || 0),
    project_document_id: row.project_document_id || null,
    created_at: row.created_at,
    url,
  };
}

function normalizeLibraryPlan(row, files = [], productions = []) {
  if (!row) return null;
  return {
    id: row.id,
    reference: row.reference || '',
    nom: row.nom || '',
    project_id: row.project_id || null,
    projet_nom: row.projet_nom || '',
    projet_ref: row.projet_ref || '',
    client_nom: row.client_nom || '',
    designation: row.designation || '',
    atelier: row.atelier || '',
    machine_type: row.machine_type || '',
    observations: row.observations || '',
    source: row.source || 'manuel',
    commentaire_transmission: row.commentaire_transmission || '',
    created_by: row.created_by || null,
    created_by_nom: row.created_by_nom || '',
    created_at: row.created_at,
    updated_at: row.updated_at,
    files,
    productions,
    statut: computeLibraryStatut(productions),
  };
}

async function loadFilesByPlan(planIds) {
  if (!planIds.length) return {};
  const { data, error } = await getSupabase()
    .from(FILES)
    .select('*')
    .in('library_plan_id', planIds)
    .order('created_at', { ascending: true });
  if (error) throw libError(error);
  const rows = data || [];
  const urls = await signFabricationPaths(rows.map((r) => r.storage_path));
  const byPlan = {};
  rows.forEach((r) => {
    (byPlan[r.library_plan_id] ||= []).push(normalizeFile(r, urls[r.storage_path] || ''));
  });
  return byPlan;
}

async function loadProductionsByPlan(planIds) {
  if (!planIds.length) return {};
  const { data, error } = await getSupabase()
    .from(PROD)
    .select('id, reference, designation, statut, atelier, avancement, date_fin_prevue, library_plan_id')
    .in('library_plan_id', planIds)
    .order('created_at', { ascending: false });
  if (error) throw libError(error);
  const byPlan = {};
  (data || []).forEach((r) => {
    (byPlan[r.library_plan_id] ||= []).push(r);
  });
  return byPlan;
}

export async function listLibraryPlans() {
  await requireUser();
  const { data, error } = await getSupabase()
    .from(LIB)
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw libError(error);
  const rows = data || [];
  const ids = rows.map((r) => r.id);
  const [files, prods] = await Promise.all([loadFilesByPlan(ids), loadProductionsByPlan(ids)]);
  return rows.map((r) => normalizeLibraryPlan(r, files[r.id] || [], prods[r.id] || []));
}

export async function getLibraryPlan(id) {
  if (!id) return null;
  await requireUser();
  const { data, error } = await getSupabase().from(LIB).select('*').eq('id', id).maybeSingle();
  if (error) throw libError(error);
  if (!data) return null;
  const [files, prods] = await Promise.all([loadFilesByPlan([id]), loadProductionsByPlan([id])]);
  return normalizeLibraryPlan(data, files[id] || [], prods[id] || []);
}

export async function generateLibraryRef() {
  const year = new Date().getFullYear();
  const prefix = `PLN-${year}-`;
  const { data, error } = await getSupabase()
    .from(LIB)
    .select('reference')
    .like('reference', `${prefix}%`)
    .order('reference', { ascending: false })
    .limit(50);
  if (error) throw libError(error);
  let max = 0;
  (data || []).forEach((r) => {
    const m = String(r.reference || '').match(/PLN-\d{4}-(\d+)/i);
    if (m) max = Math.max(max, Number(m[1]));
  });
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
}

/** Projets existants pour la liste « Projet associé » (client repris du projet). */
export async function listProjectsForFabrication() {
  await requireUser();
  const { data, error } = await getSupabase()
    .from('projects')
    .select('id, ref, nom, client_nom, statut')
    .order('nom', { ascending: true });
  if (error) {
    console.warn('[CITYMO] fabrication projects', error.message);
    return [];
  }
  return data || [];
}

async function insertFileRow({ planId, userId, storage_path, file_name, mime_type, file_size, project_document_id }) {
  const { error } = await getSupabase().from(FILES).insert([{
    library_plan_id: planId,
    storage_path,
    file_name: file_name || '',
    mime_type: mime_type || null,
    file_size: file_size || null,
    project_document_id: project_document_id || null,
    created_by: userId,
  }]);
  if (error) throw libError(error);
}

async function addFiles(planId, userId, files = [], strict = true) {
  for (const file of files) {
    if (!file) continue;
    const storage_path = await uploadLibraryPlanFile(planId, file, { strict });
    await insertFileRow({
      planId,
      userId,
      storage_path,
      file_name: file.name,
      mime_type: file.type,
      file_size: file.size,
    });
  }
}

function projectFields(project) {
  return {
    project_id: project?.id || null,
    projet_nom: project?.nom || '',
    projet_ref: project?.ref || '',
    client_nom: project?.client_nom || '',
  };
}

function cleanAtelier(atelier, machine) {
  return {
    atelier: atelier || null,
    machine_type: atelier === 'machinerie' ? (machine || null) : null,
  };
}

export async function createLibraryPlan({
  nom,
  project,
  designation,
  atelier,
  machine_type,
  observations,
  files = [],
  existingDocument = null,
  source = 'manuel',
  commentaire_transmission = '',
}) {
  const user = await requireUser();
  const nomClean = String(nom || '').trim();
  if (!nomClean) throw new Error('Le nom du plan est obligatoire.');
  if (!project?.id) throw new Error('Le projet associé est obligatoire.');

  const [reference, userName] = await Promise.all([generateLibraryRef(), getProfileName(user.id)]);
  const { data, error } = await getSupabase()
    .from(LIB)
    .insert([{
      reference,
      nom: nomClean,
      ...projectFields(project),
      designation: String(designation || '').trim(),
      ...cleanAtelier(atelier, machine_type),
      observations: String(observations || '').trim(),
      source,
      commentaire_transmission: String(commentaire_transmission || '').trim(),
      created_by: user.id,
      created_by_nom: userName,
      updated_by: user.id,
    }])
    .select('*')
    .single();
  if (error) throw libError(error);

  if (existingDocument?.storage_path) {
    await insertFileRow({
      planId: data.id,
      userId: user.id,
      storage_path: existingDocument.storage_path,
      file_name: existingDocument.file_name,
      mime_type: existingDocument.mime_type,
      file_size: existingDocument.file_size,
      project_document_id: existingDocument.id,
    });
  }
  await addFiles(data.id, user.id, files, source !== 'projets');
  return getLibraryPlan(data.id);
}

export async function updateLibraryPlan(id, {
  nom,
  project,
  designation,
  atelier,
  machine_type,
  observations,
  newFiles = [],
  removeFileIds = [],
}) {
  const user = await requireUser();
  const nomClean = String(nom || '').trim();
  if (!nomClean) throw new Error('Le nom du plan est obligatoire.');
  if (!project?.id) throw new Error('Le projet associé est obligatoire.');

  const { error } = await getSupabase()
    .from(LIB)
    .update({
      nom: nomClean,
      ...projectFields(project),
      designation: String(designation || '').trim(),
      ...cleanAtelier(atelier, machine_type),
      observations: String(observations || '').trim(),
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw libError(error);

  if (removeFileIds.length) {
    const { data: rows } = await getSupabase()
      .from(FILES)
      .select('id, storage_path, project_document_id')
      .in('id', removeFileIds)
      .eq('library_plan_id', id);
    const { error: delErr } = await getSupabase()
      .from(FILES)
      .delete()
      .in('id', removeFileIds)
      .eq('library_plan_id', id);
    if (delErr) throw libError(delErr);
    /* Les documents du projet restent intacts : seuls les fichiers propres à la bibliothèque sont effacés. */
    await removeFabricationStorage((rows || [])
      .filter((r) => !r.project_document_id && String(r.storage_path).startsWith('fabrication/library/'))
      .map((r) => r.storage_path));
  }
  await addFiles(id, user.id, newFiles);
  return getLibraryPlan(id);
}

export { SCHEMA_HINT as LIBRARY_SCHEMA_HINT };

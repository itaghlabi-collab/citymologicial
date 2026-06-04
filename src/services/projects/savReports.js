/**
 * savReports.js — Comptes rendus SAV
 */
import { getSupabase } from '../../lib/supabase';
import {
  uploadSavReportFile,
  uploadSavReportSignature,
  deleteProjectStorageFiles,
} from './savReportStorage';

function parseJsonPhotos(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const TABLE = 'sav_reports';

const SELECT = `
  *,
  sav_requests ( id, ref, titre, projet_nom, client_nom ),
  projects ( id, ref, nom )
`;

export function normalizeSavReport(row) {
  if (!row) return null;
  const sav = row.sav_requests;
  const p = row.projects;
  return {
    id: row.id,
    ref: row.ref || '',
    sav_request_id: row.sav_request_id ? String(row.sav_request_id) : '',
    project_id: row.project_id ? String(row.project_id) : '',
    sav_lie: row.sav_ref || sav?.ref || '',
    sav_ref: row.sav_ref || sav?.ref || '',
    projet_lie: row.projet_nom || p?.nom || sav?.projet_nom || '',
    projet_nom: row.projet_nom || p?.nom || '',
    client: row.client_nom || sav?.client_nom || '',
    client_nom: row.client_nom || '',
    intervenant: row.intervenant || '',
    date_intervention: row.date_compte_rendu || '',
    date_compte_rendu: row.date_compte_rendu || '',
    resume_intervention: row.resume_intervention || '',
    actions_realisees: row.actions_realisees || '',
    actions_a_prevoir: row.actions_a_prevoir || '',
    statut_apres_intervention: row.statut_apres_intervention || '',
    pieces_remplacees: row.pieces_remplacees || '',
    cout_intervention: Number(row.cout_intervention ?? 0),
    recommandations: row.recommandations || '',
    validation_client: row.validation_client || 'En attente',
    statut: row.statut || 'brouillon',
    observations: row.observation || '',
    observation: row.observation || '',
    photos_avant: parseJsonPhotos(row.photos_avant),
    photos_apres: parseJsonPhotos(row.photos_apres),
    signature_path: row.signature_path || '',
    signature_client_nom: row.signature_client_nom || '',
    created_at: row.created_at,
  };
}

function toReportRow(form) {
  return {
    ref: form.ref?.trim() || '',
    sav_request_id: form.sav_request_id || null,
    project_id: form.project_id || null,
    client_nom: (form.client || form.client_nom || '').trim() || null,
    projet_nom: (form.projet_lie || form.projet_nom || '').trim() || null,
    sav_ref: (form.sav_lie || form.sav_ref || '').trim() || null,
    intervenant: form.intervenant?.trim() || null,
    date_compte_rendu: form.date_compte_rendu || form.date_intervention || null,
    resume_intervention: form.resume_intervention?.trim() || null,
    actions_realisees: form.actions_realisees?.trim() || null,
    actions_a_prevoir: form.actions_a_prevoir?.trim() || null,
    statut_apres_intervention: form.statut_apres_intervention?.trim() || null,
    pieces_remplacees: form.pieces_remplacees?.trim() || null,
    cout_intervention: Number(form.cout_intervention) || 0,
    recommandations: form.recommandations?.trim() || null,
    validation_client: form.validation_client || 'En attente',
    statut: form.statut || 'brouillon',
    observation: (form.observation || form.observations || '').trim() || null,
    photos_avant: form.photos_avant ?? null,
    photos_apres: form.photos_apres ?? null,
    signature_path: form.signature_path || null,
    signature_client_nom: form.signature_client_nom?.trim() || null,
  };
}

/** Upload photos / signature après création ou mise à jour du CR */
export async function persistSavReportMedia(reportId, media = {}) {
  if (!reportId) return null;
  const {
    photos_avant = [],
    photos_apres = [],
    signature_path: currentSig = '',
    pendingAvant = [],
    pendingApres = [],
    signatureBlob = null,
    removeSignature = false,
    removeAvantPaths = [],
    removeApresPaths = [],
    signature_client_nom = '',
  } = media;

  const toDelete = [...removeAvantPaths, ...removeApresPaths];
  if (removeSignature && currentSig) toDelete.push(currentSig);
  if (toDelete.length) await deleteProjectStorageFiles(toDelete);

  let avant = photos_avant.filter((p) => p?.path && !removeAvantPaths.includes(p.path));
  let apres = photos_apres.filter((p) => p?.path && !removeApresPaths.includes(p.path));

  for (const file of pendingAvant) {
    avant.push(await uploadSavReportFile(reportId, 'avant', file));
  }
  for (const file of pendingApres) {
    apres.push(await uploadSavReportFile(reportId, 'apres', file));
  }

  let signature_path = removeSignature ? null : (currentSig || null);
  if (signatureBlob) {
    signature_path = await uploadSavReportSignature(reportId, signatureBlob);
  }

  const patch = {
    photos_avant: avant,
    photos_apres: apres,
    signature_path,
  };
  if (signature_client_nom !== undefined) {
    patch.signature_client_nom = signature_client_nom?.trim() || null;
  }

  const { error } = await getSupabase().from('sav_reports').update(patch).eq('id', reportId);
  if (error) throw error;
  return getSavReportById(reportId);
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

export async function generateSavReportRef() {
  await getAuthUserId();
  const y = new Date().getFullYear();
  const prefix = `CR-${y}-`;
  const { count, error } = await getSupabase()
    .from(TABLE)
    .select('*', { count: 'exact', head: true })
    .like('ref', `${prefix}%`);
  if (error) throw error;
  return `${prefix}${String((count || 0) + 1).padStart(4, '0')}`;
}

export async function listSavReports() {
  await getAuthUserId();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select(SELECT)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(normalizeSavReport);
}

export async function listSavReportsBySavRequestId(savRequestId) {
  await getAuthUserId();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select(SELECT)
    .eq('sav_request_id', savRequestId)
    .order('date_compte_rendu', { ascending: false });
  if (error) throw error;
  return (data || []).map(normalizeSavReport);
}

export async function listSavReportsByProjectId(projectId, limit = 10) {
  await getAuthUserId();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select(SELECT)
    .eq('project_id', projectId)
    .order('date_compte_rendu', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map(normalizeSavReport);
}

export async function getSavReportById(id) {
  await getAuthUserId();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select(SELECT)
    .eq('id', id)
    .single();
  if (error) throw error;
  return normalizeSavReport(data);
}

export async function createSavReport(form) {
  await getAuthUserId();
  const ref = form.ref?.trim() || await generateSavReportRef();
  const row = { ...toReportRow({ ...form, ref }), ref };
  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([row])
    .select('id')
    .single();
  if (error) throw error;
  return getSavReportById(data.id);
}

export async function updateSavReport(id, form) {
  await getAuthUserId();
  const row = toReportRow(form);
  if (form.ref?.trim()) row.ref = form.ref.trim();
  const { error } = await getSupabase().from(TABLE).update(row).eq('id', id);
  if (error) throw error;
  return getSavReportById(id);
}

export async function deleteSavReport(id) {
  await getAuthUserId();
  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) throw error;
}

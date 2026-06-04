/**
 * projectDocuments.js — Métadonnées fichiers liés aux projets
 */
import { getSupabase } from '../../lib/supabase';
import {
  uploadProjectFile,
  deleteProjectStorageFiles,
  resolveProjectFileUrl,
} from './projectStorage';

const TABLE = 'project_documents';

export const DOC_CATEGORIES = [
  { value: 'plan', label: 'Plans' },
  { value: 'devis', label: 'Devis' },
  { value: 'photo', label: 'Photos chantier' },
  { value: 'contrat', label: 'Documents contractuels' },
  { value: 'autre', label: 'Autre' },
];

function normalizeDoc(row, signedUrl = '') {
  if (!row) return null;
  return {
    id: row.id,
    project_id: row.project_id,
    storage_path: row.storage_path,
    file_name: row.file_name || '',
    mime_type: row.mime_type || '',
    file_size: Number(row.file_size || 0),
    category: row.category || 'autre',
    created_at: row.created_at,
    url: signedUrl,
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

export async function listProjectDocuments(projectId) {
  await getAuthUserId();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[CITYMO] project_documents list', error);
    throw error;
  }
  const rows = data || [];
  return Promise.all(rows.map(async (row) => {
    const url = await resolveProjectFileUrl(row.storage_path);
    return normalizeDoc(row, url);
  }));
}

export async function addProjectDocument(projectId, file, category = 'autre') {
  await getAuthUserId();
  const storage_path = await uploadProjectFile(projectId, file);
  const payload = {
    project_id: projectId,
    storage_path,
    file_name: file.name,
    mime_type: file.type || null,
    file_size: file.size,
    category: category || 'autre',
  };
  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([payload])
    .select('*')
    .single();
  if (error) {
    await deleteProjectStorageFiles([storage_path]);
    console.error('[CITYMO] project_documents insert', error);
    throw error;
  }
  const url = await resolveProjectFileUrl(data.storage_path);
  return normalizeDoc(data, url);
}

export async function deleteProjectDocument(docId) {
  await getAuthUserId();
  const { data: row, error: fetchErr } = await getSupabase()
    .from(TABLE)
    .select('storage_path')
    .eq('id', docId)
    .single();
  if (fetchErr) throw fetchErr;

  const { error } = await getSupabase().from(TABLE).delete().eq('id', docId);
  if (error) throw error;

  if (row?.storage_path) await deleteProjectStorageFiles([row.storage_path]);
}

export function formatFileSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} Ko`;
  return `${(n / (1024 * 1024)).toFixed(1)} Mo`;
}

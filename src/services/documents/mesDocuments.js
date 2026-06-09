/**
 * mesDocuments.js — GED Mes documents (document_folders + documents)
 */
import { getSupabase } from '../../lib/supabase';
import { DOCUMENT_DEPARTMENTS, normalizeDocumentDepartment } from '../../constants/documentDepartments';
import {
  uploadDocumentFile,
  getDocumentSignedUrl,
} from './documentStorage';

const FOLDERS_TABLE = 'document_folders';
const DOCS_TABLE = 'documents';

export const SYSTEM_DEPARTMENTS = DOCUMENT_DEPARTMENTS;

function normalizeFolder(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name || '',
    department: row.department || '',
    parent_id: row.parent_id || null,
    created_by: row.created_by || null,
    is_system: Boolean(row.is_system),
    is_deleted: Boolean(row.is_deleted),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function normalizeDocument(row) {
  if (!row) return null;
  const url = row.file_url || await getDocumentSignedUrl(row.file_path).catch(() => '');
  return {
    id: row.id,
    folder_id: row.folder_id || null,
    name: row.name || '',
    file_path: row.file_path || '',
    file_url: url,
    mime_type: row.mime_type || '',
    size_bytes: Number(row.size_bytes || 0),
    department: row.department || '',
    uploaded_by: row.uploaded_by || null,
    is_shared: Boolean(row.is_shared),
    is_public: Boolean(row.is_public),
    is_deleted: Boolean(row.is_deleted),
    deleted_at: row.deleted_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    date_upload: row.created_at ? String(row.created_at).slice(0, 10) : '',
    date_modif: row.updated_at ? String(row.updated_at).slice(0, 10) : '',
  };
}

async function requireUser() {
  const { data: { user }, error } = await getSupabase().auth.getUser();
  if (error || !user) throw new Error('Session requise.');
  return user.id;
}

export async function listFolders(parentId = null) {
  await requireUser();
  let q = getSupabase()
    .from(FOLDERS_TABLE)
    .select('*')
    .eq('is_deleted', false)
    .order('is_system', { ascending: false })
    .order('name', { ascending: true });

  if (parentId) q = q.eq('parent_id', parentId);
  else q = q.is('parent_id', null);

  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(normalizeFolder);
}

export async function getFolderById(id) {
  await requireUser();
  const { data, error } = await getSupabase()
    .from(FOLDERS_TABLE)
    .select('*')
    .eq('id', id)
    .eq('is_deleted', false)
    .maybeSingle();
  if (error) throw error;
  return normalizeFolder(data);
}

export async function getFolderBreadcrumb(folderId) {
  const trail = [];
  let currentId = folderId;
  while (currentId) {
    const folder = await getFolderById(currentId);
    if (!folder) break;
    trail.unshift(folder);
    currentId = folder.parent_id;
  }
  return trail;
}

export async function listDocuments(folderId = null, { search = '', department = '' } = {}) {
  await requireUser();
  let q = getSupabase()
    .from(DOCS_TABLE)
    .select('*')
    .eq('is_deleted', false)
    .order('created_at', { ascending: false });

  if (folderId) q = q.eq('folder_id', folderId);
  else q = q.is('folder_id', null);

  if (department) q = q.eq('department', department);

  const { data, error } = await q;
  if (error) throw error;

  let rows = data || [];
  if (search) {
    const qLower = search.toLowerCase();
    rows = rows.filter((r) => (r.name || '').toLowerCase().includes(qLower));
  }

  return Promise.all(rows.map((r) => normalizeDocument(r)));
}

export async function createFolder({ name, parentId = null, department = null }) {
  const uid = await requireUser();
  let dept = normalizeDocumentDepartment(department);
  if (parentId && !dept) {
    const parent = await getFolderById(parentId);
    dept = normalizeDocumentDepartment(parent?.department) || null;
  }
  const { data, error } = await getSupabase()
    .from(FOLDERS_TABLE)
    .insert([{
      name: name.trim(),
      parent_id: parentId || null,
      department: dept || null,
      created_by: uid,
      is_system: false,
    }])
    .select()
    .single();
  if (error) throw error;
  return normalizeFolder(data);
}

export async function renameFolder(id, name, department) {
  await requireUser();
  const folder = await getFolderById(id);
  if (!folder) throw new Error('Dossier introuvable.');
  if (folder.is_system) throw new Error('Les dossiers système ne peuvent pas être modifiés.');

  const updates = { name: name.trim() };
  if (department !== undefined) {
    updates.department = normalizeDocumentDepartment(department) || null;
  }

  const { data, error } = await getSupabase()
    .from(FOLDERS_TABLE)
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return normalizeFolder(data);
}

export async function softDeleteFolder(id) {
  await requireUser();
  const folder = await getFolderById(id);
  if (!folder) throw new Error('Dossier introuvable.');
  if (folder.is_system) throw new Error('Les dossiers système ne peuvent pas être supprimés.');

  const now = new Date().toISOString();
  const { error: docsErr } = await getSupabase()
    .from(DOCS_TABLE)
    .update({ is_deleted: true, deleted_at: now })
    .eq('folder_id', id)
    .eq('is_deleted', false);
  if (docsErr) throw docsErr;

  const { error: childErr } = await getSupabase()
    .from(FOLDERS_TABLE)
    .update({ is_deleted: true })
    .eq('parent_id', id)
    .eq('is_deleted', false);
  if (childErr) throw childErr;

  const { error } = await getSupabase()
    .from(FOLDERS_TABLE)
    .update({ is_deleted: true })
    .eq('id', id);
  if (error) throw error;
}

export async function uploadDocument(file, { folderId = null, department = null } = {}) {
  const uid = await requireUser();
  let dept = normalizeDocumentDepartment(department);
  if (folderId && !dept) {
    const folder = await getFolderById(folderId);
    dept = normalizeDocumentDepartment(folder?.department) || null;
  }

  const filePath = await uploadDocumentFile(uid, folderId, file);
  const signedUrl = await getDocumentSignedUrl(filePath).catch(() => '');

  const { data, error } = await getSupabase()
    .from(DOCS_TABLE)
    .insert([{
      folder_id: folderId || null,
      name: file.name,
      file_path: filePath,
      file_url: signedUrl || null,
      mime_type: file.type || null,
      size_bytes: file.size,
      department: dept,
      uploaded_by: uid,
    }])
    .select()
    .single();

  if (error) throw error;
  return normalizeDocument(data);
}

export async function renameDocument(id, name) {
  await requireUser();
  const { data, error } = await getSupabase()
    .from(DOCS_TABLE)
    .update({ name: name.trim() })
    .eq('id', id)
    .eq('is_deleted', false)
    .select()
    .single();
  if (error) throw error;
  return normalizeDocument(data);
}

export async function moveDocument(id, folderId) {
  await requireUser();
  let dept = null;
  if (folderId) {
    const folder = await getFolderById(folderId);
    dept = normalizeDocumentDepartment(folder?.department) || null;
  }
  const { data, error } = await getSupabase()
    .from(DOCS_TABLE)
    .update({ folder_id: folderId || null, department: dept })
    .eq('id', id)
    .eq('is_deleted', false)
    .select()
    .single();
  if (error) throw error;
  return normalizeDocument(data);
}

export async function shareDocument(id) {
  await requireUser();
  const { data, error } = await getSupabase()
    .from(DOCS_TABLE)
    .update({ is_shared: true })
    .eq('id', id)
    .eq('is_deleted', false)
    .select()
    .single();
  if (error) throw error;
  return normalizeDocument(data);
}

export async function softDeleteDocument(id) {
  await requireUser();
  const now = new Date().toISOString();
  const { error } = await getSupabase()
    .from(DOCS_TABLE)
    .update({ is_deleted: true, deleted_at: now })
    .eq('id', id);
  if (error) throw error;
}

export async function listAllFoldersFlat() {
  await requireUser();
  const { data, error } = await getSupabase()
    .from(FOLDERS_TABLE)
    .select('*')
    .eq('is_deleted', false)
    .order('name', { ascending: true });
  if (error) throw error;
  return (data || []).map(normalizeFolder);
}

export async function getMesDocumentsStats() {
  await requireUser();
  const { data, error } = await getSupabase()
    .from(DOCS_TABLE)
    .select('size_bytes, created_at, is_shared')
    .eq('is_deleted', false);
  if (error) throw error;
  const rows = data || [];
  const today = new Date().toISOString().slice(0, 10);
  return {
    total: rows.length,
    recents: rows.filter((r) => String(r.created_at).slice(0, 10) === today).length,
    partages: rows.filter((r) => r.is_shared).length,
    totalSize: rows.reduce((s, r) => s + Number(r.size_bytes || 0), 0),
  };
}

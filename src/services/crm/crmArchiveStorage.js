/**
 * crmArchiveStorage.js — Stockage PDF archives CRM (bucket citymo-documents)
 */
import { getSupabase } from '../../lib/supabase';

export const CRM_ARCHIVE_BUCKET = 'citymo-documents';
const SIGNED_URL_TTL = 3600;
export const MAX_ARCHIVE_FILE_BYTES = 25 * 1024 * 1024;

export function sanitizeArchiveFileName(name) {
  return (name || 'document.pdf').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

export function isAllowedArchiveFile(file) {
  if (!file) return false;
  if (file.size > MAX_ARCHIVE_FILE_BYTES) return false;
  const ext = (file.name || '').split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return true;
  return file.type === 'application/pdf';
}

export function storagePathForArchive({ scope = 'staging', clientId = null, docType = 'misc', fileName }) {
  const id = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now());
  const safeName = sanitizeArchiveFileName(fileName);
  if (scope === 'imported' && clientId) {
    const safeClient = String(clientId).replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeType = (docType || 'misc').replace(/[^a-zA-Z0-9_-]/g, '_');
    return `crm/archives/${safeClient}/${safeType}/${id}-${safeName}`;
  }
  return `crm/archives/staging/${id}-${safeName}`;
}

export function isCrmArchiveStoragePath(value) {
  const s = String(value || '').trim();
  return s.startsWith('crm/archives/');
}

export async function uploadArchiveFile(file, options = {}) {
  if (!isAllowedArchiveFile(file)) {
    throw new Error('PDF non autorisé ou trop volumineux (max 25 Mo).');
  }
  const path = storagePathForArchive({
    scope: options.scope || 'staging',
    clientId: options.clientId,
    docType: options.docType,
    fileName: file.name,
  });
  const { error } = await getSupabase().storage
    .from(CRM_ARCHIVE_BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type || 'application/pdf' });
  if (error) {
    console.error('[CITYMO] crm archive upload', error);
    throw new Error(error.message || 'Erreur lors de l\'upload du PDF.');
  }
  return path;
}

export async function resolveArchiveFileUrl(storagePath) {
  if (!storagePath) return '';
  if (!isCrmArchiveStoragePath(storagePath)) return storagePath;
  const { data, error } = await getSupabase().storage
    .from(CRM_ARCHIVE_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL);
  if (error) {
    console.warn('[CITYMO] crm archive signed URL', storagePath, error.message);
    return '';
  }
  return data?.signedUrl || '';
}

export async function deleteArchiveFile(storagePath) {
  if (!storagePath || !isCrmArchiveStoragePath(storagePath)) return;
  const { error } = await getSupabase().storage
    .from(CRM_ARCHIVE_BUCKET)
    .remove([storagePath]);
  if (error) console.warn('[CITYMO] crm archive delete storage', error.message);
}

export async function moveArchiveFile(oldPath, newPath) {
  if (!oldPath || !newPath || oldPath === newPath) return newPath;
  const sb = getSupabase();
  const { error: copyErr } = await sb.storage.from(CRM_ARCHIVE_BUCKET).copy(oldPath, newPath);
  if (copyErr) {
    console.error('[CITYMO] crm archive copy', copyErr);
    throw new Error(copyErr.message || 'Erreur déplacement du fichier.');
  }
  await deleteArchiveFile(oldPath);
  return newPath;
}

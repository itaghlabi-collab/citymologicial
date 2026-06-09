/**
 * documentStorage.js — Supabase Storage bucket "documents"
 */
import { getSupabase } from '../../lib/supabase';

export const DOCUMENTS_BUCKET = 'documents';

function sanitizeFileName(name) {
  return (name || 'fichier').replace(/[^a-zA-Z0-9._-]/g, '_');
}

export async function uploadDocumentFile(userId, folderId, file) {
  const folderPart = folderId || 'root';
  const path = `${userId}/${folderPart}/${Date.now()}-${sanitizeFileName(file.name)}`;
  const { error } = await getSupabase()
    .storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, file, { cacheControl: '3600', upsert: false });
  if (error) throw error;
  return path;
}

export async function getDocumentSignedUrl(filePath, expiresIn = 3600) {
  if (!filePath) return '';
  const { data, error } = await getSupabase()
    .storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(filePath, expiresIn);
  if (error) throw error;
  return data?.signedUrl || '';
}

export async function downloadDocumentFile(filePath, fileName) {
  const url = await getDocumentSignedUrl(filePath);
  if (!url) throw new Error('URL de téléchargement indisponible.');
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName || 'document';
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.click();
}

export function isPreviewableMime(mime) {
  if (!mime) return false;
  return mime.startsWith('image/') || mime === 'application/pdf';
}

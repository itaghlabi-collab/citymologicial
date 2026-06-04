/**
 * projectStorage.js — Fichiers projets (Supabase Storage citymo-projects)
 */
import { getSupabase } from '../../lib/supabase';

export const PROJECTS_BUCKET = 'citymo-projects';
const SIGNED_URL_TTL = 3600;

const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
];

export const MAX_PROJECT_FILE_BYTES = 20 * 1024 * 1024;

export function sanitizeFileName(name) {
  return (name || 'fichier').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

export function isAllowedProjectFile(file) {
  if (!file) return false;
  if (file.size > MAX_PROJECT_FILE_BYTES) return false;
  if (!file.type) return true;
  return ALLOWED_TYPES.includes(file.type);
}

export function storagePathForProjectFile(projectId, fileName) {
  const id = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now());
  return `projects/${projectId}/${id}-${sanitizeFileName(fileName)}`;
}

export async function uploadProjectFile(projectId, file) {
  if (!isAllowedProjectFile(file)) {
    throw new Error('Fichier non autorisé ou trop volumineux (max 20 Mo).');
  }
  const path = storagePathForProjectFile(projectId, file.name);
  const { error } = await getSupabase().storage
    .from(PROJECTS_BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type || 'application/octet-stream' });
  if (error) {
    console.error('[CITYMO] project storage upload', error);
    throw error;
  }
  return path;
}

export async function resolveProjectFileUrl(storagePath) {
  if (!storagePath) return '';
  const { data, error } = await getSupabase().storage
    .from(PROJECTS_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL);
  if (error) {
    console.warn('[CITYMO] project signed URL', storagePath, error.message);
    return '';
  }
  return data?.signedUrl || '';
}

export async function deleteProjectStorageFiles(paths = []) {
  const toRemove = paths.filter(Boolean);
  if (!toRemove.length) return;
  const { error } = await getSupabase().storage.from(PROJECTS_BUCKET).remove(toRemove);
  if (error) console.warn('[CITYMO] project storage delete', error.message);
}

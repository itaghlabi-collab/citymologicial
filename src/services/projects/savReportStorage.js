/**
 * savReportStorage.js — Photos & signature comptes rendus SAV (bucket citymo-projects)
 */
import { getSupabase } from '../../lib/supabase';
import {
  PROJECTS_BUCKET,
  sanitizeFileName,
  resolveProjectFileUrl,
  deleteProjectStorageFiles,
} from './projectStorage';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const MAX_SAV_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_SAV_PHOTOS = 8;

export function isAllowedSavPhoto(file) {
  if (!file) return false;
  if (file.size > MAX_SAV_PHOTO_BYTES) return false;
  if (!file.type) return true;
  return IMAGE_TYPES.includes(file.type);
}

export function storagePathForSavReport(reportId, kind, fileName) {
  const id = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now());
  return `sav-reports/${reportId}/${kind}/${id}-${sanitizeFileName(fileName)}`;
}

export async function uploadSavReportFile(reportId, kind, file) {
  if (!isAllowedSavPhoto(file)) {
    throw new Error('Image non autorisée ou > 10 Mo (JPG, PNG, WebP).');
  }
  const path = storagePathForSavReport(reportId, kind, file.name);
  const { error } = await getSupabase().storage
    .from(PROJECTS_BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type || 'image/jpeg' });
  if (error) throw error;
  return { path, name: file.name };
}

export async function uploadSavReportSignature(reportId, blob) {
  const file = blob instanceof File
    ? blob
    : new File([blob], 'signature.png', { type: 'image/png' });
  const path = storagePathForSavReport(reportId, 'signature', file.name);
  const { error } = await getSupabase().storage
    .from(PROJECTS_BUCKET)
    .upload(path, file, { upsert: true, contentType: 'image/png' });
  if (error) throw error;
  return path;
}

export { resolveProjectFileUrl, deleteProjectStorageFiles };

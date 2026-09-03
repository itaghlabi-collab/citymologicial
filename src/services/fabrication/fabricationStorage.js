/**
 * fabricationStorage.js — Fichiers plans / photos (bucket citymo-projects existant)
 */
import {
  PROJECTS_BUCKET,
  sanitizeFileName,
  isAllowedProjectFile,
  MAX_PROJECT_FILE_BYTES,
  resolveProjectFileUrl,
} from '../projects/projectStorage';
import { getSupabase } from '../../lib/supabase';

export { PROJECTS_BUCKET, resolveProjectFileUrl, isAllowedProjectFile, MAX_PROJECT_FILE_BYTES };

export function storagePathForFabricationFile(planId, fileName) {
  const id = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now());
  return `fabrication/${planId}/${id}-${sanitizeFileName(fileName)}`;
}

export async function uploadFabricationFile(planId, file) {
  if (!isAllowedProjectFile(file)) {
    throw new Error('Fichier non autorisé ou trop volumineux (max 20 Mo).');
  }
  const path = storagePathForFabricationFile(planId, file.name);
  const { error } = await getSupabase().storage
    .from(PROJECTS_BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type || 'application/octet-stream' });
  if (error) {
    console.error('[CITYMO] fabrication storage upload', error);
    throw error;
  }
  return path;
}

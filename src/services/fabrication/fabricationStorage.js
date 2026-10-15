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

const SIGNED_URL_TTL = 3600;
const SIGN_CHUNK = 500;

const PLAN_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

/** Plans de la bibliothèque : PDF, JPG, PNG uniquement. */
export function isAllowedPlanFile(file) {
  if (!file || file.size > MAX_PROJECT_FILE_BYTES) return false;
  if (PLAN_FILE_TYPES.includes(file.type)) return true;
  return /\.(pdf|jpe?g|png)$/i.test(file.name || '');
}

function randomId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now());
}

export function storagePathForFabricationFile(planId, fileName) {
  return `fabrication/${planId}/${randomId()}-${sanitizeFileName(fileName)}`;
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

/** strict=false : formats acceptés par « Transmettre à Fabrication » (Projets), inchangés. */
export async function uploadLibraryPlanFile(libraryPlanId, file, { strict = true } = {}) {
  if (!strict && !isAllowedProjectFile(file)) {
    throw new Error('Fichier non autorisé ou trop volumineux (max 20 Mo).');
  }
  if (strict && !isAllowedPlanFile(file)) {
    throw new Error(`« ${file?.name || 'Fichier'} » : seuls PDF, JPG et PNG (max 20 Mo) sont acceptés.`);
  }
  const path = `fabrication/library/${libraryPlanId}/${randomId()}-${sanitizeFileName(file.name)}`;
  const { error } = await getSupabase().storage
    .from(PROJECTS_BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type || 'application/octet-stream' });
  if (error) {
    console.error('[CITYMO] fabrication library upload', error);
    throw error;
  }
  return path;
}

export async function removeFabricationStorage(paths = []) {
  const list = paths.filter(Boolean);
  if (!list.length) return;
  const { error } = await getSupabase().storage.from(PROJECTS_BUCKET).remove(list);
  if (error) console.warn('[CITYMO] fabrication storage delete', error.message);
}

/** Signe un lot de chemins en une seule requête par tranche (évite un appel par fichier). */
export async function signFabricationPaths(paths = []) {
  const unique = [...new Set(paths.filter(Boolean))];
  const out = {};
  for (let i = 0; i < unique.length; i += SIGN_CHUNK) {
    const chunk = unique.slice(i, i + SIGN_CHUNK);
    const { data, error } = await getSupabase().storage
      .from(PROJECTS_BUCKET)
      .createSignedUrls(chunk, SIGNED_URL_TTL);
    if (error) {
      console.warn('[CITYMO] fabrication signed URLs', error.message);
      continue;
    }
    (data || []).forEach((row) => {
      if (row?.path && row.signedUrl) out[row.path] = row.signedUrl;
    });
  }
  return out;
}

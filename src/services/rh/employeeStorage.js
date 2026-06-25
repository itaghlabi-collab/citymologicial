/**
 * employeeStorage.js — Fichiers dossier documentaire employé (Supabase Storage)
 */
import { getSupabase } from '../../lib/supabase';

export const EMPLOYEES_BUCKET = 'citymo-employees';
const SIGNED_URL_TTL = 3600;

const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

export const MAX_EMPLOYEE_FILE_BYTES = 20 * 1024 * 1024;

export function sanitizeFileName(name) {
  return (name || 'fichier').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

export function isAllowedEmployeeFile(file) {
  if (!file) return false;
  if (file.size > MAX_EMPLOYEE_FILE_BYTES) return false;
  if (!file.type) {
    const ext = (file.name || '').split('.').pop()?.toLowerCase();
    return ['pdf', 'jpg', 'jpeg', 'png', 'docx', 'xlsx'].includes(ext);
  }
  return ALLOWED_TYPES.includes(file.type);
}

export function storagePathForEmployeeFile(employeeId, fileName) {
  const id = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now());
  return `employees/${employeeId}/${id}-${sanitizeFileName(fileName)}`;
}

export async function uploadEmployeeFile(employeeId, file) {
  if (!isAllowedEmployeeFile(file)) {
    throw new Error('Fichier non autorisé ou trop volumineux (max 20 Mo). Formats : PDF, JPG, PNG, DOCX, XLSX.');
  }
  const path = storagePathForEmployeeFile(employeeId, file.name);
  const { error } = await getSupabase().storage
    .from(EMPLOYEES_BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type || 'application/octet-stream' });
  if (error) {
    console.error('[CITYMO] employee storage upload', error);
    throw error;
  }
  return path;
}

export async function resolveEmployeeFileUrl(storagePath) {
  if (!storagePath) return '';
  const { data, error } = await getSupabase().storage
    .from(EMPLOYEES_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL);
  if (error) {
    console.warn('[CITYMO] employee signed URL', storagePath, error.message);
    return '';
  }
  return data?.signedUrl || '';
}

export async function deleteEmployeeStorageFiles(paths = []) {
  const toRemove = paths.filter(Boolean);
  if (!toRemove.length) return;
  const { error } = await getSupabase().storage.from(EMPLOYEES_BUCKET).remove(toRemove);
  if (error) console.warn('[CITYMO] employee storage delete', error.message);
}

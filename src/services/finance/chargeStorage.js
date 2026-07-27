/**
 * chargeStorage.js — Pièces jointes dépenses générales (bucket citymo-documents)
 */
import { getSupabase } from '../../lib/supabase';

export const CHARGE_FILES_BUCKET = 'citymo-documents';
const SIGNED_URL_TTL = 3600;
export const MAX_CHARGE_FILE_BYTES = 20 * 1024 * 1024;

const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
];

export function sanitizeFileName(name) {
  return (name || 'fichier').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

export function isAllowedChargeFile(file) {
  if (!file) return false;
  if (file.size > MAX_CHARGE_FILE_BYTES) return false;
  if (!file.type) {
    const ext = (file.name || '').split('.').pop()?.toLowerCase();
    return ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext);
  }
  return ALLOWED_TYPES.includes(file.type);
}

export function storagePathForChargeFile(chargeId, fileName) {
  const id = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now());
  const safeId = (chargeId || 'draft').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `finance/charges/${safeId}/${id}-${sanitizeFileName(fileName)}`;
}

export function isChargeStoragePath(value) {
  return String(value || '').trim().startsWith('finance/charges/');
}

export async function uploadChargeFile(file, { chargeId = 'draft' } = {}) {
  if (!isAllowedChargeFile(file)) {
    throw new Error('Fichier non autorisé ou trop volumineux (max 20 Mo). Formats : PDF, JPG, PNG, WebP.');
  }
  const path = storagePathForChargeFile(chargeId, file.name);
  const { error } = await getSupabase().storage
    .from(CHARGE_FILES_BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type || 'application/octet-stream' });
  if (error) {
    console.error('[CITYMO] charge storage upload', error);
    throw new Error(error.message || 'Erreur lors de l\'upload du fichier.');
  }
  return {
    storage_path: path,
    name: file.name,
    size: file.size,
    type: file.type || 'application/octet-stream',
    added_at: new Date().toISOString(),
  };
}

export async function resolveChargeFileUrl(storagePath) {
  if (!storagePath) return '';
  if (!isChargeStoragePath(storagePath) && /^https?:\/\//i.test(storagePath)) {
    return storagePath;
  }
  if (!isChargeStoragePath(storagePath)) return storagePath;
  const { data, error } = await getSupabase().storage
    .from(CHARGE_FILES_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL);
  if (error) {
    console.warn('[CITYMO] charge signed URL', storagePath, error.message);
    return '';
  }
  return data?.signedUrl || '';
}

export async function resolveChargeAttachments(attachments = []) {
  const list = Array.isArray(attachments) ? attachments : [];
  return Promise.all(list.map(async (a) => {
    const path = a.storage_path || a.path || a.url || '';
    const url = a.url && /^https?:\/\//i.test(a.url)
      ? a.url
      : await resolveChargeFileUrl(path);
    return { ...a, url };
  }));
}

export function stripChargeAttachmentUrls(attachments = []) {
  return (attachments || []).map(({ url, ...rest }) => rest);
}

export function formatChargeAttachmentLabel(mimeOrName) {
  const mime = String(mimeOrName || '').toLowerCase();
  if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif'].some((e) => mime.endsWith(e))) {
    return 'Image';
  }
  if (mime === 'application/pdf' || mime.endsWith('.pdf')) return 'PDF';
  return 'Fichier';
}

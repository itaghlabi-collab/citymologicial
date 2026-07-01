/**
 * purchaseStorage.js — Pièces jointes demandes d'achat (Supabase Storage citymo-documents)
 */
import { getSupabase } from '../../lib/supabase';

export const PURCHASE_FILES_BUCKET = 'citymo-documents';
const SIGNED_URL_TTL = 3600;

const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export const MAX_PURCHASE_FILE_BYTES = 20 * 1024 * 1024;

export function sanitizeFileName(name) {
  return (name || 'fichier').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

export function isAllowedPurchaseFile(file) {
  if (!file) return false;
  if (file.size > MAX_PURCHASE_FILE_BYTES) return false;
  if (!file.type) {
    const ext = (file.name || '').split('.').pop()?.toLowerCase();
    return ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'doc', 'docx'].includes(ext);
  }
  return ALLOWED_TYPES.includes(file.type);
}

export function storagePathForPurchaseFile(scope, scopeId, fileName) {
  const id = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now());
  const safeScope = (scope || 'misc').replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeId = (scopeId || 'draft').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `achats/${safeScope}/${safeId}/${id}-${sanitizeFileName(fileName)}`;
}

export function isPurchaseStoragePath(value) {
  const s = String(value || '').trim();
  return s.startsWith('achats/');
}

export async function uploadPurchaseFile(file, { scope = 'requests', scopeId = 'draft' } = {}) {
  if (!isAllowedPurchaseFile(file)) {
    throw new Error('Fichier non autorisé ou trop volumineux (max 20 Mo). Formats : PDF, JPG, PNG, WebP.');
  }
  const path = storagePathForPurchaseFile(scope, scopeId, file.name);
  const { error } = await getSupabase().storage
    .from(PURCHASE_FILES_BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type || 'application/octet-stream' });
  if (error) {
    console.error('[CITYMO] purchase storage upload', error);
    throw new Error(error.message || 'Erreur lors de l\'upload du fichier.');
  }
  return path;
}

export async function resolvePurchaseFileUrl(storagePath) {
  if (!storagePath) return '';
  if (!isPurchaseStoragePath(storagePath)) return storagePath;
  const { data, error } = await getSupabase().storage
    .from(PURCHASE_FILES_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL);
  if (error) {
    console.warn('[CITYMO] purchase signed URL', storagePath, error.message);
    return '';
  }
  return data?.signedUrl || '';
}

export async function resolvePurchaseAttachments(attachments = []) {
  const list = Array.isArray(attachments) ? attachments : [];
  return Promise.all(list.map(async (a) => {
    const path = a.storage_path || a.path || '';
    const url = a.url || await resolvePurchaseFileUrl(path);
    return { ...a, url };
  }));
}

export async function enrichPurchaseRequestFiles(request) {
  if (!request) return request;
  const attachments = await resolvePurchaseAttachments(request.payload?.attachments || []);
  return {
    ...request,
    payload: { ...request.payload, attachments },
  };
}

export async function enrichPurchaseQuotesFiles(quotes = []) {
  return Promise.all((quotes || []).map(async (q) => {
    if (!q.attachment_url) return q;
    if (!isPurchaseStoragePath(q.attachment_url)) return q;
    const url = await resolvePurchaseFileUrl(q.attachment_url);
    return { ...q, attachment_url: url || q.attachment_url, attachment_storage_path: q.attachment_url };
  }));
}

/**
 * workerStorage.js — Supabase Storage pour ouvriers (CIN + photo).
 * Chemins : workers/cin/{workerId}/recto.jpg | verso.jpg
 *           workers/photos/{workerId}/profile.jpg
 */
import { getSupabase } from '../../lib/supabase';

export const WORKERS_BUCKET = 'citymo-workers';
const SIGNED_URL_TTL = 3600;

export function isDataUrl(value) {
  return typeof value === 'string' && value.startsWith('data:');
}

export function isHttpUrl(value) {
  return typeof value === 'string' && (value.startsWith('http://') || value.startsWith('https://'));
}

function dataUrlToBlob(dataUrl) {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function extFromDataUrl(dataUrl, fallback = 'jpg') {
  const mime = dataUrl.match(/data:([^;]+)/)?.[1] || '';
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('pdf')) return 'pdf';
  return fallback;
}

export function storagePathFor(kind, workerId, ext = 'jpg') {
  if (kind === 'photo') return `workers/photos/${workerId}/profile.${ext}`;
  if (kind === 'cin_recto') return `workers/cin/${workerId}/recto.${ext}`;
  if (kind === 'cin_verso') return `workers/cin/${workerId}/verso.${ext}`;
  if (kind === 'engagement') return `workers/engagement/${workerId}/engagement.${ext}`;
  throw new Error(`Type média inconnu: ${kind}`);
}

export async function uploadWorkerMedia(workerId, kind, source) {
  if (!source || !isDataUrl(source)) return null;

  const ext = extFromDataUrl(source);
  const path = storagePathFor(kind, workerId, ext);
  const blob = dataUrlToBlob(source);

  const { error } = await getSupabase().storage
    .from(WORKERS_BUCKET)
    .upload(path, blob, { upsert: true, contentType: blob.type });

  if (error) {
    console.error('[CITYMO] worker storage upload', kind, error);
    throw error;
  }

  return path;
}

/** Liens signés réutilisés jusqu'à 5 min avant leur expiration. */
const SIGNED_URL_CACHE_MS = (SIGNED_URL_TTL - 300) * 1000;
const signedUrlCache = new Map();

function cachedSignedUrl(path) {
  const hit = signedUrlCache.get(path);
  return hit && hit.expiresAt > Date.now() ? hit.url : null;
}

function rememberSignedUrl(path, url) {
  if (url) signedUrlCache.set(path, { url, expiresAt: Date.now() + SIGNED_URL_CACHE_MS });
}

export async function resolveStorageUrl(pathOrUrl) {
  if (!pathOrUrl) return '';
  if (isDataUrl(pathOrUrl) || isHttpUrl(pathOrUrl)) return pathOrUrl;
  const cached = cachedSignedUrl(pathOrUrl);
  if (cached) return cached;

  const { data, error } = await getSupabase().storage
    .from(WORKERS_BUCKET)
    .createSignedUrl(pathOrUrl, SIGNED_URL_TTL);

  if (error) {
    console.warn('[CITYMO] signed URL', pathOrUrl, error.message);
    return '';
  }
  rememberSignedUrl(pathOrUrl, data?.signedUrl);
  return data?.signedUrl || '';
}

/** Signe plusieurs chemins en un seul appel Storage. Retourne Map(valeur → URL). */
export async function resolveStorageUrls(values = []) {
  const result = new Map();
  const toSign = [];
  [...new Set(values.filter(Boolean))].forEach((v) => {
    if (isDataUrl(v) || isHttpUrl(v)) {
      result.set(v, v);
      return;
    }
    const cached = cachedSignedUrl(v);
    if (cached) result.set(v, cached);
    else toSign.push(v);
  });

  for (let i = 0; i < toSign.length; i += 500) {
    const chunk = toSign.slice(i, i + 500);
    const { data, error } = await getSupabase().storage
      .from(WORKERS_BUCKET)
      .createSignedUrls(chunk, SIGNED_URL_TTL);
    if (error) {
      console.warn('[CITYMO] signed URLs', error.message);
      chunk.forEach((p) => result.set(p, ''));
      continue;
    }
    chunk.forEach((p, idx) => {
      const item = (data || []).find((d) => d.path === p) || data?.[idx];
      const url = item && !item.error ? (item.signedUrl || '') : '';
      rememberSignedUrl(p, url);
      result.set(p, url);
    });
  }
  return result;
}

export async function deleteWorkerMedia(paths = []) {
  const toRemove = paths.filter(Boolean);
  if (!toRemove.length) return;

  const { error } = await getSupabase().storage.from(WORKERS_BUCKET).remove(toRemove);
  if (error) console.warn('[CITYMO] worker storage delete', error.message);
}

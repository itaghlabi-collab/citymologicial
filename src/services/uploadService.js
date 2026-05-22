/**
 * uploadService.js — CITYMO File Upload Service
 *
 * Handles all file uploads across the ERP:
 *   - Documents (PDF, Word, Excel)
 *   - Images (JPG, PNG, WebP)
 *   - Identity documents (CIN, passeport)
 *   - Devis / propositions attachments
 *   - Media (photos chantier, etc.)
 *
 * Current mode: local object URL (no backend).
 * To switch to Supabase Storage:
 *   1. npm install @supabase/supabase-js
 *   2. Replace uploadFile() with supabase.storage.from('bucket').upload(path, file)
 *   3. Replace getPublicUrl() with supabase.storage.from('bucket').getPublicUrl(path)
 *
 * To switch to S3 / Railway backend:
 *   1. POST file as FormData to /api/upload
 *   2. Receive { url, key } in response
 *   3. Store url in the database record
 */

import { ENV } from '../config/env';
import { getAuthToken } from './auth';

/** Accepted MIME types per upload category */
export const ACCEPTED_TYPES = {
  document:  '.pdf,.doc,.docx,.xls,.xlsx,.txt',
  image:     '.jpg,.jpeg,.png,.webp,.gif',
  pdf:       '.pdf',
  cin:       '.jpg,.jpeg,.png,.pdf',
  media:     '.jpg,.jpeg,.png,.webp,.mp4,.mov',
  any:       '*',
};

/** Max file sizes in bytes */
export const MAX_SIZES = {
  document:  20 * 1024 * 1024,  // 20 MB
  image:     10 * 1024 * 1024,  // 10 MB
  pdf:       20 * 1024 * 1024,  // 20 MB
  cin:        5 * 1024 * 1024,  //  5 MB
  media:     50 * 1024 * 1024,  // 50 MB
};

/**
 * Validate file before upload.
 * Returns null on success, or an error string.
 *
 * @param {File} file
 * @param {'document'|'image'|'pdf'|'cin'|'media'} category
 */
export function validateFile(file, category = 'document') {
  if (!file) return 'Aucun fichier selectionne.';
  const maxSize = MAX_SIZES[category] || MAX_SIZES.document;
  if (file.size > maxSize) {
    const mb = (maxSize / 1024 / 1024).toFixed(0);
    return `Fichier trop volumineux. Maximum ${mb} MB.`;
  }
  return null;
}

/**
 * Upload a file.
 *
 * In production: posts to backend or Supabase Storage.
 * Currently: creates a local object URL (persists only during session).
 *
 * @param {File} file - The File object from an <input type="file">
 * @param {Object} options
 * @param {string} [options.bucket] - Storage bucket name (for Supabase)
 * @param {string} [options.folder] - Sub-folder/prefix (e.g. 'devis', 'ouvriers')
 * @param {string} [options.category] - Validation category
 * @returns {Promise<{ url: string, name: string, size: number, type: string }>}
 */
export async function uploadFile(file, options = {}) {
  const { category = 'document', folder = 'uploads' } = options;

  // Validate
  const validationError = validateFile(file, category);
  if (validationError) throw new Error(validationError);

  // ── Production: replace this block with real upload ──────────────────────
  if (ENV.API_URL && ENV.API_URL !== 'http://localhost:3000/api') {
    // Real backend upload
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', folder);

    const token = getAuthToken();
    const res = await fetch(`${ENV.API_URL}/upload`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });

    if (!res.ok) {
      let msg = 'Erreur lors de l\'upload.';
      try { const err = await res.json(); msg = err.message || msg; } catch (_) {}
      throw new Error(msg);
    }

    const data = await res.json();
    return { url: data.url, name: file.name, size: file.size, type: file.type };
  }
  // ── Offline / dev fallback: local object URL ──────────────────────────────

  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 600));

  const url = URL.createObjectURL(file);
  return { url, name: file.name, size: file.size, type: file.type };
}

/**
 * Upload multiple files in parallel.
 *
 * @param {File[]} files
 * @param {Object} options - Same as uploadFile options
 * @returns {Promise<Array<{ url, name, size, type }>>}
 */
export async function uploadFiles(files, options = {}) {
  return Promise.all(files.map(f => uploadFile(f, options)));
}

/**
 * Format file size for display.
 * @param {number} bytes
 */
export function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

/**
 * Get a file icon name based on MIME type.
 * Returns a string you can use to pick a lucide-react icon.
 * @param {string} mimeType
 */
export function getFileIconType(mimeType) {
  if (!mimeType) return 'file';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'spreadsheet';
  if (mimeType.includes('word') || mimeType.includes('document')) return 'document';
  return 'file';
}

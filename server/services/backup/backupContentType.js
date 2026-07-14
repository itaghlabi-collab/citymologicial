/**
 * Résolution MIME pour uploads vers le bucket citymo-backups.
 * Conserve le MIME source s'il est utilisable ; sinon application/octet-stream.
 */

const OCTET_STREAM = 'application/octet-stream';

/** MIME usuels ERP / documents (liste indicative — fallback toujours octet-stream). */
const KNOWN_MIME = new Set([
  'application/gzip',
  'application/x-gzip',
  'application/json',
  'application/octet-stream',
  'application/pdf',
  'application/zip',
  'application/x-zip-compressed',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'text/plain',
  'text/csv',
  'text/html',
  'video/mp4',
  'audio/mpeg',
]);

const EXT_TO_MIME = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  json: 'application/json',
  gz: 'application/gzip',
  gzip: 'application/gzip',
  zip: 'application/zip',
  txt: 'text/plain',
  csv: 'text/csv',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

function normalizeMime(raw) {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  if (!s || s === 'null' || s === 'undefined' || s === 'unknown') return null;
  // Blob type parfois « image/jpeg; charset=binary »
  const base = s.split(';')[0].trim();
  if (!base.includes('/')) return null;
  if (base === 'image/jpg') return 'image/jpeg';
  return base;
}

function mimeFromPath(filePath) {
  const name = String(filePath || '').split('/').pop() || '';
  const dot = name.lastIndexOf('.');
  if (dot < 0 || dot === name.length - 1) return null;
  const ext = name.slice(dot + 1).toLowerCase();
  return EXT_TO_MIME[ext] || null;
}

/**
 * @param {string|null|undefined} rawMime — MIME source (Blob.type, metadata, etc.)
 * @param {string} [filePath] — chemin pour inférer l'extension
 * @returns {{ contentType: string, source: 'provided'|'extension'|'fallback', preserved: boolean }}
 */
function resolveBackupContentType(rawMime, filePath = '') {
  const fromProvided = normalizeMime(rawMime);
  if (fromProvided) {
    return {
      contentType: fromProvided,
      source: 'provided',
      preserved: true,
      known: KNOWN_MIME.has(fromProvided),
    };
  }

  const fromExt = mimeFromPath(filePath);
  if (fromExt) {
    return {
      contentType: fromExt,
      source: 'extension',
      preserved: false,
      known: KNOWN_MIME.has(fromExt),
    };
  }

  return {
    contentType: OCTET_STREAM,
    source: 'fallback',
    preserved: false,
    known: true,
  };
}

function isMimeNotSupportedError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  return msg.includes('mime type') && msg.includes('not supported');
}

module.exports = {
  OCTET_STREAM,
  KNOWN_MIME,
  resolveBackupContentType,
  normalizeMime,
  mimeFromPath,
  isMimeNotSupportedError,
};

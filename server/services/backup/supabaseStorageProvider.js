/**
 * Stockage des sauvegardes dans Supabase Storage (bucket citymo-backups).
 */
const { getSupabaseAdmin } = require('../../lib/supabaseAdmin');
const {
  resolveBackupContentType,
  isMimeNotSupportedError,
  OCTET_STREAM,
} = require('./backupContentType');

const BUCKET = 'citymo-backups';

/** Après un refus MIME du bucket, les uploads suivants tentent d'abord octet-stream. */
let preferOctetStreamFirst = false;

/**
 * @param {string} path
 * @param {Buffer} buffer
 * @param {string} [contentType]
 * @param {{ sourceBucket?: string, sourcePath?: string }} [meta]
 */
async function upload(path, buffer, contentType = 'application/gzip', meta = {}) {
  const sb = getSupabaseAdmin();
  const size = buffer?.length ?? 0;
  const resolved = resolveBackupContentType(contentType, path);
  let preferred = preferOctetStreamFirst ? OCTET_STREAM : resolved.contentType;
  // Archives gzip/json : toujours le MIME résolu (bucket historique les autorise déjà)
  if (/application\/(gzip|x-gzip|json)/.test(resolved.contentType)) {
    preferred = resolved.contentType;
  }

  const tryUpload = async (type) => {
    const { error } = await sb.storage.from(BUCKET).upload(path, buffer, {
      contentType: type,
      upsert: true,
      cacheControl: '3600',
    });
    return error;
  };

  let mime = preferred;
  let error = await tryUpload(mime);

  if (error && isMimeNotSupportedError(error) && mime !== OCTET_STREAM) {
    preferOctetStreamFirst = true;
    console.warn(
      `[backup:storage] MIME refusé (${mime}) → retry ${OCTET_STREAM} (bucket encore restrictif ?)`,
      {
        dest: path,
        sourceBucket: meta.sourceBucket || null,
        sourcePath: meta.sourcePath || null,
        size,
        supabase: error.message,
      },
    );
    mime = OCTET_STREAM;
    error = await tryUpload(mime);
  }

  if (error) {
    const detail = [
      `Upload sauvegarde échoué : ${error.message}`,
      `bucket=${BUCKET}`,
      `dest=${path}`,
      meta.sourceBucket ? `source=${meta.sourceBucket}/${meta.sourcePath || ''}` : null,
      `mime=${mime}`,
      `size=${size}`,
    ].filter(Boolean).join(' | ');
    throw new Error(detail);
  }

  return {
    path,
    bucket: BUCKET,
    contentType: mime,
    size,
    contentTypeSource: mime === OCTET_STREAM && resolved.contentType !== OCTET_STREAM
      ? 'fallback_after_reject'
      : resolved.source,
  };
}

async function download(path) {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.storage.from(BUCKET).download(path);
  if (error) throw new Error(`Téléchargement sauvegarde échoué : ${error.message}`);
  const buf = Buffer.from(await data.arrayBuffer());
  return buf;
}

async function getSignedUrl(path, expiresIn = 3600) {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, expiresIn);
  if (error) throw new Error(`URL signée échouée : ${error.message}`);
  return data.signedUrl;
}

async function remove(path) {
  const sb = getSupabaseAdmin();
  const { error } = await sb.storage.from(BUCKET).remove([path]);
  if (error) throw new Error(`Suppression fichier sauvegarde échouée : ${error.message}`);
}

async function list(prefix) {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.storage.from(BUCKET).list(prefix, { limit: 1000 });
  if (error) throw new Error(`Liste sauvegardes échouée : ${error.message}`);
  return data || [];
}

module.exports = { upload, download, getSignedUrl, remove, list, BUCKET };

/**
 * Stockage des sauvegardes dans Supabase Storage (bucket citymo-backups).
 */
const { getSupabaseAdmin } = require('../../lib/supabaseAdmin');

const BUCKET = 'citymo-backups';

async function upload(path, buffer, contentType = 'application/gzip') {
  const sb = getSupabaseAdmin();
  const { error } = await sb.storage.from(BUCKET).upload(path, buffer, {
    contentType,
    upsert: true,
  });
  if (error) throw new Error(`Upload sauvegarde échoué : ${error.message}`);
  return { path, bucket: BUCKET };
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

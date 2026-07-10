/**
 * Vérification des artefacts sauvegarde dans Supabase Storage (citymo-backups).
 */
const supabaseStorageProvider = require('./supabaseStorageProvider');

async function verifyBackupArtifact(path, { minBytes = 1 } = {}) {
  const buf = await supabaseStorageProvider.download(path);
  if (!buf?.length || buf.length < minBytes) {
    throw new Error(`Artefact vide ou introuvable : ${path}`);
  }
  return { path, bytes: buf.length };
}

module.exports = { verifyBackupArtifact };

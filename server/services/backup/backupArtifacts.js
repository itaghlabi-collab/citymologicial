/**
 * Vérification des artefacts sauvegarde dans Supabase Storage (citymo-backups).
 */
const supabaseStorageProvider = require('./supabaseStorageProvider');

async function verifyBackupArtifact(path, pipeline, { minBytes = 1 } = {}) {
  const run = pipeline
    ? (loc, fn) => pipeline.run(loc, fn)
    : (loc, fn) => fn();

  const buf = await run(
    `verifyBackupArtifact.download(${path})`,
    () => supabaseStorageProvider.download(path),
  );

  if (!buf?.length || buf.length < minBytes) {
    throw new Error(`Artefact vide ou introuvable : ${path}`);
  }
  return { path, bytes: buf.length };
}

module.exports = { verifyBackupArtifact };

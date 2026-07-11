/**
 * Vérification des artefacts sauvegarde dans Supabase Storage (citymo-backups).
 */
const { getSupabaseAdmin } = require('../../lib/supabaseAdmin');
const supabaseStorageProvider = require('./supabaseStorageProvider');

const BUCKET = 'citymo-backups';
const LIST_PAGE_SIZE = 1000;

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

async function verifyRequiredArchives(paths, pipeline) {
  const results = [];
  for (const path of paths) {
    results.push(await verifyBackupArtifact(path, pipeline, { minBytes: 1 }));
  }
  return results;
}

/**
 * Compte récursivement les fichiers sous un préfixe dans citymo-backups.
 */
async function countStorageFilesUnder(prefix, pipeline) {
  const sb = getSupabaseAdmin();
  let count = 0;

  async function walk(folder, depth = 0) {
    if (depth > 32) throw new Error(`Profondeur max dépassée : ${prefix}/${folder}`);
    pipeline?.assertAlive?.();

    let offset = 0;
    while (true) {
      const listPath = folder || '(racine)';
      const fetch = () => sb.storage.from(BUCKET).list(folder, {
        limit: LIST_PAGE_SIZE,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      });

      const { data, error } = pipeline
        ? await pipeline.run(`countStorageFiles.list(${prefix}/${listPath})`, fetch)
        : await fetch();

      if (error) throw new Error(`Liste ${prefix}/${folder || ''} : ${error.message}`);
      if (!data?.length) break;

      for (const item of data) {
        const itemPath = folder ? `${folder}/${item.name}` : item.name;
        if (item.id === null) {
          await walk(itemPath, depth + 1);
        } else {
          count += 1;
        }
      }

      if (data.length < LIST_PAGE_SIZE) break;
      offset += LIST_PAGE_SIZE;
    }
  }

  await walk(prefix.replace(/\/$/, ''), 0);
  return count;
}

module.exports = {
  verifyBackupArtifact,
  verifyRequiredArchives,
  countStorageFilesUnder,
};

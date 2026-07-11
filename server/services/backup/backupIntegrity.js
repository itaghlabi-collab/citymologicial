/**
 * Contrôle d'intégrité final — sauvegarde complète restaurable uniquement si tout est présent.
 */
const { DOMAINS } = require('./backupErrors');
const { verifyRequiredArchives, countStorageFilesUnder } = require('./backupArtifacts');
const { verifyBackupArchivesOnDrive } = require('./googleDriveBackupUploader');
const { listBackupTree } = require('./googleDriveStorageProvider');

function requiredArchives(typeKey, backupPrefix) {
  const paths = [];
  if (typeKey === 'complete' || typeKey === 'base_donnees') {
    paths.push(`${backupPrefix}/database.json.gz`);
  }
  if (typeKey === 'complete' || typeKey === 'documents') {
    paths.push(`${backupPrefix}/files-manifest.json.gz`);
  }
  if (typeKey === 'complete') {
    paths.push(`${backupPrefix}/complete-index.json.gz`);
  }
  return paths;
}

function buildIntegrityReport(ctx, { ok, issues }) {
  const archives = requiredArchives(ctx.typeKey, ctx.backupPrefix);
  return {
    ok,
    tables_exported: ctx.dbPayload?.meta?.tables?.length ?? 0,
    tables_skipped: ctx.dbPayload?.meta?.skipped?.length ?? 0,
    rows_exported: Object.values(ctx.dbPayload?.meta?.rowCounts || {}).reduce((a, b) => a + b, 0),
    files_listed: ctx.manifest?.listed_objects ?? 0,
    files_copied: ctx.manifest?.copied_files ?? 0,
    drive_files_copied: ctx.manifest?.drive_copied_files ?? 0,
    storage_files_verified: ctx.storageFileCount ?? null,
    total_size_bytes: ctx.totalSize ?? 0,
    archives_expected: archives.map((p) => p.split('/').pop()),
    archives_verified: ok,
    drive_verified: Boolean(ctx.driveEnabled && ctx.driveUploadAllowed && ok),
    files_mode: ctx.manifest?.mode ?? null,
    issues,
  };
}

/**
 * Lance tous les contrôles. Lance une Error multi-domaines si un seul contrôle échoue.
 */
async function assertBackupIntegrity(ctx) {
  const issues = [];
  const {
    typeKey,
    backupPrefix,
    dbPayload,
    manifest,
    driveUploadAllowed,
    driveEnabled,
    driveErrors,
    pipeline,
    storageFileCount,
  } = ctx;

  const archives = requiredArchives(typeKey, backupPrefix);

  for (const path of archives) {
    const name = path.split('/').pop();
    try {
      await verifyRequiredArchives([path], pipeline);
    } catch (err) {
      issues.push(`[${DOMAINS.STORAGE}] Archive manquante ou vide : ${name} — ${err.message}`);
    }
  }

  if (typeKey === 'complete') {
    if (manifest?.mode !== 'full') {
      issues.push(
        `[${DOMAINS.STORAGE}] Sauvegarde complète requiert une copie physique (files_mode=full), reçu : ${manifest?.mode || 'inconnu'}`,
      );
    }
  }

  const tablesExported = dbPayload?.meta?.tables?.length ?? 0;
  const tablesSkipped = dbPayload?.meta?.skipped?.length ?? 0;

  if ((typeKey === 'complete' || typeKey === 'base_donnees') && tablesExported === 0) {
    issues.push(`[${DOMAINS.SUPABASE}] Aucune table exportée dans database.json.gz`);
  }
  if (tablesSkipped > 0) {
    const names = (dbPayload.meta.skipped || []).slice(0, 5).map((s) => s.table).join(', ');
    issues.push(`[${DOMAINS.SUPABASE}] ${tablesSkipped} table(s) non exportée(s) : ${names}`);
  }

  if (typeKey === 'complete' || (typeKey === 'documents' && manifest?.mode === 'full')) {
    const listed = manifest?.listed_objects ?? 0;
    const copied = manifest?.copied_files ?? 0;
    const copyErrors = manifest?.errors?.length ?? 0;

    if (copyErrors > 0) {
      const sample = (manifest.errors || []).slice(0, 3)
        .map((e) => `${e.bucket || ''}/${e.path || ''}: ${e.error}`)
        .join('; ');
      issues.push(`[${DOMAINS.STORAGE}] ${copyErrors} erreur(s) lors de la copie — ${sample}`);
    }

    if (manifest?.mode === 'full' && copied !== listed) {
      issues.push(`[${DOMAINS.STORAGE}] Copie physique incomplète : ${copied}/${listed} fichier(s) copié(s)`);
    }

    if (manifest?.mode === 'full' && storageFileCount !== null && storageFileCount !== copied) {
      issues.push(
        `[${DOMAINS.STORAGE}] Stockage backup : ${storageFileCount} fichier(s) trouvé(s), ${copied} attendu(s) sous files/`,
      );
    }
  }

  if (driveEnabled && driveUploadAllowed) {
    if (driveErrors?.length) {
      issues.push(`[${DOMAINS.DRIVE}] ${driveErrors.join(' | ')}`);
    }

    try {
      await verifyBackupArchivesOnDrive(backupPrefix);
    } catch (err) {
      issues.push(`[${DOMAINS.DRIVE}] ${err.message}`);
    }

    if (typeKey === 'complete' && manifest?.mode === 'full') {
      try {
        const expectedCopied = manifest.copied_files ?? 0;
        const driveTree = await listBackupTree(backupPrefix);
        const driveFileCopies = driveTree.filter((f) => f.relPath.startsWith('files/'));
        if (driveFileCopies.length !== expectedCopied) {
          issues.push(
            `[${DOMAINS.DRIVE}] Copie Drive incomplète : ${driveFileCopies.length}/${expectedCopied} fichier(s) sous files/`,
          );
        }
      } catch (err) {
        issues.push(`[${DOMAINS.DRIVE}] Inventaire Drive échoué — ${err.message}`);
      }
    }
  } else if (driveEnabled && typeKey === 'complete') {
    issues.push(`[${DOMAINS.DRIVE}] Google Drive activé mais non validé — copie Drive obligatoire pour une sauvegarde complète`);
  }

  if (issues.length) {
    const report = buildIntegrityReport(ctx, { ok: false, issues });
    const err = new Error(issues.join(' | '));
    err.integrityReport = report;
    throw err;
  }

  return buildIntegrityReport(ctx, { ok: true, issues: [] });
}

module.exports = {
  assertBackupIntegrity,
  requiredArchives,
  buildIntegrityReport,
};

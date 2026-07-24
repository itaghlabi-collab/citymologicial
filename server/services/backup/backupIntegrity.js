/**
 * Contrôle d'intégrité final.
 * Les échecs de copie fichier-par-fichier (timeout, etc.) sont soft → succès partiel.
 * Archives manquantes / DB vide / Drive requis KO restent hard → échec.
 */
const { DOMAINS } = require('./backupErrors');
const { verifyRequiredArchives } = require('./backupArtifacts');
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

function buildIntegrityReport(ctx, { ok, partial, hardIssues, softIssues }) {
  const archives = requiredArchives(ctx.typeKey, ctx.backupPrefix);
  const issues = [...(hardIssues || []), ...(softIssues || [])];
  return {
    ok,
    partial: Boolean(partial),
    tables_exported: ctx.dbPayload?.meta?.tables?.length ?? 0,
    tables_skipped: ctx.dbPayload?.meta?.skipped?.length ?? 0,
    rows_exported: Object.values(ctx.dbPayload?.meta?.rowCounts || {}).reduce((a, b) => a + b, 0),
    files_listed: ctx.manifest?.listed_objects ?? 0,
    files_copied: ctx.manifest?.copied_files ?? 0,
    files_failed: ctx.manifest?.copy_summary?.failed
      ?? (ctx.manifest?.errors || []).filter((e) => e.path).length,
    drive_files_copied: ctx.manifest?.drive_copied_files ?? 0,
    storage_files_verified: ctx.storageFileCount ?? null,
    total_size_bytes: ctx.totalSize ?? 0,
    archives_expected: archives.map((p) => p.split('/').pop()),
    archives_verified: hardIssues.length === 0,
    drive_verified: Boolean(ctx.driveEnabled && ctx.driveUploadAllowed && hardIssues.length === 0),
    files_mode: ctx.manifest?.mode ?? null,
    copy_summary: ctx.manifest?.copy_summary || null,
    hard_issues: hardIssues || [],
    soft_issues: softIssues || [],
    issues,
  };
}

/**
 * Soft = fichiers Storage isolés en échec (timeout…) → succès partiel.
 * Hard = archives / DB / mode / Drive bloquant → throw.
 */
async function assertBackupIntegrity(ctx) {
  const hardIssues = [];
  const softIssues = [];
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
      hardIssues.push(`[${DOMAINS.STORAGE}] Archive manquante ou vide : ${name} — ${err.message}`);
    }
  }

  if (typeKey === 'complete') {
    if (manifest?.mode !== 'full') {
      hardIssues.push(
        `[${DOMAINS.STORAGE}] Sauvegarde complète requiert une copie physique (files_mode=full), reçu : ${manifest?.mode || 'inconnu'}`,
      );
    }
  }

  const tablesExported = dbPayload?.meta?.tables?.length ?? 0;
  const tablesSkipped = dbPayload?.meta?.skipped?.length ?? 0;

  if ((typeKey === 'complete' || typeKey === 'base_donnees') && tablesExported === 0) {
    hardIssues.push(`[${DOMAINS.SUPABASE}] Aucune table exportée dans database.json.gz`);
  }
  if (tablesSkipped > 0) {
    const names = (dbPayload.meta.skipped || []).slice(0, 5).map((s) => s.table).join(', ');
    hardIssues.push(`[${DOMAINS.SUPABASE}] ${tablesSkipped} table(s) non exportée(s) : ${names}`);
  }

  if (typeKey === 'complete' || (typeKey === 'documents' && manifest?.mode === 'full')) {
    const listed = manifest?.listed_objects ?? 0;
    const copied = manifest?.copied_files ?? 0;
    const fileErrors = (manifest?.errors || []).filter((e) => e.path);
    const copyErrors = fileErrors.length;
    const summary = manifest?.copy_summary;

    if (copyErrors > 0) {
      const sample = fileErrors.slice(0, 5)
        .map((e) => `${e.bucket || ''}/${e.path || ''}: ${e.error}`)
        .join('; ');
      softIssues.push(
        `[${DOMAINS.STORAGE}] ${copyErrors} fichier(s) non copié(s) (sauvegarde poursuivie) — ${sample}`,
      );
    }

    if (manifest?.mode === 'full' && listed > 0 && copied !== listed) {
      softIssues.push(
        `[${DOMAINS.STORAGE}] Copie physique partielle : ${copied}/${listed} fichier(s) — ${listed - copied} échoué(s)`,
      );
    }

    // Vérifie que les fichiers marqués copiés sont bien présents sous files/
    if (manifest?.mode === 'full' && storageFileCount !== null && storageFileCount !== copied) {
      hardIssues.push(
        `[${DOMAINS.STORAGE}] Stockage backup : ${storageFileCount} fichier(s) trouvé(s), ${copied} attendu(s) sous files/`,
      );
    }

    if (summary?.failed_files?.length) {
      console.info(
        `[backup:integrity] fichiers échoués (${summary.failed_files.length}): `
          + summary.failed_files.map((f) => `${f.bucket}/${f.path}`).join(', '),
      );
    }
  }

  if (driveEnabled && driveUploadAllowed) {
    if (driveErrors?.length) {
      hardIssues.push(`[${DOMAINS.DRIVE}] ${driveErrors.join(' | ')}`);
    }

    try {
      await verifyBackupArchivesOnDrive(backupPrefix);
    } catch (err) {
      hardIssues.push(`[${DOMAINS.DRIVE}] ${err.message}`);
    }

    if (typeKey === 'complete' && manifest?.mode === 'full') {
      try {
        const expectedCopied = manifest.copied_files ?? 0;
        const driveTree = await listBackupTree(backupPrefix);
        const driveFileCopies = driveTree.filter((f) => f.relPath.startsWith('files/'));
        if (driveFileCopies.length !== expectedCopied) {
          // Écart Drive vs fichiers réellement copiés = hard ; les sources non copiés sont déjà soft
          hardIssues.push(
            `[${DOMAINS.DRIVE}] Copie Drive incomplète : ${driveFileCopies.length}/${expectedCopied} fichier(s) sous files/`,
          );
        }
      } catch (err) {
        hardIssues.push(`[${DOMAINS.DRIVE}] Inventaire Drive échoué — ${err.message}`);
      }
    }
  } else if (driveEnabled && typeKey === 'complete' && !ctx.driveSkipped) {
    hardIssues.push(`[${DOMAINS.DRIVE}] Google Drive activé mais non validé — copie Drive obligatoire pour une sauvegarde complète`);
  }

  if (hardIssues.length) {
    const report = buildIntegrityReport(ctx, {
      ok: false,
      partial: softIssues.length > 0,
      hardIssues,
      softIssues,
    });
    const err = new Error([...hardIssues, ...softIssues].join(' | '));
    err.integrityReport = report;
    throw err;
  }

  const partial = softIssues.length > 0;
  return buildIntegrityReport(ctx, {
    ok: !partial,
    partial,
    hardIssues: [],
    softIssues,
  });
}

module.exports = {
  assertBackupIntegrity,
  requiredArchives,
  buildIntegrityReport,
};

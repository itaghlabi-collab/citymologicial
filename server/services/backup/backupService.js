/**
 * Orchestration sauvegardes ERP CITYMO.
 */
const zlib = require('zlib');
const { promisify } = require('util');
const { getSupabaseAdmin } = require('../../lib/supabaseAdmin');
const { getBackupStorageProvider, isGoogleDriveEnabled } = require('./backupStorageProvider');
const { exportDatabase, exportErpConfig } = require('./databaseExporter');
const { exportFiles, resolveFilesMode } = require('./filesExporter');
const { verifyBackupArtifact } = require('./backupArtifacts');
const { createPipeline, COMPRESS_TIMEOUT_MS } = require('./backupPipeline');
const { wrapStorageUpload } = require('./timedBackupStorage');
const { formatFailMessage, DOMAINS } = require('./backupErrors');
const { updateErpBackupRow, buildInsertPayload } = require('./erpBackupSchema');
const { validateGoogleDriveForBackup } = require('./googleDriveAccess');
const { logBackupAction } = require('./auditLog');
const logger = require('./backupLogger');
const { testSupabaseConnection } = require('./backupEnvCheck');
const {
  withTimeout,
  JOB_TIMEOUT_MS,
  assertNoConcurrentBackup,
  markJobStarted,
  markJobFinished,
  updateBackupProgress,
  reconcileStuckBackups,
} = require('./backupJobRunner');

const gzip = promisify(zlib.gzip);

const TYPE_MAP = {
  'Base données': 'base_donnees',
  'Documents': 'documents',
  'Complète': 'complete',
  complete: 'complete',
  base_donnees: 'base_donnees',
  documents: 'documents',
};

function genBackupRef() {
  const y = new Date().getFullYear();
  const n = String(Math.floor(Math.random() * 9000) + 1000);
  return `BCK-${y}-${n}`;
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

async function createBackupRow({ type, planification, description, actor, scheduleType }) {
  const sb = getSupabaseAdmin();
  const ref = genBackupRef();
  const typeKey = TYPE_MAP[type] || type || 'complete';
  const ext = typeKey === 'documents' ? 'files.json.gz' : 'json.gz';
  const nom = `backup_citymo_${timestamp()}_${typeKey}.${ext}`;

  const insertPayload = await buildInsertPayload({
    ref,
    nom,
    type: typeKey,
    planification: (planification || 'manuelle').toLowerCase(),
    schedule_type: scheduleType || null,
    statut: 'en_cours',
    description: description?.trim() || null,
    storage_provider: isGoogleDriveEnabled()
      ? 'supabase_storage+google_drive'
      : (process.env.BACKUP_STORAGE_PROVIDER || 'supabase_storage'),
    cree_par: actor?.id || null,
    cree_par_nom: actor?.nom || actor?.email || 'Super Admin',
  });

  const { data, error } = await sb
    .from('erp_backups')
    .insert(insertPayload)
    .select('*')
    .single();

  if (error) throw new Error(`Création journal sauvegarde : ${error.message}`);
  return data;
}

async function finalizeBackupRow(id, fields) {
  return updateErpBackupRow(id, fields);
}

async function safeFinalizeBackupRow(id, fields, originalError) {
  try {
    return await finalizeBackupRow(id, fields);
  } catch (finalizeErr) {
    console.error('[backup] finalize SQL échoué — erreur job conservée:', originalError);
    console.error('[backup] finalize SQL détail:', finalizeErr.message);
    return null;
  }
}

async function compressJson(payload) {
  const json = JSON.stringify(payload);
  return gzip(Buffer.from(json, 'utf8'));
}

async function executeBackupJob(row, { typeKey, planification, description, actor }) {
  const storage = getBackupStorageProvider();
  const backupPrefix = row.ref;
  const pipeline = createPipeline(row.ref, (msg) => updateBackupProgress(row.id, msg));
  let driveUploadAllowed = false;

  logger.backupStart(backupPrefix, typeKey, actor);

  await logBackupAction({
    backupId: row.id,
    action: 'create',
    actor,
    details: { type: typeKey, planification, ref: row.ref },
  });

  let manifest = null;

  try {
    await pipeline.run('testSupabaseConnection', () => testSupabaseConnection());

    const driveCheck = await pipeline.run(
      'googleDrive.validate',
      () => validateGoogleDriveForBackup(),
    );
    driveUploadAllowed = Boolean(driveCheck.uploadAllowed);

    const timedUpload = wrapStorageUpload(storage, pipeline, 'backup', { driveUploadAllowed });

    await pipeline.run('updateBackupProgress:init', async () => {
      await updateBackupProgress(row.id, 'Export base de données…');
    });

    let totalSize = 0;
    let mainFilePath = null;
    const driveErrors = [];

    if (typeKey === 'base_donnees' || typeKey === 'complete') {
      const dbPayload = await pipeline.run(
        'exportDatabase',
        () => exportDatabase(pipeline),
        { timeoutMs: 30 * 60_000, progressMsg: 'Export base de données…' },
      );
      if (typeKey === 'complete') {
        dbPayload.erp_config = await pipeline.run(
          'exportErpConfig',
          () => exportErpConfig(pipeline),
          { timeoutMs: 2 * 60_000 },
        );
      }
      logger.supabaseExportOk({
        tables: dbPayload.meta?.tables?.length || 0,
        rows: Object.values(dbPayload.meta?.rowCounts || {}).reduce((a, b) => a + b, 0),
        skipped: dbPayload.meta?.skipped?.length || 0,
      });

      const compressed = await pipeline.run(
        'compressJson:database',
        () => compressJson(dbPayload),
        { timeoutMs: COMPRESS_TIMEOUT_MS, progressMsg: 'Compression base de données…' },
      );
      mainFilePath = `${backupPrefix}/database.json.gz`;
      const up = await timedUpload(mainFilePath, compressed);
      if (up.driveError) driveErrors.push(up.driveError);
      await verifyBackupArtifact(mainFilePath, pipeline);
      totalSize += compressed.length;
      await pipeline.run('updateBackupProgress:db-done', async () => {
        await updateBackupProgress(row.id, 'Base de données exportée — inventaire fichiers…');
      });
    }

    if (typeKey === 'documents' || typeKey === 'complete') {
      const filesMode = resolveFilesMode();
      manifest = await pipeline.run(
        'exportFiles',
        () => exportFiles(backupPrefix, {
          mode: filesMode,
          pipeline,
          onProgress: (p) => {
            let label = null;
            if (p.phase === 'bucket_start') {
              label = `Inventaire bucket ${p.bucketIndex}/${p.bucketTotal} « ${p.bucket} »…`;
            } else if (p.phase === 'listing') {
              label = `Inventaire ${p.bucket} — ${p.listed} objets`;
            } else if (p.phase === 'bucket_listed') {
              label = `${p.bucket} : ${p.count} fichier(s) — total inventorié ${p.totalListed}`;
            } else if (p.phase === 'copied') {
              label = `Copie fichiers ${p.copied}/${p.total}`;
            }
            if (label) pipeline.touchProgress(label);
          },
        }),
        { timeoutMs: Math.max(30_000, 30 * 60_000), progressMsg: 'Inventaire Storage…' },
      );
      logger.storageExportOk({
        files: manifest.total_files || 0,
        bytes: manifest.total_size || 0,
        errors: manifest.errors?.length || 0,
      });

      const manifestBuf = await pipeline.run(
        'compressJson:manifest',
        () => compressJson(manifest),
        { timeoutMs: COMPRESS_TIMEOUT_MS, progressMsg: 'Compression manifeste fichiers…' },
      );
      const manifestPath = `${backupPrefix}/files-manifest.json.gz`;
      const up = await timedUpload(manifestPath, manifestBuf);
      if (up.driveError) driveErrors.push(up.driveError);
      await verifyBackupArtifact(manifestPath, pipeline);
      totalSize += manifestBuf.length;
      if (typeKey === 'documents') mainFilePath = manifestPath;
    }

    if (typeKey === 'complete') {
      const index = {
        format: 'citymo-complete-v2',
        ref: row.ref,
        exported_at: new Date().toISOString(),
        files_mode: manifest?.mode || resolveFilesMode(),
        parts: {
          database: `${backupPrefix}/database.json.gz`,
          files_manifest: `${backupPrefix}/files-manifest.json.gz`,
        },
        storage_provider: storage.name,
        drive_enabled: Boolean(storage.driveEnabled),
      };
      const indexBuf = await pipeline.run(
        'compressJson:index',
        () => compressJson(index),
        { timeoutMs: COMPRESS_TIMEOUT_MS },
      );
      mainFilePath = `${backupPrefix}/complete-index.json.gz`;
      const up = await timedUpload(mainFilePath, indexBuf);
      if (up.driveError) driveErrors.push(up.driveError);
      await verifyBackupArtifact(mainFilePath, pipeline);
      totalSize += indexBuf.length;
    }

    let driveFolderId = null;
    let driveFolderUrl = null;
    if (driveUploadAllowed && storage.driveEnabled && storage.getDriveFolderLink) {
      try {
        const link = await pipeline.run(
          'getDriveFolderLink',
          () => storage.getDriveFolderLink(backupPrefix),
        );
        driveFolderId = link?.folderId || null;
        driveFolderUrl = link?.url || null;
      } catch (err) {
        driveErrors.push(err.message);
        logger.googleDriveUploadFail('folder-link', err);
      }
    }

    const driveSynced = driveUploadAllowed && storage.driveEnabled && driveErrors.length === 0;

    const updated = await pipeline.run('finalizeBackupRow:succes', () => finalizeBackupRow(row.id, {
      statut: 'succes',
      file_path: mainFilePath,
      taille_bytes: totalSize,
      drive_synced: driveSynced,
      drive_folder_id: driveFolderId,
      drive_sync_error: driveErrors.length ? driveErrors.join(' | ') : null,
    }));

    if (driveFolderUrl) {
      updated.drive_folder_url = driveFolderUrl;
    }

    logger.backupDone(backupPrefix, {
      type: typeKey,
      bytes: totalSize,
      drive_synced: driveSynced,
      drive_errors: driveErrors.length,
      file_path: mainFilePath,
      steps: pipeline.lastStep,
    });

    return updated;
  } catch (err) {
    const failMsg = formatFailMessage(err, pipeline.lastLocation);
    logger.backupError(backupPrefix, err);
    const driveOnlyMsg = err?.domain === DOMAINS.DRIVE
      ? err.message.replace(`[${DOMAINS.DRIVE}] `, '')
      : null;
    await safeFinalizeBackupRow(row.id, {
      statut: 'erreur',
      error_message: failMsg,
      drive_synced: false,
      drive_sync_error: driveOnlyMsg || (err?.domain === DOMAINS.DRIVE ? failMsg : null),
    }, failMsg);
    await logBackupAction({
      backupId: row.id,
      action: 'error',
      actor,
      details: { message: failMsg, step: pipeline.lastStep, location: pipeline.lastLocation },
    });
    throw err;
  } finally {
    pipeline.dispose();
  }
}

/** Lance la sauvegarde en arrière-plan (réponse HTTP immédiate — évite timeout Vercel/Railway proxy). */
async function startBackupAsync({ type, planification, description, actor }) {
  await assertNoConcurrentBackup();

  const typeKey = 'complete';
  const row = await createBackupRow({ type: typeKey, planification, description, actor });
  const jobParams = { typeKey, planification, description, actor };

  markJobStarted(row.ref);
  setImmediate(() => {
    withTimeout(
      executeBackupJob(row, jobParams),
      JOB_TIMEOUT_MS,
      `sauvegarde ${row.ref}`,
    )
      .catch(async (err) => {
        console.error('[backup:async] échec', { ref: row.ref, message: err.message });
        try {
          const sb = getSupabaseAdmin();
          const { data } = await sb.from('erp_backups').select('statut').eq('id', row.id).maybeSingle();
          if (data?.statut === 'en_cours') {
            await safeFinalizeBackupRow(row.id, {
              statut: 'erreur',
              error_message: formatFailMessage(err, 'async'),
              drive_synced: false,
            }, err.message);
          }
        } catch (finalizeErr) {
          console.error('[backup:async] finalize après échec', finalizeErr.message);
        }
      })
      .finally(() => {
        markJobFinished(row.ref);
      });
  });

  return row;
}

async function runBackup({ type, planification, description, actor }) {
  const typeKey = 'complete';
  const row = await createBackupRow({ type: typeKey, planification, description, actor });
  return executeBackupJob(row, { typeKey, planification, description, actor });
}

async function registerSchedule({ type, planification, notes, actor }) {
  const sb = getSupabaseAdmin();
  const typeKey = 'complete';
  const planKey = (planification || '').toLowerCase();

  if (!['quotidienne', 'hebdomadaire', 'mensuelle'].includes(planKey)) {
    throw new Error('Planification invalide.');
  }

  const nextRun = computeNextRun(planKey);

  const { data, error } = await sb
    .from('erp_backup_schedules')
    .insert({
      backup_type: typeKey,
      planification: planKey,
      notes: notes?.trim() || null,
      next_run_at: nextRun.toISOString(),
      created_by: actor?.id || null,
    })
    .select('*')
    .single();

  if (error) throw new Error(`Planification sauvegarde : ${error.message}`);

  await logBackupAction({
    action: 'schedule',
    actor,
    details: { type: typeKey, planification: planKey, schedule_id: data.id },
  });

  return data;
}

function computeNextRun(planification) {
  const now = new Date();
  const next = new Date(now);
  next.setHours(2, 0, 0, 0);

  if (planification === 'quotidienne') {
    if (next <= now) next.setDate(next.getDate() + 1);
  } else if (planification === 'hebdomadaire') {
    const day = next.getDay();
    const daysUntilSunday = (7 - day) % 7 || 7;
    next.setDate(next.getDate() + daysUntilSunday);
    if (next <= now) next.setDate(next.getDate() + 7);
  } else if (planification === 'mensuelle') {
    next.setDate(1);
    if (next <= now) next.setMonth(next.getMonth() + 1);
  }

  return next;
}

async function getBackupById(id) {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from('erp_backups').select('*').eq('id', id).single();
  if (error) throw new Error('Sauvegarde introuvable.');
  return data;
}

async function getDownloadUrl(backupId, actor) {
  const backup = await getBackupById(backupId);
  if (backup.statut !== 'succes' || !backup.file_path) {
    throw new Error('Sauvegarde non disponible au téléchargement.');
  }

  const storage = getBackupStorageProvider(backup.storage_provider);
  const url = await storage.getSignedUrl(backup.file_path, 3600);

  let driveUrl = null;
  if (storage.getDriveFolderLink) {
    try {
      const link = await storage.getDriveFolderLink(backup.ref);
      driveUrl = link?.url || null;
    } catch { /* ignore */ }
  }

  await logBackupAction({
    backupId,
    action: 'download',
    actor,
    details: { ref: backup.ref, file_path: backup.file_path, drive_url: driveUrl },
  });

  return { url, driveUrl, nom: backup.nom, ref: backup.ref };
}

async function deleteBackup(backupId, actor) {
  const backup = await getBackupById(backupId);
  const storage = getBackupStorageProvider(backup.storage_provider);

  if (backup.file_path) {
    try {
      await storage.remove(backup.file_path);
      const prefix = backup.ref;
      const files = await storage.list(prefix);
      for (const f of files) {
        if (f.name) {
          try { await storage.remove(`${prefix}/${f.name}`); } catch { /* ignore */ }
        }
      }
      if (storage.removeBackupFolder) {
        await storage.removeBackupFolder(backup.ref);
      }
    } catch (err) {
      console.warn('[deleteBackup] storage', err.message);
    }
  }

  const sb = getSupabaseAdmin();
  const { error } = await sb.from('erp_backups').delete().eq('id', backupId);
  if (error) throw new Error(error.message);

  await logBackupAction({
    backupId,
    action: 'delete',
    actor,
    details: { ref: backup.ref },
  });
}

module.exports = {
  runBackup,
  startBackupAsync,
  registerSchedule,
  getDownloadUrl,
  deleteBackup,
  getBackupById,
  createBackupRow,
  computeNextRun,
  genBackupRef,
  reconcileStuckBackups,
};

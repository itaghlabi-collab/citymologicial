/**
 * Orchestration sauvegardes ERP CITYMO.
 */
const zlib = require('zlib');
const { promisify } = require('util');
const { getSupabaseAdmin } = require('../../lib/supabaseAdmin');
const { getBackupStorageProvider, isGoogleDriveEnabled } = require('./backupStorageProvider');
const { exportDatabase, exportErpConfig } = require('./databaseExporter');
const { exportFiles, resolveFilesMode } = require('./filesExporter');
const { verifyBackupArtifact, countStorageFilesUnder } = require('./backupArtifacts');
const { assertBackupIntegrity } = require('./backupIntegrity');
const { createPipeline, COMPRESS_TIMEOUT_MS, runTimed } = require('./backupPipeline');
const { wrapStorageUpload, createDriveMirror, DRIVE_UPLOAD_TIMEOUT_MS } = require('./timedBackupStorage');
const { formatFailMessage, DOMAINS } = require('./backupErrors');
const { updateErpBackupRow, buildInsertPayload } = require('./erpBackupSchema');
const { validateGoogleDriveForBackup } = require('./googleDriveAccess');
const {
  ensureBackupFolder,
  getCachedBackupFolderId,
  verifyBackupArchivesOnDrive,
} = require('./googleDriveBackupUploader');
const { isDriveRequired } = require('./googleDriveConfig');
const { logBackupAction } = require('./auditLog');
const logger = require('./backupLogger');
const { testSupabaseConnection } = require('./backupEnvCheck');
const { classifyDriveError } = require('./googleDriveErrors');
const { sanitizeErrorForUser } = require('./backupUserMessages');
const {
  isDriveReconnectRequired,
  markDriveReconnectRequired,
} = require('./googleDriveAuthState');
const { notifyDriveReconnectRequired, notifyBackupPartialOrFail } = require('./backupNotify');
const { computeNextRun, algiersDateKey } = require('./backupSchedule');
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

async function createBackupRow({ type, planification, description, actor, scheduleType, schedulePeriodKey }) {
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
    schedule_period_key: schedulePeriodKey || null,
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

async function executeBackupJob(row, { typeKey, planification, description, actor, schedulePeriodKey }) {
  const storage = getBackupStorageProvider();
  const backupPrefix = row.ref;
  const pipeline = createPipeline(row.ref, (msg) => updateBackupProgress(row.id, msg));
  let driveUploadAllowed = false;
  const steps = {
    archive: false,
    database: false,
    files: false,
    storage: false,
    drive: false,
    integrity: false,
  };

  logger.backupStart(backupPrefix, typeKey, actor);

  await logBackupAction({
    backupId: row.id,
    action: 'create',
    actor,
    details: { type: typeKey, planification, ref: row.ref, schedulePeriodKey },
  });

  let manifest = null;
  let dbPayload = null;
  let totalSize = 0;
  let mainFilePath = null;

  try {
    await pipeline.run('testSupabaseConnection', () => testSupabaseConnection());

    let driveValidationError = null;
    const reconnectPending = await isDriveReconnectRequired();

    if (reconnectPending) {
      driveUploadAllowed = false;
      driveValidationError = 'Google Drive déconnecté — reconnexion nécessaire';
      console.warn('[backup] Drive sauté (reconnexion requise)');
    } else {
      try {
        const driveCheck = await pipeline.run(
          'googleDrive.validate',
          () => validateGoogleDriveForBackup(),
        );
        driveUploadAllowed = Boolean(driveCheck.uploadAllowed);
      } catch (err) {
        const classified = classifyDriveError(err);
        if (classified.reconnectRequired) {
          const marked = await markDriveReconnectRequired(err);
          if (!marked.alreadyNotified) {
            await notifyDriveReconnectRequired({ classified, backupRef: row.ref });
          }
          driveValidationError = classified.userMessage;
          driveUploadAllowed = false;
          // Continuer la sauvegarde Storage même si Drive était « required »
          console.warn('[backup] invalid_grant — poursuite Storage sans Drive');
        } else if (isDriveRequired()) {
          throw err;
        } else {
          driveValidationError = err.message?.replace(/^\[Google Drive\]\s*/, '') || String(err.message || err);
          driveUploadAllowed = false;
          console.warn('[backup] Google Drive ignoré:', driveValidationError);
        }
      }
    }

    if (driveUploadAllowed) {
      await pipeline.run('ensureBackupFolder', () => ensureBackupFolder(backupPrefix));
    }

    const timedUpload = wrapStorageUpload(storage, pipeline, 'backup', {
      driveUploadAllowed,
      backupRef: backupPrefix,
    });

    await pipeline.run('updateBackupProgress:init', async () => {
      await updateBackupProgress(row.id, 'Export base de données…');
    });

    const driveErrors = [];
    const driveUploadedPaths = [];

    if (typeKey === 'base_donnees' || typeKey === 'complete') {
      dbPayload = await pipeline.run(
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
      else if (driveUploadAllowed) driveUploadedPaths.push(mainFilePath);
      await verifyBackupArtifact(mainFilePath, pipeline);
      totalSize += compressed.length;
      steps.database = true;
      steps.archive = true;
      steps.storage = true;
      await pipeline.run('updateBackupProgress:db-done', async () => {
        await updateBackupProgress(row.id, 'Base de données exportée — inventaire fichiers…');
      });
    }

    if (typeKey === 'documents' || typeKey === 'complete') {
      const filesMode = typeKey === 'complete' ? 'full' : resolveFilesMode();

      const baseMirror = driveUploadAllowed ? createDriveMirror(backupPrefix) : null;
      const mirrorDrive = baseMirror
        ? async (destPath, buf, contentType) => {
          await runTimed(
            'drive-mirror',
            destPath,
            () => baseMirror(destPath, buf, contentType),
            DRIVE_UPLOAD_TIMEOUT_MS,
          );
          driveUploadedPaths.push(destPath);
        }
        : null;

      manifest = await pipeline.run(
        'exportFiles',
        () => exportFiles(backupPrefix, {
          mode: filesMode,
          pipeline,
          mirrorDrive,
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
      else if (driveUploadAllowed) driveUploadedPaths.push(manifestPath);
      await verifyBackupArtifact(manifestPath, pipeline);
      totalSize += manifestBuf.length;
      steps.files = true;
      steps.storage = true;
      if (typeKey === 'documents') mainFilePath = manifestPath;
    }

    if (typeKey === 'complete') {
      const index = {
        format: 'citymo-complete-v3',
        ref: row.ref,
        exported_at: new Date().toISOString(),
        files_mode: 'full',
        parts: {
          database: `${backupPrefix}/database.json.gz`,
          files_manifest: `${backupPrefix}/files-manifest.json.gz`,
          index: `${backupPrefix}/complete-index.json.gz`,
          files_root: `${backupPrefix}/files/`,
        },
        stats: {
          tables_exported: dbPayload?.meta?.tables?.length ?? 0,
          files_listed: manifest?.listed_objects ?? 0,
          files_copied: manifest?.copied_files ?? 0,
          drive_files_copied: manifest?.drive_copied_files ?? 0,
          total_size_bytes: totalSize,
        },
        storage_provider: storage.name,
        drive_enabled: Boolean(driveUploadAllowed && storage.driveEnabled),
      };
      const indexBuf = await pipeline.run(
        'compressJson:index',
        () => compressJson(index),
        { timeoutMs: COMPRESS_TIMEOUT_MS },
      );
      mainFilePath = `${backupPrefix}/complete-index.json.gz`;
      const up = await timedUpload(mainFilePath, indexBuf);
      if (up.driveError) driveErrors.push(up.driveError);
      else if (driveUploadAllowed) driveUploadedPaths.push(mainFilePath);
      await verifyBackupArtifact(mainFilePath, pipeline);
      totalSize += indexBuf.length;
    }

    let storageFileCount = null;
    if (manifest?.mode === 'full') {
      storageFileCount = await pipeline.run(
        'countStorageFilesUnder',
        () => countStorageFilesUnder(`${backupPrefix}/files`, pipeline),
        { timeoutMs: 30 * 60_000, progressMsg: 'Vérification copie fichiers…' },
      );
    }

    const driveEnabled = Boolean(storage.driveEnabled && isGoogleDriveEnabled());

    const integrityReport = await pipeline.run(
      'assertBackupIntegrity',
      () => assertBackupIntegrity({
        typeKey,
        backupPrefix,
        dbPayload,
        manifest,
        driveUploadAllowed,
        driveEnabled,
        driveErrors,
        pipeline,
        storageFileCount,
        totalSize,
        driveSkipped: Boolean(driveValidationError) && !driveUploadAllowed,
      }),
      { timeoutMs: 30 * 60_000, progressMsg: 'Contrôle intégrité final…' },
    );

    let driveFolderId = getCachedBackupFolderId(backupPrefix);
    let driveSynced = false;
    let driveSyncError = null;

    if (driveUploadAllowed && driveEnabled) {
      try {
        const driveVerify = await pipeline.run(
          'verifyBackupArchivesOnDrive',
          () => verifyBackupArchivesOnDrive(backupPrefix),
          { timeoutMs: 120_000 },
        );
        driveFolderId = driveVerify.folderId;
        driveSynced = true;
        steps.drive = true;
      } catch (err) {
        const classified = classifyDriveError(err);
        driveSyncError = classified.reconnectRequired
          ? classified.userMessage
          : err.message;
        if (classified.reconnectRequired) {
          const marked = await markDriveReconnectRequired(err);
          if (!marked.alreadyNotified) {
            await notifyDriveReconnectRequired({ classified, backupRef: row.ref });
          }
        } else if (isDriveRequired()) {
          throw new Error(`[Google Drive] ${err.message}`);
        }
      }
    }

    // Drive required mais sync KO (ex. reconnexion) → succès partiel si Storage OK
    if (isDriveRequired() && driveEnabled && !driveSynced && mainFilePath) {
      steps.integrity = Boolean(integrityReport);
      const userMsg = driveSyncError || driveValidationError
        || 'Sauvegarde créée dans Storage, mais copie Google Drive impossible : reconnexion requise.';
      const updated = await pipeline.run('finalizeBackupRow:succes_partiel', () => finalizeBackupRow(row.id, {
        statut: 'succes_partiel',
        file_path: mainFilePath,
        taille_bytes: totalSize,
        drive_synced: false,
        drive_folder_id: driveFolderId,
        drive_sync_error: driveSyncError || driveValidationError,
        user_message: userMsg,
        error_code: 'invalid_grant',
        schedule_period_key: schedulePeriodKey || null,
        steps_json: steps,
        description: `Succès partiel — ${userMsg}`,
        error_message: null,
      }));
      await notifyBackupPartialOrFail({
        title: 'Sauvegarde partielle',
        message: userMsg,
        backupId: row.id,
        dedupeKey: `partial-${algiersDateKey()}`,
      });
      logger.backupDone(backupPrefix, {
        type: typeKey,
        bytes: totalSize,
        drive_synced: false,
        partial: true,
      });
      return updated;
    }

    if (isDriveRequired() && driveEnabled && !driveSynced) {
      throw new Error(`[Google Drive] ${driveSyncError || 'Dossier Drive vide — archives absentes'}`);
    }

    steps.integrity = true;
    steps.drive = driveSynced;
    const updated = await pipeline.run('finalizeBackupRow:succes', () => finalizeBackupRow(row.id, {
      statut: 'succes',
      file_path: mainFilePath,
      taille_bytes: totalSize,
      drive_synced: driveSynced,
      drive_folder_id: driveFolderId,
      drive_sync_error: driveSyncError || driveValidationError,
      user_message: null,
      error_code: null,
      schedule_period_key: schedulePeriodKey || null,
      steps_json: steps,
      description: driveSynced
        ? `Intégrité OK — ${integrityReport.tables_exported} tables, ${integrityReport.files_copied} fichiers copiés, Drive sync OK`
        : driveValidationError
          ? `Intégrité OK — Supabase OK, Drive ignoré (${driveValidationError})`
          : `Intégrité OK — Supabase OK, Drive ⚠ ${driveSyncError || 'non synchronisé'}`,
    }));

    logger.backupDone(backupPrefix, {
      type: typeKey,
      bytes: totalSize,
      drive_synced: driveSynced,
      drive_folder_id: driveFolderId,
      integrity: integrityReport,
      file_path: mainFilePath,
      steps: pipeline.lastStep,
    });

    return updated;
  } catch (err) {
    const failMsg = err.integrityReport
      ? err.message
      : formatFailMessage(err, pipeline.lastLocation);
    logger.backupError(backupPrefix, err);

    const classified = classifyDriveError(err);
    const sanitized = sanitizeErrorForUser(err);

    if (classified.reconnectRequired) {
      const marked = await markDriveReconnectRequired(err);
      if (!marked.alreadyNotified) {
        await notifyDriveReconnectRequired({ classified, backupRef: row.ref });
      }
    }

    const driveOnlyFailure = mainFilePath && (
      classified.reconnectRequired
      || (!isDriveRequired() && (failMsg.includes('[Google Drive]') || failMsg.includes('DRIVE]')))
    );

    if (driveOnlyFailure) {
      const userMsg = sanitized.userMessage;
      await safeFinalizeBackupRow(row.id, {
        statut: 'succes_partiel',
        file_path: mainFilePath || null,
        taille_bytes: totalSize || null,
        error_message: null,
        user_message: userMsg,
        error_code: sanitized.code,
        drive_synced: false,
        drive_sync_error: userMsg,
        drive_folder_id: getCachedBackupFolderId(backupPrefix),
        schedule_period_key: schedulePeriodKey || null,
        description: `Succès partiel — ${userMsg}`,
      }, failMsg);
      return null;
    }

    const driveOnlyMsg = err?.domain === DOMAINS.DRIVE
      ? err.message.replace(`[${DOMAINS.DRIVE}] `, '')
      : null;
    await safeFinalizeBackupRow(row.id, {
      statut: 'erreur',
      error_message: sanitized.technical || failMsg,
      user_message: sanitized.userMessage,
      error_code: sanitized.code,
      drive_synced: false,
      drive_sync_error: driveOnlyMsg || (err?.domain === DOMAINS.DRIVE ? failMsg : null),
      schedule_period_key: schedulePeriodKey || null,
    }, failMsg);
    await logBackupAction({
      backupId: row.id,
      action: 'error',
      actor,
      details: { message: sanitized.userMessage, code: sanitized.code, step: pipeline.lastStep },
    });
    throw err;
  } finally {
    pipeline.dispose();
  }
}

/** Lance la sauvegarde en arrière-plan (réponse HTTP immédiate — évite timeout Vercel/Railway proxy). */
async function startBackupAsync({ type, planification, description, actor, schedulePeriodKey }) {
  await assertNoConcurrentBackup();

  const typeKey = 'complete';
  const row = await createBackupRow({ type: typeKey, planification, description, actor, schedulePeriodKey });
  const jobParams = { typeKey, planification, description, actor, schedulePeriodKey };

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
            const sanitized = sanitizeErrorForUser(err);
            await safeFinalizeBackupRow(row.id, {
              statut: 'erreur',
              error_message: sanitized.technical || formatFailMessage(err, 'async'),
              user_message: sanitized.userMessage,
              error_code: sanitized.code,
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

async function runBackup({ type, planification, description, actor, schedulePeriodKey }) {
  const typeKey = 'complete';
  const row = await createBackupRow({
    type: typeKey,
    planification,
    description,
    actor,
    schedulePeriodKey,
  });
  return executeBackupJob(row, { typeKey, planification, description, actor, schedulePeriodKey });
}

async function registerSchedule({ type, planification, notes, actor }) {
  const sb = getSupabaseAdmin();
  const typeKey = 'complete';
  const planKey = (planification || '').toLowerCase();

  if (!['quotidienne', 'hebdomadaire', 'mensuelle'].includes(planKey)) {
    throw new Error('Planification invalide.');
  }

  // Une seule planification active par type (évite doublons horaires)
  const { data: existing } = await sb
    .from('erp_backup_schedules')
    .select('id')
    .eq('planification', planKey)
    .eq('enabled', true)
    .limit(1);

  if (existing?.length) {
    const nextRun = computeNextRun(planKey);
    const { data, error } = await sb
      .from('erp_backup_schedules')
      .update({
        notes: notes?.trim() || null,
        next_run_at: nextRun.toISOString(),
        backup_type: typeKey,
      })
      .eq('id', existing[0].id)
      .select('*')
      .single();
    if (error) throw new Error(`Planification sauvegarde : ${error.message}`);
    return data;
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

async function getBackupById(id) {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from('erp_backups').select('*').eq('id', id).single();
  if (error) throw new Error('Sauvegarde introuvable.');
  return data;
}

async function getDownloadUrl(backupId, actor) {
  const backup = await getBackupById(backupId);
  const okStatuts = ['succes', 'succes_partiel'];
  if (!okStatuts.includes(backup.statut) || !backup.file_path) {
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

/**
 * Orchestration sauvegardes ERP CITYMO.
 */
const zlib = require('zlib');
const { promisify } = require('util');
const { getSupabaseAdmin } = require('../../lib/supabaseAdmin');
const { getBackupStorageProvider, isGoogleDriveEnabled } = require('./backupStorageProvider');
const { exportDatabase, exportErpConfig } = require('./databaseExporter');
const { exportFiles } = require('./filesExporter');
const { logBackupAction } = require('./auditLog');
const logger = require('./backupLogger');
const { testSupabaseConnection } = require('./backupEnvCheck');

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

  const { data, error } = await sb
    .from('erp_backups')
    .insert({
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
    })
    .select('*')
    .single();

  if (error) throw new Error(`Création journal sauvegarde : ${error.message}`);
  return data;
}

async function finalizeBackupRow(id, {
  statut, file_path, taille_bytes, error_message,
  drive_synced, drive_folder_id, drive_sync_error,
}) {
  const sb = getSupabaseAdmin();
  const payload = {
    statut,
    file_path: file_path || null,
    taille_bytes: taille_bytes || null,
    error_message: error_message || null,
  };
  if (drive_synced !== undefined) payload.drive_synced = drive_synced;
  if (drive_folder_id !== undefined) payload.drive_folder_id = drive_folder_id;
  if (drive_sync_error !== undefined) payload.drive_sync_error = drive_sync_error;

  const { data, error } = await sb
    .from('erp_backups')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw new Error(`Mise à jour sauvegarde : ${error.message}`);
  return data;
}

async function compressJson(payload) {
  const json = JSON.stringify(payload);
  return gzip(Buffer.from(json, 'utf8'));
}

async function runBackup({ type, planification, description, actor }) {
  const typeKey = TYPE_MAP[type] || type || 'complete';
  const row = await createBackupRow({ type: typeKey, planification, description, actor });
  const storage = getBackupStorageProvider();
  const backupPrefix = row.ref;

  logger.backupStart(backupPrefix, typeKey, actor);

  await logBackupAction({
    backupId: row.id,
    action: 'create',
    actor,
    details: { type: typeKey, planification, ref: row.ref },
  });

  try {
    await testSupabaseConnection();

    let totalSize = 0;
    let mainFilePath = null;
    const driveErrors = [];

    if (typeKey === 'base_donnees' || typeKey === 'complete') {
      const dbPayload = await exportDatabase();
      if (typeKey === 'complete') {
        dbPayload.erp_config = await exportErpConfig();
      }
      logger.supabaseExportOk({
        tables: dbPayload.meta?.tables?.length || 0,
        rows: Object.values(dbPayload.meta?.rowCounts || {}).reduce((a, b) => a + b, 0),
        skipped: dbPayload.meta?.skipped?.length || 0,
      });

      const compressed = await compressJson(dbPayload);
      mainFilePath = `${backupPrefix}/database.json.gz`;
      const up = await storage.upload(mainFilePath, compressed);
      if (up.driveError) driveErrors.push(up.driveError);
      totalSize += compressed.length;
    }

    if (typeKey === 'documents' || typeKey === 'complete') {
      const manifest = await exportFiles(backupPrefix, storage);
      logger.storageExportOk({
        files: manifest.total_files || 0,
        bytes: manifest.total_size || 0,
        errors: manifest.errors?.length || 0,
      });

      const manifestBuf = await compressJson(manifest);
      const manifestPath = `${backupPrefix}/files-manifest.json.gz`;
      const up = await storage.upload(manifestPath, manifestBuf);
      if (up.driveError) driveErrors.push(up.driveError);
      totalSize += manifestBuf.length;
      if (typeKey === 'documents') mainFilePath = manifestPath;
    }

    if (typeKey === 'complete') {
      const index = {
        format: 'citymo-complete-v1',
        ref: row.ref,
        exported_at: new Date().toISOString(),
        parts: {
          database: `${backupPrefix}/database.json.gz`,
          files_manifest: `${backupPrefix}/files-manifest.json.gz`,
        },
        storage_provider: storage.name,
        drive_enabled: Boolean(storage.driveEnabled),
      };
      const indexBuf = await compressJson(index);
      mainFilePath = `${backupPrefix}/complete-index.json.gz`;
      const up = await storage.upload(mainFilePath, indexBuf);
      if (up.driveError) driveErrors.push(up.driveError);
      totalSize += indexBuf.length;
    }

    let driveFolderId = null;
    let driveFolderUrl = null;
    if (storage.driveEnabled && storage.getDriveFolderLink) {
      try {
        const link = await storage.getDriveFolderLink(backupPrefix);
        driveFolderId = link?.folderId || null;
        driveFolderUrl = link?.url || null;
      } catch (err) {
        driveErrors.push(err.message);
        logger.googleDriveUploadFail('folder-link', err);
      }
    }

    const driveSynced = storage.driveEnabled && driveErrors.length === 0;

    const updated = await finalizeBackupRow(row.id, {
      statut: 'succes',
      file_path: mainFilePath,
      taille_bytes: totalSize,
      drive_synced: driveSynced,
      drive_folder_id: driveFolderId,
      drive_sync_error: driveErrors.length ? driveErrors.join(' | ') : null,
    });

    if (driveFolderUrl) {
      updated.drive_folder_url = driveFolderUrl;
    }

    logger.backupDone(backupPrefix, {
      type: typeKey,
      bytes: totalSize,
      drive_synced: driveSynced,
      drive_errors: driveErrors.length,
      file_path: mainFilePath,
    });

    return updated;
  } catch (err) {
    logger.backupError(backupPrefix, err);
    await finalizeBackupRow(row.id, {
      statut: 'erreur',
      error_message: err.message,
      drive_synced: false,
      drive_sync_error: err.message,
    }).catch(() => {});
    await logBackupAction({
      backupId: row.id,
      action: 'error',
      actor,
      details: { message: err.message },
    });
    throw err;
  }
}

async function registerSchedule({ type, planification, notes, actor }) {
  const sb = getSupabaseAdmin();
  const typeKey = TYPE_MAP[type] || 'complete';
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
  registerSchedule,
  getDownloadUrl,
  deleteBackup,
  getBackupById,
  createBackupRow,
  computeNextRun,
  genBackupRef,
};

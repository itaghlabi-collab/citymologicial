/**
 * Restauration sauvegardes ERP — upsert sans DROP/TRUNCATE.
 */
const zlib = require('zlib');
const { promisify } = require('util');
const { getSupabaseAdmin } = require('../../lib/supabaseAdmin');
const { getBackupStorageProvider } = require('./backupStorageProvider');
const { runBackup } = require('./backupService');
const { logBackupAction } = require('./auditLog');

const gunzip = promisify(zlib.gunzip);

async function decompressJson(buffer) {
  const raw = await gunzip(buffer);
  return JSON.parse(raw.toString('utf8'));
}

async function upsertTable(table, rows) {
  if (!rows?.length) return { table, upserted: 0 };
  const sb = getSupabaseAdmin();
  const chunkSize = 200;
  let upserted = 0;

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await sb.from(table).upsert(chunk, { onConflict: 'id', ignoreDuplicates: false });
    if (error) {
      const { error: insErr } = await sb.from(table).insert(chunk);
      if (insErr) {
        return { table, upserted, error: insErr.message };
      }
    }
    upserted += chunk.length;
  }

  return { table, upserted };
}

async function restoreDatabaseFromPayload(payload) {
  const tables = payload.tables || {};
  const results = [];
  const skipTables = new Set(['erp_backup_audit_log']);

  for (const [table, rows] of Object.entries(tables)) {
    if (skipTables.has(table)) continue;
    results.push(await upsertTable(table, rows));
  }

  return results;
}

async function restoreFilesFromManifest(manifest) {
  const sb = getSupabaseAdmin();
  const storage = getBackupStorageProvider();
  const restored = [];
  const errors = [];

  for (const file of manifest.files || []) {
    try {
      const buf = await storage.download(file.dest);
      const parts = (file.source || '').split('/');
      const bucket = parts[0];
      const objectPath = parts.slice(1).join('/');
      if (!bucket || !objectPath) throw new Error('Chemin source invalide');

      const { error } = await sb.storage.from(bucket).upload(objectPath, buf, { upsert: true });
      if (error) throw new Error(error.message);
      restored.push(file.source);
    } catch (err) {
      errors.push({ file: file.source, error: err.message });
    }
  }

  return { restored: restored.length, errors };
}

async function restoreBackup(backupId, actor, confirmation) {
  if (confirmation !== 'RESTAURER') {
    throw new Error('Confirmation requise : saisissez RESTAURER.');
  }

  const { data: backup, error: fetchErr } = await getSupabaseAdmin()
    .from('erp_backups')
    .select('*')
    .eq('id', backupId)
    .single();

  if (fetchErr || !backup) throw new Error('Sauvegarde introuvable.');
  if (backup.statut !== 'succes') {
    throw new Error('Seules les sauvegardes réussies peuvent être restaurées.');
  }

  const preBackup = await runBackup({
    type: 'complete',
    planification: 'manuelle',
    description: `Sauvegarde automatique avant restauration de ${backup.ref}`,
    actor,
  });

  await logBackupAction({
    backupId,
    action: 'restore',
    actor,
    details: { ref: backup.ref, pre_backup_ref: preBackup.ref, status: 'started' },
  });

  const storage = getBackupStorageProvider(backup.storage_provider);
  const typeKey = backup.type;

  try {
    let dbResults = null;
    let fileResults = null;
    let index = null;

    if (typeKey === 'complete') {
      index = await decompressJson(await storage.download(backup.file_path));
    }

    if (typeKey === 'base_donnees' || typeKey === 'complete') {
      const dbPath = typeKey === 'complete' ? index.parts.database : backup.file_path;
      const dbPayload = await decompressJson(await storage.download(dbPath));
      dbResults = await restoreDatabaseFromPayload(dbPayload);
    }

    if (typeKey === 'documents' || typeKey === 'complete') {
      const manifestPath = typeKey === 'complete' ? index.parts.files_manifest : backup.file_path;
      const manifest = await decompressJson(await storage.download(manifestPath));
      fileResults = await restoreFilesFromManifest(manifest);
    }

    await logBackupAction({
      backupId,
      action: 'restore',
      actor,
      details: {
        ref: backup.ref,
        pre_backup_ref: preBackup.ref,
        status: 'completed',
        dbResults,
        fileResults,
      },
    });

    return { preBackupRef: preBackup.ref, dbResults, fileResults };
  } catch (err) {
    await logBackupAction({
      backupId,
      action: 'error',
      actor,
      details: { ref: backup.ref, phase: 'restore', message: err.message },
    });
    throw err;
  }
}

module.exports = { restoreBackup };

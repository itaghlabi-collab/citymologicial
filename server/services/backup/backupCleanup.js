/**
 * Nettoyage des tentatives échouées uniquement.
 * Ne touche jamais aux succès / succès partiels / jobs en cours.
 */
const { getSupabaseAdmin } = require('../../lib/supabaseAdmin');
const { logBackupAction } = require('./auditLog');
const { getBackupStorageProvider } = require('./backupStorageProvider');

async function removeFailedBackupFiles(row) {
  if (!row?.file_path && !row?.ref) return;
  try {
    const storage = getBackupStorageProvider(row.storage_provider);
    if (row.file_path) {
      try { await storage.remove(row.file_path); } catch { /* ignore */ }
    }
    const prefix = row.ref;
    if (prefix && storage.list) {
      const files = await storage.list(prefix).catch(() => []);
      for (const f of files || []) {
        if (f.name) {
          try { await storage.remove(`${prefix}/${f.name}`); } catch { /* ignore */ }
        }
      }
    }
    if (prefix && storage.removeBackupFolder) {
      try { await storage.removeBackupFolder(prefix); } catch { /* ignore */ }
    }
  } catch (err) {
    console.warn('[backup:cleanup] fichiers', row.ref, err.message);
  }
}

async function cleanupFailedBackupAttempts(actor) {
  const sb = getSupabaseAdmin();
  const { data: rows, error } = await sb
    .from('erp_backups')
    .select('id, ref, statut, file_path, storage_provider, error_message')
    .eq('statut', 'erreur');

  if (error) throw new Error(error.message);

  let deleted = 0;
  const deleteErrors = [];

  for (const row of rows || []) {
    await removeFailedBackupFiles(row);
    const { error: delErr } = await sb.from('erp_backups').delete().eq('id', row.id);
    if (delErr) {
      deleteErrors.push(`${row.ref}: ${delErr.message}`);
      continue;
    }
    deleted += 1;
    await logBackupAction({
      backupId: row.id,
      action: 'cleanup_failed',
      actor,
      details: { ref: row.ref },
    });
  }

  if (deleted === 0 && (rows || []).length && deleteErrors.length) {
    throw new Error(`Nettoyage impossible : ${deleteErrors[0]}`);
  }

  return {
    scanned: rows?.length || 0,
    deleted,
    kept_with_file: 0,
  };
}

module.exports = { cleanupFailedBackupAttempts };

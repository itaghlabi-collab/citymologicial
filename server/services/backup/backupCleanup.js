/**
 * Nettoyage des tentatives échouées (sans fichier valide).
 * Ne touche jamais aux succès / succès partiels avec file_path.
 */
const { getSupabaseAdmin } = require('../../lib/supabaseAdmin');
const { logBackupAction } = require('./auditLog');

async function cleanupFailedBackupAttempts(actor) {
  const sb = getSupabaseAdmin();
  const { data: rows, error } = await sb
    .from('erp_backups')
    .select('id, ref, statut, file_path, error_message')
    .eq('statut', 'erreur');

  if (error) throw new Error(error.message);

  const deletable = (rows || []).filter((r) => !r.file_path);
  let deleted = 0;

  for (const row of deletable) {
    const { error: delErr } = await sb.from('erp_backups').delete().eq('id', row.id);
    if (!delErr) {
      deleted += 1;
      await logBackupAction({
        backupId: row.id,
        action: 'cleanup_failed',
        actor,
        details: { ref: row.ref },
      });
    }
  }

  return {
    scanned: rows?.length || 0,
    deleted,
    kept_with_file: (rows || []).filter((r) => r.file_path).length,
  };
}

module.exports = { cleanupFailedBackupAttempts };

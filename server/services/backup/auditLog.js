/**
 * Journal d'audit des opérations de sauvegarde.
 */
const { getSupabaseAdmin } = require('../../lib/supabaseAdmin');

async function logBackupAction({ backupId, action, actor, details = {} }) {
  try {
    const sb = getSupabaseAdmin();
    await sb.from('erp_backup_audit_log').insert({
      backup_id: backupId || null,
      action,
      actor_id: actor?.id || null,
      actor_email: actor?.email || null,
      details,
    });
  } catch (err) {
    console.error('[backup audit]', action, err.message);
  }
}

module.exports = { logBackupAction };

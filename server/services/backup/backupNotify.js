/**
 * Notifications admin sauvegardes — une seule alerte par type d’incident.
 */
const { getSupabaseAdmin } = require('../../lib/supabaseAdmin');
const { markReconnectNotified } = require('./googleDriveAuthState');

async function listSuperAdminUserIds() {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from('erp_user_profiles')
    .select('id, email, role, erp_roles ( code, est_admin )')
    .eq('statut', 'actif')
    .limit(200);

  if (error) {
    // fallback table users / profiles
    const alt = await sb.from('profiles').select('id, email, role').limit(200);
    if (alt.error) {
      console.warn('[backup:notify] destinataires:', error.message);
      return [];
    }
    return (alt.data || [])
      .filter((p) => String(p.role || '').toLowerCase().includes('admin'))
      .map((p) => p.id);
  }

  return (data || [])
    .filter((p) => {
      const code = String(p.erp_roles?.code || p.role || '').toLowerCase();
      return code.includes('super_admin') || p.erp_roles?.est_admin === true;
    })
    .map((p) => p.id);
}

async function notifyAdminsOnce({ title, message, entityType, entityId, actionUrl, dedupeKey }) {
  try {
    const sb = getSupabaseAdmin();

    if (dedupeKey) {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: existing } = await sb
        .from('notifications')
        .select('id')
        .eq('type', 'system')
        .eq('entity_type', entityType || 'backup')
        .gte('created_at', since)
        .ilike('message', `%${dedupeKey}%`)
        .limit(1);
      if (existing?.length) return { sent: false, reason: 'deduped' };
    }

    const ids = await listSuperAdminUserIds();
    if (!ids.length) {
      console.warn('[backup:notify] aucun super-admin trouvé');
      return { sent: false, reason: 'no_recipients' };
    }

    const rows = ids.map((uid) => ({
      recipient_user_id: uid,
      title,
      message: dedupeKey ? `${message} [${dedupeKey}]` : message,
      type: 'system',
      priority: 'high',
      entity_type: entityType || 'backup',
      entity_id: entityId || null,
      action_url: actionUrl || '/administration?tab=sauvegardes',
      is_read: false,
      is_global: false,
    }));

    const { error } = await sb.from('notifications').insert(rows);
    if (error) {
      console.warn('[backup:notify] insert:', error.message);
      return { sent: false, reason: error.message };
    }
    return { sent: true, count: rows.length };
  } catch (err) {
    console.warn('[backup:notify]', err.message);
    return { sent: false, reason: err.message };
  }
}

async function notifyDriveReconnectRequired({ classified, backupRef }) {
  const result = await notifyAdminsOnce({
    title: 'Google Drive — reconnexion requise',
    message: `${classified.userMessage}. La copie Storage peut être disponible. Action : Reconnecter Google Drive.`,
    entityType: 'backup_drive',
    entityId: backupRef || null,
    actionUrl: '/administration?tab=sauvegardes',
    dedupeKey: 'drive-reconnect',
  });
  if (result.sent) await markReconnectNotified();
  return result;
}

async function notifyBackupPartialOrFail({ title, message, backupId, dedupeKey }) {
  return notifyAdminsOnce({
    title,
    message,
    entityType: 'backup',
    entityId: backupId,
    dedupeKey,
  });
}

module.exports = {
  notifyAdminsOnce,
  notifyDriveReconnectRequired,
  notifyBackupPartialOrFail,
};

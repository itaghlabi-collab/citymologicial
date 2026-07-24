/**
 * État persistant Google Drive (reconnexion, tokens rotatifs).
 * Aucun secret n'est renvoyé aux clients.
 */
const { getSupabaseAdmin } = require('../../lib/supabaseAdmin');
const { classifyDriveError } = require('./googleDriveErrors');

const ROW_ID = 1;

async function readState() {
  try {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from('erp_backup_drive_state')
      .select('*')
      .eq('id', ROW_ID)
      .maybeSingle();
    if (error) {
      if (String(error.message || '').includes('does not exist')) return null;
      console.warn('[drive:state] lecture:', error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.warn('[drive:state] lecture:', err.message);
    return null;
  }
}

async function upsertState(patch) {
  try {
    const sb = getSupabaseAdmin();
    const payload = {
      id: ROW_ID,
      updated_at: new Date().toISOString(),
      ...patch,
    };
    const { data, error } = await sb
      .from('erp_backup_drive_state')
      .upsert(payload, { onConflict: 'id' })
      .select('*')
      .single();
    if (error) {
      console.warn('[drive:state] upsert:', error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.warn('[drive:state] upsert:', err.message);
    return null;
  }
}

async function isDriveReconnectRequired() {
  const state = await readState();
  return state?.status === 'reconnect_required';
}

async function getStoredRefreshToken() {
  const state = await readState();
  const token = state?.oauth_refresh_token?.trim();
  return token || null;
}

async function markDriveReconnectRequired(err) {
  const classified = classifyDriveError(err);
  const prev = await readState();
  await upsertState({
    status: 'reconnect_required',
    last_error_code: classified.code,
    last_error_user_message: classified.userMessage,
    last_check_at: new Date().toISOString(),
  });
  return {
    classified,
    alreadyNotified: Boolean(prev?.notify_reconnect_sent_at)
      && prev?.status === 'reconnect_required',
  };
}

async function markDriveActive({ account, folderId } = {}) {
  return upsertState({
    status: 'active',
    last_error_code: null,
    last_error_user_message: null,
    last_check_at: new Date().toISOString(),
    last_success_at: new Date().toISOString(),
    connected_account: account || null,
    folder_id: folderId || null,
    notify_reconnect_sent_at: null,
  });
}

async function markDriveDisconnected() {
  return upsertState({
    status: 'disconnected',
    oauth_refresh_token: null,
    last_check_at: new Date().toISOString(),
    last_error_code: null,
    last_error_user_message: 'Google Drive déconnecté',
  });
}

async function storeOAuthRefreshToken(refreshToken, meta = {}) {
  return upsertState({
    status: 'active',
    oauth_refresh_token: refreshToken,
    last_error_code: null,
    last_error_user_message: null,
    last_check_at: new Date().toISOString(),
    last_success_at: new Date().toISOString(),
    connected_account: meta.account || null,
    folder_id: meta.folderId || null,
    notify_reconnect_sent_at: null,
  });
}

async function markReconnectNotified() {
  return upsertState({
    notify_reconnect_sent_at: new Date().toISOString(),
  });
}

/** Vue client — jamais de tokens. */
async function getDriveStatePublic() {
  const state = await readState();
  const oauthEnv = Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID?.trim()
    && process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim()
    && (process.env.GOOGLE_OAUTH_REFRESH_TOKEN?.trim() || state?.oauth_refresh_token),
  );

  return {
    status: state?.status || (oauthEnv ? 'unknown' : 'misconfigured'),
    reconnect_required: state?.status === 'reconnect_required',
    last_error_code: state?.last_error_code || null,
    last_error_user_message: state?.last_error_user_message || null,
    last_check_at: state?.last_check_at || null,
    last_success_at: state?.last_success_at || null,
    connected_account: state?.connected_account || null,
    folder_id: state?.folder_id || process.env.GOOGLE_DRIVE_FOLDER_ID?.trim() || null,
    oauth_client_configured: Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID?.trim()),
    oauth_secret_configured: Boolean(process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim()),
    oauth_refresh_configured: Boolean(
      process.env.GOOGLE_OAUTH_REFRESH_TOKEN?.trim() || state?.oauth_refresh_token,
    ),
    oauth_refresh_source: state?.oauth_refresh_token
      ? 'database'
      : (process.env.GOOGLE_OAUTH_REFRESH_TOKEN?.trim() ? 'env' : 'none'),
  };
}

module.exports = {
  readState,
  upsertState,
  isDriveReconnectRequired,
  getStoredRefreshToken,
  markDriveReconnectRequired,
  markDriveActive,
  markDriveDisconnected,
  storeOAuthRefreshToken,
  markReconnectNotified,
  getDriveStatePublic,
};

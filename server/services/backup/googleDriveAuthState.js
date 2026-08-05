/**
 * État persistant Google Drive (reconnexion, tokens rotatifs).
 * Table optionnelle : si absente → warning seul, jamais d’échec de sauvegarde.
 * Aucun secret n'est renvoyé aux clients.
 */
const { getSupabaseAdmin } = require('../../lib/supabaseAdmin');
const { classifyDriveError, extractGoogleErrorCode } = require('./googleDriveErrors');

const ROW_ID = 1;
const TABLE = 'erp_backup_drive_state';

/** null = inconnu, true = absente, false = OK */
let tableMissing = null;
/** Fallback mémoire si table absente (durée de vie du process). */
let memoryState = {
  id: ROW_ID,
  status: 'unknown',
  auth_mode: null,
  folder_id: null,
  shared_drive_id: null,
  last_check_at: null,
  last_upload_at: null,
  last_success_at: null,
  error: null,
  last_error_code: null,
  last_error_user_message: null,
  connected_account: null,
  oauth_refresh_token: null,
  notify_reconnect_sent_at: null,
};

function isMissingTableError(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  const code = String(error?.code || '');
  return code === 'PGRST205'
    || msg.includes('schema cache')
    || msg.includes('could not find the table')
    || msg.includes('does not exist')
    || (msg.includes(TABLE) && msg.includes('not find'));
}

function markTableMissing(reason) {
  if (tableMissing !== true) {
    console.warn(
      `[drive:state] Table public.${TABLE} indisponible — état Drive en mémoire uniquement. `
      + 'Exécutez supabase/RUN_BACKUP_DRIVE_STATE.sql (ou la migration). '
      + `Détail: ${reason}`,
    );
  }
  tableMissing = true;
}

function normalizeRow(row) {
  if (!row) return null;
  const lastSuccess = row.last_success_at || row.last_upload_at || null;
  const errMsg = row.last_error_user_message || row.error || null;
  return {
    ...row,
    last_success_at: lastSuccess,
    last_upload_at: row.last_upload_at || lastSuccess,
    last_error_user_message: errMsg,
    error: row.error || errMsg,
  };
}

async function readState() {
  if (tableMissing === true) {
    return normalizeRow({ ...memoryState });
  }

  try {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from(TABLE)
      .select('*')
      .eq('id', ROW_ID)
      .maybeSingle();

    if (error) {
      if (isMissingTableError(error)) {
        markTableMissing(error.message);
        return normalizeRow({ ...memoryState });
      }
      console.warn('[drive:state] lecture:', error.message);
      return normalizeRow({ ...memoryState });
    }

    tableMissing = false;
    if (data) {
      memoryState = { ...memoryState, ...data };
      return normalizeRow(data);
    }
    return normalizeRow({ ...memoryState });
  } catch (err) {
    if (isMissingTableError(err)) {
      markTableMissing(err.message);
    } else {
      console.warn('[drive:state] lecture:', err.message);
    }
    return normalizeRow({ ...memoryState });
  }
}

/**
 * Mappe le patch métier vers les colonnes DB (dont alias demandés).
 */
function buildDbPayload(patch) {
  const now = new Date().toISOString();
  const payload = {
    id: ROW_ID,
    updated_at: now,
    ...patch,
  };

  // Alias : last_success_at ↔ last_upload_at
  if (patch.last_success_at && !patch.last_upload_at) {
    payload.last_upload_at = patch.last_success_at;
  }
  if (patch.last_upload_at && !patch.last_success_at) {
    payload.last_success_at = patch.last_upload_at;
  }

  // Alias : last_error_user_message ↔ error
  if (patch.last_error_user_message && !patch.error) {
    payload.error = patch.last_error_user_message;
  }
  if (patch.error && !patch.last_error_user_message) {
    payload.last_error_user_message = patch.error;
  }

  if (!payload.created_at) {
    payload.created_at = memoryState.created_at || now;
  }

  return payload;
}

async function upsertState(patch) {
  const payload = buildDbPayload(patch);
  memoryState = { ...memoryState, ...payload };

  if (tableMissing === true) {
    return normalizeRow({ ...memoryState });
  }

  try {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from(TABLE)
      .upsert(payload, { onConflict: 'id' })
      .select('*')
      .single();

    if (error) {
      if (isMissingTableError(error)) {
        markTableMissing(error.message);
        return normalizeRow({ ...memoryState });
      }
      console.warn('[drive:state] upsert (non bloquant):', error.message);
      return normalizeRow({ ...memoryState });
    }

    tableMissing = false;
    if (data) memoryState = { ...memoryState, ...data };
    return normalizeRow(data || memoryState);
  } catch (err) {
    if (isMissingTableError(err)) {
      markTableMissing(err.message);
    } else {
      console.warn('[drive:state] upsert (non bloquant):', err.message);
    }
    return normalizeRow({ ...memoryState });
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
    error: classified.userMessage,
    last_check_at: new Date().toISOString(),
  });
  return {
    classified,
    alreadyNotified: Boolean(prev?.notify_reconnect_sent_at)
      && prev?.status === 'reconnect_required',
  };
}

async function markDriveActive({ account, folderId, sharedDriveId, authMode } = {}) {
  const now = new Date().toISOString();
  return upsertState({
    status: 'active',
    last_error_code: null,
    last_error_user_message: null,
    error: null,
    last_check_at: now,
    last_success_at: now,
    last_upload_at: now,
    connected_account: account || null,
    folder_id: folderId || null,
    shared_drive_id: sharedDriveId || null,
    auth_mode: authMode || null,
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
    error: 'Google Drive déconnecté',
  });
}

/**
 * Enregistre le refresh token ERP sans activer la connexion.
 * status = active uniquement via markDriveActive après Access Token + dossier OK.
 */
async function storeOAuthRefreshToken(refreshToken, meta = {}) {
  const now = new Date().toISOString();
  return upsertState({
    status: meta.status || 'pending_validation',
    oauth_refresh_token: refreshToken,
    last_error_code: meta.last_error_code ?? null,
    last_error_user_message: meta.last_error_user_message ?? null,
    error: meta.error ?? null,
    last_check_at: now,
    connected_account: meta.account || null,
    folder_id: meta.folderId || null,
    shared_drive_id: meta.sharedDriveId || null,
    auth_mode: meta.authMode || 'oauth',
    notify_reconnect_sent_at: null,
  });
}

/** Échec OAuth / probe — ne jamais afficher Connexion active. */
async function markDriveOAuthError(err, { keepToken = true } = {}) {
  const classified = classifyDriveError(err);
  const patch = {
    status: 'error',
    last_error_code: classified.code || extractGoogleErrorCode(err) || 'drive_unknown',
    last_error_user_message: classified.userMessage,
    error: classified.userMessage,
    last_check_at: new Date().toISOString(),
  };
  if (!keepToken) {
    patch.oauth_refresh_token = null;
  }
  return upsertState(patch);
}

async function markReconnectNotified() {
  return upsertState({
    notify_reconnect_sent_at: new Date().toISOString(),
  });
}

/** Vue client — jamais de tokens. */
async function getDriveStatePublic() {
  const state = await readState();
  const envRefresh = Boolean(process.env.GOOGLE_OAUTH_REFRESH_TOKEN?.trim());
  const dbRefresh = Boolean(state?.oauth_refresh_token?.trim());
  /** Aligné sur resolveRefreshToken : DB d’abord, ENV seulement si DB vide. */
  let oauth_refresh_source = 'missing';
  if (dbRefresh) oauth_refresh_source = 'database_validated';
  else if (envRefresh) oauth_refresh_source = 'env_fallback';

  try {
    const { getRefreshTokenSource } = require('./googleDriveAuth');
    const runtime = getRefreshTokenSource();
    if (runtime && runtime !== 'missing') oauth_refresh_source = runtime;
  } catch {
    /* auth pas encore chargé */
  }

  const oauthEnv = Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID?.trim()
    && process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim()
    && (envRefresh || dbRefresh),
  );

  return {
    status: state?.status || (oauthEnv ? 'unknown' : 'misconfigured'),
    reconnect_required: state?.status === 'reconnect_required',
    table_available: tableMissing !== true,
    auth_mode: state?.auth_mode || null,
    last_error_code: state?.last_error_code || null,
    last_error_user_message: state?.last_error_user_message || state?.error || null,
    last_check_at: state?.last_check_at || null,
    last_success_at: state?.last_success_at || state?.last_upload_at || null,
    last_upload_at: state?.last_upload_at || state?.last_success_at || null,
    connected_account: state?.connected_account || null,
    folder_id: state?.folder_id || process.env.GOOGLE_DRIVE_FOLDER_ID?.trim() || null,
    shared_drive_id: state?.shared_drive_id || null,
    oauth_client_configured: Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID?.trim()),
    oauth_secret_configured: Boolean(process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim()),
    oauth_refresh_configured: envRefresh || dbRefresh,
    oauth_refresh_source,
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
  markDriveOAuthError,
  markReconnectNotified,
  getDriveStatePublic,
};

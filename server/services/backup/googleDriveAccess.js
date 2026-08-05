/**
 * Validation Google Drive avant tout upload — échec explicite, worker intact.
 */
const {
  isGoogleDriveEnabled,
  getDriveRootFolderId,
  getDriveAuthMode,
} = require('./googleDriveConfig');
const { assertRootFolderAccessible } = require('./googleDriveStorageProvider');
const { assertSharedDriveRequired, probeDriveWriteAccess, formatDriveApiError } = require('./googleDriveContext');
const { isServiceAccountMode, warmOAuthTokenCache } = require('./googleDriveAuth');
const { backupDriveError } = require('./backupErrors');
const { classifyDriveError } = require('./googleDriveErrors');
const {
  isDriveReconnectRequired,
  markDriveReconnectRequired,
  markDriveActive,
} = require('./googleDriveAuthState');

async function validateGoogleDriveForBackup() {
  if (!isGoogleDriveEnabled()) {
    return { enabled: false, uploadAllowed: false, folderId: null, authMode: null };
  }

  if (await isDriveReconnectRequired()) {
    throw backupDriveError('Google Drive déconnecté — reconnexion nécessaire');
  }

  await warmOAuthTokenCache();

  const authMode = getDriveAuthMode();
  let folderId;
  try {
    folderId = getDriveRootFolderId();
  } catch (err) {
    throw backupDriveError(
      err.message || 'GOOGLE_DRIVE_FOLDER_ID manquant ou invalide sur Railway.',
    );
  }

  try {
    await assertRootFolderAccessible();
    if (isServiceAccountMode()) {
      await assertSharedDriveRequired();
    }
    const probe = await probeDriveWriteAccess();
    await markDriveActive({
      folderId: probe.folderId || folderId,
      sharedDriveId: probe.sharedDriveId || null,
      authMode: probe.authMode || authMode,
    });
    return {
      enabled: true,
      uploadAllowed: true,
      authMode: probe.authMode || authMode,
      folderId: probe.folderId || folderId,
      sharedDriveId: probe.sharedDriveId,
    };
  } catch (err) {
    const classified = classifyDriveError(err);
    const { logGoogleApiError } = require('./googleDriveErrors');
    logGoogleApiError(err, 'validateGoogleDriveForBackup');
    if (classified.reconnectRequired) {
      await markDriveReconnectRequired(err);
    } else if (classified.code === 'unauthorized_client' || classified.code === 'oauth_misconfigured') {
      const { markDriveOAuthError } = require('./googleDriveAuthState');
      await markDriveOAuthError(err, { keepToken: true });
    }
    throw backupDriveError(formatDriveApiError(err, {
      rootFolderId: folderId,
      authMode,
      step: 'validateGoogleDriveForBackup',
    }));
  }
}

/** Test connexion seul (pas de sauvegarde). Non destructif. */
async function testGoogleDriveConnection() {
  await warmOAuthTokenCache();
  const { getRefreshTokenSource } = require('./googleDriveAuth');
  if (await isDriveReconnectRequired()) {
    return {
      ok: false,
      status: 'reconnect_required',
      oauth_refresh_source: getRefreshTokenSource(),
      userMessage: 'Google Drive déconnecté — reconnexion nécessaire',
      destructive: false,
      created_file: false,
      deleted_file: false,
    };
  }
  try {
    const result = await validateGoogleDriveForBackup();
    return {
      ok: true,
      status: 'active',
      authMode: result.authMode,
      folderId: result.folderId,
      folderName: result.folderName || null,
      oauth_refresh_source: getRefreshTokenSource(),
      capabilities: result.capabilities || null,
      userMessage: 'Connexion Google Drive OK (test lecture seule)',
      destructive: false,
      created_file: false,
      deleted_file: false,
    };
  } catch (err) {
    const classified = classifyDriveError(err);
    return {
      ok: false,
      status: classified.reconnectRequired ? 'reconnect_required' : 'error',
      code: classified.code,
      oauth_refresh_source: getRefreshTokenSource(),
      userMessage: classified.userMessage,
      destructive: false,
      created_file: false,
      deleted_file: false,
    };
  }
}

module.exports = { validateGoogleDriveForBackup, testGoogleDriveConnection };

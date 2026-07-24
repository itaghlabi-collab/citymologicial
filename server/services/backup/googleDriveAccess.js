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
    await markDriveActive({ folderId: probe.folderId || folderId });
    return {
      enabled: true,
      uploadAllowed: true,
      authMode: probe.authMode || authMode,
      folderId: probe.folderId || folderId,
      sharedDriveId: probe.sharedDriveId,
    };
  } catch (err) {
    const classified = classifyDriveError(err);
    if (classified.reconnectRequired) {
      await markDriveReconnectRequired(err);
    }
    throw backupDriveError(formatDriveApiError(err, { rootFolderId: folderId, authMode }));
  }
}

/** Test connexion seul (pas de sauvegarde complète). */
async function testGoogleDriveConnection() {
  await warmOAuthTokenCache();
  if (await isDriveReconnectRequired()) {
    return {
      ok: false,
      status: 'reconnect_required',
      userMessage: 'Google Drive déconnecté — reconnexion nécessaire',
    };
  }
  try {
    const result = await validateGoogleDriveForBackup();
    return {
      ok: true,
      status: 'active',
      authMode: result.authMode,
      folderId: result.folderId,
      userMessage: 'Connexion Google Drive OK',
    };
  } catch (err) {
    const classified = classifyDriveError(err);
    return {
      ok: false,
      status: classified.reconnectRequired ? 'reconnect_required' : 'error',
      code: classified.code,
      userMessage: classified.userMessage,
    };
  }
}

module.exports = { validateGoogleDriveForBackup, testGoogleDriveConnection };

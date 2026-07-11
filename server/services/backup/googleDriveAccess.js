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
const { isServiceAccountMode } = require('./googleDriveAuth');
const { backupDriveError } = require('./backupErrors');

async function validateGoogleDriveForBackup() {
  if (!isGoogleDriveEnabled()) {
    return { enabled: false, uploadAllowed: false, folderId: null, authMode: null };
  }

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
    return {
      enabled: true,
      uploadAllowed: true,
      authMode: probe.authMode || authMode,
      folderId: probe.folderId || folderId,
      sharedDriveId: probe.sharedDriveId,
    };
  } catch (err) {
    throw backupDriveError(formatDriveApiError(err, { rootFolderId: folderId, authMode }));
  }
}

module.exports = { validateGoogleDriveForBackup };

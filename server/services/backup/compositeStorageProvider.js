/**
 * Provider composite : Supabase Storage (principal) + miroir Google Drive.
 */
const supabaseStorageProvider = require('./supabaseStorageProvider');
const googleDriveStorageProvider = require('./googleDriveStorageProvider');
const { isGoogleDriveEnabled } = require('./googleDriveConfig');
const logger = require('./backupLogger');

function createCompositeStorageProvider() {
  const primary = supabaseStorageProvider;
  const driveEnabled = isGoogleDriveEnabled();

  return {
    name: driveEnabled ? 'supabase_storage+google_drive' : 'supabase_storage',
    driveEnabled,

    async upload(path, buffer, contentType) {
      const result = await primary.upload(path, buffer, contentType);
      logger.storageUploadOk(path, buffer?.length || 0);

      let driveResult = null;
      let driveError = null;

      if (driveEnabled) {
        try {
          driveResult = await googleDriveStorageProvider.upload(path, buffer, contentType);
          logger.googleDriveUploadOk(path);
        } catch (err) {
          driveError = err.message;
          logger.googleDriveUploadFail(path, err);
        }
      }

      return { ...result, drive: driveResult, driveError };
    },

    download: (...args) => primary.download(...args),
    getSignedUrl: (...args) => primary.getSignedUrl(...args),
    list: (...args) => primary.list(...args),

    async remove(path) {
      await primary.remove(path);
      if (driveEnabled) {
        try {
          await googleDriveStorageProvider.remove(path);
        } catch (err) {
          console.warn('[backup drive remove]', path, err.message);
        }
      }
    },

    async removeBackupFolder(backupRef) {
      if (driveEnabled) {
        try {
          await googleDriveStorageProvider.removeBackupFolder(backupRef);
        } catch (err) {
          console.warn('[backup drive folder remove]', backupRef, err.message);
        }
      }
    },

    async getDriveFolderLink(backupRef) {
      if (!driveEnabled) return null;
      return googleDriveStorageProvider.getBackupFolderLink(backupRef);
    },
  };
}

module.exports = { createCompositeStorageProvider };

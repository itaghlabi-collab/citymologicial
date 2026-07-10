/**
 * Upload / download sauvegarde avec pipeline (timeouts 30s).
 */
const supabaseStorageProvider = require('./supabaseStorageProvider');
const googleDriveStorageProvider = require('./googleDriveStorageProvider');
const { isGoogleDriveEnabled } = require('./googleDriveConfig');

function wrapStorageUpload(storage, pipeline, label, options = {}) {
  const { driveUploadAllowed = false } = options;

  return async (path, buffer, contentType) => {
    const primary = await pipeline.run(
      `${label}.supabase.upload(${path})`,
      () => supabaseStorageProvider.upload(path, buffer, contentType),
    );

    let driveError = null;
    const driveRequested = storage.driveEnabled && isGoogleDriveEnabled();

    if (driveRequested && !driveUploadAllowed) {
      driveError = 'Upload Google Drive ignoré — dossier non validé avant upload.';
    } else if (driveRequested && driveUploadAllowed) {
      try {
        await pipeline.run(
          `${label}.googleDrive.upload(${path})`,
          () => googleDriveStorageProvider.upload(path, buffer, contentType),
        );
      } catch (err) {
        driveError = err.message;
      }
    }

    return { ...primary, driveError };
  };
}

module.exports = { wrapStorageUpload };

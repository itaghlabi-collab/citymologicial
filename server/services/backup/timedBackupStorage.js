/**
 * Upload / download sauvegarde avec pipeline (timeouts 30s).
 */
const supabaseStorageProvider = require('./supabaseStorageProvider');
const googleDriveStorageProvider = require('./googleDriveStorageProvider');
const { isGoogleDriveEnabled } = require('./googleDriveConfig');
const { runTimed, OP_TIMEOUT_MS } = require('./backupPipeline');
const logger = require('./backupLogger');

/** Upload Drive : plusieurs appels API par fichier — délai plus long que Supabase. */
const DRIVE_UPLOAD_TIMEOUT_MS = Number(process.env.BACKUP_DRIVE_UPLOAD_TIMEOUT_MS) || 300_000;

function wrapStorageUpload(storage, pipeline, label, options = {}) {
  const { driveUploadAllowed = false } = options;

  return async (path, buffer, contentType) => {
    const primary = await pipeline.run(
      `${label}.supabase.upload(${path})`,
      () => supabaseStorageProvider.upload(path, buffer, contentType),
      { timeoutMs: OP_TIMEOUT_MS },
    );

    let driveError = null;
    const driveRequested = storage.driveEnabled && isGoogleDriveEnabled();

    if (driveRequested && !driveUploadAllowed) {
      driveError = 'Upload Google Drive ignoré — dossier non validé avant upload.';
    } else if (driveRequested && driveUploadAllowed) {
      try {
        await runTimed(
          'drive-upload',
          `${label}.googleDrive.upload(${path})`,
          () => googleDriveStorageProvider.upload(path, buffer, contentType),
          DRIVE_UPLOAD_TIMEOUT_MS,
        );
        pipeline.touchProgress(`Google Drive : ${path.split('/').pop()} envoyé`);
        logger.googleDriveUploadOk(path);
      } catch (err) {
        driveError = err.message;
        logger.googleDriveUploadFail(path, err);
      }
    }

    return { ...primary, driveError };
  };
}

module.exports = { wrapStorageUpload, DRIVE_UPLOAD_TIMEOUT_MS };

/**
 * Upload / download sauvegarde avec pipeline (timeouts 30s).
 */
const supabaseStorageProvider = require('./supabaseStorageProvider');
const { isGoogleDriveEnabled, isDriveRequired } = require('./googleDriveConfig');
const { runTimed, UPLOAD_TIMEOUT_MS } = require('./backupPipeline');
const {
  uploadFromSupabasePath,
  uploadBufferToBackup,
  parseStoragePath,
} = require('./googleDriveBackupUploader');
const logger = require('./backupLogger');

/** Upload Drive : plusieurs appels API par fichier — délai plus long que Supabase. */
const DRIVE_UPLOAD_TIMEOUT_MS = Number(process.env.BACKUP_DRIVE_UPLOAD_TIMEOUT_MS) || 300_000;

function wrapStorageUpload(storage, pipeline, label, options = {}) {
  const { driveUploadAllowed = false, backupRef = null } = options;

  return async (path, buffer, contentType) => {
    const fileLabel = path.split('/').pop() || path;
    const primary = await pipeline.run(
      `${label}.supabase.upload(${path})`,
      () => supabaseStorageProvider.upload(path, buffer, contentType),
      {
        timeoutMs: UPLOAD_TIMEOUT_MS,
        progressMsg: `Upload Supabase — ${fileLabel}…`,
      },
    );

    let driveError = null;
    let driveResult = null;
    const driveRequested = storage.driveEnabled && isGoogleDriveEnabled();

    if (driveRequested && !driveUploadAllowed) {
      driveError = 'Upload Google Drive ignoré — dossier non validé avant upload.';
    } else if (driveRequested && driveUploadAllowed) {
      try {
        pipeline.touchProgress(`Google Drive : envoi ${fileLabel}…`);
        driveResult = await runTimed(
          'drive-upload',
          `${label}.googleDrive.upload(${path})`,
          async () => {
            // Toujours relire depuis Supabase Storage (source de vérité post-upload)
            await supabaseStorageProvider.download(path);
            return uploadFromSupabasePath(path, contentType);
          },
          DRIVE_UPLOAD_TIMEOUT_MS,
        );
        pipeline.touchProgress(`Google Drive : ${fileLabel} envoyé`);
        logger.googleDriveUploadOk(path);
      } catch (err) {
        driveError = err.message;
        logger.googleDriveUploadFail(path, err);
        if (isDriveRequired()) {
          throw new Error(`[Google Drive] ${path.split('/').pop()} — ${err.message}`);
        }
      }
    }

    return { ...primary, driveError, driveResult };
  };
}

/**
 * Miroir Drive pour fichiers copiés sous BCK-xxxx/files/...
 */
function createDriveMirror(backupRef) {
  return async (destPath, buffer, contentType) => {
    const { relativePath } = parseStoragePath(destPath);
    return uploadBufferToBackup(backupRef, relativePath, buffer, contentType);
  };
}

module.exports = {
  wrapStorageUpload,
  createDriveMirror,
  DRIVE_UPLOAD_TIMEOUT_MS,
};

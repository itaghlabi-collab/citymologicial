/**
 * Vérification des variables Railway pour le module sauvegardes.
 * Aucun secret n'est affiché dans les logs.
 */
const { getSupabaseAdmin } = require('../../lib/supabaseAdmin');
const { isGoogleDriveEnabled, getServiceAccountCredentials, getDriveRootFolderId } = require('./googleDriveConfig');
const { resolveFilesMode } = require('./filesExporter');
const logger = require('./backupLogger');

function maskHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return url ? '(url définie)' : '(manquante)';
  }
}

function getBackupEnvironmentStatus() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  let driveJsonValid = false;
  let driveEmail = null;
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()) {
    try {
      const creds = getServiceAccountCredentials();
      driveJsonValid = Boolean(creds?.client_email);
      driveEmail = creds.client_email;
    } catch {
      driveJsonValid = false;
    }
  }

  return {
    supabase: {
      url_configured: Boolean(supabaseUrl),
      url_host: maskHost(supabaseUrl),
      service_role_configured: Boolean(serviceRole),
      anon_key_configured: Boolean(anonKey),
      using_vite_fallback: !process.env.SUPABASE_URL && Boolean(process.env.VITE_SUPABASE_URL),
    },
    storage: {
      provider: process.env.BACKUP_STORAGE_PROVIDER || 'supabase_storage',
      bucket: 'citymo-backups',
      files_mode: resolveFilesMode(),
      file_copy_concurrency: Number(process.env.BACKUP_FILE_COPY_CONCURRENCY) || 4,
    },
    google_drive: {
      enabled_flag: process.env.BACKUP_GOOGLE_DRIVE_ENABLED === 'true',
      folder_id_configured: Boolean(process.env.GOOGLE_DRIVE_FOLDER_ID?.trim()),
      folder_id: process.env.GOOGLE_DRIVE_FOLDER_ID?.trim() || null,
      json_configured: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()),
      json_valid: driveJsonValid,
      service_account_email: driveEmail,
      active: isGoogleDriveEnabled(),
    },
  };
}

async function testSupabaseConnection() {
  const sb = getSupabaseAdmin();
  const { error } = await sb.from('erp_backups').select('id').limit(1);
  if (error) throw new Error(`Connexion Supabase : ${error.message}`);
  return true;
}

function logBackupEnvironmentOnStartup() {
  const status = getBackupEnvironmentStatus();
  logger.envOk('Configuration sauvegardes', {
    supabase_host: status.supabase.url_host,
    service_role: status.supabase.service_role_configured,
    storage: status.storage.provider,
    drive_active: status.google_drive.active,
    drive_folder: status.google_drive.folder_id ? 'configuré' : 'manquant',
    drive_json: status.google_drive.json_valid ? 'valide' : 'invalide ou manquant',
  });

  if (!status.supabase.service_role_configured) {
    logger.envWarn('SUPABASE_SERVICE_ROLE_KEY manquant — sauvegardes impossibles');
  }
  if (status.google_drive.enabled_flag && !status.google_drive.active) {
    logger.envWarn('BACKUP_GOOGLE_DRIVE_ENABLED=true mais config incomplète (JSON ou FOLDER_ID)');
  }
  if (status.google_drive.json_configured && !status.google_drive.json_valid) {
    logger.envWarn('GOOGLE_SERVICE_ACCOUNT_JSON invalide — vérifiez le JSON (accolade fermante, private_key avec \\n)');
  }
  if (status.google_drive.active) {
    const { assertRootFolderAccessible } = require('./googleDriveStorageProvider');
    const { getServiceAccountEmail, getDriveRootFolderId } = require('./googleDriveConfig');
    assertRootFolderAccessible()
      .then(() => {
        logger.envOk('Google Drive dossier racine accessible', {
          folder_id: getDriveRootFolderId(),
          service_account: getServiceAccountEmail(),
        });
      })
      .catch((err) => {
        logger.envWarn(`Google Drive inaccessible : ${err.message}`);
      });
  }
}

module.exports = {
  getBackupEnvironmentStatus,
  testSupabaseConnection,
  logBackupEnvironmentOnStartup,
};

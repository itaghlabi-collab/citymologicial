/**
 * Vérification des variables Railway pour le module sauvegardes.
 * Aucun secret n'est affiché dans les logs.
 */
const { getSupabaseAdmin } = require('../../lib/supabaseAdmin');
const {
  isGoogleDriveEnabled,
  getServiceAccountCredentials,
  getDriveRootFolderId,
  getDriveAuthStatus,
} = require('./googleDriveConfig');
const { resolveFilesMode } = require('./filesExporter');
const { OP_TIMEOUT_MS, PROGRESS_STALE_MS } = require('./backupPipeline');
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
  const driveAuth = getDriveAuthStatus();

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
      op_timeout_ms: OP_TIMEOUT_MS,
      progress_stale_ms: PROGRESS_STALE_MS,
    },
    google_drive: {
      enabled_flag: process.env.BACKUP_GOOGLE_DRIVE_ENABLED === 'true',
      folder_id_configured: Boolean(process.env.GOOGLE_DRIVE_FOLDER_ID?.trim()),
      folder_id: process.env.GOOGLE_DRIVE_FOLDER_ID?.trim() || null,
      auth_mode: driveAuth.mode,
      auth_forced: driveAuth.forced_mode,
      oauth_configured: driveAuth.oauth_configured,
      json_configured: driveAuth.service_account_configured,
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
  const { loadErpBackupSchema } = require('./erpBackupSchema');
  loadErpBackupSchema().catch((err) => {
    logger.envWarn(`Schéma erp_backups non détecté : ${err.message}`);
  });
  logger.envOk('Configuration sauvegardes', {
    supabase_host: status.supabase.url_host,
    service_role: status.supabase.service_role_configured,
    storage: status.storage.provider,
    drive_active: status.google_drive.active,
    drive_auth_mode: status.google_drive.auth_mode,
    drive_folder: status.google_drive.folder_id ? 'configuré' : 'manquant',
    drive_oauth: status.google_drive.oauth_configured ? 'configuré' : 'manquant',
    drive_json: status.google_drive.json_valid ? 'valide' : 'invalide ou manquant',
  });

  if (!status.supabase.service_role_configured) {
    logger.envWarn('SUPABASE_SERVICE_ROLE_KEY manquant — sauvegardes impossibles');
  }
  if (status.google_drive.enabled_flag && !status.google_drive.active) {
    logger.envWarn(
      'BACKUP_GOOGLE_DRIVE_ENABLED=true mais config incomplète (OAuth ou Service Account + FOLDER_ID)',
    );
  }
  if (status.google_drive.json_configured && !status.google_drive.json_valid) {
    logger.envWarn('GOOGLE_SERVICE_ACCOUNT_JSON invalide — vérifiez le JSON (accolade fermante, private_key avec \\n)');
  }
  if (status.google_drive.active) {
    const { validateGoogleDriveForBackup } = require('./googleDriveAccess');
    const { loadDriveContext } = require('./googleDriveContext');
    const { getServiceAccountEmail } = require('./googleDriveConfig');
    const { AUTH_MODES } = require('./googleDriveAuth');

    loadDriveContext()
      .then((ctx) => {
        logger.envOk('Google Drive contexte', {
          auth_mode: ctx.authMode,
          folder: ctx.rootFolderName,
          folder_id: ctx.rootFolderId,
          shared_drive: ctx.isSharedDrive
            ? ctx.sharedDriveId
            : (ctx.authMode === AUTH_MODES.OAUTH ? 'Mon Drive (OAuth)' : 'NON — Mon Drive personnel (incompatible SA)'),
        });
        if (ctx.isPersonalDrive && ctx.authMode === AUTH_MODES.SERVICE_ACCOUNT) {
          logger.envWarn(
            'Service Account + Mon Drive personnel = uploads impossibles. Configurez OAuth ou un Drive partagé.',
          );
        }
      })
      .catch((err) => {
        logger.envWarn(`Google Drive contexte : ${err.message}`);
      });
    validateGoogleDriveForBackup()
      .then((check) => {
        logger.envOk('Google Drive probe upload OK', {
          auth_mode: check.authMode,
          folder_id: check.folderId,
          shared_drive_id: check.sharedDriveId,
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

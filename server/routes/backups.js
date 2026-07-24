/**
 * Routes API sauvegardes ERP — Super Admin uniquement.
 */
const express = require('express');
const { requireSupabaseSuperAdmin } = require('../middleware/supabaseAuth');
const {
  startBackupAsync,
  registerSchedule,
  getDownloadUrl,
  deleteBackup,
} = require('../services/backup/backupService');
const { restoreBackup } = require('../services/backup/restoreService');
const { isGoogleDriveEnabled } = require('../services/backup/googleDriveConfig');
const { getBackupEnvironmentStatus } = require('../services/backup/backupEnvCheck');
const { getDriveStatePublic } = require('../services/backup/googleDriveAuthState');
const { testGoogleDriveConnection } = require('../services/backup/googleDriveAccess');
const {
  buildOAuthConsentUrl,
  handleOAuthCallback,
  disconnectDrive,
  getRedirectUri,
} = require('../services/backup/googleDriveOAuth');
const { cleanupFailedBackupAttempts } = require('../services/backup/backupCleanup');
const { scheduleHour, scheduleMinute } = require('../services/backup/backupSchedule');
const { getBackupHealthDashboard } = require('../services/backup/backupHealth');

const router = express.Router();

/** Callback OAuth Google — sans auth session (redirect navigateur Google). */
router.get('/drive/oauth/callback', async (req, res) => {
  const frontend = (process.env.APP_PUBLIC_URL || process.env.VITE_APP_URL || 'https://citymologicial.vercel.app')
    .replace(/\/$/, '');
  try {
    const code = req.query.code;
    if (!code) {
      return res.redirect(`${frontend}/?backup_drive=error&reason=missing_code`);
    }
    await handleOAuthCallback(code);
    return res.redirect(`${frontend}/?backup_drive=connected`);
  } catch (err) {
    const reason = encodeURIComponent(String(err.message || 'oauth_failed').slice(0, 120));
    return res.redirect(`${frontend}/?backup_drive=error&reason=${reason}`);
  }
});

router.use(requireSupabaseSuperAdmin);

/** GET /api/backups/status/health — tableau de bord santé (sans secrets) */
router.get('/status/health', async (_req, res, next) => {
  try {
    const health = await getBackupHealthDashboard();
    res.json(health);
  } catch (err) {
    next(err);
  }
});

/** GET /api/backups/status/config — état complet (sans secrets) */
router.get('/status/config', async (_req, res, next) => {
  try {
    const status = getBackupEnvironmentStatus();
    const driveState = await getDriveStatePublic();
    let supabase_ok = false;
    try {
      const { testSupabaseConnection } = require('../services/backup/backupEnvCheck');
      await testSupabaseConnection();
      supabase_ok = true;
    } catch (err) {
      status.supabase.connection_error = err.message;
    }
    res.json({
      ...status,
      supabase: { ...status.supabase, connection_ok: supabase_ok },
      drive_runtime: driveState,
      schedule: {
        poll_cron: '15 * * * *',
        run_hour: scheduleHour(),
        run_minute: scheduleMinute(),
        timezone: 'Africa/Algiers',
        max_network_retries: Number(process.env.BACKUP_SCHEDULE_MAX_RETRIES) || 3,
      },
    });
  } catch (err) {
    next(err);
  }
});

/** GET /api/backups/status/drive — état Google Drive (sans secrets) */
router.get('/status/drive', async (_req, res, next) => {
  try {
    const status = getBackupEnvironmentStatus();
    const driveState = await getDriveStatePublic();
    res.json({
      enabled: isGoogleDriveEnabled(),
      project_id: 'citymo-erp-sauvegardes',
      folder_configured: status.google_drive.folder_id_configured,
      folder_id: status.google_drive.folder_id,
      service_account_configured: status.google_drive.json_configured,
      json_valid: status.google_drive.json_valid,
      service_account_email: status.google_drive.service_account_email,
      active: status.google_drive.active,
      ...driveState,
      oauth_redirect_configured: Boolean(getRedirectUri()),
    });
  } catch (err) {
    next(err);
  }
});

/** POST /api/backups/drive/test — test connexion (pas de sauvegarde) */
router.post('/drive/test', async (_req, res, next) => {
  try {
    const result = await testGoogleDriveConnection();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/** GET /api/backups/drive/oauth/start — URL consentement Google */
router.get('/drive/oauth/start', (req, res, next) => {
  try {
    const url = buildOAuthConsentUrl(req.query.state || 'citymo-backup-drive');
    res.json({ url, redirect_uri_configured: Boolean(getRedirectUri()) });
  } catch (err) {
    next(err);
  }
});

/** GET /api/backups/drive/oauth/callback — déplacé avant auth */

/** POST /api/backups/drive/disconnect */
router.post('/drive/disconnect', async (_req, res, next) => {
  try {
    const state = await disconnectDrive();
    res.json({ ok: true, ...state });
  } catch (err) {
    next(err);
  }
});

/** POST /api/backups/cleanup-failed — supprimer tentatives erreur sans fichier */
router.post('/cleanup-failed', async (req, res, next) => {
  try {
    const result = await cleanupFailedBackupAttempts(req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/** GET /api/backups/:id/drive — lien dossier Google Drive */
router.get('/:id/drive', async (req, res, next) => {
  try {
    const { getBackupById } = require('../services/backup/backupService');
    const { getBackupStorageProvider } = require('../services/backup/backupStorageProvider');
    const backup = await getBackupById(req.params.id);
    const storage = getBackupStorageProvider(backup.storage_provider);
    if (!storage.driveEnabled || !storage.getDriveFolderLink) {
      return res.status(400).json({ error: 'Google Drive non configuré.' });
    }
    const link = await storage.getDriveFolderLink(backup.ref);
    res.json({ url: link.url, folderId: link.folderId, ref: backup.ref });
  } catch (err) {
    next(err);
  }
});

/** POST /api/backups — lancer sauvegarde ou planifier */
router.post('/', async (req, res, next) => {
  try {
    const { type, planification, description, notes } = req.body || {};
    const plan = (planification || 'Manuelle').toLowerCase();

    if (['quotidienne', 'hebdomadaire', 'mensuelle'].includes(plan)) {
      const schedule = await registerSchedule({
        type,
        planification: plan,
        notes: description || notes,
        actor: req.user,
      });
      return res.status(201).json({
        scheduled: true,
        schedule,
        message: `Sauvegarde ${type || 'Complète'} planifiée (${plan}) — une exécution / période à ${scheduleHour()}:${String(scheduleMinute()).padStart(2, '0')} (Africa/Algiers).`,
      });
    }

    const backup = await startBackupAsync({
      type,
      planification: 'manuelle',
      description: description || notes,
      actor: req.user,
    });

    return res.status(202).json({
      scheduled: false,
      async: true,
      backup,
      message: 'Sauvegarde lancée en arrière-plan. Actualisez la liste pour suivre le statut.',
    });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
});

/** GET /api/backups/:id/download — URL signée */
router.get('/:id/download', async (req, res, next) => {
  try {
    const result = await getDownloadUrl(req.params.id, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/** POST /api/backups/:id/restore — restauration avec confirmation RESTAURER */
router.post('/:id/restore', async (req, res, next) => {
  try {
    const { confirmation } = req.body || {};
    const result = await restoreBackup(req.params.id, req.user, confirmation);
    res.json({
      message: 'Restauration terminée.',
      preBackupRef: result.preBackupRef,
      result,
    });
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/backups/:id */
router.delete('/:id', async (req, res, next) => {
  try {
    await deleteBackup(req.params.id, req.user);
    res.json({ message: 'Sauvegarde supprimée.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

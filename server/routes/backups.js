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

const router = express.Router();

router.use(requireSupabaseSuperAdmin);

/** GET /api/backups/status/config — état complet (sans secrets) */
router.get('/status/config', async (_req, res, next) => {
  try {
    const status = getBackupEnvironmentStatus();
    let supabase_ok = false;
    try {
      const { testSupabaseConnection } = require('../services/backup/backupEnvCheck');
      await testSupabaseConnection();
      supabase_ok = true;
    } catch (err) {
      status.supabase.connection_error = err.message;
    }
    res.json({ ...status, supabase: { ...status.supabase, connection_ok: supabase_ok } });
  } catch (err) {
    next(err);
  }
});

/** GET /api/backups/status/drive — état config Google Drive */
router.get('/status/drive', (_req, res) => {
  const status = getBackupEnvironmentStatus();
  res.json({
    enabled: isGoogleDriveEnabled(),
    project_id: 'citymo-erp-sauvegardes',
    folder_configured: status.google_drive.folder_id_configured,
    folder_id: status.google_drive.folder_id,
    service_account_configured: status.google_drive.json_configured,
    json_valid: status.google_drive.json_valid,
    service_account_email: status.google_drive.service_account_email,
    active: status.google_drive.active,
  });
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
        message: `Sauvegarde ${type || 'Complète'} planifiée (${plan}).`,
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

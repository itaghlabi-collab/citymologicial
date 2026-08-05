#!/usr/bin/env node
/**
 * Test accès Google Drive — NON DESTRUCTIF (aucun files.create / files.delete).
 * OAuth (Mon Drive) ou Service Account (Shared Drive).
 * Usage : cd server && node scripts/test-google-drive-access.js
 */
require('dotenv').config();

const { validateGoogleDriveForBackup } = require('../services/backup/googleDriveAccess');
const { loadDriveContext } = require('../services/backup/googleDriveContext');
const {
  getServiceAccountEmail,
  getDriveRootFolderId,
  getDriveAuthStatus,
} = require('../services/backup/googleDriveConfig');
const { AUTH_MODES, getRefreshTokenSource } = require('../services/backup/googleDriveAuth');

async function main() {
  const auth = getDriveAuthStatus();
  const folderId = getDriveRootFolderId();

  console.log('[drive-test] mode auth:', auth.mode, `(forcé: ${auth.forced_mode})`);
  console.log('[drive-test] oauth configuré:', auth.oauth_configured);
  console.log('[drive-test] service account configuré:', auth.service_account_configured);
  console.log('[drive-test] refresh token source:', getRefreshTokenSource());
  if (auth.mode === AUTH_MODES.SERVICE_ACCOUNT) {
    console.log('[drive-test] compte de service:', getServiceAccountEmail() || '(inconnu)');
  }
  console.log('[drive-test] dossier cible:', folderId);
  console.log('[drive-test] mode probe: read-only (pas de création / suppression)');

  const ctx = await loadDriveContext();
  if (auth.mode === AUTH_MODES.OAUTH) {
    console.log('[drive-test] type: Mon Drive utilisateur (OAuth) ✓');
  } else {
    console.log('[drive-test] type:', ctx.isSharedDrive ? 'Drive partagé ✓' : 'Mon Drive personnel ✗ (incompatible SA)');
  }
  if (ctx.sharedDriveId) console.log('[drive-test] shared drive id:', ctx.sharedDriveId);

  const result = await validateGoogleDriveForBackup();
  console.log('[drive-test] probe read-only OK', result);
  console.log('[drive-test] deleted_file:', result.deleted_file === true ? 'OUI (interdit)' : 'NON');
}

main().catch((err) => {
  console.error('[drive-test] ÉCHEC', err.message);
  console.error('');
  const auth = getDriveAuthStatus();
  if (auth.mode === AUTH_MODES.SERVICE_ACCOUNT
    && (err.message.includes('Mon Drive') || err.message.includes('storage quota'))) {
    console.error('ACTION — Service Account sur Shared Drive requis :');
    console.error('  1. Google Drive → Drives partagés → Nouveau drive partagé');
    console.error(`  2. Ajouter ${getServiceAccountEmail()} → Gestionnaire de contenu`);
    console.error('  3. Créer le dossier sauvegardes DANS le drive partagé (pas Mon Drive)');
    console.error('  4. Mettre à jour GOOGLE_DRIVE_FOLDER_ID sur Railway');
    console.error('');
    console.error('OU — MODE OAuth (Mon Drive personnel) :');
    console.error('  1. Configurer GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN');
    console.error('  2. BACKUP_GOOGLE_DRIVE_AUTH_MODE=auto (OAuth prioritaire)');
  } else if (auth.mode === AUTH_MODES.OAUTH) {
    console.error('Vérifiez le refresh token OAuth et GOOGLE_DRIVE_FOLDER_ID :');
    console.error(`  https://drive.google.com/drive/folders/${getDriveRootFolderId()}`);
  } else {
    console.error(`  Vérifier le dossier : https://drive.google.com/drive/folders/${getDriveRootFolderId()}`);
  }
  process.exit(1);
});

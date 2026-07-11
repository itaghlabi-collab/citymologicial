#!/usr/bin/env node
/**
 * Test accès Google Drive (compte de service → Drive partagé obligatoire).
 * Usage : cd server && node scripts/test-google-drive-access.js
 */
require('dotenv').config();

const { validateGoogleDriveForBackup } = require('../services/backup/googleDriveAccess');
const { loadDriveContext } = require('../services/backup/googleDriveContext');
const { getServiceAccountEmail, getDriveRootFolderId } = require('../services/backup/googleDriveConfig');

async function main() {
  const email = getServiceAccountEmail();
  const folderId = getDriveRootFolderId();
  console.log('[drive-test] compte de service:', email || '(inconnu)');
  console.log('[drive-test] dossier cible:', folderId);

  const ctx = await loadDriveContext();
  console.log('[drive-test] type:', ctx.isSharedDrive ? 'Drive partagé ✓' : 'Mon Drive personnel ✗ (incompatible)');
  if (ctx.sharedDriveId) console.log('[drive-test] shared drive id:', ctx.sharedDriveId);

  const result = await validateGoogleDriveForBackup();
  console.log('[drive-test] probe upload OK', result);
}

main().catch((err) => {
  console.error('[drive-test] ÉCHEC', err.message);
  console.error('');
  if (err.message.includes('Mon Drive') || err.message.includes('storage quota')) {
    console.error('ACTION OBLIGATOIRE — Drive partagé requis :');
    console.error('  1. Google Drive → Drives partagés → Nouveau drive partagé');
    console.error(`  2. Ajouter ${getServiceAccountEmail()} → Gestionnaire de contenu`);
    console.error('  3. Créer le dossier sauvegardes DANS le drive partagé (pas Mon Drive)');
    console.error('  4. Mettre à jour GOOGLE_DRIVE_FOLDER_ID sur Railway');
  } else {
    console.error(`  Vérifier le dossier : https://drive.google.com/drive/folders/${getDriveRootFolderId()}`);
  }
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Test accès Google Drive (compte de service → dossier partagé).
 * Usage : cd server && node scripts/test-google-drive-access.js
 */
require('dotenv').config();

const { validateGoogleDriveForBackup } = require('../services/backup/googleDriveAccess');
const { getServiceAccountEmail, getDriveRootFolderId } = require('../services/backup/googleDriveConfig');

async function main() {
  const email = getServiceAccountEmail();
  const folderId = getDriveRootFolderId();
  console.log('[drive-test] compte de service:', email || '(inconnu)');
  console.log('[drive-test] dossier cible:', folderId);
  console.log('[drive-test] lien:', `https://drive.google.com/drive/folders/${folderId}`);

  const result = await validateGoogleDriveForBackup();
  console.log('[drive-test] OK', result);
}

main().catch((err) => {
  console.error('[drive-test] ÉCHEC', err.message);
  console.error('');
  console.error('Action requise :');
  console.error(`  1. Ouvrir https://drive.google.com/drive/folders/${getDriveRootFolderId()}`);
  console.error(`  2. Partager → ajouter ${getServiceAccountEmail()} → rôle Éditeur`);
  process.exit(1);
});

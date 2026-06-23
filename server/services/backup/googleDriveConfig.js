/**
 * Configuration Google Drive — compte de service (pas OAuth utilisateur).
 */
function isGoogleDriveEnabled() {
  return (
    process.env.BACKUP_GOOGLE_DRIVE_ENABLED === 'true'
    && Boolean(process.env.GOOGLE_DRIVE_FOLDER_ID?.trim())
    && Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim())
  );
}

function parseServiceAccountJson(raw) {
  let text = String(raw).trim();
  // Corrige erreurs fréquentes de copier-coller
  text = text.replace(/"universe_domain":\s*"googleapis.com"\s*\./g, '"universe_domain": "googleapis.com"');
  if (!text.endsWith('}')) {
    text = text.replace(/\.\s*$/, '');
    if (!text.endsWith('}')) text += '}';
  }
  return JSON.parse(text);
}

function getServiceAccountCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON manquant sur Railway.');
  try {
    return parseServiceAccountJson(raw);
  } catch (err) {
    throw new Error(`GOOGLE_SERVICE_ACCOUNT_JSON invalide : ${err.message}`);
  }
}

function getDriveRootFolderId() {
  const id = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim();
  if (!id) throw new Error('GOOGLE_DRIVE_FOLDER_ID manquant sur Railway.');
  return id;
}

module.exports = {
  isGoogleDriveEnabled,
  getServiceAccountCredentials,
  getDriveRootFolderId,
};

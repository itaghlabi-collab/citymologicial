/**
 * Configuration Google Drive — compte de service (pas OAuth utilisateur).
 */
const fs = require('fs');

function isGoogleDriveEnabled() {
  return (
    process.env.BACKUP_GOOGLE_DRIVE_ENABLED === 'true'
    && Boolean(process.env.GOOGLE_DRIVE_FOLDER_ID?.trim())
    && Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim())
  );
}

function normalizePrivateKey(key) {
  if (!key) return key;
  return String(key).replace(/\\n/g, '\n');
}

function parseServiceAccountJson(raw) {
  let text = String(raw).trim();
  // Corrige erreurs fréquentes de copier-coller
  text = text.replace(/"universe_domain":\s*"googleapis.com"\s*\./g, '"universe_domain": "googleapis.com"');
  if (!text.endsWith('}')) {
    text = text.replace(/\.\s*$/, '');
    if (!text.endsWith('}')) text += '}';
  }
  const creds = JSON.parse(text);
  if (creds.private_key) {
    creds.private_key = normalizePrivateKey(creds.private_key);
  }
  if (!creds.client_email || !creds.private_key) {
    throw new Error('JSON incomplet : client_email et private_key requis.');
  }
  return creds;
}

function getServiceAccountCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON manquant sur Railway.');

  if (raw === '.' || raw === './' || raw === '..') {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON invalide (chemin "."). Collez le JSON complet du compte de service.');
  }

  if (raw.startsWith('/') || raw.startsWith('./')) {
    if (!fs.existsSync(raw)) {
      throw new Error(`Fichier compte de service introuvable : ${raw}`);
    }
    return parseServiceAccountJson(fs.readFileSync(raw, 'utf8'));
  }

  if (!raw.startsWith('{')) {
    try {
      const decoded = Buffer.from(raw, 'base64').toString('utf8').trim();
      if (decoded.startsWith('{')) {
        return parseServiceAccountJson(decoded);
      }
    } catch {
      /* pas du base64 */
    }
  }

  try {
    return parseServiceAccountJson(raw);
  } catch (err) {
    throw new Error(`GOOGLE_SERVICE_ACCOUNT_JSON invalide : ${err.message}`);
  }
}

/** Extrait l'ID dossier depuis une URL Drive ou un ID brut. */
function normalizeDriveFolderId(raw) {
  let id = String(raw || '').trim();
  if (!id) throw new Error('GOOGLE_DRIVE_FOLDER_ID manquant sur Railway.');

  const fromUrl = id.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (fromUrl) id = fromUrl[1];

  if (id === '.' || !/^[a-zA-Z0-9_-]{10,}$/.test(id)) {
    throw new Error(
      `GOOGLE_DRIVE_FOLDER_ID invalide : "${id}". Utilisez l'ID du dossier partagé (ex. 1EmDiULTRrP2BuLlaLhh1A1CFXkGgN59t).`,
    );
  }
  return id;
}

function getDriveRootFolderId() {
  return normalizeDriveFolderId(process.env.GOOGLE_DRIVE_FOLDER_ID);
}

function getServiceAccountEmail() {
  try {
    return getServiceAccountCredentials().client_email;
  } catch {
    return null;
  }
}

module.exports = {
  isGoogleDriveEnabled,
  getServiceAccountCredentials,
  getDriveRootFolderId,
  normalizeDriveFolderId,
  getServiceAccountEmail,
};

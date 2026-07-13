/**
 * Authentification Google Drive — deux modes supportés :
 *
 * MODE 1 (préféré) : OAuth2 utilisateur → Mon Drive personnel (quota utilisateur)
 * MODE 2            : Service Account   → Drive partagé (Shared Drive) uniquement
 *
 * Détection auto (BACKUP_GOOGLE_DRIVE_AUTH_MODE=auto) : OAuth si configuré, sinon Service Account.
 */
const { google } = require('googleapis');
const { JWT, OAuth2Client } = require('google-auth-library');

const AUTH_MODES = {
  OAUTH: 'oauth',
  SERVICE_ACCOUNT: 'service_account',
};

const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive'];

let driveClient = null;
let resolvedAuthMode = null;

function isOAuthConfigured() {
  return Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID?.trim()
    && process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim()
    && process.env.GOOGLE_OAUTH_REFRESH_TOKEN?.trim()
  );
}

function isServiceAccountConfigured() {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim());
}

/**
 * Détecte le mode d'authentification (sans lancer d'exception).
 * @returns {'oauth'|'service_account'|null}
 */
function detectAuthMode() {
  const forced = (process.env.BACKUP_GOOGLE_DRIVE_AUTH_MODE || 'auto').toLowerCase().trim();

  if (forced === AUTH_MODES.OAUTH) {
    return isOAuthConfigured() ? AUTH_MODES.OAUTH : null;
  }
  if (forced === 'service_account' || forced === 'service-account') {
    return isServiceAccountConfigured() ? AUTH_MODES.SERVICE_ACCOUNT : null;
  }

  // auto — OAuth prioritaire (MODE 1)
  if (isOAuthConfigured()) return AUTH_MODES.OAUTH;
  if (isServiceAccountConfigured()) return AUTH_MODES.SERVICE_ACCOUNT;
  return null;
}

function getAuthMode() {
  if (resolvedAuthMode) return resolvedAuthMode;
  resolvedAuthMode = detectAuthMode();
  return resolvedAuthMode;
}

function resetDriveAuth() {
  driveClient = null;
  resolvedAuthMode = null;
}

function createOAuthClient() {
  const client = new OAuth2Client(
    process.env.GOOGLE_OAUTH_CLIENT_ID.trim(),
    process.env.GOOGLE_OAUTH_CLIENT_SECRET.trim(),
  );
  client.setCredentials({
    refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN.trim(),
  });
  return client;
}

function createServiceAccountClient() {
  const { getServiceAccountCredentials } = require('./googleDriveConfig');
  const credentials = getServiceAccountCredentials();
  return new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: DRIVE_SCOPES,
  });
}

/**
 * Client Drive API v3 authentifié selon le mode détecté.
 */
function getDrive() {
  if (driveClient) return driveClient;

  const mode = getAuthMode();
  if (!mode) {
    throw new Error(
      'Google Drive : configurez OAuth (GOOGLE_OAUTH_*) ou Service Account (GOOGLE_SERVICE_ACCOUNT_JSON).',
    );
  }

  const auth = mode === AUTH_MODES.OAUTH
    ? createOAuthClient()
    : createServiceAccountClient();

  console.info(`[DRIVE] auth mode: ${mode}${mode === AUTH_MODES.OAUTH ? ' (Mon Drive utilisateur)' : ' (Shared Drive)'}`);

  driveClient = google.drive({ version: 'v3', auth });
  return driveClient;
}

/** Flags API Shared Drive — uniquement en mode Service Account. */
function getSharedDriveApiFlags() {
  if (getAuthMode() === AUTH_MODES.SERVICE_ACCOUNT) {
    return {
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    };
  }
  return {};
}

function isOAuthMode() {
  return getAuthMode() === AUTH_MODES.OAUTH;
}

function isServiceAccountMode() {
  return getAuthMode() === AUTH_MODES.SERVICE_ACCOUNT;
}

module.exports = {
  AUTH_MODES,
  DRIVE_SCOPES,
  detectAuthMode,
  getAuthMode,
  getDrive,
  resetDriveAuth,
  getSharedDriveApiFlags,
  isOAuthConfigured,
  isServiceAccountConfigured,
  isOAuthMode,
  isServiceAccountMode,
};

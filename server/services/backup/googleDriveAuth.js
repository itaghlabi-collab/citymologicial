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

/** Refresh token : env OU état DB (après reconnexion OAuth). */
let cachedDbRefreshToken = null;
let cachedDbRefreshAt = 0;

function getEnvRefreshToken() {
  return process.env.GOOGLE_OAUTH_REFRESH_TOKEN?.trim() || null;
}

async function resolveRefreshToken() {
  const fromEnv = getEnvRefreshToken();
  if (Date.now() - cachedDbRefreshAt < 60_000 && cachedDbRefreshToken) {
    return cachedDbRefreshToken || fromEnv;
  }
  try {
    const { getStoredRefreshToken } = require('./googleDriveAuthState');
    cachedDbRefreshToken = await getStoredRefreshToken();
    cachedDbRefreshAt = Date.now();
  } catch {
    cachedDbRefreshToken = null;
  }
  return cachedDbRefreshToken || fromEnv;
}

function isOAuthConfigured() {
  return Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID?.trim()
    && process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim()
    && (getEnvRefreshToken() || cachedDbRefreshToken)
  );
}

/** Version sync pour detectAuthMode — env ou cache DB. */
function isOAuthConfiguredSync() {
  return Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID?.trim()
    && process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim()
    && (getEnvRefreshToken() || cachedDbRefreshToken)
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
    return isOAuthConfiguredSync() ? AUTH_MODES.OAUTH : null;
  }
  if (forced === 'service_account' || forced === 'service-account') {
    return isServiceAccountConfigured() ? AUTH_MODES.SERVICE_ACCOUNT : null;
  }

  // auto — OAuth prioritaire (MODE 1)
  if (isOAuthConfiguredSync()) return AUTH_MODES.OAUTH;
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
  cachedDbRefreshToken = null;
  cachedDbRefreshAt = 0;
}

function createOAuthClient(refreshToken) {
  const token = (refreshToken || getEnvRefreshToken() || cachedDbRefreshToken || '').trim();
  if (!token) {
    throw new Error('GOOGLE_OAUTH_REFRESH_TOKEN manquant (env ou reconnexion).');
  }
  const client = new OAuth2Client(
    process.env.GOOGLE_OAUTH_CLIENT_ID.trim(),
    process.env.GOOGLE_OAUTH_CLIENT_SECRET.trim(),
  );
  client.setCredentials({
    refresh_token: token,
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
 * Préférer getDriveAsync() pour OAuth (token DB).
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

async function getDriveAsync() {
  if (driveClient) return driveClient;

  const mode = getAuthMode();
  if (!mode) {
    throw new Error(
      'Google Drive : configurez OAuth (GOOGLE_OAUTH_*) ou Service Account (GOOGLE_SERVICE_ACCOUNT_JSON).',
    );
  }

  let auth;
  if (mode === AUTH_MODES.OAUTH) {
    const refreshToken = await resolveRefreshToken();
    if (refreshToken) {
      cachedDbRefreshToken = refreshToken;
      cachedDbRefreshAt = Date.now();
    }
    auth = createOAuthClient(refreshToken);
  } else {
    auth = createServiceAccountClient();
  }

  console.info(`[DRIVE] auth mode: ${mode}${mode === AUTH_MODES.OAUTH ? ' (Mon Drive utilisateur)' : ' (Shared Drive)'}`);
  driveClient = google.drive({ version: 'v3', auth });
  return driveClient;
}

/** Précharge le token DB pour que isOAuthConfigured / getDrive sync fonctionnent. */
async function warmOAuthTokenCache() {
  await resolveRefreshToken();
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
  getDriveAsync,
  warmOAuthTokenCache,
  resetDriveAuth,
  getSharedDriveApiFlags,
  isOAuthConfigured,
  isServiceAccountConfigured,
  isOAuthMode,
  isServiceAccountMode,
  resolveRefreshToken,
};

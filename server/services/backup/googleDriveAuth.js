/**
 * Authentification Google Drive — deux modes supportés :
 *
 * MODE 1 (préféré) : OAuth2 utilisateur → Mon Drive personnel (quota utilisateur)
 * MODE 2            : Service Account   → Drive partagé (Shared Drive) uniquement
 *
 * Détection auto (BACKUP_GOOGLE_DRIVE_AUTH_MODE=auto) : OAuth si configuré, sinon Service Account.
 *
 * Priorité Refresh Token OAuth :
 *   1. GOOGLE_OAUTH_REFRESH_TOKEN (Railway / env)
 *   2. erp_backup_drive_state.oauth_refresh_token (fallback temporaire)
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

/** Refresh token DB (fallback) — cache mémoire, jamais loggé en clair. */
let cachedDbRefreshToken = null;
let cachedDbRefreshAt = 0;

/** Dernière source résolue : env | database | missing */
let lastResolvedRefreshSource = 'missing';

/**
 * Token avec lequel le driveClient actuel a été construit.
 * Comparaison mémoire uniquement — jamais loggé.
 */
let clientBuiltWithRefreshToken = null;

function getEnvRefreshToken() {
  return process.env.GOOGLE_OAUTH_REFRESH_TOKEN?.trim() || null;
}

/**
 * Invalide uniquement les caches techniques en mémoire.
 * Aucune donnée persistante (SQL / Drive / Railway) n'est modifiée.
 */
function invalidateDriveMemoryCaches() {
  driveClient = null;
  resolvedAuthMode = null;
  clientBuiltWithRefreshToken = null;
  try {
    const { resetDriveContext } = require('./googleDriveContext');
    resetDriveContext();
  } catch {
    /* context module peut ne pas être chargé */
  }
}

function ensureClientMatchesToken(token) {
  if (!token) return;
  if (clientBuiltWithRefreshToken && clientBuiltWithRefreshToken !== token) {
    invalidateDriveMemoryCaches();
  }
}

async function loadDbRefreshToken() {
  if (Date.now() - cachedDbRefreshAt < 60_000 && cachedDbRefreshToken !== null) {
    return cachedDbRefreshToken;
  }
  try {
    const { getStoredRefreshToken } = require('./googleDriveAuthState');
    cachedDbRefreshToken = await getStoredRefreshToken();
    cachedDbRefreshAt = Date.now();
  } catch {
    cachedDbRefreshToken = null;
    cachedDbRefreshAt = Date.now();
  }
  return cachedDbRefreshToken;
}

/**
 * Priorité : Railway (env) → DB (fallback) → erreur claire.
 * Ne log jamais le token.
 */
async function resolveRefreshToken() {
  const fromEnv = getEnvRefreshToken();
  if (fromEnv) {
    lastResolvedRefreshSource = 'env';
    ensureClientMatchesToken(fromEnv);
    return fromEnv;
  }

  const fromDb = await loadDbRefreshToken();
  if (fromDb) {
    lastResolvedRefreshSource = 'database';
    ensureClientMatchesToken(fromDb);
    return fromDb;
  }

  lastResolvedRefreshSource = 'missing';
  throw new Error('Google Drive refresh token non configuré');
}

/** Source actuelle sans exposer le secret : env | database | missing */
function getRefreshTokenSource() {
  if (getEnvRefreshToken()) return 'env';
  if (cachedDbRefreshToken) return 'database';
  if (lastResolvedRefreshSource === 'database') return 'database';
  if (lastResolvedRefreshSource === 'env') return 'env';
  return lastResolvedRefreshSource || 'missing';
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
  invalidateDriveMemoryCaches();
  cachedDbRefreshToken = null;
  cachedDbRefreshAt = 0;
  lastResolvedRefreshSource = 'missing';
}

function createOAuthClient(refreshToken) {
  const token = (refreshToken || getEnvRefreshToken() || cachedDbRefreshToken || '').trim();
  if (!token) {
    throw new Error('Google Drive refresh token non configuré');
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
 * Préférer getDriveAsync() pour OAuth (résolution env prioritaire).
 */
function getDrive() {
  if (driveClient) return driveClient;

  const mode = getAuthMode();
  if (!mode) {
    throw new Error(
      'Google Drive : configurez OAuth (GOOGLE_OAUTH_*) ou Service Account (GOOGLE_SERVICE_ACCOUNT_JSON).',
    );
  }

  let auth;
  if (mode === AUTH_MODES.OAUTH) {
    const token = getEnvRefreshToken() || cachedDbRefreshToken;
    auth = createOAuthClient(token);
    clientBuiltWithRefreshToken = token;
    lastResolvedRefreshSource = getEnvRefreshToken() ? 'env' : (token ? 'database' : 'missing');
  } else {
    auth = createServiceAccountClient();
  }

  console.info(`[DRIVE] auth mode: ${mode}${mode === AUTH_MODES.OAUTH ? ' (Mon Drive utilisateur)' : ' (Shared Drive)'}`);
  if (mode === AUTH_MODES.OAUTH) {
    console.info(`[DRIVE] refresh token source: ${lastResolvedRefreshSource}`);
  }

  driveClient = google.drive({ version: 'v3', auth });
  return driveClient;
}

async function getDriveAsync() {
  const mode = getAuthMode();
  if (!mode) {
    throw new Error(
      'Google Drive : configurez OAuth (GOOGLE_OAUTH_*) ou Service Account (GOOGLE_SERVICE_ACCOUNT_JSON).',
    );
  }

  let auth;
  if (mode === AUTH_MODES.OAUTH) {
    const refreshToken = await resolveRefreshToken();
    if (driveClient && clientBuiltWithRefreshToken === refreshToken) {
      return driveClient;
    }
    if (driveClient && clientBuiltWithRefreshToken !== refreshToken) {
      invalidateDriveMemoryCaches();
    }
    auth = createOAuthClient(refreshToken);
    clientBuiltWithRefreshToken = refreshToken;
  } else {
    if (driveClient) return driveClient;
    auth = createServiceAccountClient();
  }

  console.info(`[DRIVE] auth mode: ${mode}${mode === AUTH_MODES.OAUTH ? ' (Mon Drive utilisateur)' : ' (Shared Drive)'}`);
  if (mode === AUTH_MODES.OAUTH) {
    console.info(`[DRIVE] refresh token source: ${getRefreshTokenSource()}`);
  }

  driveClient = google.drive({ version: 'v3', auth });
  return driveClient;
}

/** Précharge le token (env prioritaire, sinon DB) pour isOAuthConfigured sync. */
async function warmOAuthTokenCache() {
  try {
    await resolveRefreshToken();
  } catch {
    /* missing — laisse isOAuthConfigured à false si rien */
  }
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
  invalidateDriveMemoryCaches,
  getSharedDriveApiFlags,
  isOAuthConfigured,
  isServiceAccountConfigured,
  isOAuthMode,
  isServiceAccountMode,
  resolveRefreshToken,
  getRefreshTokenSource,
  getEnvRefreshToken,
};

/**
 * Authentification Google Drive — deux modes supportés :
 *
 * MODE 1 (préféré) : OAuth2 utilisateur → Mon Drive personnel (quota utilisateur)
 * MODE 2            : Service Account   → Drive partagé (Shared Drive) uniquement
 *
 * Détection auto (BACKUP_GOOGLE_DRIVE_AUTH_MODE=auto) : OAuth si configuré, sinon Service Account.
 *
 * Priorité Refresh Token OAuth (unique pour toute la chaîne) :
 *   1. erp_backup_drive_state.oauth_refresh_token (connexion ERP validée / reconnect)
 *   2. GOOGLE_OAUTH_REFRESH_TOKEN (Railway) — fallback initial uniquement si DB vide
 *   3. erreur claire
 *
 * Sources diagnostic (jamais de secret) :
 *   database_validated | env_fallback | missing
 */
const { google } = require('googleapis');
const { JWT, OAuth2Client } = require('google-auth-library');

const AUTH_MODES = {
  OAUTH: 'oauth',
  SERVICE_ACCOUNT: 'service_account',
};

const REFRESH_SOURCES = {
  DATABASE_VALIDATED: 'database_validated',
  ENV_FALLBACK: 'env_fallback',
  MISSING: 'missing',
};

const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive'];

let driveClient = null;
let resolvedAuthMode = null;

/** Refresh token DB — cache mémoire, jamais loggé en clair. */
let cachedDbRefreshToken = null;
let cachedDbRefreshAt = 0;

/** Dernière source résolue : database_validated | env_fallback | missing */
let lastResolvedRefreshSource = REFRESH_SOURCES.MISSING;

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
  try {
    const { resetBackupFolderCache } = require('./googleDriveBackupUploader');
    resetBackupFolderCache();
  } catch {
    /* optionnel */
  }
}

function ensureClientMatchesToken(token) {
  if (!token) return;
  if (clientBuiltWithRefreshToken && clientBuiltWithRefreshToken !== token) {
    invalidateDriveMemoryCaches();
  }
}

/**
 * Injecte le refresh token DB en cache mémoire (après callback reconnect).
 * N’écrit rien en persistance.
 */
function seedDbRefreshTokenCache(token) {
  const t = token?.trim() || null;
  cachedDbRefreshToken = t;
  cachedDbRefreshAt = Date.now();
  if (t) {
    lastResolvedRefreshSource = REFRESH_SOURCES.DATABASE_VALIDATED;
    ensureClientMatchesToken(t);
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
 * Priorité : DB (ERP) → ENV Railway (fallback si DB vide) → erreur claire.
 * Seule fonction de sélection du refresh token pour toute la chaîne.
 * Ne log jamais le token.
 */
async function resolveRefreshToken() {
  const fromDb = await loadDbRefreshToken();
  if (fromDb) {
    lastResolvedRefreshSource = REFRESH_SOURCES.DATABASE_VALIDATED;
    ensureClientMatchesToken(fromDb);
    return fromDb;
  }

  const fromEnv = getEnvRefreshToken();
  if (fromEnv) {
    lastResolvedRefreshSource = REFRESH_SOURCES.ENV_FALLBACK;
    ensureClientMatchesToken(fromEnv);
    return fromEnv;
  }

  lastResolvedRefreshSource = REFRESH_SOURCES.MISSING;
  throw new Error(
    'Google Drive refresh token non configuré — reconnectez Google Drive dans l’ERP '
    + '(ou définissez GOOGLE_OAUTH_REFRESH_TOKEN en fallback initial).',
  );
}

/** Source actuelle sans exposer le secret. */
function getRefreshTokenSource() {
  return lastResolvedRefreshSource || REFRESH_SOURCES.MISSING;
}

function isOAuthConfigured() {
  return Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID?.trim()
    && process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim()
    && (cachedDbRefreshToken || getEnvRefreshToken())
  );
}

/** Version sync pour detectAuthMode — cache DB ou env. */
function isOAuthConfiguredSync() {
  return Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID?.trim()
    && process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim()
    && (cachedDbRefreshToken || getEnvRefreshToken())
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
  lastResolvedRefreshSource = REFRESH_SOURCES.MISSING;
}

function createOAuthClient(refreshToken) {
  const token = (refreshToken || '').trim();
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
 * Client Drive API v3 — préférer getDriveAsync() (résolution DB prioritaire).
 * Sync : utilise le cache DB s’il a été warmé, sinon ENV fallback.
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
    const token = cachedDbRefreshToken || getEnvRefreshToken();
    if (!token) {
      throw new Error('Google Drive refresh token non configuré — appelez getDriveAsync() / warmOAuthTokenCache().');
    }
    auth = createOAuthClient(token);
    clientBuiltWithRefreshToken = token;
    lastResolvedRefreshSource = cachedDbRefreshToken
      ? REFRESH_SOURCES.DATABASE_VALIDATED
      : REFRESH_SOURCES.ENV_FALLBACK;
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

/** Précharge le token (DB prioritaire) pour isOAuthConfigured sync. */
async function warmOAuthTokenCache() {
  try {
    await resolveRefreshToken();
  } catch {
    /* missing — laisse isOAuthConfigured à false si rien */
  }
}

/**
 * Flags Drive API — toujours supportsAllDrives.
 * Nécessaire aussi en OAuth si le dossier cible est dans un Drive partagé.
 */
function getSharedDriveApiFlags() {
  return {
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  };
}

function isOAuthMode() {
  return getAuthMode() === AUTH_MODES.OAUTH;
}

function isServiceAccountMode() {
  return getAuthMode() === AUTH_MODES.SERVICE_ACCOUNT;
}

/** Préfixe client_id pour logs (jamais la valeur complète). */
function getOAuthClientIdPrefix() {
  const id = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() || '';
  if (!id) return null;
  const head = id.split('-')[0] || id.slice(0, 11);
  return `${head}…`;
}

module.exports = {
  AUTH_MODES,
  REFRESH_SOURCES,
  DRIVE_SCOPES,
  detectAuthMode,
  getAuthMode,
  getDrive,
  getDriveAsync,
  warmOAuthTokenCache,
  resetDriveAuth,
  invalidateDriveMemoryCaches,
  seedDbRefreshTokenCache,
  getSharedDriveApiFlags,
  isOAuthConfigured,
  isServiceAccountConfigured,
  isOAuthMode,
  isServiceAccountMode,
  resolveRefreshToken,
  getRefreshTokenSource,
  getEnvRefreshToken,
  getOAuthClientIdPrefix,
  createOAuthClient,
};

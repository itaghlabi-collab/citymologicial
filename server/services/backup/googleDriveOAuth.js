/**
 * OAuth Google Drive — démarrage / callback reconnexion.
 */
const { OAuth2Client } = require('google-auth-library');
const {
  DRIVE_SCOPES,
  resetDriveAuth,
  seedDbRefreshTokenCache,
  invalidateDriveMemoryCaches,
  getOAuthClientIdPrefix,
} = require('./googleDriveAuth');
const { resetDriveContext, probeDriveWriteAccess } = require('./googleDriveContext');
const {
  storeOAuthRefreshToken,
  markDriveDisconnected,
  markDriveActive,
  markDriveOAuthError,
  getDriveStatePublic,
} = require('./googleDriveAuthState');
const { classifyDriveError, logGoogleApiError } = require('./googleDriveErrors');

function getRedirectUri() {
  const explicit = process.env.BACKUP_OAUTH_REDIRECT_URI?.trim()
    || process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim();
  if (explicit) return explicit;

  const base = (process.env.RAILWAY_PUBLIC_DOMAIN || process.env.CITYMO_API_URL || '')
    .replace(/\/$/, '');
  if (base.startsWith('http')) return `${base}/api/backups/drive/oauth/callback`;
  if (base) return `https://${base}/api/backups/drive/oauth/callback`;
  return null;
}

function createOAuth2ForConsent() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  const redirectUri = getRedirectUri();
  if (!clientId || !clientSecret) {
    throw new Error('OAuth Google non configuré (CLIENT_ID / CLIENT_SECRET).');
  }
  if (!redirectUri) {
    throw new Error('BACKUP_OAUTH_REDIRECT_URI manquant (URL callback Railway).');
  }
  return { client: new OAuth2Client(clientId, clientSecret, redirectUri), redirectUri };
}

function buildOAuthConsentUrl(state) {
  const { client } = createOAuth2ForConsent();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: DRIVE_SCOPES,
    state: state || 'citymo-backup-drive',
  });
}

/**
 * Callback ERP : stocke le token, invalide caches, valide Access Token + dossier,
 * puis seulement status=active.
 */
async function handleOAuthCallback(code) {
  const { client } = createOAuth2ForConsent();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error(
      'Google n’a pas renvoyé de refresh_token. Réessayez avec prompt=consent '
      + '(ou révoquez l’accès app dans le compte Google puis reconnectez).',
    );
  }

  // 1) Invalider tous les caches mémoire (ancien client / token Playground en cache)
  resetDriveAuth();
  resetDriveContext();
  invalidateDriveMemoryCaches();

  // 2) Enregistrer le token ERP en DB SANS status active
  await storeOAuthRefreshToken(tokens.refresh_token, { status: 'pending_validation' });

  // 3) Forcer la résolution runtime sur ce token (DB prioritaire)
  seedDbRefreshTokenCache(tokens.refresh_token);
  invalidateDriveMemoryCaches();
  seedDbRefreshTokenCache(tokens.refresh_token);

  console.info('[drive:oauth] reconnect token stored', {
    client_id_prefix: getOAuthClientIdPrefix(),
    oauth_refresh_source: 'database_validated',
  });

  // 4) Validation réelle : Access Token + lecture dossier
  try {
    const probe = await probeDriveWriteAccess();
    await markDriveActive({
      folderId: probe.folderId,
      sharedDriveId: probe.sharedDriveId || null,
      authMode: probe.authMode || 'oauth',
      account: null,
    });
  } catch (err) {
    logGoogleApiError(err, 'oauth_callback_probe');
    const classified = classifyDriveError(err);
    await markDriveOAuthError(err, { keepToken: true });
    console.warn('[drive:oauth] probe après reconnect KO — status=error', {
      code: classified.code,
      userMessage: classified.userMessage,
    });
    throw new Error(classified.userMessage || err.message);
  }

  return getDriveStatePublic();
}

async function disconnectDrive() {
  resetDriveAuth();
  resetDriveContext();
  await markDriveDisconnected();
  return getDriveStatePublic();
}

module.exports = {
  getRedirectUri,
  buildOAuthConsentUrl,
  handleOAuthCallback,
  disconnectDrive,
};

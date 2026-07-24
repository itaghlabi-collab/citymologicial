/**
 * OAuth Google Drive — démarrage / callback reconnexion.
 */
const { OAuth2Client } = require('google-auth-library');
const { DRIVE_SCOPES, resetDriveAuth } = require('./googleDriveAuth');
const { resetDriveContext } = require('./googleDriveContext');
const { storeOAuthRefreshToken, markDriveDisconnected, getDriveStatePublic } = require('./googleDriveAuthState');
const { probeDriveWriteAccess } = require('./googleDriveContext');

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

async function handleOAuthCallback(code) {
  const { client } = createOAuth2ForConsent();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error(
      'Google n’a pas renvoyé de refresh_token. Réessayez avec prompt=consent '
      + '(ou révoquez l’accès app dans le compte Google puis reconnectez).',
    );
  }

  resetDriveAuth();
  resetDriveContext();
  await storeOAuthRefreshToken(tokens.refresh_token);

  // Probe sans exposer le token
  try {
    const probe = await probeDriveWriteAccess();
    await storeOAuthRefreshToken(tokens.refresh_token, {
      folderId: probe.folderId,
      account: null,
    });
  } catch (err) {
    // Token stocké mais probe KO — laisser status active quand même si token OK
    console.warn('[drive:oauth] probe après reconnect:', err.message);
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

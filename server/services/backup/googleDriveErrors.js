/**
 * Classification des erreurs Google Drive — sans exposer de secrets.
 */
const CODES = {
  INVALID_GRANT: 'invalid_grant',
  UNAUTHORIZED_CLIENT: 'unauthorized_client',
  REVOKED: 'auth_revoked',
  EXPIRED: 'auth_expired',
  MISCONFIGURED: 'oauth_misconfigured',
  NETWORK: 'network_temp',
  QUOTA: 'quota',
  NOT_FOUND: 'folder_not_found',
  UNKNOWN: 'drive_unknown',
};

function extractGoogleErrorCode(err) {
  const raw = String(err?.message || err || '');
  const responseData = err?.response?.data?.error;
  if (typeof responseData === 'string') return responseData;
  if (responseData?.error) return String(responseData.error);
  const m = raw.match(/invalid_grant|invalid_client|unauthorized_client|access_denied/i);
  return m ? m[0].toLowerCase() : null;
}

/**
 * Log sécurisé : HTTP status + error + error_description, jamais de secrets.
 */
function logGoogleApiError(err, step = 'unknown') {
  const data = err?.response?.data;
  const payload = {
    step,
    httpStatus: err?.response?.status || null,
    googleError: typeof data?.error === 'string'
      ? data.error
      : (data?.error?.message || data?.error || extractGoogleErrorCode(err) || null),
    googleErrorDescription: data?.error_description || null,
    message: String(err?.message || '').slice(0, 240),
  };
  console.error('[DRIVE] google_api_error', payload);
  return payload;
}

function classifyDriveError(err) {
  const raw = String(err?.message || err || '');
  const lower = raw.toLowerCase();
  const gCode = extractGoogleErrorCode(err);

  if (gCode === 'unauthorized_client' || lower.includes('unauthorized_client')) {
    return {
      code: CODES.UNAUTHORIZED_CLIENT,
      reconnectRequired: true,
      retryable: false,
      userMessage: 'Refresh Token incompatible avec le Client OAuth configuré',
      detailSafe: 'unauthorized_client — le refresh token ne correspond pas au GOOGLE_OAUTH_CLIENT_ID/SECRET ERP.',
    };
  }

  if (gCode === 'invalid_grant' || lower.includes('invalid_grant')) {
    const revoked = lower.includes('revoked') || lower.includes('expired or revoked');
    return {
      code: revoked ? CODES.REVOKED : CODES.INVALID_GRANT,
      reconnectRequired: true,
      retryable: false,
      userMessage: 'Google Drive déconnecté — reconnexion nécessaire',
      detailSafe: revoked
        ? 'Autorisation Google révoquée ou refresh token invalide.'
        : 'Refresh token Google invalide (invalid_grant).',
    };
  }

  if (gCode === 'invalid_client' || lower.includes('invalid_client')) {
    return {
      code: CODES.MISCONFIGURED,
      reconnectRequired: true,
      retryable: false,
      userMessage: 'Configuration OAuth Google incorrecte',
      detailSafe: 'Client OAuth Google invalide (client_id / client_secret).',
    };
  }

  if (lower.includes('enotfound') || lower.includes('etimedout') || lower.includes('econnreset')
    || lower.includes('network') || lower.includes('socket hang up') || lower.includes('429')) {
    return {
      code: CODES.NETWORK,
      reconnectRequired: false,
      retryable: true,
      userMessage: 'Erreur réseau temporaire Google Drive',
      detailSafe: 'Erreur réseau temporaire — nouvelles tentatives limitées.',
    };
  }

  if (lower.includes('storage quota') || lower.includes('quota')) {
    return {
      code: CODES.QUOTA,
      reconnectRequired: false,
      retryable: false,
      userMessage: 'Quota Google Drive insuffisant',
      detailSafe: 'Quota Drive / Service Account sans espace.',
    };
  }

  if (lower.includes('file not found') || lower.includes('not found')) {
    return {
      code: CODES.NOT_FOUND,
      reconnectRequired: false,
      retryable: false,
      userMessage: 'Dossier Google Drive inaccessible',
      detailSafe: 'Dossier Drive introuvable ou hors portée OAuth.',
    };
  }

  const safeDetail = raw
    .replace(/Bearer\s+[\w.-]+/gi, 'Bearer ***')
    .replace(/refresh_token[=:]\s*[^\s&]+/gi, 'refresh_token=***')
    .replace(/client_secret[=:]\s*[^\s&]+/gi, 'client_secret=***')
    .slice(0, 180);
  return {
    code: CODES.UNKNOWN,
    reconnectRequired: false,
    retryable: true,
    userMessage: safeDetail
      ? `Erreur Google Drive — ${safeDetail}`
      : 'Erreur Google Drive',
    detailSafe: safeDetail,
  };
}

function isInvalidGrantError(err) {
  const c = classifyDriveError(err);
  return c.reconnectRequired
    && [CODES.INVALID_GRANT, CODES.REVOKED, CODES.MISCONFIGURED, CODES.UNAUTHORIZED_CLIENT].includes(c.code);
}

module.exports = {
  CODES,
  classifyDriveError,
  extractGoogleErrorCode,
  isInvalidGrantError,
  logGoogleApiError,
};

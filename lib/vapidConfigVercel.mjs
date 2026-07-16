/**
 * Configuration VAPID Web Push — serveur uniquement (Vercel / Node).
 *
 * Secrets :
 * - VAPID_PRIVATE_KEY  → jamais exposée au frontend / jamais dans VITE_*
 * - VAPID_PUBLIC_KEY   → exposable via GET /api/push/vapid-public-key
 * - VAPID_SUBJECT      → mailto: ou https: (contact du serveur d'application)
 */

function trimEnv(name) {
  try {
    const v = process.env[name];
    return typeof v === 'string' ? v.trim() : '';
  } catch {
    return '';
  }
}

/** Clé publique VAPID (safe pour le client après fetch API). */
export function getVapidPublicKey() {
  return trimEnv('VAPID_PUBLIC_KEY') || null;
}

/**
 * Clé privée VAPID — usage serveur uniquement (web-push send).
 * Ne jamais renvoyer dans une réponse HTTP.
 */
export function getVapidPrivateKey() {
  return trimEnv('VAPID_PRIVATE_KEY') || null;
}

/** Subject VAPID (RFC 8292) — mailto: ou URL https. */
export function getVapidSubject() {
  return trimEnv('VAPID_SUBJECT') || 'mailto:noreply@citymoapp.com';
}

export function isVapidConfigured() {
  return Boolean(getVapidPublicKey() && getVapidPrivateKey());
}

/**
 * Identifiants complets pour l'envoi push (étapes ultérieures).
 * @throws {{ status: number, message: string }}
 */
export function getVapidCredentials() {
  const publicKey = getVapidPublicKey();
  const privateKey = getVapidPrivateKey();
  if (!publicKey || !privateKey) {
    const err = new Error('Configuration VAPID incomplète (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY).');
    err.status = 503;
    throw err;
  }
  return {
    publicKey,
    privateKey,
    subject: getVapidSubject(),
  };
}

/**
 * Payload HTTP sûr : uniquement la clé publique.
 * Garantit qu'aucune propriété privée n'est sérialisée.
 */
export function buildVapidPublicKeyResponse() {
  const publicKey = getVapidPublicKey();
  if (!publicKey) {
    const err = new Error('Notifications push non configurées sur le serveur.');
    err.status = 503;
    throw err;
  }
  return Object.freeze({
    publicKey,
    configured: true,
  });
}

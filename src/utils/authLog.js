/**
 * Logs structurés pour le flux Supabase Auth (console uniquement).
 */

export function logAuth(step, details = {}) {
  console.info(`[CITYMO Auth] ${step}`, details);
}

export function logAuthError(step, error, extra = {}) {
  console.error(`[CITYMO Auth] ${step}`, {
    message: error?.message,
    status: error?.status,
    code: error?.code,
    name: error?.name,
    ...extra,
  });
}

/** Message affiché à l'utilisateur — erreur Supabase réelle sauf identifiants invalides. */
export function formatSupabaseAuthError(error) {
  if (!error) return 'Erreur de connexion inconnue.';
  const msg = (error.message || '').trim();
  if (!msg) return 'Erreur de connexion inconnue.';

  if (/invalid login credentials/i.test(msg)) {
    return 'Email ou mot de passe incorrect.';
  }
  if (/email not confirmed/i.test(msg)) {
    return 'Email non confirmé. Vérifiez votre boîte mail ou contactez l\'administrateur.';
  }
  if (/user banned|user disabled/i.test(msg)) {
    return 'Compte désactivé. Contactez l\'administrateur.';
  }
  if (/too many requests|rate limit/i.test(msg)) {
    return 'Trop de tentatives. Réessayez dans quelques minutes.';
  }

  return msg;
}

export function authErrorPayload(error) {
  return {
    error: formatSupabaseAuthError(error),
    errorCode: error?.code ?? null,
    errorStatus: error?.status ?? null,
  };
}

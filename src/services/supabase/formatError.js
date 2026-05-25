/**
 * formatError.js — Normalize Supabase/PostgREST errors for UI toasts.
 */
export function formatSupabaseError(error, fallback = 'Une erreur est survenue.') {
  if (!error) return fallback;
  if (typeof error === 'string') return error;

  const code = error.code;
  const message = error.message || fallback;

  if (code === '23505') return 'Cet enregistrement existe déjà (contrainte unique).';
  if (code === '42501') return 'Accès refusé. Connectez-vous avec un compte Supabase valide.';
  if (code === '42703' || message.includes('created_by')) {
    return 'Schéma congés incomplet — exécutez supabase/migrations/20260525200000_leaves_rls_super_admin.sql';
  }
  if (code === 'PGRST301' || message.includes('JWT')) {
    return 'Session expirée. Veuillez vous reconnecter.';
  }

  return message;
}

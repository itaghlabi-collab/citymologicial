/**
 * financeDiagnostics.js — Diagnostic lecture Supabase Finance
 */
import { getSupabase, isSupabaseConfigured } from '../../lib/supabase';
import { ENV } from '../../config/env';

export async function diagnoseFinanceAccess() {
  const result = {
    configured: isSupabaseConfigured(),
    supabaseUrl: ENV.SUPABASE_URL || '(vide)',
    hasSession: false,
    userEmail: null,
    categoriesCount: null,
    transactionsCount: null,
    error: null,
    hint: null,
  };

  if (!result.configured) {
    result.hint = 'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY manquants sur Vercel ou .env';
    return result;
  }

  try {
    const client = getSupabase();
    const { data: { session } } = await client.auth.getSession();
    result.hasSession = Boolean(session?.user);
    result.userEmail = session?.user?.email || null;

    const cat = await client
      .from('finance_categories')
      .select('id', { count: 'exact', head: true });
    if (cat.error) {
      result.error = cat.error.message;
      result.hint = cat.error.code === '42P01'
        ? 'Table absente — exécutez supabase/RUN_FINANCE_COMPLET.sql'
        : 'Erreur Supabase — exécutez supabase/RUN_FINANCE_COMPLET.sql';
      return result;
    }
    result.categoriesCount = cat.count ?? 0;

    const tx = await client
      .from('finance_transactions')
      .select('id', { count: 'exact', head: true });
    result.transactionsCount = tx.error ? null : (tx.count ?? 0);

    if (result.categoriesCount === 0) {
      result.hint = result.hasSession
        ? '0 catégorie lue — exécutez supabase/RUN_FINANCE_COMPLET.sql dans SQL Editor'
        : 'Connectez-vous puis actualisez';
    }
  } catch (err) {
    result.error = err?.message || String(err);
  }

  return result;
}

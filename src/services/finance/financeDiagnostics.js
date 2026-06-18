/**
 * financeDiagnostics.js — Diagnostic lecture Supabase Finance + audit sync RH
 */
import { getSupabase, isSupabaseConfigured } from '../../lib/supabase';
import { ENV } from '../../config/env';
import { auditWorkerPayrollCashSync } from '../rh/workerPayroll';

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

  if (import.meta.env.DEV || result.error || result.categoriesCount === 0) {
    console.info('[CITYMO Finance] Supabase diagnostic', result);
  }

  return result;
}

/** Audit : paiements RH payés vs lignes finance_transactions (montant + date exacts). */
export async function auditRhFinanceSync() {
  const result = {
    schemaOk: false,
    payrollPaid: 0,
    subcontractorPaid: 0,
    workerTxCount: 0,
    subcontractorTxCount: 0,
    missingWorker: 0,
    missingSubcontractor: 0,
    error: null,
    hint: null,
  };

  if (!isSupabaseConfigured()) {
    result.error = 'Supabase non configuré';
    return result;
  }

  const client = getSupabase();

  try {
    const probe = await client.from('finance_transactions').select('source_type, source_id, is_auto_generated').limit(1);
    if (probe.error) {
      result.error = probe.error.message;
      if (probe.error.message?.includes('source_type') || probe.error.message?.includes('is_auto_generated')) {
        result.hint = 'Exécutez supabase/RUN_FINANCE_TOUT_EN_UN.sql dans Supabase SQL Editor';
      }
      return result;
    }
    result.schemaOk = true;

    const [workerAudit, subRes, subTxRes] = await Promise.all([
      auditWorkerPayrollCashSync(client),
      client.from('subcontractor_payments').select('id, amount').eq('status', 'paid').gt('amount', 0),
      client.from('finance_transactions').select('id', { count: 'exact', head: true })
        .eq('source_type', 'subcontractor_payment').neq('statut', 'Annulé'),
    ]);

    if (subRes.error) throw subRes.error;

    result.payrollPaid = workerAudit.expectedGroups;
    result.workerTxCount = workerAudit.workerTxCount;
    result.missingWorker = workerAudit.missingOrWrong;
    result.subcontractorPaid = subRes.data?.length || 0;
    result.subcontractorTxCount = subTxRes.count ?? 0;

    const paidSubIds = new Set((subRes.data || []).map((r) => r.id));
    if (paidSubIds.size > 0) {
      const { data: subTxs } = await client
        .from('finance_transactions')
        .select('source_id')
        .eq('source_type', 'subcontractor_payment')
        .neq('statut', 'Annulé');
      const syncedIds = new Set((subTxs || []).map((t) => t.source_id));
      result.missingSubcontractor = [...paidSubIds].filter((id) => !syncedIds.has(id)).length;
    }

    if (result.missingWorker > 0 || result.missingSubcontractor > 0) {
      result.hint = 'Cliquez « Actualiser » sur la Feuille de caisse';
    }
  } catch (err) {
    result.error = err?.message || String(err);
  }

  return result;
}

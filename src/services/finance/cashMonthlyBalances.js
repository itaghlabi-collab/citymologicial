/**
 * cashMonthlyBalances.js — Soldes mensuels caisse + report automatique du reliquat
 *
 * Le reliquat suit la Feuille de caisse (mouvements Espèces uniquement),
 * pas l’ensemble du journal finance (virements exclus).
 *
 * force_ouverture = true : le solde_initial stocké du mois est utilisé tel quel
 * (pas de report du mois précédent). Utile pour une amorce / nouveau départ.
 */
import { getSupabase } from '../../lib/supabase';
import { requireSupabaseUserId } from '../supabase/requireUser';
import { listFinanceTransactions, computeCashTotals } from './financeTransactions';
import { consolidateCashSheetTransactions } from './cashSheetDisplay';

const TABLE = 'cash_monthly_balances';
const MAX_CHAIN_MONTHS = 36;

export function normalizeBalance(row) {
  if (!row) return null;
  return {
    id: row.id,
    annee: Number(row.annee),
    mois: Number(row.mois),
    solde_initial: Number(row.solde_initial) || 0,
    alimentation: Number(row.alimentation) || 0,
    notes: row.notes || '',
    force_ouverture: Boolean(row.force_ouverture),
  };
}

export function toBalanceRow(form) {
  const row = {
    annee: Number(form.annee),
    mois: Number(form.mois),
    solde_initial: Number(form.solde_initial) || 0,
    alimentation: Number(form.alimentation) || 0,
    notes: form.notes || null,
  };
  if (form.force_ouverture !== undefined) {
    row.force_ouverture = Boolean(form.force_ouverture);
  }
  return row;
}

export function prevYearMonth(annee, mois) {
  if (Number(mois) <= 1) return { annee: Number(annee) - 1, mois: 12 };
  return { annee: Number(annee), mois: Number(mois) - 1 };
}

export async function getCashMonthlyBalance(annee, mois) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .eq('annee', annee)
    .eq('mois', mois)
    .maybeSingle();
  if (error) throw error;
  return data ? normalizeBalance(data) : null;
}

export async function listCashMonthlyBalancesForYear(annee) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .eq('annee', annee)
    .order('mois', { ascending: true });
  if (error) throw error;
  return (data || []).map(normalizeBalance);
}

export async function upsertCashMonthlyBalance(form) {
  const uid = await requireSupabaseUserId();
  const existing = await getCashMonthlyBalance(form.annee, form.mois);
  const row = toBalanceRow(form);
  if (existing?.id) {
    const { data, error } = await getSupabase()
      .from(TABLE)
      .update(row)
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw error;
    return normalizeBalance(data);
  }
  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([{ ...row, created_by: uid }])
    .select()
    .single();
  if (error) throw error;
  return normalizeBalance(data);
}

/** Activité utile pour la chaîne = ligne solde mensuel OU mouvements espèces. */
function monthHasCashSheetActivity(balance, cashTxs) {
  if (balance) return true;
  return Array.isArray(cashTxs) && cashTxs.length > 0;
}

/**
 * Chaîne pure : ouverture du mois courant = clôture du dernier mois de previousMonthsAsc.
 * previousMonthsAsc : [{ balance, transactions }] du plus ancien au mois N-1.
 * `transactions` = déjà filtrées Feuille de caisse (espèces).
 * Si un mois a force_ouverture, son solde_initial stocké reprend la chaîne à cet endroit.
 * Retourne null si la chaîne est vide (utiliser alors le solde_initial stocké du mois courant).
 */
export function computeEffectiveOpeningFromChain(previousMonthsAsc) {
  const chain = Array.isArray(previousMonthsAsc) ? previousMonthsAsc : [];
  if (!chain.length) return null;

  let opening = Number(chain[0]?.balance?.solde_initial) || 0;
  for (const month of chain) {
    if (month.balance?.force_ouverture) {
      opening = Number(month.balance.solde_initial) || 0;
    }
    // Même formule feuille de caisse : reliquat + entrées espèces − sorties (pas de pot alimentation séparé).
    opening = computeCashTotals(month.transactions || [], {
      solde_initial: opening,
      alimentation: 0,
    }).soldeMois;
  }
  return opening;
}

/**
 * Solde initial / reliquat du mois (annee, mois) =
 * solde final Feuille de caisse du mois précédent (espèces),
 * recalculé dynamiquement sur toute la chaîne —
 * sauf si force_ouverture sur le mois courant.
 * Aucune écriture journal créée.
 */
export async function resolveEffectiveSoldeInitial(annee, mois) {
  const y0 = Number(annee);
  const m0 = Number(mois);
  if (!y0 || !m0) return 0;

  const currentBalance = await getCashMonthlyBalance(y0, m0);
  if (currentBalance?.force_ouverture) {
    return Number(currentBalance.solde_initial) || 0;
  }

  const chainDesc = [];
  let cursor = { annee: y0, mois: m0 };

  for (let i = 0; i < MAX_CHAIN_MONTHS; i += 1) {
    const prev = prevYearMonth(cursor.annee, cursor.mois);
    const [balance, allTxs] = await Promise.all([
      getCashMonthlyBalance(prev.annee, prev.mois),
      listFinanceTransactions({ year: prev.annee, month: prev.mois }),
    ]);
    const cashTxs = consolidateCashSheetTransactions(allTxs);
    if (!monthHasCashSheetActivity(balance, cashTxs)) break;
    chainDesc.push({ balance, transactions: cashTxs });
    cursor = prev;
  }

  const chainAsc = chainDesc.reverse();
  const fromChain = computeEffectiveOpeningFromChain(chainAsc);
  if (fromChain !== null) return fromChain;

  return Number(currentBalance?.solde_initial) || 0;
}

/** Solde de clôture du mois précédent (= solde initial effectif du mois demandé). */
export async function getPreviousMonthClosing(annee, mois) {
  return resolveEffectiveSoldeInitial(annee, mois);
}

/**
 * Balance d'affichage / calcul : solde_initial = reliquat effectif (feuille de caisse).
 * Conserve alimentation / notes / id / force_ouverture stockés. N'écrit rien en base.
 */
export async function resolveEffectiveBalance(annee, mois, storedBalance = undefined) {
  const stored = storedBalance === undefined
    ? await getCashMonthlyBalance(annee, mois)
    : storedBalance;
  const solde_initial = await resolveEffectiveSoldeInitial(annee, mois);
  const storedInitial = Number(stored?.solde_initial) || 0;
  let solde_initial_source = 'stocke';
  if (stored?.force_ouverture) solde_initial_source = 'force';
  else if (!stored || solde_initial !== storedInitial) solde_initial_source = 'reliquat';

  return {
    id: stored?.id || null,
    annee: Number(annee),
    mois: Number(mois),
    solde_initial,
    alimentation: Number(stored?.alimentation) || 0,
    notes: stored?.notes || '',
    force_ouverture: Boolean(stored?.force_ouverture),
    solde_initial_stored: storedInitial,
    solde_initial_source,
  };
}

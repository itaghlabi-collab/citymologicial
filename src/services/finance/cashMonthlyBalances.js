/**
 * cashMonthlyBalances.js — Soldes mensuels caisse
 */
import { getSupabase } from '../../lib/supabase';
import { requireSupabaseUserId } from '../supabase/requireUser';
import { listFinanceTransactions, computeCashTotals } from './financeTransactions';

const TABLE = 'cash_monthly_balances';

export function normalizeBalance(row) {
  if (!row) return null;
  return {
    id: row.id,
    annee: Number(row.annee),
    mois: Number(row.mois),
    solde_initial: Number(row.solde_initial) || 0,
    alimentation: Number(row.alimentation) || 0,
    notes: row.notes || '',
  };
}

export function toBalanceRow(form) {
  return {
    annee: Number(form.annee),
    mois: Number(form.mois),
    solde_initial: Number(form.solde_initial) || 0,
    alimentation: Number(form.alimentation) || 0,
    notes: form.notes || null,
  };
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

/** Solde de clôture du mois précédent (transactions + alimentation). */
export async function getPreviousMonthClosing(annee, mois) {
  let prevMois = mois - 1;
  let prevAnnee = annee;
  if (prevMois < 1) { prevMois = 12; prevAnnee -= 1; }
  const balance = await getCashMonthlyBalance(prevAnnee, prevMois);
  if (!balance) return 0;
  const txs = await listFinanceTransactions({ year: prevAnnee, month: prevMois });
  return computeCashTotals(txs, balance).soldeMois;
}

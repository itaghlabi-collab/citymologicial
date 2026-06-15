/**
 * cashDailyValidation.js — Validation journalière caisse (DG)
 */
import { getSupabase } from '../../lib/supabase';
import { requireSupabaseUserId } from '../supabase/requireUser';

const TABLE = 'cash_daily_validations';

export async function getCashDailyValidation(dateIso) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .eq('date_validation', dateIso)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listRecentCashValidations(limit = 14) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .order('date_validation', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function validateCashDay(dateIso, notes = '') {
  const uid = await requireSupabaseUserId();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .upsert({
      date_validation: dateIso,
      validated_by: uid,
      validated_at: new Date().toISOString(),
      notes: notes?.trim() || null,
    }, { onConflict: 'date_validation' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

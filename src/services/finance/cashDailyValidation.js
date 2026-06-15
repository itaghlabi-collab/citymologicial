/**
 * cashDailyValidation.js — Validation journalière caisse (DG) — logique J-1
 * Chaque matin le DG valide la caisse de la veille (J-1).
 */
import { getSupabase } from '../../lib/supabase';
import { requireSupabaseUserId } from '../supabase/requireUser';

const TABLE = 'cash_daily_validations';

export function todayIso(ref = new Date()) {
  return toIsoDate(ref);
}

/** Date calendaire J-1 (veille). */
export function yesterdayIso(ref = new Date()) {
  const d = new Date(ref);
  d.setDate(d.getDate() - 1);
  return toIsoDate(d);
}

function toIsoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatDateFr(iso) {
  if (!iso) return '—';
  return new Date(`${iso}T12:00:00`).toLocaleDateString('fr-MA', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

/** Date à valider : toujours J-1 (pas le jour en cours). */
export function getValidationTargetDate(ref = new Date()) {
  return yesterdayIso(ref);
}

export async function getCashDailyValidation(dateIso) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .eq('date_validation', dateIso)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getPendingCashValidation(ref = new Date()) {
  const targetDate = getValidationTargetDate(ref);
  const validation = await getCashDailyValidation(targetDate);
  return {
    targetDate,
    validation,
    needsValidation: !validation,
  };
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

/** Valide la caisse J-1 (usage standard DG). */
export async function validateCashPreviousDay(notes = '') {
  return validateCashDay(getValidationTargetDate(), notes);
}

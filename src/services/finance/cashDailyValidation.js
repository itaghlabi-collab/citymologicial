/**
 * cashDailyValidation.js — Validation journalière caisse (DG)
 * Table : daily_cash_reviews (review_date) — rétro-compat cash_daily_validations
 */
import { getSupabase } from '../../lib/supabase';
import { requireSupabaseUserId } from '../supabase/requireUser';

const TABLE = 'daily_cash_reviews';
const LEGACY_TABLE = 'cash_daily_validations';

export function todayIso(ref = new Date()) {
  return toIsoDate(ref);
}

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

function normalizeReview(row) {
  if (!row) return null;
  return {
    id: row.id,
    review_date: row.review_date || row.date_validation,
    validated_by: row.validated_by,
    validated_at: row.validated_at,
    notes: row.notes,
  };
}

async function readReview(dateIso) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .eq('review_date', dateIso)
    .maybeSingle();
  if (!error) return normalizeReview(data);
  if (error?.code === 'PGRST205' || error?.message?.includes('daily_cash_reviews')) {
    const legacy = await getSupabase()
      .from(LEGACY_TABLE)
      .select('*')
      .eq('date_validation', dateIso)
      .maybeSingle();
    if (legacy.error) throw legacy.error;
    return normalizeReview(legacy.data);
  }
  throw error;
}

export async function getCashDailyValidation(dateIso) {
  return readReview(dateIso);
}

/** @deprecated use getCashDailyValidation(selectedDate) */
export async function getPendingCashValidation(ref = new Date()) {
  const targetDate = yesterdayIso(ref);
  const validation = await getCashDailyValidation(targetDate);
  return { targetDate, validation, needsValidation: !validation };
}

export async function listRecentCashValidations(limit = 14) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .order('review_date', { ascending: false })
    .limit(limit);
  if (error) {
    const legacy = await getSupabase()
      .from(LEGACY_TABLE)
      .select('*')
      .order('date_validation', { ascending: false })
      .limit(limit);
    if (legacy.error) throw legacy.error;
    return (legacy.data || []).map(normalizeReview);
  }
  return (data || []).map(normalizeReview);
}

export async function validateCashDay(dateIso, notes = '') {
  const uid = await requireSupabaseUserId();
  const row = {
    review_date: dateIso,
    validated_by: uid,
    validated_at: new Date().toISOString(),
    notes: notes?.trim() || null,
  };
  const { data, error } = await getSupabase()
    .from(TABLE)
    .upsert(row, { onConflict: 'review_date' })
    .select()
    .single();
  if (error) {
    const legacyRow = {
      date_validation: dateIso,
      validated_by: uid,
      validated_at: row.validated_at,
      notes: row.notes,
    };
    const legacy = await getSupabase()
      .from(LEGACY_TABLE)
      .upsert(legacyRow, { onConflict: 'date_validation' })
      .select()
      .single();
    if (legacy.error) throw legacy.error;
    return normalizeReview(legacy.data);
  }
  return normalizeReview(data);
}

export async function unlockCashDay(dateIso) {
  await requireSupabaseUserId();
  const { error } = await getSupabase().from(TABLE).delete().eq('review_date', dateIso);
  if (error) {
    const legacy = await getSupabase().from(LEGACY_TABLE).delete().eq('date_validation', dateIso);
    if (legacy.error) throw legacy.error;
    return;
  }
}

/** @deprecated */
export async function validateCashPreviousDay(notes = '') {
  return validateCashDay(yesterdayIso(), notes);
}

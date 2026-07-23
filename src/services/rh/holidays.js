/**
 * holidays.js — Calendrier jours fériés (table public_holidays)
 */
import { getSupabase } from '../../lib/supabase';

const TABLE = 'public_holidays';

export function isMissingHolidaysSchema(err) {
  const msg = String(err?.message || err?.details || '').toLowerCase();
  const code = String(err?.code || '');
  return code === '42P01' || code === 'PGRST205' || msg.includes('public_holidays') || msg.includes('schema cache');
}

/** Retourne un Set de dates ISO (YYYY-MM-DD) actives. */
export async function listActiveHolidayDates(fromIso = null, toIso = null) {
  try {
    let q = getSupabase()
      .from(TABLE)
      .select('date, label')
      .eq('actif', true)
      .order('date', { ascending: true });
    if (fromIso) q = q.gte('date', fromIso);
    if (toIso) q = q.lte('date', toIso);
    const { data, error } = await q;
    if (error) {
      if (isMissingHolidaysSchema(error)) return [];
      throw error;
    }
    return (data || []).map((r) => ({
      date: String(r.date).slice(0, 10),
      label: r.label || 'Jour férié',
    }));
  } catch (err) {
    if (isMissingHolidaysSchema(err)) return [];
    throw err;
  }
}

export async function listHolidayDateSet(fromIso = null, toIso = null) {
  const rows = await listActiveHolidayDates(fromIso, toIso);
  return new Set(rows.map((r) => r.date));
}

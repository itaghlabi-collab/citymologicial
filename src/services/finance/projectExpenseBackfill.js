/**
 * Rattrapage dépenses → projets (API service_role, idempotent).
 */
import { getSupabase } from '../../lib/supabase';

export const BACKFILL_SINCE = '2026-07-01';

export async function backfillProjectExpensesViaApi({ since = BACKFILL_SINCE, dryRun = false } = {}) {
  try {
    const { resolveApiBaseUrl, ENV } = await import('../../config/env');
    const sb = getSupabase();
    const { data: { session } } = await sb.auth.getSession();
    if (!session?.access_token) return null;

    const res = await fetch(`${resolveApiBaseUrl()}/finance/backfill-project-expenses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: ENV.SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ since, dryRun }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.warn('[CITYMO] backfill project expenses', res.status, err.error || '');
      return null;
    }

    return res.json();
  } catch (err) {
    console.warn('[CITYMO] backfillProjectExpensesViaApi', err);
    return null;
  }
}

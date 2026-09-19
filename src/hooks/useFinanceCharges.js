import { useState, useEffect, useCallback, useRef } from 'react';
import { isSupabaseConfigured } from '../lib/supabase';
import { formatSupabaseError } from '../services/supabase/formatError';
import {
  listFinanceCharges,
  createFinanceCharge,
  updateFinanceCharge,
  deleteFinanceCharge,
} from '../services/finance/charges';
import {
  SAVE_TIMEOUT_MS,
  SAVE_TIMEOUT_MESSAGE,
  withTimeout,
  upsertChargeRecord,
} from './financeChargeSave';

export function useFinanceCharges() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState(null);
  const configured = isSupabaseConfigured();

  const load = useCallback(async () => {
    if (!configured) {
      setError('Supabase non configuré (.env)');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setRecords(await listFinanceCharges());
    } catch (err) {
      console.error('[CITYMO] useFinanceCharges', err);
      setError(formatSupabaseError(err, 'Erreur chargement charges.'));
    } finally {
      setLoading(false);
    }
  }, [configured]);

  useEffect(() => { load(); }, [load]);

  async function save(form, id, categoryName) {
    if (savingRef.current) return { success: false, ignored: true, error: 'Enregistrement déjà en cours.' };
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const charge = await withTimeout(
        id ? updateFinanceCharge(id, form, categoryName) : createFinanceCharge(form, categoryName),
        SAVE_TIMEOUT_MS,
        SAVE_TIMEOUT_MESSAGE,
      );
      if (charge) {
        setRecords((prev) => upsertChargeRecord(prev, charge));
      }
      return { success: true, charge };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur enregistrement.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function remove(id) {
    setSaving(true);
    try {
      await deleteFinanceCharge(id);
      setRecords((prev) => prev.filter((r) => r.id !== id));
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur suppression.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }

  return { records, loading, saving, error, configured, reload: load, save, remove };
}

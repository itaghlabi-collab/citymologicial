import { useState, useEffect, useCallback } from 'react';
import { isSupabaseConfigured } from '../lib/supabase';
import { formatSupabaseError } from '../services/supabase/formatError';
import {
  listFinanceCharges,
  createFinanceCharge,
  updateFinanceCharge,
  deleteFinanceCharge,
} from '../services/finance/charges';

export function useFinanceCharges() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
    setSaving(true);
    setError(null);
    try {
      if (id) await updateFinanceCharge(id, form, categoryName);
      else await createFinanceCharge(form, categoryName);
      await load();
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur enregistrement.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    setSaving(true);
    try {
      await deleteFinanceCharge(id);
      await load();
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

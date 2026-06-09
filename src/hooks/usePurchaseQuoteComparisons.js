import { useState, useEffect, useCallback } from 'react';
import { isSupabaseConfigured } from '../lib/supabase';
import { formatSupabaseError } from '../services/supabase/formatError';
import {
  listQuoteComparisons,
  createQuoteComparison,
  updateQuoteComparison,
  deleteQuoteComparison,
  loadQuoteComparisonFormOptions,
  exportQuoteComparisonsCsv,
} from '../services/achats/purchaseQuoteComparisons';

export function usePurchaseQuoteComparisons() {
  const [records, setRecords] = useState([]);
  const [projects, setProjects] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const configured = isSupabaseConfigured();

  const loadOptions = useCallback(async () => {
    if (!configured) {
      setOptionsLoading(false);
      return;
    }
    setOptionsLoading(true);
    try {
      const { projects: p, suppliers: s } = await loadQuoteComparisonFormOptions();
      setProjects(p);
      setSuppliers(s);
    } catch (err) {
      console.error('[CITYMO] usePurchaseQuoteComparisons options', err);
    } finally {
      setOptionsLoading(false);
    }
  }, [configured]);

  const load = useCallback(async () => {
    if (!configured) {
      setError('Supabase non configuré — vérifiez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setRecords(await listQuoteComparisons());
    } catch (err) {
      console.error('[CITYMO] usePurchaseQuoteComparisons', err);
      setError(formatSupabaseError(err, 'Erreur chargement comparaisons de devis.'));
    } finally {
      setLoading(false);
    }
  }, [configured]);

  useEffect(() => {
    load();
    loadOptions();
  }, [load, loadOptions]);

  async function save(form, id) {
    setSaving(true);
    setError(null);
    try {
      if (id) await updateQuoteComparison(id, form);
      else await createQuoteComparison(form);
      await load();
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur enregistrement comparaison.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    setSaving(true);
    setError(null);
    try {
      await deleteQuoteComparison(id);
      await load();
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur suppression comparaison.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }

  function exportCsv(filtered) {
    exportQuoteComparisonsCsv(filtered || records);
  }

  return {
    records,
    projects,
    suppliers,
    loading,
    optionsLoading,
    saving,
    error,
    configured,
    reload: load,
    reloadOptions: loadOptions,
    save,
    remove,
    exportCsv,
  };
}

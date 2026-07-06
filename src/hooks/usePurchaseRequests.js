import { useState, useEffect, useCallback } from 'react';
import { isSupabaseConfigured } from '../lib/supabase';
import { formatSupabaseError } from '../services/supabase/formatError';
import {
  listPurchaseRequests,
  deletePurchaseRequest,
  loadPurchaseRequestFormOptions,
} from '../services/achats/purchaseRequests';
import {
  createPurchaseRequestWorkflow,
  updatePurchaseRequestWorkflow,
} from '../services/achats/purchaseWorkflow';

export function usePurchaseRequests() {
  const [records, setRecords] = useState([]);
  const [projects, setProjects] = useState([]);
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
      const { projects: p } = await loadPurchaseRequestFormOptions();
      setProjects(p);
    } catch (err) {
      console.error('[CITYMO] usePurchaseRequests options', err);
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
      setRecords(await listPurchaseRequests());
    } catch (err) {
      console.error('[CITYMO] usePurchaseRequests', err);
      setError(formatSupabaseError(err, 'Erreur chargement demandes d\'achat.'));
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
      if (id) await updatePurchaseRequestWorkflow(id, form);
      else await createPurchaseRequestWorkflow(form);
      await load();
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur enregistrement demande.');
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
      await deletePurchaseRequest(id);
      await load();
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur suppression demande.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }

  return {
    records,
    projects,
    loading,
    optionsLoading,
    saving,
    error,
    configured,
    reload: load,
    reloadOptions: loadOptions,
    save,
    remove,
  };
}

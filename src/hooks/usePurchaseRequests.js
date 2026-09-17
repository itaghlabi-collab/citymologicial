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

function upsertPurchaseRecord(prev, updated) {
  if (!updated?.id) return prev;
  const idx = prev.findIndex((r) => String(r.id) === String(updated.id));
  if (idx < 0) return [updated, ...prev];
  const next = prev.slice();
  next[idx] = { ...prev[idx], ...updated };
  return next;
}

export function usePurchaseRequests() {
  const [records, setRecords] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [optionsLoading, setOptionsLoading] = useState(false);
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
    const t0 = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    if (!configured) {
      setError('Supabase non configuré — vérifiez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await listPurchaseRequests();
      setRecords(rows);
      console.info('[CITYMO] purchaseRequest', {
        op: 'list-ui',
        ms: Math.round((typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) - t0),
        n: rows?.length || 0,
      });
    } catch (err) {
      console.error('[CITYMO] usePurchaseRequests', err);
      setError(formatSupabaseError(err, 'Erreur chargement demandes d\'achat.'));
    } finally {
      setLoading(false);
    }
  }, [configured]);

  useEffect(() => {
    load();
  }, [load]);

  const upsertRecord = useCallback((updated) => {
    setRecords((prev) => upsertPurchaseRecord(prev, updated));
  }, []);

  async function save(form, id) {
    setSaving(true);
    setError(null);
    try {
      const saved = id
        ? await updatePurchaseRequestWorkflow(id, form)
        : await createPurchaseRequestWorkflow(form);
      if (saved) upsertRecord(saved);
      return { success: true, record: saved };
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
      setRecords((prev) => prev.filter((r) => String(r.id) !== String(id)));
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
    upsertRecord,
    save,
    remove,
  };
}

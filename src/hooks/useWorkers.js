/**
 * useWorkers.js — Ouvriers hook (list / CRUD / stats).
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { isSupabaseConfigured } from '../lib/supabase';
import { formatSupabaseError } from '../services/supabase/formatError';
import {
  listWorkers,
  createWorker,
  updateWorker,
  deleteWorker,
  computeWorkerStats,
  filterWorkers,
} from '../services/rh/workers';

export function useWorkers() {
  const [workers, setWorkers] = useState([]);
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
      const data = await listWorkers();
      setWorkers(data);
    } catch (err) {
      setError(formatSupabaseError(err, 'Erreur de chargement des ouvriers.'));
    } finally {
      setLoading(false);
    }
  }, [configured]);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => computeWorkerStats(workers), [workers]);

  const create = useCallback(async (form) => {
    setSaving(true);
    setError(null);
    try {
      const created = await createWorker(form);
      await load();
      return { success: true, worker: created };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur enregistrement ouvrier.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }, [load]);

  const update = useCallback(async (id, form) => {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateWorker(id, form);
      await load();
      return { success: true, worker: updated };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur enregistrement ouvrier.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }, [load]);

  const remove = useCallback(async (id) => {
    setError(null);
    try {
      await deleteWorker(id);
      await load();
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur suppression ouvrier.');
      setError(msg);
      return { success: false, error: msg };
    }
  }, [load]);

  return {
    workers,
    stats,
    loading,
    saving,
    error,
    configured,
    load,
    create,
    update,
    remove,
    filterWorkers,
  };
}

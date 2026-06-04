/**
 * useInternalTasks.js — Tâches organisation interne
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';
import { formatSupabaseError } from '../services/supabase/formatError';
import {
  listInternalTasks,
  createInternalTask,
  updateInternalTask,
  deleteInternalTask,
  filterInternalTasks,
  computeInternalTaskStats,
  collectTaskResponsables,
} from '../services/internal/internalTasks';

export function useInternalTasks() {
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
      const rows = await listInternalTasks();
      setRecords(rows);
    } catch (err) {
      console.error('[CITYMO] useInternalTasks load', err);
      setError(formatSupabaseError(err, 'Erreur de chargement des taches.'));
    } finally {
      setLoading(false);
    }
  }, [configured]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!configured) return undefined;
    const { data: { subscription } } = getSupabase().auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'SIGNED_OUT') load();
    });
    return () => subscription.unsubscribe();
  }, [configured, load]);

  const responsables = useMemo(() => collectTaskResponsables(records), [records]);

  const create = useCallback(async (form) => {
    setSaving(true);
    setError(null);
    try {
      await createInternalTask(form);
      await load();
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur creation tache.');
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
      await updateInternalTask(id, form);
      await load();
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur modification tache.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }, [load]);

  const remove = useCallback(async (id) => {
    setError(null);
    try {
      await deleteInternalTask(id);
      await load();
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur suppression.');
      setError(msg);
      return { success: false, error: msg };
    }
  }, [load]);

  return {
    records,
    loading,
    saving,
    error,
    configured,
    load,
    create,
    update,
    remove,
    responsables,
    filterInternalTasks,
    computeInternalTaskStats,
  };
}

/**
 * useActionsMarketing.js — Campagnes / actions marketing (list / CRUD / filtres)
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';
import { formatSupabaseError } from '../services/supabase/formatError';
import {
  listActionsMarketing,
  createActionMarketing,
  updateActionMarketing,
  deleteActionMarketing,
  filterActionsMarketing,
  computeActionsMarketingStats,
  collectActionsResponsables,
} from '../services/commercial/actionsMarketing';

export function useActionsMarketing() {
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
      const rows = await listActionsMarketing();
      setRecords(rows);
    } catch (err) {
      console.error('[CITYMO] useActionsMarketing load', err);
      setError(formatSupabaseError(err, 'Erreur de chargement des actions marketing.'));
    } finally {
      setLoading(false);
    }
  }, [configured]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!configured) return undefined;
    const { data: { subscription } } = getSupabase().auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'SIGNED_OUT') {
        load();
      }
    });
    return () => subscription.unsubscribe();
  }, [configured, load]);

  const responsables = useMemo(
    () => collectActionsResponsables(records),
    [records],
  );

  const create = useCallback(async (form) => {
    setSaving(true);
    setError(null);
    try {
      const created = await createActionMarketing(form);
      await load();
      return { success: true, data: created };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur enregistrement action marketing.');
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
      const updated = await updateActionMarketing(id, form);
      await load();
      return { success: true, data: updated };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur modification action marketing.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }, [load]);

  const remove = useCallback(async (id) => {
    setError(null);
    try {
      await deleteActionMarketing(id);
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
    responsables,
    loading,
    saving,
    error,
    configured,
    load,
    create,
    update,
    remove,
    filterActionsMarketing,
    computeActionsMarketingStats,
  };
}

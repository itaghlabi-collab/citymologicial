/**
 * useProspects.js — Prospects Commercial (list / CRUD / filtres)
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';
import { formatSupabaseError } from '../services/supabase/formatError';
import {
  listProspects,
  createProspect,
  updateProspect,
  deleteProspect,
  filterProspects,
  computeProspectStats,
  collectProspectVilles,
  STATUT_VALUES,
  STATUT_LABEL,
} from '../services/commercial/prospects';

export function useProspects() {
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
      const rows = await listProspects();
      setRecords(rows);
    } catch (err) {
      console.error('[CITYMO] useProspects load', err);
      setError(formatSupabaseError(err, 'Erreur de chargement des prospects.'));
    } finally {
      setLoading(false);
    }
  }, [configured]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!configured) return undefined;
    const { data: { subscription } } = getSupabase().auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'SIGNED_OUT') {
        load();
      } else if (session) {
        load();
      }
    });
    return () => subscription.unsubscribe();
  }, [configured, load]);

  const villes = useMemo(() => collectProspectVilles(records), [records]);

  const create = useCallback(async (form) => {
    setSaving(true);
    setError(null);
    try {
      await createProspect(form);
      await load();
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur enregistrement prospect.');
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
      await updateProspect(id, form);
      await load();
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur modification prospect.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }, [load]);

  const remove = useCallback(async (id) => {
    setError(null);
    try {
      await deleteProspect(id);
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
    villes,
    filterProspects,
    computeProspectStats,
    STATUT_VALUES,
    STATUT_LABEL,
  };
}

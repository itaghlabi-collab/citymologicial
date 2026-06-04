/**
 * useDepenses.js — Dépenses commerciales / marketing (list / CRUD / filtres)
 */
import { useState, useEffect, useCallback } from 'react';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';
import { formatSupabaseError } from '../services/supabase/formatError';
import {
  listDepenses,
  createDepense,
  updateDepense,
  deleteDepense,
  filterDepenses,
  computeDepensesStats,
  sumDepensesMontant,
  collectDepensesResponsables,
} from '../services/commercial/depenses';

export function useDepenses() {
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
      const rows = await listDepenses();
      setRecords(rows);
    } catch (err) {
      console.error('[CITYMO] useDepenses load', err);
      setError(formatSupabaseError(err, 'Erreur de chargement des dépenses.'));
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

  const create = useCallback(async (form) => {
    setSaving(true);
    setError(null);
    try {
      const created = await createDepense(form);
      await load();
      return { success: true, data: created };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur enregistrement dépense.');
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
      const updated = await updateDepense(id, form);
      await load();
      return { success: true, data: updated };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur modification dépense.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }, [load]);

  const remove = useCallback(async (id) => {
    setError(null);
    try {
      await deleteDepense(id);
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
    filterDepenses,
    computeDepensesStats,
    sumDepensesMontant,
    collectDepensesResponsables,
  };
}

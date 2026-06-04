import { useState, useEffect, useCallback } from 'react';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';
import { formatSupabaseError } from '../services/supabase/formatError';
import {
  listSavReports,
  getSavReportById,
  createSavReport,
  updateSavReport,
  deleteSavReport,
  generateSavReportRef,
} from '../services/projects/savReports';

export function useSavReports() {
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
      setRecords(await listSavReports());
    } catch (err) {
      setError(formatSupabaseError(err, 'Erreur chargement comptes rendus.'));
    } finally {
      setLoading(false);
    }
  }, [configured]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!configured) return undefined;
    const { data: { subscription } } = getSupabase().auth.onAuthStateChange((e) => {
      if (['SIGNED_IN', 'TOKEN_REFRESHED', 'SIGNED_OUT'].includes(e)) load();
    });
    return () => subscription.unsubscribe();
  }, [configured, load]);

  const create = useCallback(async (form) => {
    setSaving(true);
    setError(null);
    try {
      const data = await createSavReport(form);
      await load();
      return { success: true, data };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur création compte rendu.');
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
      const data = await updateSavReport(id, form);
      await load();
      return { success: true, data };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur modification compte rendu.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }, [load]);

  const remove = useCallback(async (id) => {
    try {
      await deleteSavReport(id);
      await load();
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur suppression.');
      return { success: false, error: msg };
    }
  }, [load]);

  const fetchOne = useCallback(async (id) => getSavReportById(id), []);

  return {
    records, loading, saving, error, configured, load, create, update, remove, fetchOne,
    generateSavReportRef,
  };
}

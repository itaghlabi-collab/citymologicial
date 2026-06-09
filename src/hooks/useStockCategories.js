import { useState, useEffect, useCallback } from 'react';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';
import { formatSupabaseError } from '../services/supabase/formatError';
import { useAuth } from './useAuth';
import {
  listStockCategories,
  createStockCategory,
  updateStockCategory,
  setStockCategoryActive,
  deleteStockCategory,
  exportStockCategoriesCsv,
  exportStockCategoriesExcel,
  exportStockCategoriesPdf,
} from '../services/inventaire/stockCategories';

export function useStockCategories() {
  const { user, loading: authLoading } = useAuth();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const configured = isSupabaseConfigured();

  const load = useCallback(async () => {
    if (!configured) {
      setError('Supabase non configuré — vérifiez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY');
      setLoading(false);
      return;
    }
    if (authLoading) {
      setLoading(true);
      return;
    }
    if (!user) {
      setError('Session non détectée — tentative de lecture quand même.');
    }
    setLoading(true);
    setError(null);
    try {
      setRecords(await listStockCategories());
    } catch (err) {
      console.error('[CITYMO] useStockCategories', err);
      setError(formatSupabaseError(err, 'Erreur chargement catégories stock.'));
    } finally {
      setLoading(false);
    }
  }, [configured, authLoading, user]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!configured) return undefined;
    const { data: { subscription } } = getSupabase().auth.onAuthStateChange((event) => {
      if (['SIGNED_IN', 'TOKEN_REFRESHED', 'INITIAL_SESSION', 'SIGNED_OUT'].includes(event)) {
        load();
      }
    });
    return () => subscription.unsubscribe();
  }, [configured, load]);

  async function save(form, id) {
    setSaving(true);
    setError(null);
    try {
      if (id) await updateStockCategory(id, form);
      else await createStockCategory(form);
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

  async function toggleActive(id, currentActive) {
    setSaving(true);
    setError(null);
    try {
      await setStockCategoryActive(id, !currentActive);
      await load();
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur mise à jour statut.');
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
      await deleteStockCategory(id);
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

  function exportCsv(filtered) {
    exportStockCategoriesCsv(filtered || records);
  }

  function exportExcel(filtered) {
    exportStockCategoriesExcel(filtered || records);
  }

  function exportPdf(filtered) {
    exportStockCategoriesPdf(filtered || records);
  }

  return {
    records,
    loading,
    saving,
    error,
    configured,
    reload: load,
    save,
    toggleActive,
    remove,
    exportCsv,
    exportExcel,
    exportPdf,
  };
}

import { useState, useEffect, useCallback } from 'react';
import { isSupabaseConfigured } from '../lib/supabase';
import { formatSupabaseError } from '../services/supabase/formatError';
import {
  listSuppliers,
  createSupplier,
  updateSupplier,
  archiveSupplier,
  exportSuppliersCsv,
} from '../services/achats/suppliers';

export function useSuppliers() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const configured = isSupabaseConfigured();

  const load = useCallback(async () => {
    if (!configured) {
      setError('Supabase non configuré — vérifiez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setRecords(await listSuppliers({ includeArchived: true }));
    } catch (err) {
      console.error('[CITYMO] useSuppliers', err);
      setError(formatSupabaseError(err, 'Erreur chargement fournisseurs.'));
    } finally {
      setLoading(false);
    }
  }, [configured]);

  useEffect(() => { load(); }, [load]);

  async function save(form, id) {
    setSaving(true);
    setError(null);
    try {
      if (id) await updateSupplier(id, form);
      else await createSupplier(form);
      await load();
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur enregistrement fournisseur.');
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
      await archiveSupplier(id);
      await load();
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur archivage fournisseur.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }

  function exportCsv(filtered) {
    exportSuppliersCsv(filtered || records);
  }

  return {
    records,
    loading,
    saving,
    error,
    configured,
    reload: load,
    save,
    remove,
    exportCsv,
  };
}

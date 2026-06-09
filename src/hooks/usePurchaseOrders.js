import { useState, useEffect, useCallback } from 'react';
import { isSupabaseConfigured } from '../lib/supabase';
import { formatSupabaseError } from '../services/supabase/formatError';
import { listSuppliers } from '../services/achats/suppliers';
import {
  listPurchaseOrders,
  createPurchaseOrder,
  updatePurchaseOrder,
  deletePurchaseOrder,
  duplicatePurchaseOrder,
  exportPurchaseOrdersCsv,
} from '../services/achats/purchaseOrders';

export function usePurchaseOrders() {
  const [records, setRecords] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [suppliersLoading, setSuppliersLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const configured = isSupabaseConfigured();

  const loadSuppliers = useCallback(async () => {
    if (!configured) {
      setSuppliersLoading(false);
      return;
    }
    setSuppliersLoading(true);
    try {
      const all = await listSuppliers({ includeArchived: false });
      setSuppliers(all.filter((s) => s.statut === 'Actif' || s.status === 'active'));
    } catch (err) {
      console.error('[CITYMO] usePurchaseOrders suppliers', err);
    } finally {
      setSuppliersLoading(false);
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
      setRecords(await listPurchaseOrders());
    } catch (err) {
      console.error('[CITYMO] usePurchaseOrders', err);
      setError(formatSupabaseError(err, 'Erreur chargement bons de commande.'));
    } finally {
      setLoading(false);
    }
  }, [configured]);

  useEffect(() => {
    load();
    loadSuppliers();
  }, [load, loadSuppliers]);

  async function save(form, id) {
    setSaving(true);
    setError(null);
    try {
      if (id) await updatePurchaseOrder(id, form);
      else await createPurchaseOrder(form);
      await load();
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur enregistrement bon de commande.');
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
      await deletePurchaseOrder(id);
      await load();
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur suppression bon de commande.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }

  async function duplicate(source) {
    setSaving(true);
    setError(null);
    try {
      await duplicatePurchaseOrder(source);
      await load();
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur duplication bon de commande.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }

  function exportCsv(filtered) {
    exportPurchaseOrdersCsv(filtered || records);
  }

  return {
    records,
    suppliers,
    loading,
    suppliersLoading,
    saving,
    error,
    configured,
    reload: load,
    reloadSuppliers: loadSuppliers,
    save,
    remove,
    duplicate,
    exportCsv,
  };
}

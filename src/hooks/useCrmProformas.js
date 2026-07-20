/**
 * useCrmProformas.js — CRM Factures Proforma (list / CRUD)
 * Isolé des factures comptables (pas de sync caisse / CA).
 */
import { useState, useEffect, useCallback } from 'react';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';
import { formatSupabaseError } from '../services/supabase/formatError';
import {
  listCrmProformas,
  getCrmProformaById,
  createCrmProforma,
  updateCrmProforma,
  deleteCrmProforma,
  cancelCrmProforma,
  duplicateCrmProforma,
  createCrmProformaFromDevis,
  generateCrmProformaNumero,
  markCrmProformaConverted,
} from '../services/crm/crmProformas';

export function useCrmProformas() {
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
      const rows = await listCrmProformas();
      setRecords(rows);
    } catch (err) {
      console.error('[CITYMO] useCrmProformas load', err);
      // Table absente tant que la migration n'est pas appliquée
      const msg = formatSupabaseError(err, 'Erreur de chargement des proformas.');
      setError(msg);
      setRecords([]);
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

  const create = useCallback(async (form) => {
    setSaving(true);
    setError(null);
    try {
      const data = await createCrmProforma(form);
      await load();
      return { success: true, data };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur création proforma.');
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
      const data = await updateCrmProforma(id, form);
      await load();
      return { success: true, data };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur mise à jour proforma.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }, [load]);

  const remove = useCallback(async (id) => {
    setSaving(true);
    setError(null);
    try {
      await deleteCrmProforma(id);
      await load();
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur suppression proforma.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }, [load]);

  const cancel = useCallback(async (id) => {
    setSaving(true);
    setError(null);
    try {
      const data = await cancelCrmProforma(id);
      await load();
      return { success: true, data };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur annulation proforma.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }, [load]);

  const duplicate = useCallback(async (id) => {
    setSaving(true);
    setError(null);
    try {
      const data = await duplicateCrmProforma(id);
      await load();
      return { success: true, data };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur duplication proforma.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }, [load]);

  const createFromDevis = useCallback(async (devisId) => {
    setSaving(true);
    setError(null);
    try {
      const data = await createCrmProformaFromDevis(devisId);
      await load();
      return { success: true, data };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur création proforma depuis devis.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
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
    cancel,
    duplicate,
    createFromDevis,
    getById: getCrmProformaById,
    generateNumero: generateCrmProformaNumero,
    markConverted: markCrmProformaConverted,
  };
}

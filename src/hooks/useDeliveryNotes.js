/**
 * useDeliveryNotes.js — CRM Bons de livraison
 */
import { useState, useEffect, useCallback } from 'react';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';
import { formatSupabaseError } from '../services/supabase/formatError';
import {
  listDeliveryNotes,
  getDeliveryNoteById,
  createDeliveryNote,
  updateDeliveryNote,
  deleteDeliveryNote,
  duplicateDeliveryNote,
  filterDeliveryNotes,
  computeDeliveryNoteStats,
  generateDeliveryNoteNumero,
} from '../services/crm/deliveryNotes';

export function useDeliveryNotes() {
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
      const rows = await listDeliveryNotes();
      setRecords(rows);
    } catch (err) {
      console.error('[CITYMO] useDeliveryNotes load', err);
      setError(formatSupabaseError(err, 'Erreur de chargement des bons de livraison.'));
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
      const data = await createDeliveryNote(form);
      await load();
      return { success: true, data };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur création bon de livraison.');
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
      const data = await updateDeliveryNote(id, form);
      await load();
      return { success: true, data };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur modification bon de livraison.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }, [load]);

  const remove = useCallback(async (id) => {
    setError(null);
    try {
      await deleteDeliveryNote(id);
      await load();
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur suppression.');
      setError(msg);
      return { success: false, error: msg };
    }
  }, [load]);

  const duplicate = useCallback(async (id) => {
    setError(null);
    try {
      await duplicateDeliveryNote(id);
      await load();
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur duplication.');
      setError(msg);
      return { success: false, error: msg };
    }
  }, [load]);

  const fetchOne = useCallback(async (id) => {
    try {
      return await getDeliveryNoteById(id);
    } catch (err) {
      throw new Error(formatSupabaseError(err, 'Bon de livraison introuvable.'));
    }
  }, []);

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
    duplicate,
    fetchOne,
    filterDeliveryNotes,
    computeDeliveryNoteStats,
    generateDeliveryNoteNumero,
  };
}

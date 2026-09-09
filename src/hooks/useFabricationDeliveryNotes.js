import { useState, useEffect, useCallback } from 'react';
import { isSupabaseConfigured } from '../lib/supabase';
import { formatSupabaseError } from '../services/supabase/formatError';
import {
  listFabricationDeliveryNotes,
  createFabricationDeliveryNote,
  updateFabricationDeliveryNote,
  deleteFabricationDeliveryNote,
  generateFabricationDeliveryNoteNumero,
} from '../services/fabrication/fabricationDeliveryNotes';

export function useFabricationDeliveryNotes() {
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
      setRecords(await listFabricationDeliveryNotes());
    } catch (err) {
      console.error('[CITYMO] useFabricationDeliveryNotes', err);
      setError(formatSupabaseError(err, 'Erreur chargement bons de livraison Fabrication.'));
    } finally {
      setLoading(false);
    }
  }, [configured]);

  useEffect(() => {
    load();
  }, [load]);

  async function save(form, id) {
    setSaving(true);
    setError(null);
    try {
      const row = id
        ? await updateFabricationDeliveryNote(id, form)
        : await createFabricationDeliveryNote(form);
      await load();
      return { success: true, record: row };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur enregistrement bon de livraison.');
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
      await deleteFabricationDeliveryNote(id);
      await load();
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur suppression bon de livraison.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }

  async function nextNumero() {
    try {
      return await generateFabricationDeliveryNoteNumero();
    } catch (err) {
      console.warn('[CITYMO] generate BL numero', err);
      const y = new Date().getFullYear();
      return `BL-${y}-0001`;
    }
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
    nextNumero,
  };
}

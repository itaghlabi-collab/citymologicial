/**
 * useVehicles.js — Hook flotte véhicules (Supabase).
 */
import { useState, useEffect, useCallback } from 'react';
import { isSupabaseConfigured } from '../lib/supabase';
import { formatSupabaseError } from '../services/supabase/formatError';
import {
  listVehicles,
  createVehicle,
  updateVehicle,
  deleteVehicle,
} from '../services/logistique/vehicles';
import { importVehiclesFromSeed } from '../services/logistique/importVehicles';

export function useVehicles({ enabled = true } = {}) {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const configured = isSupabaseConfigured();

  const load = useCallback(async () => {
    if (!enabled || !configured) {
      setLoading(false);
      if (!configured) setError('Supabase non configuré (.env)');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await listVehicles();
      setVehicles(data);
    } catch (err) {
      setError(formatSupabaseError(err, 'Erreur chargement véhicules.'));
    } finally {
      setLoading(false);
    }
  }, [enabled, configured]);

  useEffect(() => {
    load();
  }, [load]);

  const create = useCallback(async (form) => {
    setSaving(true);
    setError(null);
    try {
      await createVehicle(form);
      await load();
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur enregistrement véhicule.');
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
      const data = await updateVehicle(id, form);
      await load();
      return { success: true, data };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur enregistrement véhicule.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }, [load]);

  const remove = useCallback(async (id) => {
    setError(null);
    try {
      await deleteVehicle(id);
      await load();
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur suppression véhicule.');
      setError(msg);
      return { success: false, error: msg };
    }
  }, [load]);

  const importSeed = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await importVehiclesFromSeed();
      await load();
      return { success: true, ...result };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur import véhicules.');
      setError(msg);
      return { success: false, error: msg, imported: 0, updated: 0, skipped: 0, errors: [msg] };
    } finally {
      setSaving(false);
    }
  }, [load]);

  return {
    vehicles,
    loading,
    saving,
    error,
    configured,
    load,
    create,
    update,
    remove,
    importSeed,
  };
}

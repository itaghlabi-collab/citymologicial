/**
 * usePickupRequests.js — Demandes logistiques (hors stock / hors bons).
 */
import { useCallback, useEffect, useState } from 'react';
import {
  listPickupRequests,
  savePickupRequest,
  deletePickupRequest,
  buildPickupRequest,
  applyTripReturn,
} from '../services/logistique/pickupRequests';
import { formatSupabaseError } from '../services/supabase/formatError';

export function usePickupRequests({ enabled = true, user } = {}) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError('');
    try {
      const rows = await listPickupRequests();
      setRecords(rows);
    } catch (err) {
      setError(formatSupabaseError(err, 'Erreur chargement des demandes logistiques.'));
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(async (form, extras = {}) => {
    setSaving(true);
    setError('');
    try {
      const current = await listPickupRequests();
      const previous = extras.previous || (form.id ? current.find((r) => r.id === form.id) : null);
      const built = buildPickupRequest(form, {
        existing: current,
        user,
        employees: extras.employees || [],
        previous,
      });
      const saved = await savePickupRequest(built);
      setRecords((prev) => {
        const idx = prev.findIndex((r) => r.id === saved.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = saved;
          return next;
        }
        return [saved, ...prev];
      });
      return { success: true, data: saved };
    } catch (err) {
      const msg = err?.details?.join(' ') || formatSupabaseError(err, err.message || 'Erreur enregistrement.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }, [user]);

  const recordReturn = useCallback(async (id, heureRetour) => {
    setSaving(true);
    setError('');
    try {
      const current = await listPickupRequests();
      const previous = current.find((r) => String(r.id) === String(id));
      if (!previous) throw new Error('Déplacement introuvable.');
      const built = applyTripReturn(previous, heureRetour);
      const saved = await savePickupRequest(built);
      setRecords((prev) => prev.map((r) => (r.id === saved.id ? saved : r)));
      return { success: true, data: saved };
    } catch (err) {
      const msg = formatSupabaseError(err, err.message || 'Erreur enregistrement du retour.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }, []);

  const remove = useCallback(async (id) => {
    setSaving(true);
    setError('');
    try {
      await deletePickupRequest(id);
      setRecords((prev) => prev.filter((r) => r.id !== id));
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, err.message || 'Erreur suppression.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }, []);

  return {
    records,
    loading,
    saving,
    error,
    reload: load,
    save,
    recordReturn,
    remove,
  };
}

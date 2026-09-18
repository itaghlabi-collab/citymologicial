/**
 * usePickupRequests.js — Demandes de récupération logistique (persistées hors stock).
 */
import { useCallback, useEffect, useState } from 'react';
import {
  listPickupRequests,
  savePickupRequest,
  buildPickupRequest,
  assignPickup,
  confirmPickupRecovery,
  cancelPickup,
  startPickup,
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

  const create = useCallback(async (form, extras = {}) => {
    setSaving(true);
    setError('');
    try {
      const current = await listPickupRequests();
      const built = buildPickupRequest(form, { existing: current, user, employees: extras.employees || [] });
      const saved = await savePickupRequest(built);
      setRecords((prev) => [saved, ...prev.filter((r) => r.id !== saved.id)]);
      return { success: true, data: saved };
    } catch (err) {
      const msg = err?.details?.join(' ') || formatSupabaseError(err, err.message || 'Erreur création.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }, [user]);

  const mutate = useCallback(async (id, fn) => {
    setSaving(true);
    setError('');
    try {
      const current = records.find((r) => r.id === id) || (await listPickupRequests()).find((r) => r.id === id);
      if (!current) throw new Error('Demande introuvable.');
      const next = fn(current);
      const saved = await savePickupRequest(next);
      setRecords((prev) => prev.map((r) => (r.id === saved.id ? saved : r)));
      return { success: true, data: saved };
    } catch (err) {
      const msg = formatSupabaseError(err, err.message || 'Erreur enregistrement.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }, [records]);

  return {
    records,
    loading,
    saving,
    error,
    reload: load,
    create,
    assign: (id, patch, extras = {}) => mutate(id, (r) => assignPickup(r, patch, extras)),
    confirm: (id, payload) => mutate(id, (r) => confirmPickupRecovery(r, payload)),
    cancel: (id, reason) => mutate(id, (r) => cancelPickup(r, { reason })),
    start: (id) => mutate(id, (r) => startPickup(r)),
  };
}

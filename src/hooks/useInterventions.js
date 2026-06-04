/**
 * useInterventions.js — Demandes + historique interventions véhicules.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { isSupabaseConfigured } from '../lib/supabase';
import { formatSupabaseError } from '../services/supabase/formatError';
import {
  listInterventionRequests,
  createInterventionRequest,
  updateInterventionRequest,
  deleteInterventionRequest,
  CLOSED_STATUTS,
  normalizeInterventionStatut,
  filterInterventionRequests,
} from '../services/logistique/interventionRequests';
import {
  listInterventionHistory,
  filterInterventionHistory,
} from '../services/logistique/interventionHistory';

export function useInterventions({ enabled = true } = {}) {
  const [requests, setRequests] = useState([]);
  const [history, setHistory] = useState([]);
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
      const [reqs, hist] = await Promise.all([
        listInterventionRequests(),
        listInterventionHistory(),
      ]);
      setRequests(reqs);
      setHistory(hist);
    } catch (err) {
      setError(formatSupabaseError(err, 'Erreur chargement interventions.'));
    } finally {
      setLoading(false);
    }
  }, [enabled, configured]);

  useEffect(() => {
    load();
  }, [load]);

  const openRequests = useMemo(
    () => requests.filter((r) => !CLOSED_STATUTS.includes(normalizeInterventionStatut(r.statut))),
    [requests],
  );

  const allForVehicleDetail = useMemo(() => [...requests, ...history], [requests, history]);

  const create = useCallback(async (form, vehicules) => {
    setSaving(true);
    setError(null);
    try {
      await createInterventionRequest(form, vehicules);
      await load();
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur enregistrement demande.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }, [load]);

  const update = useCallback(async (id, form, vehicules) => {
    setSaving(true);
    setError(null);
    try {
      const data = await updateInterventionRequest(id, form, vehicules);
      await load();
      return { success: true, data };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur enregistrement demande.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }, [load]);

  const remove = useCallback(async (id) => {
    setError(null);
    try {
      await deleteInterventionRequest(id);
      await load();
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur suppression demande.');
      setError(msg);
      return { success: false, error: msg };
    }
  }, [load]);

  return {
    requests,
    openRequests,
    history,
    allForVehicleDetail,
    loading,
    saving,
    error,
    configured,
    load,
    create,
    update,
    remove,
    filterInterventionRequests,
    filterInterventionHistory,
  };
}

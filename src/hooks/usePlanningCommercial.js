/**
 * usePlanningCommercial.js — Planning commercial (list / CRUD / filtres)
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';
import { formatSupabaseError } from '../services/supabase/formatError';
import { listProspects, prospectDisplayName } from '../services/commercial/prospects';
import {
  listPlanningCommercial,
  createPlanningCommercial,
  updatePlanningCommercial,
  deletePlanningCommercial,
  filterPlanningRecords,
  computePlanningStats,
  isPlanningStale,
  collectPlanningCommercials,
  PLANNING_STATUTS,
  PLANNING_STATUT_LABEL,
  PLANNING_STATUT_BADGE,
} from '../services/commercial/planningCommercial';

export function usePlanningCommercial() {
  const [records, setRecords] = useState([]);
  const [prospects, setProspects] = useState([]);
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
      const [rows, prospectRows] = await Promise.all([
        listPlanningCommercial(),
        listProspects(),
      ]);
      setRecords(rows);
      setProspects(prospectRows);
    } catch (err) {
      console.error('[CITYMO] usePlanningCommercial load', err);
      setError(formatSupabaseError(err, 'Erreur de chargement du planning.'));
    } finally {
      setLoading(false);
    }
  }, [configured]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!configured) return undefined;
    const { data: { subscription } } = getSupabase().auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'SIGNED_OUT') {
        load();
      }
    });
    return () => subscription.unsubscribe();
  }, [configured, load]);

  const prospectOptions = useMemo(
    () => prospects.map((p) => ({
      id: p.id,
      label: prospectDisplayName(p),
      type: p.type,
    })).filter((o) => o.label),
    [prospects],
  );

  const commercials = useMemo(
    () => collectPlanningCommercials(records),
    [records],
  );

  const create = useCallback(async (form) => {
    setSaving(true);
    setError(null);
    try {
      const created = await createPlanningCommercial(form);
      await load();
      return { success: true, data: created };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur enregistrement RDV.');
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
      const updated = await updatePlanningCommercial(id, form);
      await load();
      return { success: true, data: updated };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur modification RDV.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }, [load]);

  const remove = useCallback(async (id) => {
    setError(null);
    try {
      await deletePlanningCommercial(id);
      await load();
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur suppression.');
      setError(msg);
      return { success: false, error: msg };
    }
  }, [load]);

  return {
    records,
    prospects,
    prospectOptions,
    commercials,
    loading,
    saving,
    error,
    configured,
    load,
    create,
    update,
    remove,
    filterPlanningRecords,
    computePlanningStats,
    isPlanningStale,
    PLANNING_STATUTS,
    PLANNING_STATUT_LABEL,
    PLANNING_STATUT_BADGE,
  };
}

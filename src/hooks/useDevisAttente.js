/**
 * useDevisAttente.js — Devis en attente (list / CRUD / filtres)
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';
import { formatSupabaseError } from '../services/supabase/formatError';
import { listProspects, prospectDisplayName } from '../services/commercial/prospects';
import {
  listDevis,
  createDevis,
  updateDevis,
  deleteDevis,
  filterDevisRecords,
  computeDevisStats,
  isDevisStale,
  DEVIS_STATUTS,
  DEVIS_STATUT_LABEL,
  DEVIS_STATUT_BADGE,
} from '../services/commercial/devis';

export function useDevisAttente() {
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
      const [devisRows, prospectRows] = await Promise.all([
        listDevis(),
        listProspects(),
      ]);
      setRecords(devisRows);
      setProspects(prospectRows);
    } catch (err) {
      console.error('[CITYMO] useDevisAttente load', err);
      setError(formatSupabaseError(err, 'Erreur de chargement des devis.'));
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
    })).filter((o) => o.label),
    [prospects],
  );

  const create = useCallback(async (form) => {
    setSaving(true);
    setError(null);
    try {
      await createDevis(form);
      await load();
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur enregistrement devis.');
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
      await updateDevis(id, form);
      await load();
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur modification devis.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }, [load]);

  const remove = useCallback(async (id) => {
    setError(null);
    try {
      await deleteDevis(id);
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
    loading,
    saving,
    error,
    configured,
    load,
    create,
    update,
    remove,
    filterDevisRecords,
    computeDevisStats,
    isDevisStale,
    DEVIS_STATUTS,
    DEVIS_STATUT_LABEL,
    DEVIS_STATUT_BADGE,
  };
}

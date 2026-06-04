/**
 * usePropositionsMarketing.js — Propositions (list / CRUD / filtres)
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';
import { formatSupabaseError } from '../services/supabase/formatError';
import {
  listPropositions,
  createProposition,
  updateProposition,
  deleteProposition,
  filterPropositions,
  computePropositionsStats,
  collectPropositionsResponsables,
  PROPOSITION_STATUT_NEXT,
  TYPE_PROPOSITION_VALUES,
  TYPE_PROPOSITION_LABEL,
  typePropositionLabel,
} from '../services/commercial/propositionsMarketing';

export function usePropositionsMarketing() {
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
      const rows = await listPropositions();
      setRecords(rows);
    } catch (err) {
      console.error('[CITYMO] usePropositionsMarketing load', err);
      setError(formatSupabaseError(err, 'Erreur de chargement des propositions.'));
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

  const responsables = useMemo(
    () => collectPropositionsResponsables(records),
    [records],
  );

  const create = useCallback(async (form) => {
    setSaving(true);
    setError(null);
    try {
      await createProposition(form);
      await load();
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur enregistrement proposition.');
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
      await updateProposition(id, form);
      await load();
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur modification proposition.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }, [load]);

  const remove = useCallback(async (id) => {
    setError(null);
    try {
      await deleteProposition(id);
      await load();
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur suppression.');
      setError(msg);
      return { success: false, error: msg };
    }
  }, [load]);

  const advanceStatut = useCallback(async (prop) => {
    const next = PROPOSITION_STATUT_NEXT[prop.statut];
    if (!next) return { success: false, error: 'Transition impossible.' };
    return update(prop.id, { ...prop, statut: next });
  }, [update]);

  return {
    records,
    responsables,
    loading,
    saving,
    error,
    configured,
    load,
    create,
    update,
    remove,
    advanceStatut,
    filterPropositions,
    computePropositionsStats,
    PROPOSITION_STATUT_NEXT,
    TYPE_PROPOSITION_VALUES,
    TYPE_PROPOSITION_LABEL,
    typePropositionLabel,
  };
}

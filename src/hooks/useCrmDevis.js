/**
 * useCrmDevis.js — CRM Devis (list / CRUD / PDF)
 */
import { useState, useEffect, useCallback } from 'react';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';
import { formatSupabaseError } from '../services/supabase/formatError';
import {
  listCrmDevis,
  getCrmDevisById,
  createCrmDevis,
  updateCrmDevis,
  deleteCrmDevis,
  duplicateCrmDevis,
  filterCrmDevis,
  computeCrmDevisStats,
  generateCrmDevisReference,
  updateCrmDevisStatut,
  convertCrmDevisToProject,
  listDevisIdsWithProjects,
} from '../services/crm/crmDevis';

export function useCrmDevis() {
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
      const rows = await listCrmDevis();
      setRecords(rows);
    } catch (err) {
      console.error('[CITYMO] useCrmDevis load', err);
      setError(formatSupabaseError(err, 'Erreur de chargement des devis.'));
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
      const data = await createCrmDevis(form);
      await load();
      return { success: true, data };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur création devis.');
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
      const data = await updateCrmDevis(id, form);
      await load();
      return { success: true, data };
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
      await deleteCrmDevis(id);
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
      await duplicateCrmDevis(id);
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
      return await getCrmDevisById(id);
    } catch (err) {
      throw new Error(formatSupabaseError(err, 'Devis introuvable.'));
    }
  }, []);

  const updateStatut = useCallback(async (id, statut, patch = {}) => {
    setSaving(true);
    setError(null);
    try {
      const data = await updateCrmDevisStatut(id, statut, patch);
      await load();
      return { success: true, data };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur mise à jour statut.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }, [load]);

  const convertToProject = useCallback(async (id) => {
    setSaving(true);
    setError(null);
    try {
      const data = await convertCrmDevisToProject(id);
      await load();
      return { success: true, data };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur conversion en projet.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }, [load]);

  const fetchConvertedIds = useCallback(async () => {
    try {
      return await listDevisIdsWithProjects();
    } catch {
      return new Set();
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
    updateStatut,
    convertToProject,
    fetchConvertedIds,
    filterCrmDevis,
    computeCrmDevisStats,
    generateCrmDevisReference,
  };
}

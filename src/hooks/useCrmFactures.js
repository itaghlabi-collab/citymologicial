/**
 * useCrmFactures.js — CRM Factures (list / CRUD / PDF)
 */
import { useState, useEffect, useCallback } from 'react';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';
import { formatSupabaseError } from '../services/supabase/formatError';
import {
  listCrmFactures,
  getCrmFactureById,
  createCrmFacture,
  updateCrmFacture,
  deleteCrmFacture,
  duplicateCrmFacture,
  createCrmFactureAcompte,
  getDevisAcompteSummary,
  filterCrmFactures,
  computeCrmFactureStats,
  generateCrmFactureNumero,
  generateCrmAcompteNumero,
} from '../services/crm/crmFactures';

export function useCrmFactures() {
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
      const rows = await listCrmFactures();
      setRecords(rows);
    } catch (err) {
      console.error('[CITYMO] useCrmFactures load', err);
      setError(formatSupabaseError(err, 'Erreur de chargement des factures.'));
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
      const data = await createCrmFacture(form);
      await load();
      return { success: true, data };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur création facture.');
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
      const data = await updateCrmFacture(id, form);
      await load();
      return { success: true, data };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur modification facture.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }, [load]);

  const remove = useCallback(async (id) => {
    setError(null);
    try {
      await deleteCrmFacture(id);
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
      await duplicateCrmFacture(id);
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
      return await getCrmFactureById(id);
    } catch (err) {
      throw new Error(formatSupabaseError(err, 'Facture introuvable.'));
    }
  }, []);

  const createAcompte = useCallback(async (form) => {
    setSaving(true);
    setError(null);
    try {
      const data = await createCrmFactureAcompte(form);
      await load();
      return { success: true, data };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur création facture acompte.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }, [load]);

  const fetchDevisAcompteSummary = useCallback(async (devisId) => {
    try {
      return await getDevisAcompteSummary(devisId);
    } catch (err) {
      throw new Error(formatSupabaseError(err, 'Impossible de charger le devis.'));
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
    createAcompte,
    update,
    remove,
    duplicate,
    fetchOne,
    fetchDevisAcompteSummary,
    filterCrmFactures,
    computeCrmFactureStats,
    generateCrmFactureNumero,
    generateCrmAcompteNumero,
  };
}

/**
 * useComptesRendus.js — Comptes rendus commerciaux (list / CRUD / filtres)
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';
import { formatSupabaseError } from '../services/supabase/formatError';
import { listProspects, prospectDisplayName } from '../services/commercial/prospects';
import { listPlanningCommercial } from '../services/commercial/planningCommercial';
import {
  listComptesRendus,
  createCompteRendu,
  updateCompteRendu,
  deleteCompteRendu,
  filterComptesRendus,
  computeComptesRendusStats,
  collectComptesResponsables,
} from '../services/commercial/comptesRendus';

export function useComptesRendus() {
  const [records, setRecords] = useState([]);
  const [prospects, setProspects] = useState([]);
  const [rdvs, setRdvs] = useState([]);
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
      const [rows, prospectRows, rdvRows] = await Promise.all([
        listComptesRendus(),
        listProspects(),
        listPlanningCommercial(),
      ]);
      setRecords(rows);
      setProspects(prospectRows);
      setRdvs(rdvRows);
    } catch (err) {
      console.error('[CITYMO] useComptesRendus load', err);
      setError(formatSupabaseError(err, 'Erreur de chargement des comptes rendus.'));
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
      nom: p.nom,
      prenom: p.prenom,
    })).filter((o) => o.label),
    [prospects],
  );

  const rdvOptions = useMemo(
    () => rdvs.map((r) => ({
      id: r.id,
      titre: r.rdv_type === 'rapide'
        ? (r.societe ? `${r.societe}${r.secteur ? ` - ${r.secteur}` : ''}` : (r.titre || 'RDV terrain'))
        : (r.titre || 'RDV'),
      date: r.date,
    })),
    [rdvs],
  );

  const responsables = useMemo(
    () => collectComptesResponsables(records),
    [records],
  );

  const create = useCallback(async (form) => {
    setSaving(true);
    setError(null);
    try {
      const created = await createCompteRendu(form);
      await load();
      return { success: true, data: created };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur enregistrement compte rendu.');
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
      const updated = await updateCompteRendu(id, form);
      await load();
      return { success: true, data: updated };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur modification compte rendu.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }, [load]);

  const remove = useCallback(async (id) => {
    setError(null);
    try {
      await deleteCompteRendu(id);
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
    prospects: prospectOptions,
    rdvs: rdvOptions,
    responsables,
    loading,
    saving,
    error,
    configured,
    load,
    create,
    update,
    remove,
    filterComptesRendus,
    computeComptesRendusStats,
  };
}

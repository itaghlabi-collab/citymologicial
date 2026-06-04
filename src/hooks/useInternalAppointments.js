/**
 * useInternalAppointments.js — Rendez-vous organisation interne
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';
import { formatSupabaseError } from '../services/supabase/formatError';
import {
  listInternalAppointments,
  createInternalAppointment,
  updateInternalAppointment,
  deleteInternalAppointment,
  setInternalAppointmentStatut,
  filterInternalAppointments,
  collectAppointmentResponsables,
} from '../services/internal/internalAppointments';

export function useInternalAppointments() {
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
      const rows = await listInternalAppointments();
      setRecords(rows);
    } catch (err) {
      console.error('[CITYMO] useInternalAppointments load', err);
      setError(formatSupabaseError(err, 'Erreur de chargement des rendez-vous.'));
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

  const responsables = useMemo(() => collectAppointmentResponsables(records), [records]);

  const create = useCallback(async (form) => {
    setSaving(true);
    setError(null);
    try {
      await createInternalAppointment(form);
      await load();
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur creation rendez-vous.');
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
      await updateInternalAppointment(id, form);
      await load();
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur modification rendez-vous.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }, [load]);

  const remove = useCallback(async (id) => {
    setError(null);
    try {
      await deleteInternalAppointment(id);
      await load();
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur suppression.');
      setError(msg);
      return { success: false, error: msg };
    }
  }, [load]);

  const setStatut = useCallback(async (id, statut) => {
    setError(null);
    try {
      await setInternalAppointmentStatut(id, statut);
      await load();
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur mise a jour statut.');
      setError(msg);
      return { success: false, error: msg };
    }
  }, [load]);

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
    setStatut,
    responsables,
    filterInternalAppointments,
  };
}

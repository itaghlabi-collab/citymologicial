/**
 * useSubcontractorPayroll.js — Suivi paiements sous-traitants (par projet)
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { isSupabaseConfigured } from '../lib/supabase';
import { formatSupabaseError } from '../services/supabase/formatError';
import {
  listSubcontractors,
  listProjectBalances,
  listAllSubcontractorPayments,
  listAssignments,
  createPayment,
  computeGlobalSummary,
} from '../services/rh/subcontractors';

export function useSubcontractorPayroll() {
  const [subcontractors, setSubcontractors] = useState([]);
  const [balances, setBalances] = useState([]);
  const [payments, setPayments] = useState([]);
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
      const [subs, balanceRows, paymentRows] = await Promise.all([
        listSubcontractors(),
        listProjectBalances(),
        listAllSubcontractorPayments(100),
      ]);
      setSubcontractors(subs);
      setBalances(balanceRows);
      setPayments(paymentRows);
    } catch (err) {
      console.error('[CITYMO] useSubcontractorPayroll load', err);
      setError(formatSupabaseError(err, 'Erreur chargement paiements sous-traitants.'));
    } finally {
      setLoading(false);
    }
  }, [configured]);

  useEffect(() => {
    load();
  }, [load]);

  const summary = useMemo(() => computeGlobalSummary(balances), [balances]);

  const loadAssignments = useCallback(async (subcontractorId) => {
    if (!subcontractorId) return [];
    return listAssignments(subcontractorId);
  }, []);

  const addPayment = useCallback(async (subcontractorId, form) => {
    setSaving(true);
    setError(null);
    try {
      await createPayment(subcontractorId, form);
      await load();
      return { success: true };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur enregistrement paiement.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }, [load]);

  return {
    subcontractors,
    balances,
    payments,
    summary,
    loading,
    saving,
    error,
    configured,
    load,
    loadAssignments,
    addPayment,
  };
}

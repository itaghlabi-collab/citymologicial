/**
 * useSubcontractors.js
 */
import { useState, useEffect, useCallback } from 'react';
import { isSupabaseConfigured } from '../lib/supabase';
import { formatSupabaseError } from '../services/supabase/formatError';
import { listProjects } from '../services/projects/projects';
import {
  listSubcontractors,
  getSubcontractor,
  createSubcontractor,
  updateSubcontractor,
  deleteSubcontractor,
  listAssignments,
  createAssignment,
  listServices,
  createService,
  updateService,
  listPayments,
  createPayment,
  listProjectBalances,
  listDocuments,
  computeGlobalSummary,
} from '../services/rh/subcontractors';

export function useSubcontractors() {
  const [items, setItems] = useState([]);
  const [projects, setProjects] = useState([]);
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
      const [rows, projectRows] = await Promise.all([
        listSubcontractors(),
        listProjects(),
      ]);
      setItems(rows);
      setProjects(projectRows);
    } catch (err) {
      console.error('[CITYMO] useSubcontractors load', err);
      setError(formatSupabaseError(err, 'Erreur chargement sous-traitants.'));
    } finally {
      setLoading(false);
    }
  }, [configured]);

  useEffect(() => { load(); }, [load]);

  const loadDetail = useCallback(async (id) => {
    const [sub, assignments, services, payments, balances, documents] = await Promise.all([
      getSubcontractor(id),
      listAssignments(id),
      listServices(id),
      listPayments(id),
      listProjectBalances(id),
      listDocuments(id),
    ]);
    return {
      sub,
      assignments,
      services,
      payments,
      balances,
      documents,
      summary: computeGlobalSummary(balances),
    };
  }, []);

  async function wrapSave(fn) {
    setSaving(true);
    setError(null);
    try {
      const result = await fn();
      await load();
      return { success: true, data: result };
    } catch (err) {
      const msg = formatSupabaseError(err, 'Erreur enregistrement.');
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setSaving(false);
    }
  }

  return {
    items,
    projects,
    loading,
    saving,
    error,
    configured,
    load,
    loadDetail,
    create: (form) => wrapSave(() => createSubcontractor(form)),
    update: (id, form) => wrapSave(() => updateSubcontractor(id, form)),
    remove: (id) => wrapSave(() => deleteSubcontractor(id)),
    createAssignment: (subId, form) => wrapSave(() => createAssignment(subId, form)),
    createService: (subId, form) => wrapSave(() => createService(subId, form)),
    updateService: (subId, id, form) => wrapSave(() => updateService(id, subId, form)),
    createPayment: (subId, form) => wrapSave(() => createPayment(subId, form)),
  };
}

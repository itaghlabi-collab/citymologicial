/**
 * useProjectExpenses.js — Hook module Dépenses par projet
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { listProjects } from '../services/projects/projects';
import {
  listProjectExpenses,
  createProjectExpense,
  updateProjectExpense,
  deleteProjectExpense,
  purgeImportedTotalSummaryRows,
} from '../services/finance/projectExpenses';
import { syncProjectExpensesFromErp } from '../services/finance/projectExpenseSync';
import {
  buildProjectExpenseDashboard,
  buildProjectSummaries,
  fetchErpContextForProjects,
} from '../services/finance/projectExpenseData';
import { isSupabaseConfigured } from '../lib/supabase';

const SYNC_COOLDOWN_MS = 5 * 60 * 1000; // sync auto max 1× / 5 min
let lastAutoSyncAt = 0;

function enrichExpensesWithProjects(expenses, projects) {
  const byId = Object.fromEntries((projects || []).map((p) => [p.id, p]));
  return (expenses || []).map((e) => {
    const p = e.project_id ? byId[e.project_id] : null;
    if (!p) return e;
    return { ...e, project_nom: p.nom || e.project_nom || e.project_name_raw || '' };
  });
}

export function useProjectExpenses() {
  const [projects, setProjects] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [erpContext, setErpContext] = useState({ orders: [], acquisitionOrders: [] });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const configured = isSupabaseConfigured();

  const reload = useCallback(async (opts = {}) => {
    const withSync = opts.withSync === true;
    if (!configured) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [projs, exps, ctx] = await Promise.all([
        listProjects({ light: true }),
        listProjectExpenses(),
        fetchErpContextForProjects(),
      ]);
      setProjects(projs);
      setExpenses(enrichExpensesWithProjects(exps, projs));
      setErpContext(ctx);
    } catch (err) {
      setError(err.message || 'Erreur chargement');
    } finally {
      setLoading(false);
    }

    // Sync ERP uniquement sur demande explicite (bouton), ou 1× toutes les 5 min max
    const now = Date.now();
    const canAuto = withSync && now - lastAutoSyncAt > SYNC_COOLDOWN_MS;
    if (!canAuto && !opts.forceSync) return;

    setSyncing(true);
    try {
      lastAutoSyncAt = Date.now();
      await syncProjectExpensesFromErp().catch(() => {});
      await purgeImportedTotalSummaryRows().catch(() => {});
      const [projs2, exps2, ctx2] = await Promise.all([
        listProjects({ light: true }),
        listProjectExpenses(),
        fetchErpContextForProjects(),
      ]);
      setProjects(projs2);
      setExpenses(enrichExpensesWithProjects(exps2, projs2));
      setErpContext(ctx2);
    } finally {
      setSyncing(false);
    }
  }, [configured]);

  useEffect(() => {
    // Premier affichage : lecture seule (rapide) — pas de sync ERP
    reload({ withSync: false });
  }, [reload]);

  const dashboard = useMemo(
    () => buildProjectExpenseDashboard(
      expenses,
      projects,
      erpContext.orders,
      erpContext.acquisitionOrders,
    ),
    [expenses, projects, erpContext.orders, erpContext.acquisitionOrders],
  );

  const summaries = useMemo(
    () => buildProjectSummaries(
      projects,
      expenses,
      erpContext.orders,
      erpContext.acquisitionOrders,
    ),
    [projects, expenses, erpContext.orders, erpContext.acquisitionOrders],
  );

  const unmatched = useMemo(
    () => expenses.filter((e) => e.project_match_status === 'needs_manual'),
    [expenses],
  );

  return {
    configured,
    loading,
    syncing,
    error,
    projects,
    expenses,
    erpContext,
    dashboard,
    summaries,
    unmatched,
    reload: () => reload({ withSync: false }),
    create: createProjectExpense,
    update: updateProjectExpense,
    remove: deleteProjectExpense,
    syncNow: async () => {
      setSyncing(true);
      try {
        lastAutoSyncAt = Date.now();
        await syncProjectExpensesFromErp();
        await purgeImportedTotalSummaryRows().catch(() => {});
        await reload({ withSync: false });
      } finally {
        setSyncing(false);
      }
    },
  };
}

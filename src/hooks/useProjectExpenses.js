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
import {
  fetchLinkedChargesForProjects,
  mergeChargesIntoProjectExpenses,
  syncChargesToProjectsViaApi,
} from '../services/finance/projectExpenseMerge';
import { isSupabaseConfigured } from '../lib/supabase';

const SYNC_COOLDOWN_MS = 5 * 60 * 1000;
let lastAutoSyncAt = 0;
let hasMountedOnce = false;

function enrichExpensesWithProjects(expenses, projects) {
  const byId = Object.fromEntries((projects || []).map((p) => [String(p.id), p]));
  return (expenses || []).map((e) => {
    const p = e.project_id ? byId[String(e.project_id)] : null;
    if (!p) return e;
    return { ...e, project_nom: p.nom || e.project_nom || e.project_name_raw || '' };
  });
}

async function loadExpenseBundle() {
  const [projs, exps, ctx, charges] = await Promise.all([
    listProjects({ light: true }),
    listProjectExpenses(),
    fetchErpContextForProjects(),
    fetchLinkedChargesForProjects(),
  ]);
  const merged = mergeChargesIntoProjectExpenses(exps, charges, projs);
  return { projs, expenses: enrichExpensesWithProjects(merged, projs), ctx };
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
      const { projs, expenses: merged, ctx } = await loadExpenseBundle();
      setProjects(projs);
      setExpenses(merged);
      setErpContext(ctx);
    } catch (err) {
      setError(err.message || 'Erreur chargement');
    } finally {
      setLoading(false);
    }

    const now = Date.now();
    const firstMount = !hasMountedOnce;
    hasMountedOnce = true;
    const canAuto = withSync && (firstMount || now - lastAutoSyncAt > SYNC_COOLDOWN_MS);
    if (!canAuto && !opts.forceSync) return;

    setSyncing(true);
    try {
      await syncChargesToProjectsViaApi();
      await syncProjectExpensesFromErp().catch(() => {});
      await purgeImportedTotalSummaryRows().catch(() => {});
      const { projs: projs2, expenses: merged2, ctx: ctx2 } = await loadExpenseBundle();
      setProjects(projs2);
      setExpenses(merged2);
      setErpContext(ctx2);
      lastAutoSyncAt = Date.now();
    } finally {
      setSyncing(false);
    }
  }, [configured]);

  useEffect(() => {
    // Premier affichage : sync ERP (rattrape les dépenses générales non encore liées)
    reload({ withSync: true });
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
        await syncChargesToProjectsViaApi();
        await syncProjectExpensesFromErp();
        await purgeImportedTotalSummaryRows().catch(() => {});
        const { projs, expenses: merged, ctx } = await loadExpenseBundle();
        setProjects(projs);
        setExpenses(merged);
        setErpContext(ctx);
        lastAutoSyncAt = Date.now();
      } finally {
        setSyncing(false);
      }
    },
  };
}

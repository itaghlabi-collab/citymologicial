/**
 * useProjectExpenses.js — Hook module Dépenses par projet
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { listProjects } from '../services/projects/projects';
import {
  listProjectExpenses,
  createProjectExpense,
  updateProjectExpense,
  deleteProjectExpense,
} from '../services/finance/projectExpenses';
import {
  buildProjectExpenseDashboard,
  buildProjectSummaries,
  fetchErpContextForProjects,
} from '../services/finance/projectExpenseData';
import {
  fetchLinkedChargesForProjects,
  mergeChargesIntoProjectExpenses,
} from '../services/finance/projectExpenseMerge';
import { backfillProjectExpensesViaApi } from '../services/finance/projectExpenseBackfill';
import { isSupabaseConfigured } from '../lib/supabase';

const BACKFILL_SESSION_KEY = 'citymo_dpp_backfill_at';
const BACKFILL_MIN_INTERVAL_MS = 5 * 60 * 1000;

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

function shouldRunBackfill() {
  try {
    const last = Number(sessionStorage.getItem(BACKFILL_SESSION_KEY) || 0);
    return !last || Date.now() - last > BACKFILL_MIN_INTERVAL_MS;
  } catch {
    return true;
  }
}

function markBackfillRan() {
  try {
    sessionStorage.setItem(BACKFILL_SESSION_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function useProjectExpenses() {
  const [projects, setProjects] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [erpContext, setErpContext] = useState({ orders: [], acquisitionOrders: [] });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const configured = isSupabaseConfigured();
  const backfillRunning = useRef(false);

  const applyBundle = useCallback((bundle) => {
    setProjects(bundle.projs);
    setExpenses(bundle.expenses);
    setErpContext(bundle.ctx);
  }, []);

  const runBackgroundBackfill = useCallback(async () => {
    if (backfillRunning.current || !shouldRunBackfill()) return;
    backfillRunning.current = true;
    setSyncing(true);
    try {
      const result = await backfillProjectExpensesViaApi();
      markBackfillRan();
      const changed = (result?.stats?.created || 0) + (result?.stats?.updated || 0) > 0;
      if (changed) {
        const bundle = await loadExpenseBundle();
        applyBundle(bundle);
      }
    } catch (err) {
      console.warn('[CITYMO] backfill dépenses projet (arrière-plan)', err);
    } finally {
      backfillRunning.current = false;
      setSyncing(false);
    }
  }, [applyBundle]);

  const reload = useCallback(async ({ forceBackfill = false } = {}) => {
    if (!configured) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const bundle = await loadExpenseBundle();
      applyBundle(bundle);
    } catch (err) {
      setError(err.message || 'Erreur chargement');
    } finally {
      setLoading(false);
    }

    if (forceBackfill || shouldRunBackfill()) {
      runBackgroundBackfill();
    }
  }, [configured, applyBundle, runBackgroundBackfill]);

  useEffect(() => {
    reload();
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
    reload,
    create: createProjectExpense,
    update: updateProjectExpense,
    remove: deleteProjectExpense,
  };
}

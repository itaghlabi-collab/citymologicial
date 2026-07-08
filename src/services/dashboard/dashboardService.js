/**
 * dashboardService.js — Service central tableau de bord ERP CITYMO
 * Chargement agrégé, alertes prioritaires, realtime + polling permanent.
 */
import { getSupabase, isSupabaseConfigured } from '../../lib/supabase';
import { loadMainDashboardData } from './dashboardData';
import { formatDate, roundMoney } from '../../utils/formatters';
import { ROUTES } from '../../config/routes';

/** Polling permanent — garde le dashboard à jour même si le realtime lâche. */
export const DASHBOARD_POLL_MS = 15_000;

/** Tables Supabase écoutées pour rafraîchissement automatique */
export const DASHBOARD_REALTIME_TABLES = [
  'finance_transactions',
  'cash_monthly_balances',
  'finance_charges',
  'payment_orders',
  'crm_factures',
  'crm_devis',
  'clients',
  'payroll',
  'subcontractor_payments',
  'projects',
  'internal_tasks',
  'internal_appointments',
  'leaves',
  'stock_articles',
  'stock_movements',
  'notifications',
  'attendance',
  'purchase_orders',
  'daily_cash_reviews',
  'prospects',
];

/** @deprecated alias — préférer loadDashboardData */
export { loadMainDashboardData };

/**
 * Charge toutes les données dashboard pour une période.
 * @param {{ dateFrom?: string, dateTo?: string }} dateRange
 */
export async function loadDashboardData(dateRange = {}) {
  const payload = await loadMainDashboardData(dateRange);
  return {
    ...payload,
    alerts: buildDashboardAlerts(payload, dateRange),
  };
}

function overlapsRange(start, end, from, to) {
  if (!start && !end) return true;
  const s = String(start || end).slice(0, 10);
  const e = String(end || start).slice(0, 10);
  return e >= from && s <= to;
}

/**
 * Alertes prioritaires cliquables (module de navigation).
 */
export function buildDashboardAlerts(data, { dateFrom, dateTo } = {}) {
  if (!data?.configured) return [];

  const from = dateFrom || new Date().toISOString().slice(0, 7) + '-01';
  const to = dateTo || new Date().toISOString().slice(0, 10);
  const alerts = [];
  const seen = new Set();

  function push(alert) {
    const key = `${alert.type}|${alert.msg}`;
    if (seen.has(key)) return;
    seen.add(key);
    alerts.push(alert);
  }

  const internal = data.internal;

  (internal?.tasks || []).forEach((t) => {
    if (t.priority === 'haute' || t.priority === 'urgente') {
      push({
        type: 'warning',
        msg: `Tâche urgente : ${t.title}`,
        module: ROUTES.TACHES,
      });
    }
  });

  (internal?.alerts || []).forEach((a) => {
    const module = a.msg?.includes('Facture') ? ROUTES.FACTURES
      : a.msg?.includes('RDV') ? ROUTES.RENDEZVOUS
        : a.msg?.includes('Tache') || a.msg?.includes('Tâche') ? ROUTES.TACHES
          : null;
    push({ ...a, module: a.module || module });
  });

  (data.leaves || [])
    .filter((l) => l.status === 'pending' && overlapsRange(l.dateDebut, l.dateFin, from, to))
    .slice(0, 5)
    .forEach((l) => {
      push({
        type: 'info',
        msg: `Congé en attente : ${l.employee} (${l.type})`,
        module: ROUTES.CONGES,
      });
    });

  if (data.cashValidation?.needsValidation) {
    push({
      type: 'warning',
      msg: `Caisse J-1 non validée (${formatDate(data.cashValidation.targetDate)})`,
      module: ROUTES.FEUILLE_CAISSE,
    });
  }

  (data.legacyInvoices || [])
    .filter((i) => (i.status === 'overdue' || i.status === 'unpaid') && overlapsRange(i.date, i.date, from, to))
    .slice(0, 5)
    .forEach((i) => {
      push({
        type: i.status === 'overdue' ? 'error' : 'warning',
        msg: `Facture ${i.status === 'overdue' ? 'en retard' : 'impayée'} : ${i.ref} — ${roundMoney(i.amount).toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MAD`,
        module: ROUTES.FACTURES,
      });
    });

  (data.projects || []).filter((p) => p.delayed).slice(0, 5).forEach((p) => {
    push({
      type: 'warning',
      msg: `Projet en retard : ${p.name}`,
      module: ROUTES.PROJETS,
    });
  });

  (data.products || []).slice(0, 5).forEach((p) => {
    push({
      type: 'error',
      msg: `Stock critique : ${p.name} (${p.qty}/${p.threshold} ${p.unit})`,
      module: ROUTES.ARTICLES_STOCK,
    });
  });

  (data.workerPayments || [])
    .filter((p) => p.statut === 'Payé' && overlapsRange(p.paymentDate || p.semaineDebut, p.paymentDate || p.semaineFin, from, to))
    .filter((p) => roundMoney(p.total) >= 5000)
    .slice(0, 3)
    .forEach((p) => {
      push({
        type: 'info',
        msg: `Paiement ouvrier : ${p.ouvrier} — ${roundMoney(p.total).toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MAD`,
        module: ROUTES.PAIEMENT_HEBDO,
      });
    });

  (data.purchaseAlerts || []).forEach((a) => {
    push({ ...a, module: ROUTES.BONS_COMMANDE });
  });

  const priority = { error: 0, warning: 1, info: 2 };
  return alerts
    .sort((a, b) => (priority[a.type] ?? 9) - (priority[b.type] ?? 9))
    .slice(0, 12);
}

/**
 * Abonnement realtime Supabase + polling permanent (15s).
 * @param {() => void} onChange
 * @returns {() => void} cleanup
 */
export function subscribeDashboardRealtime(onChange) {
  if (typeof onChange !== 'function') return () => {};

  let debounceTimer = null;
  const notify = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      onChange();
    }, 350);
  };

  // Polling toujours actif (filet de sécurité + cas realtime coupé)
  const pollTimer = setInterval(notify, DASHBOARD_POLL_MS);

  if (!isSupabaseConfigured()) {
    return () => {
      clearTimeout(debounceTimer);
      clearInterval(pollTimer);
    };
  }

  const sb = getSupabase();
  let channel = sb.channel(`citymo-dashboard-realtime-${Date.now()}`);

  DASHBOARD_REALTIME_TABLES.forEach((table) => {
    channel = channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table },
      () => notify(),
    );
  });

  channel.subscribe();

  return () => {
    clearTimeout(debounceTimer);
    clearInterval(pollTimer);
    sb.removeChannel(channel);
  };
}

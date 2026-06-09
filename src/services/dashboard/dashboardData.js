/**
 * dashboardData.js — Agrégation Supabase pour le tableau de bord principal
 */
import { isSupabaseConfigured } from '../../lib/supabase';
import { loadInternalDashboardData } from '../internal/internalDashboard';
import { listFinanceCharges } from '../finance/charges';
import { listPaymentOrders } from '../finance/paymentOrders';
import { listFinanceTransactions, computeCashTotals } from '../finance/financeTransactions';
import { listProjects } from '../projects/projects';
import { listAttendance } from '../rh/attendance';
import { listLeaves } from '../rh/leaves';
import { listPurchaseOrders } from '../achats/purchaseOrders';
import { listCrmFactures } from '../crm/crmFactures';
import { inMonth } from '../finance/financeDashboardData';

const EXECUTED_ORDER_STATUTS = ['Payé', 'Exécuté', 'Comptabilisé'];
const PAID_CHARGE_STATUTS = ['Payé', 'Validé', 'Validée', 'Comptabilisée'];

function inDateRange(dateStr, from, to) {
  if (!dateStr) return false;
  const d = String(dateStr).slice(0, 10);
  return d >= from && d <= to;
}

function parseHours(entree, sortie) {
  if (!entree || !sortie) return 8;
  const [h1, m1] = entree.split(':').map(Number);
  const [h2, m2] = sortie.split(':').map(Number);
  if (Number.isNaN(h1) || Number.isNaN(h2)) return 8;
  return Math.max(0, (h2 + m2 / 60) - (h1 + m1 / 60));
}

function mapProjectForDashboard(p, today) {
  const delayed = Boolean(
    p.date_fin_prevue && p.date_fin_prevue < today
    && p.statut !== 'termine' && p.statut !== 'annule',
  );
  let status = 'En cours';
  if (p.statut === 'termine') status = 'Termine';
  else if (p.statut === 'brouillon' || p.statut === 'en_pause') status = 'En pause';
  else if (Number(p.avancement) >= 90) status = 'Finalisation';

  return {
    id: p.id,
    name: p.nom || p.ref || 'Projet',
    progress: Math.min(100, Math.max(0, Number(p.avancement) || 0)),
    budget: Number(p.budget_estime) || 0,
    spent: Number(p.budget_consomme) || 0,
    delayed,
    status,
  };
}

function buildAttendanceSummary(attendance, endDate) {
  const today = endDate;
  const todayRows = (attendance || []).filter((a) => a.date === today);
  const present = todayRows.filter((a) => a.statut === 'Present' || a.statut === 'Retard').length;
  const absent = todayRows.filter((a) => a.statut === 'Absent').length;
  const total = todayRows.length;

  const hoursPerDay = [];
  const end = new Date(endDate);
  for (let i = 6; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    const ds = d.toISOString().slice(0, 10);
    const dayRows = (attendance || []).filter((a) => a.date === ds && a.statut !== 'Absent');
    const h = dayRows.reduce((s, r) => s + parseHours(r.heureEntree, r.heureSortie), 0);
    hoursPerDay.push(Math.round(h));
  }

  return { present, absent, total, hoursPerDay };
}

function mapLeaveStatus(statut) {
  const s = (statut || '').toLowerCase();
  if (s.includes('attente') || s === 'pending') return 'pending';
  if (s.includes('approuv') || s.includes('valid') || s === 'approved') return 'approved';
  if (s.includes('refus') || s === 'rejected') return 'rejected';
  return 'other';
}

function buildChartSeries(transactions, factures, dateFrom, dateTo) {
  const start = new Date(dateFrom);
  const end = new Date(dateTo);
  const months = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);

  while (cursor <= endMonth) {
    const y = cursor.getFullYear();
    const m = cursor.getMonth() + 1;
    months.push({
      key: `${y}-${String(m).padStart(2, '0')}`,
      label: cursor.toLocaleString('fr-FR', { month: 'short' }),
      year: y,
      month: m,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  if (months.length === 0) {
    const now = new Date(dateTo);
    months.push({
      key: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
      label: now.toLocaleString('fr-FR', { month: 'short' }),
      year: now.getFullYear(),
      month: now.getMonth() + 1,
    });
  }
  if (months.length === 1) {
    const prev = new Date(months[0].year, months[0].month - 2, 1);
    months.unshift({
      key: `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`,
      label: prev.toLocaleString('fr-FR', { month: 'short' }),
      year: prev.getFullYear(),
      month: prev.getMonth() + 1,
    });
  }

  const invoiceData = months.map(({ year, month }) =>
    (factures || [])
      .filter((f) => inMonth(f.date || f.date_emission || f.created_at, year, month))
      .reduce((s, f) => s + (Number(f.amount) || Number(f.total_ttc) || 0), 0),
  );

  const expenseData = months.map(({ year, month }) => {
    const txSorties = (transactions || [])
      .filter((t) => inMonth(t.date, year, month) && t.sens === 'sortie' && t.statut !== 'Annulé')
      .reduce((s, t) => s + (Number(t.montant) || 0), 0);
    return txSorties;
  });

  const tresorerieData = months.map(({ year, month }) => {
    const monthTxs = (transactions || []).filter(
      (t) => inMonth(t.date, year, month) && t.statut !== 'Annulé',
    );
    const totals = computeCashTotals(monthTxs, null);
    return Math.max(0, totals.soldeMois);
  });

  return {
    labels: months.map((m) => m.label),
    series: [
      { name: 'Factures', data: invoiceData },
      { name: 'Depenses', data: expenseData },
      { name: 'Tresorerie', data: tresorerieData },
    ],
  };
}

function buildFinanceKpis({ charges, orders, transactions, factures, dateFrom, dateTo }) {
  const periodCharges = (charges || []).filter(
    (c) => inDateRange(c.date, dateFrom, dateTo) && PAID_CHARGE_STATUTS.includes(c.statut),
  );
  const periodOrders = (orders || []).filter(
    (o) => inDateRange(o.date || o.date_prevue, dateFrom, dateTo) && EXECUTED_ORDER_STATUTS.includes(o.statut),
  );
  const periodTxs = (transactions || []).filter(
    (t) => inDateRange(t.date, dateFrom, dateTo) && t.statut !== 'Annulé',
  );

  const totalExpenses = periodCharges.reduce((s, c) => s + (Number(c.montant) || 0), 0)
    || periodTxs.filter((t) => t.sens === 'sortie').reduce((s, t) => s + (Number(t.montant) || 0), 0);

  const executedPayments = periodOrders.reduce((s, o) => s + (Number(o.montant) || 0), 0)
    || periodTxs.filter((t) => t.sens === 'entree').reduce((s, t) => s + (Number(t.montant) || 0), 0);

  const periodFactures = (factures || []).filter((f) => inDateRange(f.date, dateFrom, dateTo));
  const totalInvoices = periodFactures.reduce((s, f) => s + (Number(f.amount) || 0), 0);
  const unpaidInvoices = periodFactures
    .filter((f) => f.status !== 'paid')
    .reduce((s, f) => s + (Number(f.amount) || 0), 0);

  const cashTotals = computeCashTotals(periodTxs, null);
  const tresorerie = periodTxs.length
    ? cashTotals.soldeMois
    : executedPayments - totalExpenses;

  return {
    totalInvoices,
    unpaidInvoices,
    totalExpenses,
    executedPayments,
    tresorerie,
    expensesCount: periodCharges.length || periodTxs.filter((t) => t.sens === 'sortie').length,
  };
}

export async function loadMainDashboardData({ dateFrom, dateTo } = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const from = dateFrom || today.slice(0, 7) + '-01';
  const to = dateTo || today;

  const empty = {
    configured: false,
    internal: null,
    finance: {
      totalInvoices: 0, unpaidInvoices: 0, totalExpenses: 0,
      executedPayments: 0, tresorerie: 0, expensesCount: 0,
    },
    chart: { labels: [new Date().toLocaleString('fr-FR', { month: 'short' })], series: [] },
    projects: [],
    attendance: { present: 0, absent: 0, total: 0, hoursPerDay: [0, 0, 0, 0, 0, 0, 0] },
    leaves: [],
    purchaseOrders: [],
    products: [],
  };

  if (!isSupabaseConfigured()) return empty;

  const results = await Promise.allSettled([
    loadInternalDashboardData(),
    listFinanceCharges(),
    listPaymentOrders(),
    listFinanceTransactions(),
    listProjects(),
    listAttendance(),
    listLeaves(),
    listPurchaseOrders(),
  ]);

  const val = (i) => (results[i].status === 'fulfilled' ? results[i].value : []);
  const internal = val(0);
  const charges = val(1);
  const orders = val(2);
  const transactions = val(3);
  const projectsRaw = val(4);
  const attendanceRaw = val(5);
  const leavesRaw = val(6);
  const purchaseOrders = val(7);

  const factures = internal?.recentFactures?.length
    ? internal.recentFactures
    : [];

  const allFacturesForChart = await listCrmFactures().catch(() => []);

  const mappedFactures = (allFacturesForChart || []).map((f) => ({
    amount: Number(f.total_ttc) || 0,
    date: f.date_emission || f.created_at,
    status: f.statut === 'payee' ? 'paid' : f.statut === 'en_retard' ? 'overdue' : 'unpaid',
    ref: f.numero,
    client: f.client_nom,
  }));

  const finance = buildFinanceKpis({
    charges,
    orders,
    transactions,
    factures: mappedFactures.length ? mappedFactures : factures,
    dateFrom: from,
    dateTo: to,
  });

  const chart = buildChartSeries(
    transactions,
    mappedFactures.length ? mappedFactures : factures,
    from,
    to,
  );

  const projects = (projectsRaw || []).map((p) => mapProjectForDashboard(p, to));
  const attendance = buildAttendanceSummary(attendanceRaw, to);

  const leaves = (leavesRaw || []).map((l) => ({
    id: l.id,
    employee: l.employe || l.employe_label || '—',
    type: l.type_conge || l.type || 'Congé',
    status: mapLeaveStatus(l.statut || l._statut),
    dateDebut: l.date_debut || l.dateDebut,
    dateFin: l.date_fin || l.dateFin,
  }));

  const purchaseAlerts = (purchaseOrders || [])
    .filter((o) => ['Brouillon', 'Soumis', 'En attente'].includes(o.statut))
    .slice(0, 3)
    .map((o) => ({ type: 'info', msg: `Bon de commande en attente : ${o.ref || o.fournisseur || o.id}` }));

  return {
    configured: true,
    internal,
    finance,
    chart,
    projects,
    attendance,
    leaves,
    purchaseOrders,
    products: [],
    purchaseAlerts,
    legacyInvoices: mappedFactures.length ? mappedFactures : factures,
    expenses: charges.filter((c) => inDateRange(c.date, from, to)),
  };
}

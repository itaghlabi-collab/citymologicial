import { useState, useEffect, useCallback } from 'react';
import { isSupabaseConfigured } from '../lib/supabase';
import { formatSupabaseError } from '../services/supabase/formatError';
import { listFinanceCharges } from '../services/finance/charges';
import { listPaymentOrders } from '../services/finance/paymentOrders';
import {
  listFinanceTransactionsForYear,
  computeCashTotals,
} from '../services/finance/financeTransactions';
import {
  listCashMonthlyBalancesForYear,
} from '../services/finance/cashMonthlyBalances';
import { listProjects } from '../services/projects/projects';
import { listChargeCategories } from '../services/finance/chargeCategories';
import {
  prevMonth,
  inMonth,
  evolutionPct,
  buildMonthlySeries,
  sparklineValues,
  buildCategoryBreakdown,
  buildTopCharges,
  buildRecentActivity,
  buildProjectIndicators,
  sumPendingAmounts,
  buildForecast,
  countPending,
} from '../services/finance/financeDashboardData';

const PENDING_CHARGE_STATUTS = ['Brouillon', 'En attente validation'];
const PENDING_ORDER_STATUTS = ['Brouillon', 'Soumis', 'En attente'];

function filterTxsByMonth(txs, y, m) {
  return (txs || []).filter((t) => inMonth(t.date, y, m));
}

export function useFinanceDashboard() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const { year: prevYear, month: prevMonthNum } = prevMonth(year, month);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const configured = isSupabaseConfigured();

  const load = useCallback(async () => {
    if (!configured) {
      setLoading(false);
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Peu de requêtes parallèles — pas de backfill RH ni reconcile au load
      const [
        charges,
        orders,
        yearTxs,
        balances,
        projects,
        categories,
      ] = await Promise.all([
        listFinanceCharges(),
        listPaymentOrders(),
        listFinanceTransactionsForYear(year),
        listCashMonthlyBalancesForYear(year),
        listProjects({ light: true }).catch(() => []),
        listChargeCategories().catch(() => []),
      ]);

      const monthTxs = filterTxsByMonth(yearTxs, year, month);
      // Mois précédent dans la même année (en janvier, on saute l’évolution fine)
      const prevTxs = prevYear === year
        ? filterTxsByMonth(yearTxs, prevYear, prevMonthNum)
        : [];

      const balance = (balances || []).find((b) => b.mois === month) || null;
      const prevBalance = prevYear === year
        ? (balances || []).find((b) => b.mois === prevMonthNum) || null
        : null;

      const totals = computeCashTotals(monthTxs, balance);
      const prevTotals = computeCashTotals(prevTxs, prevBalance);
      const monthlySeries = buildMonthlySeries(year, yearTxs, balances);
      const { chargesEnAttente, ordresAValider } = countPending(charges, orders);
      const { chargesPendingAmount, ordersPendingAmount } = sumPendingAmounts(charges, orders);

      const prevChargesPending = (charges || []).filter(
        (c) => inMonth(c.date, prevYear, prevMonthNum) && PENDING_CHARGE_STATUTS.includes(c.statut),
      ).length;
      const prevOrdersPending = (orders || []).filter((o) => {
        const d = o.date || o.date_prevue;
        return inMonth(d, prevYear, prevMonthNum) && PENDING_ORDER_STATUTS.includes(o.statut);
      }).length;

      const chargesSparkSeries = monthlySeries.map((m) => ({
        ...m,
        charges: (charges || []).filter((c) => inMonth(c.date, year, m.month)).length,
      }));
      const ordresSparkSeries = monthlySeries.map((m) => ({
        ...m,
        ordres: (orders || []).filter((o) => inMonth(o.date || o.date_prevue, year, m.month)).length,
      }));

      const kpis = {
        totalEntrees: totals.totalEntrees,
        totalSorties: totals.totalSorties,
        soldeCaisse: totals.soldeMois,
        chargesEnAttente,
        ordresAValider,
        evolutions: {
          entrees: evolutionPct(totals.totalEntrees, prevTotals.totalEntrees),
          sorties: evolutionPct(totals.totalSorties, prevTotals.totalSorties),
          solde: evolutionPct(totals.soldeMois, prevTotals.soldeMois),
          charges: evolutionPct(chargesEnAttente, prevChargesPending),
          ordres: evolutionPct(ordresAValider, prevOrdersPending),
        },
        sparklines: {
          entrees: sparklineValues(monthlySeries, 'entrees', month),
          sorties: sparklineValues(monthlySeries, 'sorties', month),
          solde: sparklineValues(monthlySeries, 'solde', month),
          charges: sparklineValues(chargesSparkSeries, 'charges', month),
          ordres: sparklineValues(ordresSparkSeries, 'ordres', month),
        },
      };

      setData({
        kpis,
        monthlySeries,
        categoryBreakdown: buildCategoryBreakdown(charges, monthTxs, categories, year, month),
        topCharges: buildTopCharges(charges, monthTxs, categories, year, month),
        recentActivity: buildRecentActivity(yearTxs, charges, orders),
        projectIndicators: buildProjectIndicators(projects, charges, monthTxs),
        forecast: buildForecast({
          soldeActuel: totals.soldeMois,
          totalEntrees: totals.totalEntrees,
          year,
          month,
          chargesPendingAmount,
          ordersPendingAmount,
        }),
      });
    } catch (err) {
      setError(formatSupabaseError(err, 'Erreur dashboard finance.'));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [configured, year, month, prevYear, prevMonthNum]);

  useEffect(() => { load(); }, [load]);

  return { data, loading, error, configured, reload: load, year, month };
}

import { useState, useEffect, useCallback } from 'react';
import { isSupabaseConfigured } from '../lib/supabase';
import { formatSupabaseError } from '../services/supabase/formatError';
import { listFinanceCharges } from '../services/finance/charges';
import { listPaymentOrders } from '../services/finance/paymentOrders';
import { listFinanceTransactions, computeCashTotals } from '../services/finance/financeTransactions';
import { getCashMonthlyBalance } from '../services/finance/cashMonthlyBalances';

export function useFinanceDashboard() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [stats, setStats] = useState({
    totalSorties: 0,
    totalEntrees: 0,
    soldeCaisse: 0,
    chargesEnAttente: 0,
    ordresAValider: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const configured = isSupabaseConfigured();

  const load = useCallback(async () => {
    if (!configured) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [charges, orders, txs, balance] = await Promise.all([
        listFinanceCharges(),
        listPaymentOrders(),
        listFinanceTransactions({ year, month }),
        getCashMonthlyBalance(year, month),
      ]);
      const totals = computeCashTotals(txs, balance);
      const chargesEnAttente = charges.filter((c) =>
        ['Brouillon', 'En attente validation'].includes(c.statut),
      ).length;
      const ordresAValider = orders.filter((o) =>
        ['Brouillon', 'Soumis', 'En attente'].includes(o.statut),
      ).length;
      setStats({
        totalSorties: totals.totalSorties,
        totalEntrees: totals.totalEntrees,
        soldeCaisse: totals.soldeMois,
        chargesEnAttente,
        ordresAValider,
      });
    } catch (err) {
      setError(formatSupabaseError(err, 'Erreur dashboard finance.'));
    } finally {
      setLoading(false);
    }
  }, [configured, year, month]);

  useEffect(() => { load(); }, [load]);

  return { stats, loading, error, configured, reload: load, year, month };
}

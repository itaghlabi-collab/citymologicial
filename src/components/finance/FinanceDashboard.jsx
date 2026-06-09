/**
 * FinanceDashboard.jsx — Tableau de bord Finance & Trésorerie
 */
import { Loader2, TrendingDown, TrendingUp, Wallet, Clock, FileCheck } from 'lucide-react';
import { useFinanceDashboard } from '../../hooks/useFinanceDashboard';
import { KpiCard, formatMAD } from './shared.jsx';

const MOIS = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

export default function FinanceDashboard() {
  const { stats, loading, error, year, month } = useFinanceDashboard();

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-3)' }}>
        <Loader2 size={28} className="spin" style={{ margin: '0 auto 12px' }} />
        Chargement du tableau de bord finance…
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">FINANCE & TRÉSORERIE</h1>
        <p className="page-subtitle">
          Vue synthétique — {MOIS[month]} {year}
        </p>
      </div>

      {error && (
        <div className="card" style={{ marginBottom: 16, padding: 14, color: 'var(--red)', fontSize: '0.86rem' }}>
          {error}
        </div>
      )}

      <div className="stat-grid finance-kpi-grid" style={{ marginBottom: 24 }}>
        <KpiCard icon={<TrendingDown size={17} />} label="Total sorties (mois)" value={formatMAD(stats.totalSorties)} color="red" />
        <KpiCard icon={<TrendingUp size={17} />} label="Total entrées (mois)" value={formatMAD(stats.totalEntrees)} color="green" />
        <KpiCard icon={<Wallet size={17} />} label="Solde caisse (mois)" value={formatMAD(stats.soldeCaisse)} color="blue" />
        <KpiCard icon={<Clock size={17} />} label="Charges en attente" value={stats.chargesEnAttente} color="orange" />
        <KpiCard icon={<FileCheck size={17} />} label="Ordres à valider" value={stats.ordresAValider} color="purple" />
      </div>

      <div className="card">
        <p style={{ fontSize: '0.86rem', color: 'var(--text-2)', margin: 0, lineHeight: 1.6 }}>
          Utilisez le menu latéral pour gérer les <strong>catégories</strong>, les <strong>charges</strong>,
          la <strong>feuille de caisse</strong> et les <strong>ordres de paiement</strong>.
          Les totaux sont calculés automatiquement depuis Supabase (journal caisse + soldes mensuels).
        </p>
      </div>
    </div>
  );
}

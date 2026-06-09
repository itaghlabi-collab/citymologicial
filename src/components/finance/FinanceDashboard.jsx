/**
 * FinanceDashboard.jsx — Cockpit Finance & Trésorerie CITYMO
 */
import {
  Loader2, TrendingDown, TrendingUp, Wallet, Clock, FileCheck,
  RefreshCw, ArrowDownLeft, ArrowUpRight, Receipt, FileText,
  Building2, Target,
} from 'lucide-react';
import { useFinanceDashboard } from '../../hooks/useFinanceDashboard';
import { formatMAD } from './shared.jsx';
import {
  Sparkline,
  TreasuryComboChart,
  FinanceDonutChart,
  ProjectProgressBar,
} from './FinanceCharts.jsx';

const MOIS = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

const ACTIVITY_META = {
  entree: { label: 'Entrée caisse', color: '#2E7D32', Icon: ArrowDownLeft },
  sortie: { label: 'Sortie caisse', color: '#C62828', Icon: ArrowUpRight },
  charge: { label: 'Charge', color: '#E65100', Icon: Receipt },
  ordre: { label: 'Ordre paiement', color: '#6A1B9A', Icon: FileText },
};

function EvolutionBadge({ value, invert = false }) {
  const n = Number(value) || 0;
  const positive = invert ? n <= 0 : n >= 0;
  const cls = positive ? 'finance-evolution-up' : 'finance-evolution-down';
  const arrow = n >= 0 ? '▲' : '▼';
  return (
    <span className={`finance-evolution ${cls}`}>
      {arrow} {Math.abs(n).toFixed(1)}% <span className="finance-evolution-ref">vs m-1</span>
    </span>
  );
}

function PremiumKpi({ icon, label, value, evolution, sparkData, color, invertEvolution }) {
  return (
    <div className="finance-dash-kpi card">
      <div className="finance-dash-kpi-top">
        <div className="finance-dash-kpi-icon" style={{ background: `${color}18`, color }}>{icon}</div>
        <Sparkline data={sparkData} color={color} />
      </div>
      <div className="finance-dash-kpi-value">{value}</div>
      <div className="finance-dash-kpi-label">{label}</div>
      <EvolutionBadge value={evolution} invert={invertEvolution} />
    </div>
  );
}

function formatShortDate(d) {
  if (!d) return '—';
  const [y, m, day] = String(d).slice(0, 10).split('-');
  return `${day}/${m}/${y}`;
}

export default function FinanceDashboard() {
  const { data, loading, error, configured, reload, year, month } = useFinanceDashboard();

  if (loading) {
    return (
      <div className="finance-dashboard-loading">
        <Loader2 size={28} className="cin-spin" />
        <span>Chargement du cockpit finance…</span>
      </div>
    );
  }

  const kpis = data?.kpis;
  const monthlySeries = data?.monthlySeries || [];
  const categoryBreakdown = data?.categoryBreakdown || [];
  const topCharges = data?.topCharges || [];
  const recentActivity = data?.recentActivity || [];
  const projectIndicators = data?.projectIndicators || [];
  const forecast = data?.forecast;

  return (
    <div className="finance-dashboard animate-fade-in">
      <div className="page-header flex-between finance-dash-header">
        <div>
          <h1 className="page-title">COCKPIT FINANCE & TRÉSORERIE</h1>
          <p className="page-subtitle">
            Pilotage financier — {MOIS[month]} {year}
          </p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={reload}>
          <RefreshCw size={14} /> Actualiser
        </button>
      </div>

      {error && (
        <div className="card finance-dash-alert">{error}</div>
      )}
      {!configured && (
        <div className="card finance-dash-alert">
          Supabase non configuré — vérifiez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY.
        </div>
      )}

      {/* ZONE 1 — KPI */}
      <section className="finance-dash-section">
        <div className="finance-dash-kpi-grid">
          <PremiumKpi
            icon={<TrendingUp size={18} />}
            label="Total entrées du mois"
            value={formatMAD(kpis?.totalEntrees)}
            evolution={kpis?.evolutions?.entrees}
            sparkData={kpis?.sparklines?.entrees}
            color="#2E7D32"
          />
          <PremiumKpi
            icon={<TrendingDown size={18} />}
            label="Total sorties du mois"
            value={formatMAD(kpis?.totalSorties)}
            evolution={kpis?.evolutions?.sorties}
            sparkData={kpis?.sparklines?.sorties}
            color="#C62828"
            invertEvolution
          />
          <PremiumKpi
            icon={<Wallet size={18} />}
            label="Solde caisse actuel"
            value={formatMAD(kpis?.soldeCaisse)}
            evolution={kpis?.evolutions?.solde}
            sparkData={kpis?.sparklines?.solde}
            color="#1565C0"
          />
          <PremiumKpi
            icon={<Clock size={18} />}
            label="Charges en attente"
            value={kpis?.chargesEnAttente ?? 0}
            evolution={kpis?.evolutions?.charges}
            sparkData={kpis?.sparklines?.charges}
            color="#E65100"
            invertEvolution
          />
          <PremiumKpi
            icon={<FileCheck size={18} />}
            label="Ordres de paiement en attente"
            value={kpis?.ordresAValider ?? 0}
            evolution={kpis?.evolutions?.ordres}
            sparkData={kpis?.sparklines?.ordres}
            color="#6A1B9A"
            invertEvolution
          />
        </div>
      </section>

      {/* ZONE 2 — Trésorerie mensuelle */}
      <section className="finance-dash-section">
        <div className="card finance-dash-card">
          <div className="finance-dash-card-head">
            <h2>Évolution de la trésorerie</h2>
            <span className="finance-dash-card-sub">{year} — Entrées, sorties et solde par mois</span>
          </div>
          <TreasuryComboChart
            data={monthlySeries}
            emptyMessage="Aucune opération enregistrée cette année. Alimentez la feuille de caisse."
          />
        </div>
      </section>

      {/* ZONE 3 + 4 */}
      <section className="finance-dash-section finance-dash-split">
        <div className="card finance-dash-card">
          <div className="finance-dash-card-head">
            <h2>Répartition des charges</h2>
            <span className="finance-dash-card-sub">{MOIS[month]} {year}</span>
          </div>
          <FinanceDonutChart segments={categoryBreakdown} />
        </div>

        <div className="card finance-dash-card">
          <div className="finance-dash-card-head">
            <h2>Top 10 charges du mois</h2>
            <span className="finance-dash-card-sub">Tri décroissant par montant</span>
          </div>
          {topCharges.length === 0 ? (
            <div className="finance-chart-empty">Aucune charge enregistrée ce mois.</div>
          ) : (
            <div className="table-wrap finance-dash-table-wrap">
              <table className="finance-dash-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Catégorie</th>
                    <th>Description</th>
                    <th>Montant</th>
                  </tr>
                </thead>
                <tbody>
                  {topCharges.map((c) => (
                    <tr key={c.id}>
                      <td data-label="Date">{formatShortDate(c.date)}</td>
                      <td data-label="Catégorie">{c.categorie || '—'}</td>
                      <td data-label="Description">{c.libelle || '—'}</td>
                      <td data-label="Montant" className="finance-amount-out">{formatMAD(c.montant)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* ZONE 5 — Dernières opérations */}
      <section className="finance-dash-section">
        <div className="card finance-dash-card">
          <div className="finance-dash-card-head">
            <h2>Dernières opérations</h2>
            <span className="finance-dash-card-sub">Journal caisse, charges et ordres</span>
          </div>
          {recentActivity.length === 0 ? (
            <div className="finance-chart-empty">Aucune activité récente.</div>
          ) : (
            <ul className="finance-timeline">
              {recentActivity.map((item) => {
                const meta = ACTIVITY_META[item.type] || ACTIVITY_META.sortie;
                const { Icon } = meta;
                const isIn = item.type === 'entree';
                return (
                  <li key={item.id} className="finance-timeline-item">
                    <div className="finance-timeline-dot" style={{ background: `${meta.color}20`, color: meta.color }}>
                      <Icon size={14} />
                    </div>
                    <div className="finance-timeline-body">
                      <div className="finance-timeline-title">{meta.label}</div>
                      <div className="finance-timeline-desc">{item.label}</div>
                      <div className="finance-timeline-meta">
                        <span>{formatShortDate(item.date)}</span>
                        <span>{item.responsable}</span>
                      </div>
                    </div>
                    <div className={`finance-timeline-amount ${isIn ? 'in' : 'out'}`}>
                      {isIn ? '+' : '−'}{formatMAD(item.montant)}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* ZONE 6 + 7 */}
      <section className="finance-dash-section finance-dash-split">
        <div className="card finance-dash-card">
          <div className="finance-dash-card-head">
            <h2><Building2 size={16} style={{ verticalAlign: -2, marginRight: 6 }} />Indicateurs chantier</h2>
            <span className="finance-dash-card-sub">Charges liées aux projets</span>
          </div>
          {projectIndicators.length === 0 ? (
            <div className="finance-chart-empty">Aucun projet avec budget ou dépenses associées.</div>
          ) : (
            <ul className="finance-project-list">
              {projectIndicators.map((p) => (
                <li key={p.id} className="finance-project-item">
                  <div className="finance-project-head">
                    <span className="finance-project-name">{p.nom}</span>
                    <span className="finance-project-pct">{p.pct.toFixed(0)}%</span>
                  </div>
                  <ProjectProgressBar pct={p.pct} over={p.depense > p.budget && p.budget > 0} />
                  <div className="finance-project-stats">
                    <span>Budget {formatMAD(p.budget)}</span>
                    <span>Dépensé {formatMAD(p.depense)}</span>
                    <span>Reste {formatMAD(p.reste)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card finance-dash-card finance-forecast-card">
          <div className="finance-dash-card-head">
            <h2><Target size={16} style={{ verticalAlign: -2, marginRight: 6 }} />Prévision fin du mois</h2>
            <span className="finance-dash-card-sub">Synthèse trésorerie</span>
          </div>
          {forecast ? (
            <div className="finance-forecast">
              <div className="finance-forecast-row">
                <span>Solde actuel</span>
                <strong>{formatMAD(forecast.soldeActuel)}</strong>
              </div>
              <div className="finance-forecast-row plus">
                <span>+ Entrées prévues</span>
                <strong>{formatMAD(forecast.entreesPrevues)}</strong>
              </div>
              <div className="finance-forecast-row minus">
                <span>− Charges en attente</span>
                <strong>{formatMAD(forecast.chargesPendingAmount)}</strong>
              </div>
              <div className="finance-forecast-row minus">
                <span>− Ordres de paiement</span>
                <strong>{formatMAD(forecast.ordersPendingAmount)}</strong>
              </div>
              <div className="finance-forecast-total">
                <span>= Solde prévisionnel</span>
                <strong>{formatMAD(forecast.soldePrevisionnel)}</strong>
              </div>
            </div>
          ) : (
            <div className="finance-chart-empty">Données insuffisantes pour la prévision.</div>
          )}
        </div>
      </section>
    </div>
  );
}

/**
 * DepensesParProjet.jsx — Module Finance : Dépenses par projet (UI premium)
 */
import { useState, useRef, useMemo } from 'react';
import {
  Loader2, RefreshCw, Plus, Upload, Eye, Download, FileSpreadsheet,
  Building2, TrendingDown, Calendar, Target, ArrowLeft, BarChart3,
  AlertTriangle, LayoutDashboard, FolderKanban, CreditCard, LineChart,
  Search, User, Wallet, ShoppingCart, ChevronDown, ChevronUp, Users, Tags,
} from 'lucide-react';
import { useProjectExpenses } from '../../hooks/useProjectExpenses';
import { formatMAD, Modal, INPUT_STYLE, SELECT_STYLE, TEXTAREA_STYLE, MODES_PAIEMENT } from './shared.jsx';
import { FinanceDonutChart } from './FinanceCharts.jsx';
import { importDepenseChantierFile } from '../../services/finance/projectExpenseImport';
import { filterProjectExpenses, ORIGINE_LABELS } from '../../services/finance/projectExpenses';
import { getProjectDetailData } from '../../services/finance/projectExpenseData';
import { exportProjectExpensesPdf } from '../../services/finance/projectExpensePdf';
import { exportProjectExpensesExcel, exportAllProjectsExcel } from '../../services/finance/projectExpenseExport';

const CHART_COLORS = ['#C62828', '#1565C0', '#2E7D32', '#E65100', '#6A1B9A', '#00838F', '#AD1457', '#558B2F'];

const TABS = [
  { id: 'vue', label: 'Vue générale', icon: LayoutDashboard },
  { id: 'projets', label: 'Projets', icon: FolderKanban },
  { id: 'depenses', label: 'Dépenses', icon: CreditCard },
  { id: 'analyses', label: 'Analyses', icon: LineChart },
];

function fmtDate(d) {
  if (!d) return '—';
  const [y, m, day] = String(d).slice(0, 10).split('-');
  return `${day}/${m}/${y}`;
}

function fmtMonth(ym) {
  if (!ym) return '—';
  const [y, m] = ym.split('-');
  const names = ['', 'Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
  return `${names[Number(m)] || m} ${y}`;
}

/* ── UI helpers (affichage uniquement) ── */

function SectionHeader({ icon: Icon, title, subtitle, action }) {
  return (
    <div className="dpp-section-header">
      <div className="dpp-section-header-left">
        {Icon && <span className="dpp-section-icon"><Icon size={18} /></span>}
        <div>
          <h2 className="dpp-section-title">{title}</h2>
          {subtitle && <p className="dpp-section-subtitle">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

function DepProjKpi({ icon, label, value, sub, accent = 'red' }) {
  return (
    <div className={`dpp-kpi dpp-kpi--${accent}`}>
      <div className="dpp-kpi-top">
        <span className="dpp-kpi-icon">{icon}</span>
      </div>
      <div className="dpp-kpi-value">{value}</div>
      <div className="dpp-kpi-label">{label}</div>
      {sub && <div className="dpp-kpi-sub">{sub}</div>}
    </div>
  );
}

function ChartCard({ title, icon: Icon, children, className = '' }) {
  return (
    <div className={`dpp-chart-card card ${className}`}>
      <div className="dpp-chart-card-head">
        {Icon && <Icon size={16} className="dpp-chart-card-icon" />}
        <h3>{title}</h3>
      </div>
      <div className="dpp-chart-card-body">{children}</div>
    </div>
  );
}

function BarChartSimple({ data = [], emptyMessage, compact = false }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  if (!data.length) return <div className="finance-chart-empty">{emptyMessage}</div>;
  return (
    <div className={`dpp-bar-chart ${compact ? 'dpp-bar-chart--compact' : ''}`}>
      {data.map((d, i) => (
        <div key={d.label} className="dpp-bar-row">
          <div className="dpp-bar-label" title={d.label}>{d.label}</div>
          <div className="dpp-bar-track">
            <div
              className="dpp-bar-fill"
              style={{ width: `${(d.value / max) * 100}%`, background: CHART_COLORS[i % CHART_COLORS.length] }}
            />
          </div>
          <div className="dpp-bar-value">{formatMAD(d.value)}</div>
        </div>
      ))}
    </div>
  );
}

function ScrollableSearchList({ items, placeholder = 'Rechercher…', emptyLabel = 'Aucun élément' }) {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((x) => String(x).toLowerCase().includes(s));
  }, [items, q]);

  return (
    <div className="dpp-scroll-list">
      <div className="dpp-scroll-list-toolbar">
        <div style={{ flex: 1, minWidth: 160, position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
          <input
            type="search"
            placeholder={placeholder}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ ...INPUT_STYLE, paddingLeft: 32 }}
          />
        </div>
        <span className="dpp-scroll-list-count">{filtered.length} / {items.length}</span>
      </div>
      <ul className="dpp-scroll-list-items">
        {filtered.length === 0 && <li className="dpp-scroll-list-empty">{emptyLabel}</li>}
        {filtered.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}

function CollapsibleCard({ title, icon: Icon, count, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`dpp-collapsible card ${open ? 'is-open' : ''}`}>
      <button type="button" className="dpp-collapsible-head" onClick={() => setOpen((v) => !v)}>
        <span className="dpp-collapsible-head-left">
          {Icon && <Icon size={16} />}
          <span>{title}</span>
          {count != null && <span className="dpp-collapsible-badge">{count}</span>}
        </span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && <div className="dpp-collapsible-body">{children}</div>}
    </div>
  );
}

function StatMiniCard({ icon: Icon, label, value, highlight }) {
  return (
    <div className={`dpp-stat-card ${highlight ? 'dpp-stat-card--highlight' : ''}`}>
      <div className="dpp-stat-card-icon">{Icon && <Icon size={16} />}</div>
      <div className="dpp-stat-card-label">{label}</div>
      <div className="dpp-stat-card-value">{value}</div>
    </div>
  );
}

/* ── Modals (inchangés fonctionnellement) ── */

function ImportModal({ open, onClose, projects, onDone }) {
  const inputRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  if (!open) return null;

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setResult(null);
    try {
      const r = await importDepenseChantierFile(file, projects);
      setResult(r);
      onDone();
    } catch (err) {
      setResult({ error: err.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} title="Import Excel initial" onClose={onClose}>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-2)', marginBottom: 12 }}>
        Fichier <strong>DEPENSE CHANTIER JUIN.xlsx</strong> — import unique pour l&apos;historique.
        Feuilles exclues : GENERAL, DIVERS, DÉPÔT - BUREAU.
      </p>
      <input ref={inputRef} type="file" accept=".xlsx,.xls" onChange={handleFile} style={{ display: 'none' }} />
      <button type="button" className="btn btn-primary" onClick={() => inputRef.current?.click()} disabled={loading}>
        {loading ? <Loader2 size={14} className="cin-spin" /> : <Upload size={14} />}
        Sélectionner le fichier Excel
      </button>
      {result && !result.error && (
        <div className="card" style={{ marginTop: 16, padding: 14, fontSize: '0.85rem' }}>
          <div><strong>Projets importés :</strong> {result.projectsCount}</div>
          <div><strong>Dépenses importées :</strong> {result.expensesCount}</div>
          <div><strong>Montant total :</strong> {formatMAD(result.totalMontant)}</div>
          <div><strong>Doublons ignorés :</strong> {result.duplicates}</div>
          <div><strong>Erreurs :</strong> {result.errorsCount}</div>
          {result.unmatchedProjects?.length > 0 && (
            <div style={{ marginTop: 8, color: '#E65100' }}>
              <AlertTriangle size={14} style={{ verticalAlign: 'middle' }} /> Projet à associer manuellement :{' '}
              {result.unmatchedProjects.map((u) => u.replace('unmatched:', '')).join(', ')}
            </div>
          )}
        </div>
      )}
      {result?.error && <div className="finance-dash-alert" style={{ marginTop: 12 }}>{result.error}</div>}
    </Modal>
  );
}

function ExpenseFormModal({ open, onClose, projects, onSave, initial }) {
  const [form, setForm] = useState(initial || {
    project_id: '', date_depense: new Date().toISOString().slice(0, 10),
    categorie: '', element_depense: '', description: '', fournisseur: '',
    montant: '', mode_paiement: 'Virement', observation: '', origine: 'charge_manuelle',
  });
  const [saving, setSaving] = useState(false);

  if (!open) return null;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({ ...form, montant: Number(form.montant) });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} title="Nouvelle dépense" onClose={onClose}>
      <form onSubmit={submit} className="finance-form-grid">
        <label>Projet *
          <select style={SELECT_STYLE} value={form.project_id} onChange={(e) => set('project_id', e.target.value)} required>
            <option value="">— Sélectionner —</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
          </select>
        </label>
        <label>Date *
          <input type="date" style={INPUT_STYLE} value={form.date_depense} onChange={(e) => set('date_depense', e.target.value)} required />
        </label>
        <label>Catégorie
          <input style={INPUT_STYLE} value={form.categorie} onChange={(e) => set('categorie', e.target.value)} />
        </label>
        <label>Élément *
          <input style={INPUT_STYLE} value={form.element_depense} onChange={(e) => set('element_depense', e.target.value)} required />
        </label>
        <label>Description
          <textarea style={TEXTAREA_STYLE} value={form.description} onChange={(e) => set('description', e.target.value)} />
        </label>
        <label>Fournisseur
          <input style={INPUT_STYLE} value={form.fournisseur} onChange={(e) => set('fournisseur', e.target.value)} />
        </label>
        <label>Montant (MAD) *
          <input type="number" min="0" step="0.01" style={INPUT_STYLE} value={form.montant} onChange={(e) => set('montant', e.target.value)} required />
        </label>
        <label>Mode de paiement
          <select style={SELECT_STYLE} value={form.mode_paiement} onChange={(e) => set('mode_paiement', e.target.value)}>
            {MODES_PAIEMENT.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label>Observation
          <textarea style={TEXTAREA_STYLE} value={form.observation} onChange={(e) => set('observation', e.target.value)} />
        </label>
        <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Annuler</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? <Loader2 size={14} className="cin-spin" /> : null} Enregistrer
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ── Main ── */

export default function DepensesParProjet() {
  const {
    configured, loading, syncing, error, projects, expenses, dashboard, summaries,
    unmatched, reload, create, syncNow, erpContext,
  } = useProjectExpenses();

  const [view, setView] = useState('vue');
  const [selectedProject, setSelectedProject] = useState(null);
  const [search, setSearch] = useState('');
  const [filterOrigine, setFilterOrigine] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const filteredExpenses = filterProjectExpenses(expenses, { search, origine: filterOrigine });
  const detail = selectedProject
    ? getProjectDetailData(selectedProject, expenses, erpContext.orders, erpContext.acquisitionOrders)
    : null;

  const donutFournisseur = dashboard.fournisseurChart.map((s, i) => ({
    ...s, color: CHART_COLORS[i % CHART_COLORS.length],
  }));
  const donutCategorie = dashboard.categorieChart.map((s, i) => ({
    ...s, color: CHART_COLORS[i % CHART_COLORS.length],
  }));

  const monthlyChart = useMemo(() => {
    const byMonth = {};
    expenses.filter((e) => e.statut !== 'annule').forEach((e) => {
      const m = e.date_depense?.slice(0, 7);
      if (m) byMonth[m] = (byMonth[m] || 0) + e.montant;
    });
    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, value]) => ({ label: fmtMonth(label), value }));
  }, [expenses]);

  const topDepensesChart = useMemo(() => (
    [...expenses]
      .filter((e) => e.statut !== 'annule')
      .sort((a, b) => b.montant - a.montant)
      .slice(0, 8)
      .map((e) => ({
        label: (e.element_depense || '').slice(0, 28),
        value: e.montant,
      }))
  ), [expenses]);

  const attentionCount = unmatched.length;

  if (loading) {
    return (
      <div className="finance-dashboard-loading">
        <Loader2 size={28} className="cin-spin" />
        <span>Chargement des dépenses par projet…</span>
      </div>
    );
  }

  return (
    <div className="depenses-par-projet dpp-root animate-fade-in">
      {/* Header */}
      <div className="page-header flex-between finance-page-header dpp-header">
        <div>
          <h1 className="page-title">DÉPENSES PAR PROJET</h1>
          <p className="page-subtitle">Suivi financier des chantiers — alimentation automatique ERP</p>
        </div>
        <div className="finance-page-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => syncNow()} disabled={syncing}>
            <RefreshCw size={14} className={syncing ? 'cin-spin' : ''} /> Sync ERP
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowImport(true)}>
            <Upload size={14} /> Import Excel initial
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>
            <Plus size={14} /> Nouvelle dépense
          </button>
        </div>
      </div>

      {error && <div className="card finance-dash-alert dpp-block">{error}</div>}
      {!configured && <div className="card finance-dash-alert dpp-block">Supabase non configuré.</div>}

      {/* Tabs */}
      <nav className="dpp-tabs" aria-label="Navigation dépenses par projet">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={`dpp-tab ${view === id ? 'active' : ''}`}
            onClick={() => { setView(id); if (id !== 'projets') setSelectedProject(null); }}
          >
            <Icon size={16} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {/* ── Vue générale ── */}
      {view === 'vue' && (
        <div className="dpp-view dpp-fade-in">
          {attentionCount > 0 && (
            <div className="card dpp-alert-card dpp-block">
              <AlertTriangle size={18} />
              <div>
                <strong>{attentionCount} dépense(s) à traiter</strong>
                <p>Projet à associer manuellement — consultez l&apos;onglet Dépenses.</p>
              </div>
            </div>
          )}

          <section className="dpp-block">
            <SectionHeader
              icon={BarChart3}
              title="Indicateurs clés"
              subtitle="Vue synthétique de la situation financière"
            />
            <div className="dpp-kpi-grid">
              <DepProjKpi icon={<Building2 size={20} />} label="Projets suivis" value={dashboard.projectCount} accent="blue" />
              <DepProjKpi icon={<TrendingDown size={20} />} label="Dépenses totales" value={formatMAD(dashboard.totalDepenses)} accent="red" />
              <DepProjKpi icon={<Calendar size={20} />} label="Dépenses du mois" value={formatMAD(dashboard.depensesMois)} accent="orange" />
              <DepProjKpi
                icon={<Target size={20} />}
                label="Projet le plus dépensier"
                value={dashboard.topProject || '—'}
                sub={dashboard.topProject ? formatMAD(dashboard.topProjectAmount) : undefined}
                accent="purple"
              />
              <DepProjKpi icon={<Wallet size={20} />} label="Budget consommé" value={formatMAD(dashboard.budgetConsomme)} accent="red" />
              <DepProjKpi
                icon={<Target size={20} />}
                label="Budget restant"
                value={dashboard.totalBudget ? formatMAD(dashboard.budgetRestant) : '—'}
                accent="green"
              />
            </div>
          </section>

          <section className="dpp-block">
            <SectionHeader
              icon={FolderKanban}
              title="Top projets"
              subtitle="Les chantiers les plus consommateurs"
              action={(
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setView('analyses')}>
                  Voir analyses <LineChart size={14} />
                </button>
              )}
            />
            <div className="card dpp-chart-card">
              <BarChartSimple
                data={dashboard.projectChart.slice(0, 6)}
                emptyMessage="Aucune dépense enregistrée."
                compact
              />
            </div>
          </section>
        </div>
      )}

      {/* ── Analyses ── */}
      {view === 'analyses' && (
        <div className="dpp-view dpp-fade-in">
          <SectionHeader
            icon={LineChart}
            title="Analyses détaillées"
            subtitle="Répartitions, évolution et principales dépenses"
          />
          <div className="dpp-analyses-grid dpp-block">
            <ChartCard title="Dépenses par projet" icon={FolderKanban}>
              <BarChartSimple data={dashboard.projectChart} emptyMessage="Aucune dépense enregistrée." />
            </ChartCard>
            <ChartCard title="Répartition par fournisseur" icon={Users}>
              <FinanceDonutChart segments={donutFournisseur} emptyMessage="Aucun fournisseur." />
            </ChartCard>
            <ChartCard title="Répartition par catégorie" icon={Tags}>
              <FinanceDonutChart segments={donutCategorie} emptyMessage="Aucune catégorie." />
            </ChartCard>
            <ChartCard title="Évolution mensuelle" icon={LineChart}>
              <BarChartSimple data={monthlyChart} emptyMessage="Pas encore de données mensuelles." compact />
            </ChartCard>
          </div>
          <section className="dpp-block">
            <ChartCard title="Top dépenses" icon={TrendingDown} className="dpp-top-depenses">
              <BarChartSimple data={topDepensesChart} emptyMessage="Aucune dépense." compact />
            </ChartCard>
          </section>
        </div>
      )}

      {/* ── Projets liste ── */}
      {view === 'projets' && !selectedProject && (
        <div className="dpp-view dpp-fade-in">
          <SectionHeader
            icon={FolderKanban}
            title="Liste des projets"
            subtitle={`${summaries.length} projet(s) chantier`}
            action={(
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => exportAllProjectsExcel(summaries)}>
                <FileSpreadsheet size={14} /> Export Excel
              </button>
            )}
          />
          <div className="dpp-table-card card dpp-block">
            <div className="table-wrap dpp-table-wrap">
              <table className="data-table dpp-table">
                <thead>
                  <tr>
                    <th>Projet</th><th>Chef de projet</th><th>Budget</th><th>Total dépenses</th>
                    <th>Commandé</th><th>Payé</th><th>Reste budget</th><th>Nb dép.</th><th>Fourn.</th><th>Statut</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {summaries.map((p) => (
                    <tr key={p.id}>
                      <td><strong>{p.nom}</strong></td>
                      <td>{p.chef_projet}</td>
                      <td>{p.budget_approuve ? formatMAD(p.budget_approuve) : '—'}</td>
                      <td className="dpp-num">{formatMAD(p.total_depenses)}</td>
                      <td>{formatMAD(p.montant_commande)}</td>
                      <td>{formatMAD(p.montant_paye)}</td>
                      <td>{p.reste_budget != null ? formatMAD(p.reste_budget) : '—'}</td>
                      <td>{p.nb_depenses}</td>
                      <td>{p.nb_fournisseurs}</td>
                      <td><span className="badge badge-blue">{p.statut}</span></td>
                      <td>
                        <div style={{ display: 'flex', gap: 3 }}>
                          <button type="button" className="btn btn-secondary btn-sm" title="Voir" onClick={() => { setSelectedProject(p); setView('projets'); }}>
                            <Eye size={13} />
                          </button>
                          <button type="button" className="btn btn-ghost btn-sm" title="PDF" onClick={() => exportProjectExpensesPdf({ project: p, expenses: expenses.filter((e) => e.project_id === p.id) })}>
                            <Download size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Fiche projet ── */}
      {view === 'projets' && selectedProject && detail && (
        <div className="dpp-view dpp-fade-in dpp-project-detail">
          <button type="button" className="btn btn-secondary btn-sm dpp-back-btn" onClick={() => setSelectedProject(null)}>
            <ArrowLeft size={14} /> Retour à la liste
          </button>

          <header className="dpp-project-hero card dpp-block">
            <div className="dpp-project-hero-top">
              <div>
                <p className="dpp-project-hero-label">Fiche projet</p>
                <h2 className="dpp-project-hero-title">{selectedProject.nom}</h2>
              </div>
              <div className="dpp-project-hero-actions">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => exportProjectExpensesPdf({ project: selectedProject, expenses: detail.expenses })}>
                  <Download size={14} /> PDF
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => exportProjectExpensesExcel({ project: selectedProject, expenses: detail.expenses })}>
                  <FileSpreadsheet size={14} /> Excel
                </button>
              </div>
            </div>
            <div className="dpp-stat-grid">
              <StatMiniCard icon={User} label="Chef de projet" value={selectedProject.responsable || selectedProject.chef_projet || '—'} />
              <StatMiniCard icon={Wallet} label="Budget" value={formatMAD(detail.budget)} />
              <StatMiniCard icon={TrendingDown} label="Total dépenses" value={formatMAD(detail.total)} highlight />
              <StatMiniCard icon={ShoppingCart} label="Commandé" value={formatMAD(selectedProject.montant_commande)} />
              <StatMiniCard icon={CreditCard} label="Payé" value={formatMAD(selectedProject.montant_paye)} />
              <StatMiniCard icon={Target} label="Reste budget" value={detail.reste != null ? formatMAD(detail.reste) : '—'} />
            </div>
          </header>

          <section className="dpp-block">
            <SectionHeader icon={CreditCard} title="Historique des dépenses" subtitle={`${detail.expenses.length} opération(s)`} />
            <div className="dpp-table-card card">
              <div className="table-wrap dpp-table-wrap dpp-table-wrap--scroll">
                <table className="data-table dpp-table dpp-table--compact">
                  <thead>
                    <tr><th>Date</th><th>Origine</th><th>Élément</th><th>Fournisseur</th><th>Montant</th></tr>
                  </thead>
                  <tbody>
                    {detail.expenses.map((e) => (
                      <tr key={e.id}>
                        <td>{fmtDate(e.date_depense)}</td>
                        <td>{e.origine_label}</td>
                        <td>{e.element_depense}</td>
                        <td>{e.fournisseur || '—'}</td>
                        <td className="dpp-num">{formatMAD(e.montant)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <div className="dpp-detail-side-grid dpp-block">
            <CollapsibleCard title="Fournisseurs" icon={Users} count={detail.fournisseurs.length} defaultOpen>
              <ScrollableSearchList
                items={detail.fournisseurs}
                placeholder="Rechercher un fournisseur…"
                emptyLabel="Aucun fournisseur"
              />
            </CollapsibleCard>
            <CollapsibleCard title="Par catégorie" icon={Tags} count={detail.categorieChart.length} defaultOpen={false}>
              <FinanceDonutChart
                segments={detail.categorieChart.map((s, i) => ({ ...s, color: CHART_COLORS[i % CHART_COLORS.length] }))}
                emptyMessage="—"
              />
            </CollapsibleCard>
          </div>
        </div>
      )}

      {/* ── Dépenses ── */}
      {view === 'depenses' && (
        <div className="dpp-view dpp-fade-in">
          <SectionHeader icon={CreditCard} title="Toutes les dépenses" subtitle="Journal complet des opérations" />
          <div className="card finance-toolbar dpp-block" style={{ padding: '14px 20px' }}>
            <div className="finance-toolbar-inner">
              <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher référence, projet, fournisseur…"
                  style={{ ...INPUT_STYLE, paddingLeft: 32 }}
                />
              </div>
              <select value={filterOrigine} onChange={(e) => setFilterOrigine(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 200 }}>
                <option value="">Toutes origines</option>
                {Object.entries(ORIGINE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <span className="text-muted" style={{ fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>{filteredExpenses.length} résultat(s)</span>
            </div>
          </div>
          <div className="dpp-table-card card dpp-block">
            <div className="table-wrap dpp-table-wrap dpp-table-wrap--scroll-lg">
              <table className="data-table dpp-table">
                <thead>
                  <tr>
                    <th>Date</th><th>Projet</th><th>Origine</th><th>Élément</th><th>Description</th>
                    <th>Fournisseur</th><th>Montant</th><th>Statut</th><th>Observation</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredExpenses.map((e) => (
                    <tr key={e.id}>
                      <td>{fmtDate(e.date_depense)}</td>
                      <td>
                        {e.project_nom || e.project_name_raw || '—'}
                        {e.project_match_status === 'needs_manual' && (
                          <span className="badge badge-orange dpp-badge-inline">À associer</span>
                        )}
                      </td>
                      <td>{e.origine_label}</td>
                      <td>{e.element_depense}</td>
                      <td className="dpp-cell-muted">{e.description || '—'}</td>
                      <td>{e.fournisseur || '—'}</td>
                      <td className="dpp-num"><strong>{formatMAD(e.montant)}</strong></td>
                      <td><span className="badge badge-grey">{e.statut}</span></td>
                      <td className="dpp-cell-muted">{e.observation || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <ImportModal open={showImport} onClose={() => setShowImport(false)} projects={projects} onDone={() => reload()} />
      <ExpenseFormModal open={showForm} onClose={() => setShowForm(false)} projects={projects} onSave={async (f) => { await create(f); reload(false); }} />

      <style>{`
        .dpp-root { --dpp-gap: 32px; --dpp-radius: 12px; padding-bottom: 48px; }
        .dpp-block { margin-bottom: var(--dpp-gap); }
        .dpp-block:last-child { margin-bottom: 0; }
        .dpp-fade-in { animation: dppFadeIn 0.28s ease; }
        @keyframes dppFadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

        /* Tabs */
        .dpp-tabs {
          display: flex; gap: 6px; margin-bottom: var(--dpp-gap);
          padding: 6px; background: #F4F5F7; border-radius: 14px;
          flex-wrap: wrap;
        }
        .dpp-tab {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 12px 20px; border: none; border-radius: 10px;
          background: transparent; color: var(--text-2);
          font-size: 0.875rem; font-weight: 600; cursor: pointer;
          transition: background 0.2s ease, color 0.2s ease, box-shadow 0.2s ease, transform 0.15s ease;
        }
        .dpp-tab:hover { background: rgba(255,255,255,0.7); color: var(--text); }
        .dpp-tab.active {
          background: #fff; color: var(--red);
          box-shadow: 0 2px 12px rgba(0,0,0,0.06);
        }
        .dpp-tab.active svg { color: var(--red); }

        /* Section headers */
        .dpp-section-header {
          display: flex; align-items: flex-start; justify-content: space-between;
          gap: 16px; margin-bottom: 20px; flex-wrap: wrap;
        }
        .dpp-section-header-left { display: flex; gap: 14px; align-items: flex-start; }
        .dpp-section-icon {
          width: 40px; height: 40px; border-radius: 10px;
          background: var(--red-light); color: var(--red);
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .dpp-section-title {
          margin: 0; font-size: 1.125rem; font-weight: 800;
          font-family: var(--font-head); letter-spacing: 0.02em; color: var(--text);
        }
        .dpp-section-subtitle {
          margin: 4px 0 0; font-size: 0.8125rem; color: var(--text-3); font-weight: 400;
        }

        /* KPI grid */
        .dpp-kpi-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
        }
        .dpp-kpi {
          background: #fff; border: 1px solid var(--border);
          border-radius: var(--dpp-radius); padding: 24px 28px;
          min-height: 140px; display: flex; flex-direction: column;
          transition: box-shadow 0.22s ease, transform 0.22s ease;
        }
        .dpp-kpi:hover { box-shadow: 0 8px 28px rgba(0,0,0,0.06); transform: translateY(-2px); }
        .dpp-kpi-top { margin-bottom: 16px; }
        .dpp-kpi-icon {
          width: 44px; height: 44px; border-radius: 11px;
          display: flex; align-items: center; justify-content: center;
          background: var(--red-light); color: var(--red);
        }
        .dpp-kpi--blue .dpp-kpi-icon { background: #E3F2FD; color: #1565C0; }
        .dpp-kpi--orange .dpp-kpi-icon { background: #FFF3E0; color: #E65100; }
        .dpp-kpi--purple .dpp-kpi-icon { background: #F3E5F5; color: #6A1B9A; }
        .dpp-kpi--green .dpp-kpi-icon { background: #E8F5E9; color: #2E7D32; }
        .dpp-kpi-value {
          font-size: 1.65rem; font-weight: 800; line-height: 1.2;
          color: var(--text); letter-spacing: -0.02em;
        }
        .dpp-kpi-label {
          margin-top: 8px; font-size: 0.75rem; font-weight: 600;
          text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-3);
        }
        .dpp-kpi-sub { margin-top: 6px; font-size: 0.8125rem; color: var(--text-2); }

        /* Alert */
        .dpp-alert-card {
          display: flex; align-items: flex-start; gap: 14px;
          padding: 18px 22px; border-left: 4px solid #E65100;
          background: #FFF8F0;
        }
        .dpp-alert-card p { margin: 4px 0 0; font-size: 0.8125rem; color: var(--text-2); }

        /* Charts */
        .dpp-analyses-grid {
          display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px;
        }
        .dpp-chart-card { padding: 0; overflow: hidden; }
        .dpp-chart-card-head {
          display: flex; align-items: center; gap: 10px;
          padding: 18px 22px; border-bottom: 1px solid var(--border);
        }
        .dpp-chart-card-head h3 {
          margin: 0; font-size: 0.9375rem; font-weight: 700; color: var(--text);
        }
        .dpp-chart-card-icon { color: var(--red); opacity: 0.85; }
        .dpp-chart-card-body { padding: 20px 22px 24px; max-height: 340px; overflow: auto; }
        .dpp-top-depenses .dpp-chart-card-body { max-height: 420px; }

        .dpp-bar-chart { display: flex; flex-direction: column; gap: 14px; }
        .dpp-bar-chart--compact { gap: 10px; }
        .dpp-bar-row {
          display: grid; grid-template-columns: minmax(100px, 28%) 1fr minmax(90px, 22%);
          gap: 14px; align-items: center; font-size: 0.8125rem;
        }
        .dpp-bar-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text); font-weight: 500; }
        .dpp-bar-track { height: 10px; background: #ECEEF2; border-radius: 6px; overflow: hidden; }
        .dpp-bar-fill { height: 100%; border-radius: 6px; transition: width 0.4s ease; }
        .dpp-bar-value { text-align: right; font-size: 0.75rem; color: var(--text-2); font-weight: 600; }

        /* Tables */
        .dpp-table-card { padding: 0; overflow: hidden; }
        .dpp-table-wrap { overflow-x: auto; }
        .dpp-table-wrap--scroll { max-height: 380px; overflow-y: auto; }
        .dpp-table-wrap--scroll-lg { max-height: 560px; overflow-y: auto; }
        .dpp-table { width: 100%; border-collapse: separate; border-spacing: 0; }
        .dpp-table thead th {
          position: sticky; top: 0; z-index: 1; background: #FAFBFC;
          padding: 16px 18px; font-size: 0.68rem; font-weight: 800;
          text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-3);
          border-bottom: 1px solid var(--border); white-space: nowrap;
        }
        .dpp-table tbody td {
          padding: 16px 18px; font-size: 0.875rem;
          border-bottom: 1px solid #F0F1F4; vertical-align: middle;
        }
        .dpp-table tbody tr { transition: background 0.15s ease; }
        .dpp-table tbody tr:hover { background: #FAFBFD; }
        .dpp-table--compact tbody td { padding: 12px 16px; font-size: 0.8125rem; }
        .dpp-num { font-variant-numeric: tabular-nums; text-align: right; }
        .dpp-cell-muted { color: var(--text-3); max-width: 200px; }
        .dpp-badge-inline { margin-left: 8px; font-size: 0.65rem; }

        /* Project detail */
        .dpp-back-btn { margin-bottom: 24px; }
        .dpp-project-hero { padding: 28px 32px; }
        .dpp-project-hero-top {
          display: flex; justify-content: space-between; align-items: flex-start;
          gap: 20px; flex-wrap: wrap; margin-bottom: 28px;
        }
        .dpp-project-hero-label {
          margin: 0 0 6px; font-size: 0.7rem; font-weight: 700;
          text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-3);
        }
        .dpp-project-hero-title {
          margin: 0; font-size: 1.5rem; font-weight: 800;
          font-family: var(--font-head); letter-spacing: 0.02em;
        }
        .dpp-project-hero-actions { display: flex; gap: 8px; }
        .dpp-stat-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
        }
        .dpp-stat-card {
          background: #F8F9FB; border-radius: 10px; padding: 18px 20px;
          border: 1px solid transparent;
          transition: border-color 0.2s ease, background 0.2s ease;
        }
        .dpp-stat-card:hover { border-color: var(--border); background: #fff; }
        .dpp-stat-card--highlight { background: var(--red-light); border-color: rgba(198,40,40,0.15); }
        .dpp-stat-card-icon { color: var(--red); margin-bottom: 10px; opacity: 0.8; }
        .dpp-stat-card-label {
          font-size: 0.68rem; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.07em; color: var(--text-3); margin-bottom: 6px;
        }
        .dpp-stat-card-value { font-size: 1.125rem; font-weight: 800; color: var(--text); }

        .dpp-detail-side-grid {
          display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px;
        }

        /* Scrollable list */
        .dpp-scroll-list-toolbar {
          display: flex; align-items: center; justify-content: space-between;
          gap: 12px; margin-bottom: 12px;
        }
        .dpp-scroll-list-count { font-size: 0.75rem; color: var(--text-3); white-space: nowrap; }
        .dpp-scroll-list-items {
          list-style: none; margin: 0; padding: 0;
          max-height: 240px; overflow-y: auto;
          border: 1px solid var(--border); border-radius: 8px;
        }
        .dpp-scroll-list-items li {
          padding: 11px 14px; font-size: 0.8125rem;
          border-bottom: 1px solid #F0F1F4;
          transition: background 0.12s ease;
        }
        .dpp-scroll-list-items li:last-child { border-bottom: none; }
        .dpp-scroll-list-items li:hover { background: #FAFBFD; }
        .dpp-scroll-list-empty { color: var(--text-3); font-style: italic; }

        /* Collapsible */
        .dpp-collapsible { padding: 0; overflow: hidden; }
        .dpp-collapsible-head {
          width: 100%; display: flex; align-items: center; justify-content: space-between;
          padding: 16px 20px; border: none; background: #FAFBFC; cursor: pointer;
          font-size: 0.9375rem; font-weight: 700; color: var(--text);
          transition: background 0.15s ease;
        }
        .dpp-collapsible-head:hover { background: #F4F5F7; }
        .dpp-collapsible-head-left { display: flex; align-items: center; gap: 10px; }
        .dpp-collapsible-badge {
          font-size: 0.7rem; font-weight: 700; padding: 2px 8px;
          border-radius: 20px; background: var(--red-light); color: var(--red);
        }
        .dpp-collapsible-body { padding: 18px 20px 22px; }

        .finance-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

        /* Responsive */
        @media (max-width: 1600px) {
          .dpp-kpi-grid { grid-template-columns: repeat(3, 1fr); gap: 18px; }
          .dpp-kpi-value { font-size: 1.45rem; }
        }
        @media (max-width: 1440px) {
          .dpp-kpi-grid { grid-template-columns: repeat(2, 1fr); }
          .dpp-stat-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 1024px) {
          .dpp-analyses-grid, .dpp-detail-side-grid { grid-template-columns: 1fr; }
          .dpp-kpi-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 768px) {
          .dpp-root { --dpp-gap: 24px; }
          .dpp-kpi-grid, .dpp-stat-grid { grid-template-columns: 1fr; }
          .dpp-tab { padding: 10px 14px; font-size: 0.8125rem; }
          .dpp-bar-row { grid-template-columns: 80px 1fr 72px; gap: 8px; }
          .finance-form-grid { grid-template-columns: 1fr; }
          .dpp-project-hero { padding: 20px; }
        }
      `}</style>
    </div>
  );
}

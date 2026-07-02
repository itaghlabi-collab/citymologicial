/**
 * DepensesParProjet.jsx — Module Finance : Dépenses par projet
 */
import { useState, useRef } from 'react';
import {
  Loader2, RefreshCw, Plus, Upload, Eye, Download, FileSpreadsheet,
  Building2, TrendingDown, Calendar, Target, ArrowLeft, BarChart3,
  AlertTriangle, X,
} from 'lucide-react';
import { useProjectExpenses } from '../../hooks/useProjectExpenses';
import { KpiCard, formatMAD, Modal, INPUT_STYLE, SELECT_STYLE, TEXTAREA_STYLE, MODES_PAIEMENT } from './shared.jsx';
import { FinanceDonutChart } from './FinanceCharts.jsx';
import { importDepenseChantierFile } from '../../services/finance/projectExpenseImport';
import { filterProjectExpenses, ORIGINE_LABELS } from '../../services/finance/projectExpenses';
import { getProjectDetailData } from '../../services/finance/projectExpenseData';
import { exportProjectExpensesPdf } from '../../services/finance/projectExpensePdf';
import { exportProjectExpensesExcel, exportAllProjectsExcel } from '../../services/finance/projectExpenseExport';

const CHART_COLORS = ['#C62828', '#1565C0', '#2E7D32', '#E65100', '#6A1B9A', '#00838F', '#AD1457', '#558B2F'];

function fmtDate(d) {
  if (!d) return '—';
  const [y, m, day] = String(d).slice(0, 10).split('-');
  return `${day}/${m}/${y}`;
}

function BarChartSimple({ data = [], emptyMessage }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  if (!data.length) return <div className="finance-chart-empty">{emptyMessage}</div>;
  return (
    <div className="dep-proj-bar-chart">
      {data.map((d, i) => (
        <div key={d.label} className="dep-proj-bar-row">
          <div className="dep-proj-bar-label" title={d.label}>{d.label}</div>
          <div className="dep-proj-bar-track">
            <div
              className="dep-proj-bar-fill"
              style={{ width: `${(d.value / max) * 100}%`, background: CHART_COLORS[i % CHART_COLORS.length] }}
            />
          </div>
          <div className="dep-proj-bar-value">{formatMAD(d.value)}</div>
        </div>
      ))}
    </div>
  );
}

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

export default function DepensesParProjet() {
  const {
    configured, loading, syncing, error, projects, expenses, dashboard, summaries,
    unmatched, reload, create, syncNow, erpContext,
  } = useProjectExpenses();

  const [view, setView] = useState('dashboard');
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

  if (loading) {
    return (
      <div className="finance-dashboard-loading">
        <Loader2 size={28} className="cin-spin" />
        <span>Chargement des dépenses par projet…</span>
      </div>
    );
  }

  return (
    <div className="depenses-par-projet animate-fade-in">
      <div className="page-header flex-between finance-page-header">
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

      {error && <div className="card finance-dash-alert">{error}</div>}
      {!configured && (
        <div className="card finance-dash-alert">Supabase non configuré.</div>
      )}

      {unmatched.length > 0 && (
        <div className="card finance-dash-alert" style={{ marginBottom: 12 }}>
          <AlertTriangle size={16} /> {unmatched.length} dépense(s) — <strong>Projet à associer manuellement</strong>
        </div>
      )}

      <div className="dep-proj-tabs">
        {[
          ['dashboard', 'Tableau de bord'],
          ['projets', 'Projets'],
          ['depenses', 'Dépenses'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`dep-proj-tab ${view === id ? 'active' : ''}`}
            onClick={() => { setView(id); setSelectedProject(null); }}
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'dashboard' && (
        <>
          <div className="stat-grid finance-kpi-grid">
            <KpiCard icon={<Building2 size={18} />} label="Projets" value={dashboard.projectCount} color="blue" />
            <KpiCard icon={<TrendingDown size={18} />} label="Dépenses totales" value={formatMAD(dashboard.totalDepenses)} color="red" />
            <KpiCard icon={<Calendar size={18} />} label="Dépenses du mois" value={formatMAD(dashboard.depensesMois)} color="orange" />
            <KpiCard icon={<Target size={18} />} label="Projet le plus dépensier" value={dashboard.topProject || '—'} sub={dashboard.topProject ? formatMAD(dashboard.topProjectAmount) : ''} color="purple" />
            <KpiCard icon={<BarChart3 size={18} />} label="Budget consommé" value={formatMAD(dashboard.budgetConsomme)} color="red" />
            <KpiCard icon={<Target size={18} />} label="Budget restant" value={dashboard.totalBudget ? formatMAD(dashboard.budgetRestant) : '—'} color="green" />
          </div>

          <div className="finance-dash-grid" style={{ marginTop: 16 }}>
            <div className="card finance-dash-card">
              <h3>Dépenses par projet</h3>
              <BarChartSimple data={dashboard.projectChart} emptyMessage="Aucune dépense enregistrée." />
            </div>
            <div className="card finance-dash-card">
              <h3>Répartition par fournisseur</h3>
              <FinanceDonutChart segments={donutFournisseur} emptyMessage="Aucun fournisseur." />
            </div>
            <div className="card finance-dash-card">
              <h3>Répartition par catégorie</h3>
              <FinanceDonutChart segments={donutCategorie} emptyMessage="Aucune catégorie." />
            </div>
          </div>
        </>
      )}

      {view === 'projets' && !selectedProject && (
        <>
          <div className="flex-between" style={{ marginBottom: 12 }}>
            <span className="text-muted">{summaries.length} projet(s)</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => exportAllProjectsExcel(summaries)}>
              <FileSpreadsheet size={14} /> Export Excel
            </button>
          </div>
          <div className="table-wrap">
            <table className="data-table">
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
                    <td>{formatMAD(p.total_depenses)}</td>
                    <td>{formatMAD(p.montant_commande)}</td>
                    <td>{formatMAD(p.montant_paye)}</td>
                    <td>{p.reste_budget != null ? formatMAD(p.reste_budget) : '—'}</td>
                    <td>{p.nb_depenses}</td>
                    <td>{p.nb_fournisseurs}</td>
                    <td><span className="badge badge-blue">{p.statut}</span></td>
                    <td>
                      <button type="button" className="btn-icon" title="Voir" onClick={() => { setSelectedProject(p); setView('projets'); }}>
                        <Eye size={15} />
                      </button>
                      <button type="button" className="btn-icon" title="PDF" onClick={() => exportProjectExpensesPdf({ project: p, expenses: expenses.filter((e) => e.project_id === p.id) })}>
                        <Download size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {view === 'projets' && selectedProject && detail && (
        <div>
          <button type="button" className="btn btn-secondary btn-sm" style={{ marginBottom: 12 }} onClick={() => setSelectedProject(null)}>
            <ArrowLeft size={14} /> Retour liste
          </button>
          <div className="card" style={{ marginBottom: 16, padding: 16 }}>
            <h2 style={{ margin: '0 0 8px' }}>{selectedProject.nom}</h2>
            <div className="dep-proj-detail-grid">
              <div><span className="text-muted">Chef de projet</span><br />{selectedProject.responsable || '—'}</div>
              <div><span className="text-muted">Budget</span><br />{formatMAD(detail.budget)}</div>
              <div><span className="text-muted">Total dépenses</span><br /><strong>{formatMAD(detail.total)}</strong></div>
              <div><span className="text-muted">Reste budget</span><br />{detail.reste != null ? formatMAD(detail.reste) : '—'}</div>
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => exportProjectExpensesPdf({ project: selectedProject, expenses: detail.expenses })}>
                <Download size={14} /> Export PDF
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => exportProjectExpensesExcel({ project: selectedProject, expenses: detail.expenses })}>
                <FileSpreadsheet size={14} /> Export Excel
              </button>
            </div>
          </div>

          <div className="finance-dash-grid">
            <div className="card finance-dash-card">
              <h3>Historique des dépenses ({detail.expenses.length})</h3>
              <div className="table-wrap" style={{ maxHeight: 320, overflow: 'auto' }}>
                <table className="data-table data-table-sm">
                  <thead><tr><th>Date</th><th>Origine</th><th>Élément</th><th>Fournisseur</th><th>Montant</th></tr></thead>
                  <tbody>
                    {detail.expenses.map((e) => (
                      <tr key={e.id}>
                        <td>{fmtDate(e.date_depense)}</td>
                        <td>{e.origine_label}</td>
                        <td>{e.element_depense}</td>
                        <td>{e.fournisseur || '—'}</td>
                        <td>{formatMAD(e.montant)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="card finance-dash-card">
              <h3>Fournisseurs ({detail.fournisseurs.length})</h3>
              <ul className="dep-proj-list">{detail.fournisseurs.map((f) => <li key={f}>{f}</li>)}</ul>
              <h3 style={{ marginTop: 16 }}>Par catégorie</h3>
              <FinanceDonutChart
                segments={detail.categorieChart.map((s, i) => ({ ...s, color: CHART_COLORS[i % CHART_COLORS.length] }))}
                emptyMessage="—"
              />
            </div>
          </div>
        </div>
      )}

      {view === 'depenses' && (
        <>
          <div className="finance-filters" style={{ marginBottom: 12 }}>
            <input
              className="search-input"
              placeholder="Rechercher…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select value={filterOrigine} onChange={(e) => setFilterOrigine(e.target.value)} style={SELECT_STYLE}>
              <option value="">Toutes origines</option>
              {Object.entries(ORIGINE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <span className="text-muted">{filteredExpenses.length} résultat(s)</span>
          </div>
          <div className="table-wrap">
            <table className="data-table">
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
                        <span className="badge badge-orange" style={{ marginLeft: 6 }}>À associer</span>
                      )}
                    </td>
                    <td>{e.origine_label}</td>
                    <td>{e.element_depense}</td>
                    <td>{e.description || '—'}</td>
                    <td>{e.fournisseur || '—'}</td>
                    <td><strong>{formatMAD(e.montant)}</strong></td>
                    <td><span className="badge badge-grey">{e.statut}</span></td>
                    <td>{e.observation || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <ImportModal open={showImport} onClose={() => setShowImport(false)} projects={projects} onDone={() => reload()} />
      <ExpenseFormModal open={showForm} onClose={() => setShowForm(false)} projects={projects} onSave={async (f) => { await create(f); reload(false); }} />

      <style>{`
        .dep-proj-tabs { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
        .dep-proj-tab { padding: 8px 16px; border: 1.5px solid var(--border); border-radius: 8px; background: #fff; cursor: pointer; font-size: 0.85rem; }
        .dep-proj-tab.active { background: var(--red-light); border-color: var(--red); color: var(--red); font-weight: 600; }
        .dep-proj-bar-chart { display: flex; flex-direction: column; gap: 8px; }
        .dep-proj-bar-row { display: grid; grid-template-columns: 120px 1fr 100px; gap: 8px; align-items: center; font-size: 0.8rem; }
        .dep-proj-bar-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .dep-proj-bar-track { height: 8px; background: #ECEEF2; border-radius: 4px; overflow: hidden; }
        .dep-proj-bar-fill { height: 100%; border-radius: 4px; }
        .dep-proj-bar-value { text-align: right; font-size: 0.75rem; color: var(--text-2); }
        .dep-proj-detail-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; }
        .dep-proj-list { margin: 0; padding-left: 18px; font-size: 0.85rem; }
        .finance-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        @media (max-width: 768px) { .finance-form-grid { grid-template-columns: 1fr; } .dep-proj-bar-row { grid-template-columns: 80px 1fr 70px; } }
      `}</style>
    </div>
  );
}

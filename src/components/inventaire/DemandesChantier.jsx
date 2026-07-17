/**
 * DemandesChantier.jsx — Demandes matériel chantier (Inventaire & Dépôt)
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ClipboardList, Plus, Search, RefreshCw, Loader2, Eye, Edit2, Trash2,
  Download, CheckCircle, Truck, Package, X,
} from 'lucide-react';
import { listProjects } from '../../services/projects/projects';
import { listStockArticles } from '../../services/inventaire/stockArticles';
import {
  SITE_REQUEST_STATUTS,
  siteRequestStatutColor,
  siteRequestPreparationStatut,
  siteRequestLivraisonStatut,
} from '../../constants/siteMaterialRequests';
import {
  listSiteMaterialRequests,
  getSiteMaterialRequest,
  createSiteMaterialRequest,
  updateSiteMaterialRequest,
  submitSiteMaterialRequest,
  prepareSiteMaterialRequest,
  requestDgValidation,
  validateSiteRequestDg,
  markSiteRequestReady,
  deliverSiteMaterialRequest,
  cancelSiteMaterialRequest,
  deleteSiteMaterialRequest,
} from '../../services/inventaire/siteMaterialRequests';
import { generateSiteRequestPdf } from '../../services/inventaire/siteRequestPdf';
import SiteRequestForm, { buildInitialLines } from './SiteRequestForm.jsx';
import SiteRequestFormPage from './SiteRequestFormPage.jsx';
import ArticleScanBar from './ArticleScanBar.jsx';
import { useArticleScanner } from '../../hooks/useArticleScanner';
import {
  matchRequestLineByArticle,
  incrementPreparedLine,
  isLineFullyPrepared,
} from '../../services/inventaire/articleScanWorkflow';
import { KpiCard, INPUT_STYLE, SELECT_STYLE } from './shared.jsx';

const EMPTY_FORM = {
  project_id: '', project_ref: '', project_name: '', client_name: '',
  chef_projet: '', chef_chantier: '',
  date_demande: new Date().toISOString().slice(0, 10),
  date_souhaitee: '', priorite: 'Normale', observation: '',
};

function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR'); } catch { return d; }
}

function fmtDateTime(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleString('fr-FR'); } catch { return d; }
}


function prepBadgeClass(statut) {
  if (['prete', 'validee_dg', 'livree'].includes(statut)) return 'badge-green';
  if (['en_preparation', 'preparation_partielle', 'en_attente_dg'].includes(statut)) return 'badge-orange';
  if (statut === 'soumise') return 'badge-blue';
  return 'badge-grey';
}

function livBadgeClass(statut) {
  if (statut === 'livree') return 'badge-green';
  if (['prete', 'validee_dg'].includes(statut)) return 'badge-blue';
  return 'badge-grey';
}

function getRowActions(r, handlers, { embedded = false } = {}) {
  const actions = [
    { key: 'view', label: 'Voir', icon: Eye, onClick: () => handlers.openDetail(r.id) },
    { key: 'pdf', label: 'Télécharger PDF', icon: Download, onClick: () => handlers.handlePdf(r.id) },
  ];
  if (r.statut === 'brouillon') {
    actions.push({ key: 'edit', label: 'Modifier', icon: Edit2, onClick: () => handlers.openEdit(r.id) });
  }
  if (embedded) return actions;
  if (r.statut === 'soumise') {
    actions.push({ key: 'prepare', label: 'Préparer', icon: Package, onClick: () => handlers.openDetail(r.id) });
  }
  if (['en_preparation', 'preparation_partielle', 'en_attente_dg'].includes(r.statut)) {
    actions.push({ key: 'validate', label: 'Valider', icon: CheckCircle, onClick: () => handlers.openDetail(r.id) });
  }
  if (['prete', 'validee_dg'].includes(r.statut)) {
    actions.push({ key: 'deliver', label: 'Livrer', icon: Truck, onClick: () => handlers.openDetail(r.id) });
  }
  return actions;
}

function projectFormFromProjet(projet) {
  if (!projet) return {};
  return {
    project_id: projet.id,
    project_ref: projet.ref || '',
    project_name: projet.nom || projet.name || '',
    client_name: projet.client || projet.client_nom || '',
    chef_projet: projet.chef_projet || projet.responsable || '',
    chef_chantier: projet.chef_chantier || '',
  };
}

export default function DemandesChantier({ projet, embedded = false }) {
  const embeddedProjectId = embedded && projet?.id ? String(projet.id) : null;
  const [requests, setRequests] = useState([]);
  const [projects, setProjects] = useState([]);
  const [stockArticles, setStockArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statutFilter, setStatutFilter] = useState('');
  const [prioriteFilter, setPrioriteFilter] = useState('');
  const [view, setView] = useState('list');
  const [editId, setEditId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [lines, setLines] = useState(() => buildInitialLines());

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [rows, projs, arts] = await Promise.all([
        listSiteMaterialRequests({
          statut: statutFilter,
          priorite: prioriteFilter,
          projectId: embeddedProjectId || undefined,
        }),
        embedded ? Promise.resolve(projet ? [projet] : []) : listProjects(),
        listStockArticles(),
      ]);
      setRequests(rows);
      setProjects(projs || []);
      setStockArticles(arts || []);
    } catch (err) {
      setError(err.message || 'Erreur de chargement.');
    } finally {
      setLoading(false);
    }
  }, [statutFilter, prioriteFilter, embeddedProjectId, embedded, projet]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return requests;
    return requests.filter((r) =>
      (r.ref || '').toLowerCase().includes(q)
      || (r.project_name || '').toLowerCase().includes(q)
      || (r.client_name || '').toLowerCase().includes(q)
      || (r.chef_chantier || '').toLowerCase().includes(q)
      || (r.chef_projet || '').toLowerCase().includes(q),
    );
  }, [requests, search]);

  const stats = useMemo(() => ({
    total: requests.length,
    soumises: requests.filter((r) => r.statut === 'soumise').length,
    preparation: requests.filter((r) => ['en_preparation', 'preparation_partielle'].includes(r.statut)).length,
    pretes: requests.filter((r) => r.statut === 'prete').length,
  }), [requests]);

  function openCreate() {
    setEditId(null);
    const base = { ...EMPTY_FORM, date_demande: new Date().toISOString().slice(0, 10) };
    if (embedded && projet) Object.assign(base, projectFormFromProjet(projet));
    setForm(base);
    setLines(buildInitialLines());
    setError('');
    setView('form');
  }

  async function openEdit(id) {
    setSaving(true);
    try {
      const req = await getSiteMaterialRequest(id);
      setEditId(id);
      setForm({
        ref: req.ref,
        project_id: req.project_id || '',
        project_ref: req.project_ref,
        project_name: req.project_name,
        client_name: req.client_name,
        chef_projet: req.chef_projet,
        chef_chantier: req.chef_chantier,
        date_demande: req.date_demande,
        date_souhaitee: req.date_souhaitee,
        priorite: req.priorite,
        observation: req.observation,
      });
      setLines(buildInitialLines(req.lines));
      setError('');
      setView('form');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function openDetail(id) {
    setSaving(true);
    try {
      setDetail(await getSiteMaterialRequest(id));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function closeForm() {
    setView('list');
    setEditId(null);
    setError('');
  }

  async function handleSave(submitAfter = false) {
    if (!form.project_id) {
      setError('Sélectionnez un projet.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = { ...form };
      let req;
      if (editId) {
        req = await updateSiteMaterialRequest(editId, payload, lines);
      } else {
        req = await createSiteMaterialRequest(payload, lines);
        setEditId(req.id);
      }
      if (submitAfter) {
        await submitSiteMaterialRequest(req.id);
        if (embedded) {
          alert('Besoin matériel soumis — la demande a été transmise au magasinier.');
        }
      }
      closeForm();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function runAction(fn) {
    if (!detail) return;
    setSaving(true);
    setError('');
    try {
      const updated = await fn(detail.id);
      setDetail(updated);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Supprimer cette demande brouillon ?')) return;
    setSaving(true);
    try {
      await deleteSiteMaterialRequest(id);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handlePdf(id) {
    setSaving(true);
    setError('');
    try {
      const full = await getSiteMaterialRequest(id);
      await generateSiteRequestPdf(full);
    } catch (err) {
      setError(err.message || 'Erreur lors de la génération du PDF.');
    } finally {
      setSaving(false);
    }
  }

  const rowHandlers = { openDetail, openEdit, handlePdf };

  function updateDetailLine(lineId, patch) {
    setDetail((prev) => ({
      ...prev,
      lines: prev.lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l)),
    }));
  }

  const canScanPreparation = detail
    && !embedded
    && ['soumise', 'en_preparation', 'preparation_partielle', 'en_attente_dg', 'validee_dg'].includes(detail.statut)
    && !['prete', 'livree', 'annulee'].includes(detail.statut);

  const detailRef = useRef(detail);
  detailRef.current = detail;

  const {
    handleScan: handlePrepScan,
    scanning: prepScanning,
    scanError: prepScanError,
    scanSuccess: prepScanSuccess,
  } = useArticleScanner({
    articles: stockArticles,
    validateFound: (article) => {
      const d = detailRef.current;
      if (!d) return false;
      const active = (d.lines || []).filter((l) => Number(l.quantite_demandee) > 0);
      return !!matchRequestLineByArticle(active, article);
    },
    onFound: (article) => {
      const d = detailRef.current;
      if (!d) return;
      const active = (d.lines || []).filter((l) => Number(l.quantite_demandee) > 0);
      const line = matchRequestLineByArticle(active, article);
      if (!line) return;
      const updated = incrementPreparedLine(line);
      updateDetailLine(line.id, { quantite_preparee: updated.quantite_preparee });
    },
  });

  if (view === 'form') {
    return (
      <SiteRequestFormPage
        editId={editId}
        form={form}
        setForm={setForm}
        lines={lines}
        setLines={setLines}
        projects={projects}
        stockArticles={stockArticles}
        saving={saving}
        error={error}
        onBack={closeForm}
        onSave={handleSave}
        lockProject={embedded && !!projet?.id}
        backLabel={embedded ? 'Retour aux besoins matériel' : 'Retour aux demandes'}
        formTitle={embedded ? 'Nouveau besoin matériel' : undefined}
        formSubtitle={embedded ? 'Demande transmise au magasinier — même workflow que Inventaire & Dépôt → Demandes chantier' : undefined}
      />
    );
  }

  return (
    <div className={embedded ? 'inv-dc-page inv-dc-page--embedded' : 'animate-fade-in inv-dc-page'}>
      {!embedded && (
        <div className="page-header flex-between finance-page-header">
          <div>
            <h1 className="page-title">DEMANDES CHANTIER</h1>
            <p className="page-subtitle">Demandes de matériel, consommables, équipements et EPI — remplace les fiches papier.</p>
          </div>
          <div className="finance-page-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={load} disabled={loading}>
              <RefreshCw size={14} /> Actualiser
            </button>
            <button type="button" className="btn btn-primary" onClick={openCreate}>
              <Plus size={15} /> Nouvelle demande
            </button>
          </div>
        </div>
      )}

      {embedded && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={load} disabled={loading} style={{ marginLeft: 'auto' }}>
            <RefreshCw size={13} /> Actualiser
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={openCreate}>
            <Plus size={13} /> Ajouter un besoin matériel
          </button>
        </div>
      )}

      {!embedded && (
        <div className="stat-grid finance-kpi-grid" style={{ marginBottom: 16 }}>
          <KpiCard icon={<ClipboardList size={17} />} label="Total demandes" value={stats.total} color="grey" />
          <KpiCard icon={<Package size={17} />} label="Soumises" value={stats.soumises} color="blue" />
          <KpiCard icon={<Loader2 size={17} />} label="En préparation" value={stats.preparation} color="orange" />
          <KpiCard icon={<CheckCircle size={17} />} label="Prêtes" value={stats.pretes} color="green" />
        </div>
      )}

      <div className="card finance-toolbar inv-dc-toolbar" style={{ marginBottom: 16, padding: '14px 20px' }}>
        <div className="finance-toolbar-inner" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: 280 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text-3)' }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher…" style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
          </div>
          <select value={statutFilter} onChange={(e) => setStatutFilter(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 180 }}>
            <option value="">Tous statuts</option>
            {SITE_REQUEST_STATUTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select value={prioriteFilter} onChange={(e) => setPrioriteFilter(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 140 }}>
            <option value="">Toutes priorités</option>
            <option value="Normale">Normale</option>
            <option value="Urgente">Urgente</option>
            <option value="Critique">Critique</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="card" style={{ marginBottom: 16, color: 'var(--red)', padding: 14, fontSize: '0.86rem' }}>{error}</div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><Loader2 size={24} className="spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ padding: embedded ? 28 : 40, textAlign: 'center', color: 'var(--text-3)' }}>
          {embedded
            ? 'Aucun besoin matériel pour ce projet. Cliquez sur « Ajouter un besoin matériel ».'
            : 'Aucune demande chantier. Créez la première demande de matériel.'}
        </div>
      ) : (
        <div className="card inv-dc-list-card" style={{ padding: 0 }}>
          <div className="table-wrap inv-dc-desktop" style={{ overflowX: 'auto' }}>
            <table style={{ minWidth: embedded ? 900 : 1100 }}>
              <thead>
                <tr>
                  <th>Référence</th>
                  {!embedded && <th>Projet</th>}
                  <th>Client</th>
                  <th>Nb articles</th>
                  <th>Qté totale</th>
                  <th>Magasinier</th>
                  <th>Validation DG</th>
                  <th>Date souhaitée</th>
                  <th>Préparation</th>
                  <th>Livraison</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td data-label="Référence"><strong>{r.ref}</strong></td>
                    {!embedded && <td data-label="Projet">{r.project_name || '—'}</td>}
                    <td data-label="Client">{r.client_name || '—'}</td>
                    <td data-label="Nb articles">{r.distinct_articles}</td>
                    <td data-label="Qté totale">{r.total_articles}</td>
                    <td data-label="Magasinier">{r.prepared_by_name || '—'}</td>
                    <td data-label="Validation DG">{r.validated_dg_name || (r.requires_dg ? 'En attente' : '—')}</td>
                    <td data-label="Date souhaitée">{fmtDate(r.date_souhaitee)}</td>
                    <td data-label="Préparation">
                      <span className={`badge ${prepBadgeClass(r.statut)}`}>
                        {siteRequestPreparationStatut(r.statut)}
                      </span>
                    </td>
                    <td data-label="Livraison">
                      <span className={`badge ${livBadgeClass(r.statut)}`}>
                        {siteRequestLivraisonStatut(r.statut)}
                      </span>
                    </td>
                    <td data-label="Statut">
                      <span className="badge" style={{ background: `${siteRequestStatutColor(r.statut)}22`, color: siteRequestStatutColor(r.statut) }}>
                        {r.statutLabel}
                      </span>
                    </td>
                    <td data-label="Actions">
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, minWidth: 120 }}>
                        {getRowActions(r, rowHandlers, { embedded }).map((action) => {
                          const Icon = action.icon;
                          return (
                            <button
                              key={action.key}
                              type="button"
                              className="btn btn-ghost btn-sm"
                              title={action.label}
                              onClick={action.onClick}
                              disabled={saving}
                            >
                              <Icon size={13} />
                            </button>
                          );
                        })}
                        {r.statut === 'brouillon' && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ color: 'var(--red)' }}
                            title="Supprimer"
                            onClick={() => handleDelete(r.id)}
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="inv-dc-mobile" aria-label="Liste demandes chantier">
            {filtered.map((r) => (
              <article key={r.id} className="inv-dc-card">
                <header className="inv-dc-card-head">
                  <div className="inv-dc-card-ref">{r.ref}</div>
                  <span
                    className="badge"
                    style={{ background: `${siteRequestStatutColor(r.statut)}22`, color: siteRequestStatutColor(r.statut) }}
                  >
                    {r.statutLabel}
                  </span>
                </header>
                {!embedded && (
                  <div className="inv-dc-card-title">{r.project_name || '—'}</div>
                )}
                <dl className="inv-dc-card-fields">
                  <div className="inv-dc-field">
                    <dt>Client</dt>
                    <dd>{r.client_name || '—'}</dd>
                  </div>
                  <div className="inv-dc-field-grid">
                    <div className="inv-dc-field">
                      <dt>Nb articles</dt>
                      <dd>{r.distinct_articles ?? '—'}</dd>
                    </div>
                    <div className="inv-dc-field">
                      <dt>Qté totale</dt>
                      <dd>{r.total_articles ?? '—'}</dd>
                    </div>
                  </div>
                  <div className="inv-dc-field">
                    <dt>Date souhaitée</dt>
                    <dd>{fmtDate(r.date_souhaitee)}</dd>
                  </div>
                  <div className="inv-dc-field-grid">
                    <div className="inv-dc-field">
                      <dt>Préparation</dt>
                      <dd>
                        <span className={`badge ${prepBadgeClass(r.statut)}`}>
                          {siteRequestPreparationStatut(r.statut)}
                        </span>
                      </dd>
                    </div>
                    <div className="inv-dc-field">
                      <dt>Livraison</dt>
                      <dd>
                        <span className={`badge ${livBadgeClass(r.statut)}`}>
                          {siteRequestLivraisonStatut(r.statut)}
                        </span>
                      </dd>
                    </div>
                  </div>
                </dl>
                <footer className="inv-dc-card-actions">
                  {getRowActions(r, rowHandlers, { embedded }).map((action) => {
                    const Icon = action.icon;
                    return (
                      <button
                        key={action.key}
                        type="button"
                        className="btn btn-ghost btn-sm inv-dc-action"
                        onClick={action.onClick}
                        disabled={saving}
                      >
                        <Icon size={14} /> {action.label}
                      </button>
                    );
                  })}
                  {r.statut === 'brouillon' && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm inv-dc-action inv-dc-action--danger"
                      onClick={() => handleDelete(r.id)}
                    >
                      <Trash2 size={14} /> Supprimer
                    </button>
                  )}
                </footer>
              </article>
            ))}
          </div>
        </div>
      )}


      {detail && (
        <>
          <div className="rh-emp-docs-drawer-overlay" onClick={() => setDetail(null)} aria-hidden="true" />
          <aside className="rh-emp-docs-drawer inv-dc-drawer" style={{ maxWidth: 920, width: 'min(96vw, 920px)' }} role="dialog">
            <header className="rh-emp-docs-drawer-header inv-dc-drawer-header">
              <div className="inv-dc-drawer-head-top">
                <div className="inv-dc-drawer-head-text">
                  <div className="inv-dc-drawer-ref">{detail.ref}</div>
                  <h2 className="rh-emp-docs-drawer-title">DEMANDE — {detail.project_name}</h2>
                </div>
                <button type="button" className="rh-emp-modal-close inv-dc-drawer-close" onClick={() => setDetail(null)} aria-label="Fermer">
                  <X size={20} />
                </button>
              </div>
            </header>
            <div className="rh-emp-docs-drawer-body">
              <div className="rh-emp-docs-info-grid inv-dc-info-grid" style={{ marginBottom: 16 }}>
                <div><div className="rh-emp-docs-info-label">Client</div><div className="rh-emp-docs-info-value">{detail.client_name || '—'}</div></div>
                <div><div className="rh-emp-docs-info-label">Chef chantier</div><div className="rh-emp-docs-info-value">{detail.chef_chantier || '—'}</div></div>
                <div><div className="rh-emp-docs-info-label">Priorité</div><div className="rh-emp-docs-info-value">{detail.priorite}</div></div>
                <div><div className="rh-emp-docs-info-label">Statut</div><div className="rh-emp-docs-info-value">{detail.statutLabel}</div></div>
              </div>

              {['soumise', 'en_preparation', 'preparation_partielle', 'en_attente_dg', 'validee_dg'].includes(detail.statut) && (
                <>
                  {canScanPreparation && (
                    <ArticleScanBar
                      onScan={handlePrepScan}
                      loading={prepScanning}
                      error={prepScanError}
                      success={prepScanSuccess}
                      label="Scanner un article à préparer"
                      placeholder="Scannez chaque article préparé…"
                      compact
                    />
                  )}
                <div className="table-wrap inv-dc-lines-desktop" style={{ marginBottom: 16 }}>
                  <table style={{ fontSize: '0.82rem' }}>
                    <thead>
                      <tr>
                        <th>Article</th>
                        <th>Demandé</th>
                        <th>Préparé</th>
                        <th>Stock</th>
                        {!embedded && <th>Remarque magasin</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {(detail.lines || []).filter((l) => Number(l.quantite_demandee) > 0).map((l) => {
                        const prepared = isLineFullyPrepared(l);
                        return (
                        <tr key={l.id || `${l.category_id}-${l.article_name}`} style={prepared ? { background: '#F1F8E9' } : undefined}>
                          <td>
                            {prepared && <span style={{ color: '#2E7D32', marginRight: 6 }} title="Préparée">✓</span>}
                            {l.article_name}
                          </td>
                          <td>{l.quantite_demandee}</td>
                          <td>
                            {embedded ? (
                              l.quantite_preparee ?? '—'
                            ) : (
                              <input
                                type="number"
                                min="0"
                                value={l.quantite_preparee ?? l.quantite_demandee ?? ''}
                                onChange={(e) => updateDetailLine(l.id, { quantite_preparee: Number(e.target.value) || 0 })}
                                style={{ ...INPUT_STYLE, padding: '4px 8px', width: 70 }}
                                disabled={['prete', 'livree', 'annulee'].includes(detail.statut)}
                              />
                            )}
                          </td>
                          <td>{l.stock_actuel ?? '—'}</td>
                          {!embedded && (
                            <td>
                              <input
                                value={l.remarque_magasinier || ''}
                                onChange={(e) => updateDetailLine(l.id, { remarque_magasinier: e.target.value })}
                                style={{ ...INPUT_STYLE, padding: '4px 8px' }}
                                disabled={['prete', 'livree', 'annulee'].includes(detail.statut)}
                              />
                            </td>
                          )}
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="inv-dc-lines-mobile" style={{ marginBottom: 16 }}>
                  {(detail.lines || []).filter((l) => Number(l.quantite_demandee) > 0).map((l) => {
                    const prepared = isLineFullyPrepared(l);
                    return (
                      <div
                        key={l.id || `m-${l.category_id}-${l.article_name}`}
                        className={`inv-dc-line-card${prepared ? ' is-prepared' : ''}`}
                      >
                        <div className="inv-dc-line-name">
                          {prepared && <span className="inv-dc-line-ok" title="Préparée">✓</span>}
                          {l.article_name}
                        </div>
                        <dl className="inv-dc-line-metrics">
                          <div className="inv-dc-field">
                            <dt>Demandé</dt>
                            <dd>{l.quantite_demandee}</dd>
                          </div>
                          <div className="inv-dc-field">
                            <dt>Préparé</dt>
                            <dd>
                              {embedded ? (
                                l.quantite_preparee ?? '—'
                              ) : (
                                <input
                                  type="number"
                                  min="0"
                                  value={l.quantite_preparee ?? l.quantite_demandee ?? ''}
                                  onChange={(e) => updateDetailLine(l.id, { quantite_preparee: Number(e.target.value) || 0 })}
                                  className="inv-dc-line-input"
                                  style={INPUT_STYLE}
                                  disabled={['prete', 'livree', 'annulee'].includes(detail.statut)}
                                />
                              )}
                            </dd>
                          </div>
                          <div className="inv-dc-field">
                            <dt>Stock</dt>
                            <dd>{l.stock_actuel ?? '—'}</dd>
                          </div>
                        </dl>
                        {!embedded && (
                          <dl className="inv-dc-field" style={{ marginTop: 8 }}>
                            <dt>Remarque magasin</dt>
                            <dd>
                              <input
                                value={l.remarque_magasinier || ''}
                                onChange={(e) => updateDetailLine(l.id, { remarque_magasinier: e.target.value })}
                                className="inv-dc-line-input inv-dc-line-input--full"
                                style={INPUT_STYLE}
                                disabled={['prete', 'livree', 'annulee'].includes(detail.statut)}
                              />
                            </dd>
                          </dl>
                        )}
                      </div>
                    );
                  })}
                </div>
                </>
              )}

              {detail.observation && (
                <div style={{ marginBottom: 16, fontSize: '0.86rem' }}>
                  <strong>Observation :</strong> {detail.observation}
                </div>
              )}

              {detail.movement_ref && (
                <div style={{ marginBottom: 16, fontSize: '0.86rem', color: '#1565C0' }}>
                  Bon de sortie : <strong>{detail.movement_ref}</strong>
                </div>
              )}

              <div className="inv-dc-detail-actions" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => handlePdf(detail.id)}><Download size={14} /> Télécharger PDF</button>
                {!embedded && detail.statut === 'soumise' && (
                  <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={() => runAction((id) => prepareSiteMaterialRequest(id, detail.lines))}>
                    <Package size={14} /> Prendre en charge
                  </button>
                )}
                {!embedded && ['en_preparation', 'preparation_partielle'].includes(detail.statut) && (
                  <>
                    <button type="button" className="btn btn-secondary btn-sm" disabled={saving} onClick={() => runAction((id) => prepareSiteMaterialRequest(id, detail.lines, { partial: true }))}>Préparation partielle</button>
                    {detail.requires_dg ? (
                      <button type="button" className="btn btn-secondary btn-sm" disabled={saving} onClick={() => runAction(requestDgValidation)}>Demander validation DG</button>
                    ) : (
                      <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={() => runAction((id) => prepareSiteMaterialRequest(id, detail.lines).then(() => markSiteRequestReady(id)))}>
                        <CheckCircle size={14} /> Valider préparation
                      </button>
                    )}
                  </>
                )}
                {!embedded && detail.statut === 'en_attente_dg' && (
                  <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={() => runAction((id) => validateSiteRequestDg(id).then(() => markSiteRequestReady(id)))}>
                    Valider DG
                  </button>
                )}
                {!embedded && ['prete', 'validee_dg'].includes(detail.statut) && (
                  <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={() => runAction(async (id) => {
                    await prepareSiteMaterialRequest(id, detail.lines);
                    return deliverSiteMaterialRequest(id);
                  })}
                  >
                    <Truck size={14} /> Livrer & générer bon de sortie
                  </button>
                )}
                {!embedded && !['livree', 'annulee'].includes(detail.statut) && (
                  <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} disabled={saving} onClick={() => {
                    const reason = window.prompt('Motif d\'annulation :');
                    if (reason) runAction((id) => cancelSiteMaterialRequest(id, reason));
                  }}
                  >
                    Annuler
                  </button>
                )}
              </div>

              {detail.history?.length > 0 && (
                <section>
                  <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 10 }}>Historique</h3>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.82rem' }}>
                    {detail.history.map((h) => (
                      <li key={h.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                        <strong>{h.action}</strong> — {h.actor_name || 'Système'} — {fmtDateTime(h.created_at)}
                        {h.details && <div style={{ color: 'var(--text-3)', marginTop: 2 }}>{h.details}</div>}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          </aside>
        </>
      )}
    </div>
  );
}

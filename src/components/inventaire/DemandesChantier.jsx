/**
 * DemandesChantier.jsx — Demandes matériel chantier (Inventaire & Dépôt)
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ClipboardList, Plus, Search, RefreshCw, Loader2, Eye, Edit2, Trash2,
  Download, CheckCircle, Truck, Package, X,
} from 'lucide-react';
import { listProjects } from '../../services/projects/projects';
import { listStockArticles } from '../../services/inventaire/stockArticles';
import {
  SITE_REQUEST_STATUTS,
  siteRequestStatutColor,
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

function prioriteBadge(p) {
  if (p === 'Critique') return 'badge-red';
  if (p === 'Urgente') return 'badge-orange';
  return 'badge-grey';
}

export default function DemandesChantier() {
  const [requests, setRequests] = useState([]);
  const [projects, setProjects] = useState([]);
  const [stockArticles, setStockArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statutFilter, setStatutFilter] = useState('');
  const [prioriteFilter, setPrioriteFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [lines, setLines] = useState(() => buildInitialLines());

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [rows, projs, arts] = await Promise.all([
        listSiteMaterialRequests({ statut: statutFilter, priorite: prioriteFilter }),
        listProjects(),
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
  }, [statutFilter, prioriteFilter]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return requests;
    return requests.filter((r) =>
      (r.ref || '').toLowerCase().includes(q)
      || (r.project_name || '').toLowerCase().includes(q)
      || (r.client_name || '').toLowerCase().includes(q)
      || (r.chef_chantier || '').toLowerCase().includes(q),
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
    setForm({ ...EMPTY_FORM, date_demande: new Date().toISOString().slice(0, 10) });
    setLines(buildInitialLines());
    setShowForm(true);
  }

  async function openEdit(id) {
    setSaving(true);
    try {
      const req = await getSiteMaterialRequest(id);
      setEditId(id);
      setForm({
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
      setShowForm(true);
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
    setShowForm(false);
    setEditId(null);
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

  function updateDetailLine(lineId, patch) {
    setDetail((prev) => ({
      ...prev,
      lines: prev.lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l)),
    }));
  }

  return (
    <div className="animate-fade-in">
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

      <div className="stat-grid finance-kpi-grid" style={{ marginBottom: 16 }}>
        <KpiCard icon={<ClipboardList size={17} />} label="Total demandes" value={stats.total} color="grey" />
        <KpiCard icon={<Package size={17} />} label="Soumises" value={stats.soumises} color="blue" />
        <KpiCard icon={<Loader2 size={17} />} label="En préparation" value={stats.preparation} color="orange" />
        <KpiCard icon={<CheckCircle size={17} />} label="Prêtes" value={stats.pretes} color="green" />
      </div>

      <div className="card finance-toolbar" style={{ marginBottom: 16, padding: '14px 20px' }}>
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
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>
          Aucune demande chantier. Créez la première demande de matériel.
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Référence</th>
                  <th>Projet</th>
                  <th>Client</th>
                  <th>Chef chantier</th>
                  <th>Articles</th>
                  <th>Priorité</th>
                  <th>Date</th>
                  <th>Statut</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td data-label="Référence"><strong>{r.ref}</strong></td>
                    <td data-label="Projet">{r.project_name || '—'}</td>
                    <td data-label="Client">{r.client_name || '—'}</td>
                    <td data-label="Chef chantier">{r.chef_chantier || '—'}</td>
                    <td data-label="Articles">{r.distinct_articles} lignes · {r.total_articles} u.</td>
                    <td data-label="Priorité"><span className={`badge ${prioriteBadge(r.priorite)}`}>{r.priorite}</span></td>
                    <td data-label="Date">{fmtDate(r.date_demande)}</td>
                    <td data-label="Statut">
                      <span className="badge" style={{ background: `${siteRequestStatutColor(r.statut)}22`, color: siteRequestStatutColor(r.statut) }}>
                        {r.statutLabel}
                      </span>
                    </td>
                    <td data-label="Actions">
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button type="button" className="btn btn-ghost btn-sm" title="Voir" onClick={() => openDetail(r.id)}><Eye size={13} /></button>
                        <button type="button" className="btn btn-ghost btn-sm" title="PDF" onClick={() => generateSiteRequestPdf(r)}><Download size={13} /></button>
                        {r.statut === 'brouillon' && (
                          <>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => openEdit(r.id)}><Edit2 size={13} /></button>
                            <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => handleDelete(r.id)}><Trash2 size={13} /></button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showForm && (
        <>
          <div className="rh-emp-docs-drawer-overlay" onClick={closeForm} aria-hidden="true" />
          <aside className="rh-emp-docs-drawer" style={{ maxWidth: 920, width: 'min(96vw, 920px)' }} role="dialog">
            <header className="rh-emp-docs-drawer-header">
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>Demande chantier</div>
                <h2 className="rh-emp-docs-drawer-title">{editId ? 'MODIFIER LA DEMANDE' : 'NOUVELLE DEMANDE CHANTIER'}</h2>
              </div>
              <button type="button" className="rh-emp-modal-close" onClick={closeForm}><X size={20} /></button>
            </header>
            <div className="rh-emp-docs-drawer-body">
              <SiteRequestForm
                form={form}
                setForm={setForm}
                lines={lines}
                setLines={setLines}
                projects={projects}
                stockArticles={stockArticles}
              />
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                <button type="button" className="btn btn-secondary" onClick={closeForm}>Annuler</button>
                <button type="button" className="btn btn-secondary" onClick={() => handleSave(false)} disabled={saving}>
                  {saving ? <Loader2 size={14} className="spin" /> : null} Enregistrer brouillon
                </button>
                <button type="button" className="btn btn-primary" onClick={() => handleSave(true)} disabled={saving}>
                  {saving ? <Loader2 size={14} className="spin" /> : <CheckCircle size={14} />} Soumettre au magasin
                </button>
              </div>
            </div>
          </aside>
        </>
      )}

      {detail && (
        <>
          <div className="rh-emp-docs-drawer-overlay" onClick={() => setDetail(null)} aria-hidden="true" />
          <aside className="rh-emp-docs-drawer" style={{ maxWidth: 920, width: 'min(96vw, 920px)' }} role="dialog">
            <header className="rh-emp-docs-drawer-header">
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)' }}>{detail.ref}</div>
                <h2 className="rh-emp-docs-drawer-title">DEMANDE — {detail.project_name}</h2>
              </div>
              <button type="button" className="rh-emp-modal-close" onClick={() => setDetail(null)}><X size={20} /></button>
            </header>
            <div className="rh-emp-docs-drawer-body">
              <div className="rh-emp-docs-info-grid" style={{ marginBottom: 16 }}>
                <div><div className="rh-emp-docs-info-label">Client</div><div className="rh-emp-docs-info-value">{detail.client_name || '—'}</div></div>
                <div><div className="rh-emp-docs-info-label">Chef chantier</div><div className="rh-emp-docs-info-value">{detail.chef_chantier || '—'}</div></div>
                <div><div className="rh-emp-docs-info-label">Priorité</div><div className="rh-emp-docs-info-value">{detail.priorite}</div></div>
                <div><div className="rh-emp-docs-info-label">Statut</div><div className="rh-emp-docs-info-value">{detail.statutLabel}</div></div>
              </div>

              {['soumise', 'en_preparation', 'preparation_partielle', 'en_attente_dg', 'validee_dg'].includes(detail.statut) && (
                <div className="table-wrap" style={{ marginBottom: 16 }}>
                  <table style={{ fontSize: '0.82rem' }}>
                    <thead>
                      <tr>
                        <th>Article</th>
                        <th>Demandé</th>
                        <th>Préparé</th>
                        <th>Stock</th>
                        <th>Remarque magasin</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detail.lines || []).filter((l) => Number(l.quantite_demandee) > 0).map((l) => (
                        <tr key={l.id || `${l.category_id}-${l.article_name}`}>
                          <td>{l.article_name}</td>
                          <td>{l.quantite_demandee}</td>
                          <td>
                            <input
                              type="number"
                              min="0"
                              value={l.quantite_preparee ?? l.quantite_demandee ?? ''}
                              onChange={(e) => updateDetailLine(l.id, { quantite_preparee: Number(e.target.value) || 0 })}
                              style={{ ...INPUT_STYLE, padding: '4px 8px', width: 70 }}
                              disabled={['prete', 'livree', 'annulee'].includes(detail.statut)}
                            />
                          </td>
                          <td>{l.stock_actuel ?? '—'}</td>
                          <td>
                            <input
                              value={l.remarque_magasinier || ''}
                              onChange={(e) => updateDetailLine(l.id, { remarque_magasinier: e.target.value })}
                              style={{ ...INPUT_STYLE, padding: '4px 8px' }}
                              disabled={['prete', 'livree', 'annulee'].includes(detail.statut)}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => generateSiteRequestPdf(detail)}><Download size={14} /> PDF</button>
                {detail.statut === 'soumise' && (
                  <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={() => runAction((id) => prepareSiteMaterialRequest(id, detail.lines))}>
                    <Package size={14} /> Prendre en charge
                  </button>
                )}
                {['en_preparation', 'preparation_partielle'].includes(detail.statut) && (
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
                {detail.statut === 'en_attente_dg' && (
                  <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={() => runAction((id) => validateSiteRequestDg(id).then(() => markSiteRequestReady(id)))}>
                    Valider DG
                  </button>
                )}
                {['prete', 'validee_dg'].includes(detail.statut) && (
                  <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={() => runAction(async (id) => {
                    await prepareSiteMaterialRequest(id, detail.lines);
                    return deliverSiteMaterialRequest(id);
                  })}
                  >
                    <Truck size={14} /> Livrer & générer bon de sortie
                  </button>
                )}
                {!['livree', 'annulee'].includes(detail.statut) && (
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

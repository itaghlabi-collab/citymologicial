/**
 * DemandesRessources.jsx — Tableau de pilotage RH (style ERP Devis)
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ClipboardList, Search, RefreshCw, Loader2, Eye, Users, UserPlus, CheckCircle,
  Clock, AlertTriangle, TrendingUp, XCircle, Trash2,
} from 'lucide-react';
import { RECRUITMENT_STATUTS, recruitmentStatutLabel } from '../constants/projectBesoins';
import {
  listResourceRequests,
  getResourceRequest,
  updateResourceRequestStatus,
  validateResourceRequest,
  closeResourceRequest,
  refuseResourceRequest,
  createRecruitmentRequestFromRequest,
  removeWorkerFromResourceRequest,
  updateRecruitmentStatut,
  closeRecruitmentRequest,
  deleteResourceRequest,
} from '../services/rh/resourceRequests';
import { listWorkers } from '../services/rh/workers';
import { KpiCard, INPUT_STYLE } from './inventaire/shared';
import RhAssignWorkersModal from './rh/RhAssignWorkersModal';
import ResourceRequestDetailView from './rh/ResourceRequestDetailView';
import {
  RH_REQUEST_TABS,
  computeResourceRequestStats,
  filterRequestsByTab,
  getRequestCoverage,
  getDerivedRequestStatut,
  statutBadgeClass,
  prioriteBadgeClass,
  canAssignRequest,
  canCloseRequest,
  canRecruitRequest,
  deleteResourceRequestWarnMessage,
  CoverageProgressBar,
  CoverageBadge,
} from './rh/resourceRequestUi';

function fmtDate(d) {
  if (!d) return '—';
  try {
    return new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR');
  } catch {
    return d;
  }
}

function tabCount(requests, tabKey) {
  return filterRequestsByTab(requests, tabKey).length;
}

export default function DemandesRessources() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [view, setView] = useState('list');
  const [detail, setDetail] = useState(null);
  const [assignOpen, setAssignOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRequests(await listResourceRequests());
    } catch (err) {
      setError(err.message || 'Erreur de chargement.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const handler = async () => {
      await load();
      if (detail?.id) {
        try {
          setDetail(await getResourceRequest(detail.id));
        } catch (err) {
          console.warn('[CITYMO] refresh detail after RH sync', err);
        }
      }
    };
    window.addEventListener('citymo:rh-assignments-updated', handler);
    return () => window.removeEventListener('citymo:rh-assignments-updated', handler);
  }, [load, detail?.id]);

  const stats = useMemo(() => computeResourceRequestStats(requests), [requests]);

  const filtered = useMemo(() => {
    let list = filterRequestsByTab(requests, activeTab);
    const q = search.toLowerCase().trim();
    if (!q) return list;
    return list.filter((r) =>
      (r.ref || '').toLowerCase().includes(q)
      || (r.project_name || '').toLowerCase().includes(q)
      || (r.fonction || '').toLowerCase().includes(q)
      || (r.requested_by_name || '').toLowerCase().includes(q),
    );
  }, [requests, activeTab, search]);

  async function openDetail(id, openAssign = false) {
    setDetailLoading(true);
    setError('');
    setView('detail');
    try {
      setDetail(await getResourceRequest(id));
      if (openAssign) setAssignOpen(true);
    } catch (err) {
      setError(err.message);
      setView('list');
    } finally {
      setDetailLoading(false);
    }
  }

  function backToList() {
    setView('list');
    setDetail(null);
    setAssignOpen(false);
  }

  async function refreshDetail() {
    if (!detail?.id) return;
    setDetailLoading(true);
    try {
      setDetail(await getResourceRequest(detail.id));
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleAssignConfirm(workerIds) {
    if (!detail) return;
    setSaving(true);
    setError('');
    try {
      const { setResourceRequestWorkers } = await import('../services/rh/resourceRequests');
      await setResourceRequestWorkers(detail.id, workerIds);
      await validateResourceRequest(detail.id, { allowPartial: true });
      setAssignOpen(false);
      await refreshDetail();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleTakeCharge() {
    if (!detail) return;
    setSaving(true);
    try {
      await updateResourceRequestStatus(detail.id, 'en_cours');
      await refreshDetail();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRefuse() {
    if (!detail) return;
    const reason = window.prompt('Motif du refus (optionnel) :');
    if (reason === null) return;
    setSaving(true);
    try {
      await refuseResourceRequest(detail.id, reason);
      backToList();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRecruitment(targetId) {
    const id = targetId || detail?.id;
    if (!id) return;
    if (!window.confirm('Créer une demande de recrutement pour les postes manquants ?')) return;
    setSaving(true);
    try {
      await createRecruitmentRequestFromRequest(id);
      if (view === 'detail') await refreshDetail();
      else await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(targetId) {
    const id = targetId || detail?.id;
    if (!id) return;
    const row = requests.find((r) => r.id === id) || detail;
    if (!window.confirm(deleteResourceRequestWarnMessage(row))) return;
    setSaving(true);
    setError('');
    try {
      await deleteResourceRequest(id);
      if (view === 'detail') backToList();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleClose(targetId) {
    const id = targetId || detail?.id;
    if (!id || !window.confirm('Clôturer cette demande ?')) return;
    setSaving(true);
    try {
      await closeResourceRequest(id);
      if (view === 'detail') backToList();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveWorker(worker) {
    if (!detail || !window.confirm(`Retirer ${worker.workerName} de cette affectation ?`)) return;
    setSaving(true);
    try {
      await removeWorkerFromResourceRequest(detail.id, worker.worker_id);
      await refreshDetail();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleViewWorker(worker) {
    try {
      const all = await listWorkers();
      const w = all.find((x) => String(x.id) === String(worker.worker_id));
      if (!w) { alert('Ouvrier introuvable.'); return; }
      alert([
        `${w.prenom || ''} ${w.nom || ''}`.trim(),
        `Fonction : ${w.fonction || '—'}`,
        `Tél. : ${w.telephone || '—'}`,
        `Statut : ${w.statut || '—'}`,
      ].join('\n'));
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleEditRecruitment(rec) {
    const options = RECRUITMENT_STATUTS.map((s, i) => `${i + 1}. ${s.label}`).join('\n');
    const choice = window.prompt(`Nouveau statut recrutement :\n${options}\n\nEntrez le numéro :`);
    if (!choice) return;
    const idx = Number(choice) - 1;
    const statut = RECRUITMENT_STATUTS[idx]?.value;
    if (!statut) { alert('Choix invalide.'); return; }
    setSaving(true);
    try {
      await updateRecruitmentStatut(rec.id, statut);
      await refreshDetail();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleCloseRecruitment(rec) {
    if (!window.confirm(`Clôturer le recrutement ${rec.ref} ?`)) return;
    setSaving(true);
    try {
      await closeRecruitmentRequest(rec.id);
      await refreshDetail();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (view === 'detail') {
    return (
      <div className="animate-fade-in crm-module rh-page">
        {error && (
          <div style={{ background: '#FFEBEE', color: 'var(--red)', borderRadius: 8, padding: '10px 14px', fontSize: '0.84rem', marginBottom: 16 }}>
            {error}
          </div>
        )}
        <ResourceRequestDetailView
          detail={detail}
          loading={detailLoading}
          saving={saving}
          onBack={backToList}
          onTakeCharge={handleTakeCharge}
          onAssign={() => setAssignOpen(true)}
          onRecruitment={() => handleRecruitment()}
          onRefuse={handleRefuse}
          onCloseRequest={() => handleClose()}
          onDelete={() => handleDelete()}
          onRemoveWorker={handleRemoveWorker}
          onViewWorker={handleViewWorker}
          onViewRecruitment={(r) => alert(`${r.ref} — ${r.fonction} × ${r.quantite}\nStatut : ${recruitmentStatutLabel(r.recruitment_statut)}`)}
          onEditRecruitment={handleEditRecruitment}
          onCloseRecruitment={handleCloseRecruitment}
        />
        <RhAssignWorkersModal
          open={assignOpen && !!detail}
          onClose={() => setAssignOpen(false)}
          request={detail}
          initialSelected={(detail?.workers || []).map((w) => w.worker_id)}
          onConfirm={handleAssignConfirm}
          saving={saving}
        />
      </div>
    );
  }

  return (
    <div className="animate-fade-in crm-module rh-page">
      <div className="page-header flex-between" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="page-title">Demandes ressources</h1>
          <p className="page-subtitle">
            Tableau de pilotage RH — besoins chantier, affectations et recrutements
          </p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={load} disabled={loading}>
          <RefreshCw size={14} /> Actualiser
        </button>
      </div>

      <div className="stat-grid finance-kpi-grid rh-kpi-grid" style={{ marginBottom: 16 }}>
        <KpiCard icon={<ClipboardList size={17} />} label="Total demandes" value={loading ? '—' : stats.total} color="grey" />
        <KpiCard icon={<Clock size={17} />} label="En attente RH" value={loading ? '—' : stats.enAttente} color="orange" />
        <KpiCard icon={<Users size={17} />} label="En cours / partielles" value={loading ? '—' : stats.enCoursPartiel} sub={`${stats.recrutement} en recrutement`} color="blue" />
        <KpiCard icon={<CheckCircle size={17} />} label="Couvertes" value={loading ? '—' : stats.couvertes} color="green" />
        <KpiCard icon={<UserPlus size={17} />} label="À recruter" value={loading ? '—' : stats.aRecruter} sub="postes manquants" color="red" />
        <KpiCard icon={<AlertTriangle size={17} />} label="Urgentes" value={loading ? '—' : stats.urgentes} color="red" />
        <div
          role="button"
          tabIndex={0}
          onClick={() => setActiveTab('cloturee')}
          onKeyDown={(e) => e.key === 'Enter' && setActiveTab('cloturee')}
          style={{ cursor: 'pointer' }}
          title="Voir les demandes clôturées / supprimables"
        >
          <KpiCard icon={<Trash2 size={17} />} label="Clôturées" value={loading ? '—' : stats.cloturees} sub="supprimables" color="grey" />
        </div>
      </div>

      <div className="card rh-coverage-compact">
        <div className="rh-coverage-compact-row">
          <TrendingUp size={16} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-2)' }}>Taux de couverture</span>
          <div style={{ flex: '1 1 180px', maxWidth: 280 }}>
            <CoverageProgressBar
              taux={stats.taux}
              color={stats.taux >= 100 ? '#2E7D32' : stats.taux >= 50 ? '#F57C00' : '#C62828'}
            />
          </div>
          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-2)' }}>{stats.taux}%</span>
        </div>
      </div>

      <div className="rh-filter-chips" role="tablist" aria-label="Filtres demandes ressources">
        {RH_REQUEST_TABS.map((tab) => {
          const count = tabCount(requests, tab.key);
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab.key)}
              className={`rh-filter-chip${active ? ' is-active' : ''}`}
            >
              {tab.label}
              <span className="rh-filter-chip-count">{loading ? '—' : count}</span>
            </button>
          );
        })}
      </div>

      <div className="card finance-toolbar" style={{ marginBottom: 16, padding: '14px 18px' }}>
        <div className="rh-m-toolbar-search" style={{ maxWidth: 320 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher référence, projet, fonction…"
            aria-label="Rechercher une demande"
            style={{ ...INPUT_STYLE, paddingLeft: 32 }}
          />
        </div>
      </div>

      {error && (
        <div className="card" style={{ marginBottom: 16, color: 'var(--red)', padding: 14, fontSize: '0.86rem', display: 'flex', alignItems: 'center', gap: 8 }}>
          <XCircle size={15} /> {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48 }}><Loader2 size={26} className="spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>
          Aucune demande pour ce filtre.
        </div>
      ) : (
        <>
          <div className="rh-m-only rh-m-cards">
            {filtered.map((r) => {
              const cov = getRequestCoverage(r);
              const derived = getDerivedRequestStatut(r);
              return (
                <article key={r.id} className="rh-m-card">
                  <div className="rh-m-card-head">
                    <div className="rh-m-card-name">{r.project_name || r.ref || '—'}</div>
                    {r.priorite ? (
                      <span className={`badge ${prioriteBadgeClass(r.priorite)}`}>{r.priorite}</span>
                    ) : null}
                  </div>
                  {r.fonction ? <div className="rh-m-card-poste">{r.fonction}</div> : null}
                  {r.ref ? <div className="rh-m-card-meta">{r.ref}</div> : null}
                  <div className="rh-m-card-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                    <div className="rh-m-card-kv">
                      <div className="rh-m-card-kv-label">Demandé</div>
                      <div className="rh-m-card-kv-value">{cov.demanded}</div>
                    </div>
                    <div className="rh-m-card-kv">
                      <div className="rh-m-card-kv-label">Affecté</div>
                      <div className="rh-m-card-kv-value">{cov.assigned}</div>
                    </div>
                    <div className="rh-m-card-kv">
                      <div className="rh-m-card-kv-label">Manquant</div>
                      <div className="rh-m-card-kv-value" style={{ color: cov.manque > 0 ? 'var(--red)' : '#2E7D32' }}>{cov.manque}</div>
                    </div>
                  </div>
                  <div style={{ margin: '6px 0 4px' }}>
                    <CoverageProgressBar taux={cov.taux} color={cov.color} />
                  </div>
                  {r.date_souhaitee ? (
                    <div className="rh-m-card-meta">Souhaitée : {fmtDate(r.date_souhaitee)}</div>
                  ) : null}
                  <div style={{ marginTop: 6 }}>
                    <span className={`badge ${statutBadgeClass(derived.statut)}`}>{derived.label}</span>
                  </div>
                  <div className="rh-m-card-actions">
                    <button type="button" className="btn btn-ghost btn-sm" title="Voir" aria-label="Voir" onClick={() => openDetail(r.id)}>
                      <Eye size={16} />
                    </button>
                    {canAssignRequest(r) && (
                      <button type="button" className="btn btn-ghost btn-sm" title="Affecter" aria-label="Affecter" onClick={() => openDetail(r.id, true)}>
                        <Users size={16} />
                      </button>
                    )}
                    {canRecruitRequest(r) && (
                      <button type="button" className="btn btn-ghost btn-sm" title="Créer recrutement" aria-label="Recruter" onClick={() => handleRecruitment(r.id)}>
                        <UserPlus size={16} />
                      </button>
                    )}
                    {canCloseRequest(r) && (
                      <button type="button" className="btn btn-ghost btn-sm" title="Clôturer" aria-label="Modifier" onClick={() => handleClose(r.id)}>
                        <CheckCircle size={16} />
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      title="Supprimer"
                      aria-label="Supprimer"
                      style={{ color: 'var(--red)' }}
                      onClick={() => handleDelete(r.id)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="card rh-desk-only" style={{ padding: 0 }}>
            <div className="table-wrap" style={{ overflowX: 'auto' }}>
              <table style={{ minWidth: 1200 }}>
                <thead>
                  <tr>
                    <th>Référence</th>
                    <th>Projet</th>
                    <th>Fonction demandée</th>
                    <th>Demandé</th>
                    <th>Affecté</th>
                    <th>Manquant</th>
                    <th>Couverture</th>
                    <th>Priorité</th>
                    <th>Date souhaitée</th>
                    <th>Statut</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const cov = getRequestCoverage(r);
                    const derived = getDerivedRequestStatut(r);
                    return (
                      <tr key={r.id}>
                        <td data-label="Référence"><strong>{r.ref || '—'}</strong></td>
                        <td data-label="Projet">
                          <div style={{ fontWeight: 600 }}>{r.project_name}</div>
                          {r.project_ref && <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>{r.project_ref}</div>}
                        </td>
                        <td data-label="Fonction" style={{ fontWeight: 600 }}>{r.fonction}</td>
                        <td data-label="Demandé">{cov.demanded}</td>
                        <td data-label="Affecté">{cov.assigned}</td>
                        <td data-label="Manquant" style={{ fontWeight: 700, color: cov.manque > 0 ? 'var(--red)' : '#2E7D32' }}>{cov.manque}</td>
                        <td data-label="Couverture" style={{ minWidth: 130 }}>
                          <CoverageProgressBar taux={cov.taux} color={cov.color} />
                          <div style={{ marginTop: 4 }}><CoverageBadge coverage={cov} /></div>
                        </td>
                        <td data-label="Priorité">
                          <span className={`badge ${prioriteBadgeClass(r.priorite)}`}>{r.priorite}</span>
                        </td>
                        <td data-label="Date souhaitée">{fmtDate(r.date_souhaitee)}</td>
                        <td data-label="Statut">
                          <span className={`badge ${statutBadgeClass(derived.statut)}`}>{derived.label}</span>
                        </td>
                        <td data-label="Actions">
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            <button type="button" className="btn btn-ghost btn-sm" title="Voir" onClick={() => openDetail(r.id)}>
                              <Eye size={13} />
                            </button>
                            {canAssignRequest(r) && (
                              <button type="button" className="btn btn-ghost btn-sm" title="Affecter" onClick={() => openDetail(r.id, true)}>
                                <Users size={13} />
                              </button>
                            )}
                            {canRecruitRequest(r) && (
                              <button type="button" className="btn btn-ghost btn-sm" title="Créer recrutement" onClick={() => handleRecruitment(r.id)}>
                                <UserPlus size={13} />
                              </button>
                            )}
                            {canCloseRequest(r) && (
                              <button type="button" className="btn btn-ghost btn-sm" title="Clôturer" onClick={() => handleClose(r.id)}>
                                <CheckCircle size={13} />
                              </button>
                            )}
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              title="Supprimer"
                              style={{ color: 'var(--red)' }}
                              onClick={() => handleDelete(r.id)}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

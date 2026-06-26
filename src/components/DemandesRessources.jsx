/**
 * DemandesRessources.jsx — RH : traitement et affectation des ressources chantier
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ClipboardList, Search, RefreshCw, Loader2, Eye,
} from 'lucide-react';
import {
  BESOIN_REQUEST_STATUTS, RECRUITMENT_STATUTS, recruitmentStatutLabel,
} from '../constants/projectBesoins';
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
  requestStatutColor,
} from '../services/rh/resourceRequests';
import { listWorkers } from '../services/rh/workers';
import RhAssignWorkersModal from './rh/RhAssignWorkersModal';
import ResourceRequestDetailPanel from './rh/ResourceRequestDetailPanel';

const inputStyle = {
  padding: '8px 11px',
  border: '1.5px solid var(--border)',
  borderRadius: 6,
  fontSize: '0.86rem',
  background: '#fff',
};

function fmtDate(d) {
  if (!d) return '—';
  try {
    return new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR');
  } catch {
    return d;
  }
}

export default function DemandesRessources() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statutFilter, setStatutFilter] = useState('');
  const [detail, setDetail] = useState(null);
  const [assignOpen, setAssignOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRequests(await listResourceRequests({ statut: statutFilter }));
    } catch (err) {
      setError(err.message || 'Erreur de chargement.');
    } finally {
      setLoading(false);
    }
  }, [statutFilter]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return requests;
    return requests.filter((r) =>
      (r.ref || '').toLowerCase().includes(q)
      || (r.project_name || '').toLowerCase().includes(q)
      || (r.fonction || '').toLowerCase().includes(q)
      || (r.requested_by_name || '').toLowerCase().includes(q),
    );
  }, [requests, search]);

  const stats = useMemo(() => ({
    total: requests.length,
    enAttente: requests.filter((r) => r.statut === 'en_attente').length,
    enCours: requests.filter((r) => ['en_cours', 'partielle', 'recrutement_en_cours'].includes(r.statut)).length,
    affectees: requests.filter((r) => r.statut === 'affectee').length,
  }), [requests]);

  async function openDetail(id) {
    setSaving(true);
    setError('');
    try {
      setDetail(await getResourceRequest(id));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function closeDetail() {
    setDetail(null);
    setAssignOpen(false);
  }

  async function refreshDetail() {
    if (!detail?.id) return;
    await openDetail(detail.id);
    await load();
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
      closeDetail();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRecruitment() {
    if (!detail) return;
    if (!window.confirm('Créer une demande de recrutement pour les postes manquants ?')) return;
    setSaving(true);
    try {
      await createRecruitmentRequestFromRequest(detail.id);
      await refreshDetail();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleClose() {
    if (!detail || !window.confirm('Clôturer cette demande ?')) return;
    setSaving(true);
    try {
      await closeResourceRequest(detail.id);
      closeDetail();
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

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">Demandes de ressources</h1>
        <p className="page-subtitle">Affectation des ouvriers disponibles et suivi des recrutements</p>
      </div>

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', marginBottom: 20 }}>
        <div className="stat-card"><div className="stat-body"><div className="stat-value">{stats.total}</div><div className="stat-label">Total</div></div></div>
        <div className="stat-card"><div className="stat-body"><div className="stat-value" style={{ color: '#F57C00' }}>{stats.enAttente}</div><div className="stat-label">En attente RH</div></div></div>
        <div className="stat-card"><div className="stat-body"><div className="stat-value" style={{ color: '#1565C0' }}>{stats.enCours}</div><div className="stat-label">En cours / Partiel</div></div></div>
        <div className="stat-card"><div className="stat-body"><div className="stat-value" style={{ color: '#2E7D32' }}>{stats.affectees}</div><div className="stat-label">Couvertes</div></div></div>
      </div>

      <div className="card">
        <div className="flex-between" style={{ marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flex: 1 }}>
            <div style={{ position: 'relative', minWidth: 200 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher…" style={{ ...inputStyle, paddingLeft: 32, width: '100%' }} />
            </div>
            <select value={statutFilter} onChange={(e) => setStatutFilter(e.target.value)} style={{ ...inputStyle, minWidth: 160 }}>
              <option value="">Tous statuts</option>
              {BESOIN_REQUEST_STATUTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={load} disabled={loading}>
            <RefreshCw size={13} /> Actualiser
          </button>
        </div>

        {error && <div style={{ color: 'var(--red)', marginBottom: 12, fontSize: '0.84rem' }}>{error}</div>}

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}><Loader2 size={22} style={{ animation: 'spin 0.8s linear infinite' }} /></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Réf.</th>
                  <th>Projet</th>
                  <th>Fonction</th>
                  <th>Demandées</th>
                  <th>Affectées</th>
                  <th>Manque</th>
                  <th>Priorité</th>
                  <th>Statut</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-3)' }}>Aucune demande.</td></tr>
                ) : filtered.map((r) => {
                  const aff = r.workers_count || 0;
                  const manque = Math.max(0, (Number(r.quantite) || 0) - aff);
                  return (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 700 }}>{r.ref || '—'}</td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{r.project_name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{r.project_ref}</div>
                      </td>
                      <td>{r.fonction}</td>
                      <td>{r.quantite}</td>
                      <td>{aff}</td>
                      <td style={{ fontWeight: 700, color: manque > 0 ? 'var(--red)' : '#2E7D32' }}>{manque}</td>
                      <td>{r.priorite}</td>
                      <td>
                        <span className="badge" style={{ background: requestStatutColor(r.statut), color: '#fff' }}>{r.statutLabel}</span>
                      </td>
                      <td>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => openDetail(r.id)} title="Ouvrir">
                          <Eye size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ResourceRequestDetailPanel
        detail={detail}
        saving={saving}
        onClose={closeDetail}
        onTakeCharge={handleTakeCharge}
        onAssign={() => setAssignOpen(true)}
        onRecruitment={handleRecruitment}
        onRefuse={handleRefuse}
        onCloseRequest={handleClose}
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

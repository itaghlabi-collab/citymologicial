/**
 * DemandesRessources.jsx — RH : traitement et affectation des ressources chantier
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ClipboardList, Search, RefreshCw, Loader2, Eye, CheckCircle, XCircle, Users, UserPlus,
} from 'lucide-react';
import { BESOIN_REQUEST_STATUTS } from '../constants/projectBesoins';
import {
  listResourceRequests,
  getResourceRequest,
  updateResourceRequestStatus,
  setResourceRequestWorkers,
  validateResourceRequest,
  closeResourceRequest,
  refuseResourceRequest,
  createRecruitmentRequestFromRequest,
  requestStatutColor,
} from '../services/rh/resourceRequests';
import RhAssignWorkersModal from './rh/RhAssignWorkersModal';

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

function fmtDateTime(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
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
    enCours: requests.filter((r) => ['en_cours', 'partielle'].includes(r.statut)).length,
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

  async function handleAssignConfirm(workerIds) {
    if (!detail) return;
    setSaving(true);
    setError('');
    try {
      await setResourceRequestWorkers(detail.id, workerIds);
      await validateResourceRequest(detail.id, { allowPartial: true });
      closeDetail();
      await load();
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
      await openDetail(detail.id);
      await load();
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
      const req = await createRecruitmentRequestFromRequest(detail.id);
      alert(`Demande de recrutement ${req.ref} créée.`);
      await openDetail(detail.id);
      await load();
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

  const assignedCount = detail?.workers?.length || 0;
  const manque = detail ? Math.max(0, (Number(detail.quantite) || 0) - assignedCount) : 0;
  const canAssign = detail && ['en_attente', 'en_cours', 'partielle'].includes(detail.statut);

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">Demandes de ressources</h1>
        <p className="page-subtitle">Traitement RH — affectation des ouvriers sur les chantiers</p>
      </div>

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', marginBottom: 20 }}>
        <div className="stat-card"><div className="stat-body"><div className="stat-value">{stats.total}</div><div className="stat-label">Total</div></div></div>
        <div className="stat-card"><div className="stat-body"><div className="stat-value" style={{ color: '#F57C00' }}>{stats.enAttente}</div><div className="stat-label">En attente</div></div></div>
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
            <select value={statutFilter} onChange={(e) => setStatutFilter(e.target.value)} style={{ ...inputStyle, minWidth: 150 }}>
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
                  <th>Qté</th>
                  <th>Affectés</th>
                  <th>Date souhaitée</th>
                  <th>Priorité</th>
                  <th>Demandeur</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--text-3)' }}>Aucune demande.</td></tr>
                ) : filtered.map((r) => (
                  <tr key={r.id}>
                    <td data-label="Réf." style={{ fontWeight: 700 }}>{r.ref || '—'}</td>
                    <td data-label="Projet">
                      <div style={{ fontWeight: 600 }}>{r.project_name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{r.project_ref}</div>
                    </td>
                    <td data-label="Fonction">{r.fonction}</td>
                    <td data-label="Qté">{r.quantite}</td>
                    <td data-label="Affectés">{r.workers?.length || 0}</td>
                    <td data-label="Date">{fmtDate(r.date_souhaitee)}</td>
                    <td data-label="Priorité">{r.priorite}</td>
                    <td data-label="Demandeur">{r.requested_by_name || '—'}</td>
                    <td data-label="Statut">
                      <span className="badge" style={{ background: requestStatutColor(r.statut), color: '#fff' }}>{r.statutLabel}</span>
                    </td>
                    <td data-label="Actions">
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => openDetail(r.id)} title="Traiter">
                        <Eye size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detail && (
        <div className="rh-emp-modal-overlay" style={{ zIndex: 1200 }}>
          <div className="card" style={{ width: '100%', maxWidth: 600, maxHeight: '90vh', overflow: 'auto', padding: 24 }}>
            <h3 style={{ margin: '0 0 4px', fontFamily: 'var(--font-head)', fontWeight: 800 }}>{detail.ref} — {detail.fonction}</h3>
            <p style={{ margin: '0 0 16px', color: 'var(--text-3)', fontSize: '0.84rem' }}>
              {detail.project_name} ({detail.project_ref}) · {detail.quantite} poste(s) demandé(s) · Priorité {detail.priorite}
            </p>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              <span className="badge" style={{ background: requestStatutColor(detail.statut), color: '#fff' }}>{detail.statutLabel}</span>
              <span className="badge badge-blue">{assignedCount} affecté(s)</span>
              {manque > 0 && <span className="badge badge-orange">{manque} manquant(s)</span>}
            </div>

            {detail.commentaire && (
              <div style={{ padding: 10, background: 'var(--surface-2)', borderRadius: 8, marginBottom: 14, fontSize: '0.84rem' }}>
                <strong>Description / commentaire :</strong>
                <div style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{detail.commentaire}</div>
              </div>
            )}

            <section style={{ marginBottom: 16 }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase' }}>
                <Users size={12} style={{ display: 'inline', marginRight: 4 }} /> Ouvriers affectés
              </div>
              {(detail.workers || []).length ? (
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.86rem' }}>
                  {detail.workers.map((w) => <li key={w.worker_id}>{w.workerName} — {w.fonction}</li>)}
                </ul>
              ) : (
                <div style={{ color: 'var(--text-3)', fontSize: '0.84rem' }}>Aucun ouvrier affecté pour le moment.</div>
              )}
            </section>

            {detail.history?.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase' }}>Historique</div>
                <ul style={{ margin: 0, padding: '0 0 0 16px', fontSize: '0.8rem', color: 'var(--text-2)' }}>
                  {detail.history.map((h) => (
                    <li key={h.id} style={{ marginBottom: 4 }}>
                      {fmtDateTime(h.created_at)} — <strong>{h.action}</strong>
                      {h.details ? ` : ${h.details}` : ''}
                      {h.actor_name ? ` (${h.actor_name})` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={closeDetail}>Fermer</button>
              {detail.statut === 'en_attente' && (
                <button type="button" className="btn btn-secondary" disabled={saving} onClick={handleTakeCharge}>
                  Prendre en charge
                </button>
              )}
              {canAssign && (
                <button type="button" className="btn btn-primary" disabled={saving} onClick={() => setAssignOpen(true)}>
                  <Users size={13} /> Affecter des ouvriers
                </button>
              )}
              {canAssign && (
                <button type="button" className="btn btn-secondary" disabled={saving} onClick={handleRefuse} style={{ color: 'var(--red)' }}>
                  <XCircle size={13} /> Refuser
                </button>
              )}
              {manque > 0 && ['partielle', 'affectee', 'en_cours'].includes(detail.statut) && (
                <button type="button" className="btn btn-secondary" disabled={saving} onClick={handleRecruitment}>
                  <UserPlus size={13} /> Créer demande recrutement
                </button>
              )}
              {['affectee', 'partielle'].includes(detail.statut) && (
                <button type="button" className="btn btn-primary" disabled={saving} onClick={handleClose}>
                  <CheckCircle size={13} /> Clôturer
                </button>
              )}
            </div>
          </div>
        </div>
      )}

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

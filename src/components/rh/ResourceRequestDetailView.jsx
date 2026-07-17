/**
 * ResourceRequestDetailView.jsx — Vue détail pleine page (4 blocs ERP)
 */
import {
  ChevronLeft, Users, UserPlus, CheckCircle, XCircle, Eye, Trash2, Pencil, Clock, Loader2,
} from 'lucide-react';
import {
  recruitmentStatutBadge, recruitmentStatutColor,
} from '../../constants/projectBesoins';
import { requestStatutColor } from '../../services/rh/resourceRequests';
import { getRequestCoverage, getDerivedRequestStatut, canAssignRequest, canCloseRequest, CoverageProgressBar, CoverageBadge } from './resourceRequestUi';

function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR'); } catch { return d; }
}

function fmtDateTime(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleString('fr-FR'); } catch { return d; }
}

function fmtTime(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); } catch { return d; }
}

function Block({ title, subtitle, children, headerRight }) {
  return (
    <section className="card" style={{ marginBottom: 16, padding: 0, overflow: 'hidden' }}>
      <header style={{
        padding: '14px 18px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12,
      }}
      >
        <div>
          <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</div>
          {subtitle && <div style={{ fontSize: '0.78rem', color: 'var(--text-3)', marginTop: 3 }}>{subtitle}</div>}
        </div>
        {headerRight}
      </header>
      <div style={{ padding: 18 }}>{children}</div>
    </section>
  );
}

function KpiMini({ label, value, color }) {
  return (
    <div style={{ padding: '14px 16px', background: 'var(--surface-2)', borderRadius: 8, textAlign: 'center' }}>
      <div style={{ fontSize: '1.5rem', fontWeight: 800, color: color || 'var(--text)', lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', marginTop: 5 }}>{label}</div>
    </div>
  );
}

function InfoCell({ label, children }) {
  return (
    <div>
      <div style={{ color: 'var(--text-3)', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{children}</div>
    </div>
  );
}

export default function ResourceRequestDetailView({
  detail, saving, loading, onBack, onTakeCharge, onAssign, onRecruitment, onRefuse, onCloseRequest, onDelete,
  onRemoveWorker, onViewWorker, onViewRecruitment, onEditRecruitment, onCloseRecruitment,
}) {
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <Loader2 size={28} style={{ animation: 'spin 0.8s linear infinite', color: 'var(--text-3)' }} />
      </div>
    );
  }
  if (!detail) return null;

  const coverage = getRequestCoverage(detail);
  const derived = getDerivedRequestStatut(detail);
  const canAssign = canAssignRequest(detail);
  const openRecruitments = (detail.recruitments || []).filter(
    (r) => !['cloture', 'annule'].includes(r.recruitment_statut),
  );

  return (
    <div className="animate-fade-in rh-request-detail-page">
      <div className="devis-doc-header card" style={{ padding: 0, overflow: 'visible', marginBottom: 16 }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, alignItems: 'center',
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
        }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-ghost btn-sm rh-back-btn" onClick={onBack} aria-label="Retour" style={{ border: '1px solid var(--border)' }}>
              <ChevronLeft size={16} /> Retour
            </button>
            <div>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)' }}>{detail.ref}</div>
              <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>{detail.fonction}</h2>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-3)', marginTop: 2 }}>{detail.project_name}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <CoverageBadge coverage={coverage} />
            <span className="badge" style={{ background: requestStatutColor(derived.statut), color: '#fff' }}>{derived.label}</span>
          </div>
        </div>
        <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-3)', fontWeight: 600 }}>Taux de couverture</span>
          <div style={{ flex: '1 1 200px', maxWidth: 320 }}>
            <CoverageProgressBar taux={coverage.taux} color={coverage.color} />
          </div>
          <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>
            {coverage.assigned} / {coverage.demanded} affectés
          </span>
        </div>
      </div>

      {/* BLOC 1 — Résumé */}
      <Block title="Résumé du besoin">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 18 }}>
          <KpiMini label="Demandées" value={coverage.demanded} color="#1565C0" />
          <KpiMini label="Affectées" value={coverage.assigned} color="#2E7D32" />
          <KpiMini label="Manquantes" value={coverage.manque} color={coverage.manque > 0 ? '#C62828' : '#2E7D32'} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
          <InfoCell label="Projet">{detail.project_name || '—'}</InfoCell>
          <InfoCell label="Client">{detail.client_name || '—'}</InfoCell>
          <InfoCell label="Fonction">{detail.fonction}</InfoCell>
          <InfoCell label="Priorité">{detail.priorite}</InfoCell>
          <InfoCell label="Date souhaitée">{fmtDate(detail.date_souhaitee)}</InfoCell>
          <InfoCell label="Demandeur">{detail.requested_by_name || '—'}</InfoCell>
          <InfoCell label="Statut">
            <span className="badge" style={{ background: requestStatutColor(derived.statut), color: '#fff' }}>{derived.label}</span>
          </InfoCell>
        </div>
        {detail.commentaire && (
          <div style={{ marginTop: 16, padding: 12, background: '#FAFAFA', borderRadius: 8, fontSize: '0.86rem', whiteSpace: 'pre-wrap', border: '1px solid var(--border)' }}>
            {detail.commentaire}
          </div>
        )}
        {derived.statut === 'en_attente' && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px dashed var(--border)' }}>
            <button type="button" className="btn btn-secondary btn-sm" disabled={saving} onClick={onTakeCharge}>
              Prendre en charge
            </button>
          </div>
        )}
      </Block>

      {/* BLOC 2 — Ouvriers affectés */}
      <Block
        title="Ouvriers affectés"
        subtitle="Affectation des ressources disponibles — section distincte du recrutement"
        headerRight={canAssign && (
          <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={onAssign}>
            <Users size={13} /> Affecter des ouvriers
          </button>
        )}
      >
        {(detail.workers || []).length === 0 ? (
          <div style={{ color: 'var(--text-3)', fontSize: '0.86rem', textAlign: 'center', padding: '20px 0' }}>
            Aucun ouvrier affecté — utilisez le bouton ci-dessus pour positionner des ressources disponibles.
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Fonction</th>
                  <th>Téléphone</th>
                  <th>Date affectation</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {detail.workers.map((w) => (
                  <tr key={w.worker_id}>
                    <td style={{ fontWeight: 700 }}>{w.workerName}</td>
                    <td>{w.fonction || '—'}</td>
                    <td>{w.telephone || '—'}</td>
                    <td>{fmtDateTime(w.assigned_at)}</td>
                    <td><span className={`badge ${w.statut === 'actif' ? 'badge-green' : 'badge-grey'}`}>{w.statut || '—'}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button type="button" className="btn btn-ghost btn-sm" title="Voir fiche" onClick={() => onViewWorker?.(w)}><Eye size={13} /></button>
                        {canAssign && (
                          <button type="button" className="btn btn-ghost btn-sm" title="Retirer" style={{ color: 'var(--red)' }} onClick={() => onRemoveWorker?.(w)}><Trash2 size={13} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Block>

      {/* BLOC 3 — Recrutement */}
      <Block
        title="Recrutement à lancer ou en cours"
        subtitle={coverage.manque > 0 ? `${coverage.manque} poste(s) à couvrir par recrutement` : 'Tous les postes sont couverts par affectation'}
        headerRight={coverage.manque > 0 && canAssign && (
          <button type="button" className="btn btn-secondary btn-sm" disabled={saving} onClick={onRecruitment}>
            <UserPlus size={13} /> Créer recrutement
          </button>
        )}
      >
        {openRecruitments.length === 0 ? (
          <div style={{ color: 'var(--text-3)', fontSize: '0.86rem', textAlign: 'center', padding: '20px 0' }}>
            {coverage.manque > 0 ? 'Aucune demande de recrutement lancée pour les postes manquants.' : 'Aucun recrutement en cours.'}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fonction</th>
                  <th>Nombre à recruter</th>
                  <th>Date création</th>
                  <th>Statut recrutement</th>
                  <th>Responsable RH</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {openRecruitments.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.fonction}</td>
                    <td>{r.quantite}</td>
                    <td>{fmtDate(r.created_at)}</td>
                    <td>
                      <span className={`badge ${recruitmentStatutBadge(r.recruitment_statut)}`} style={{ color: recruitmentStatutColor(r.recruitment_statut) }}>
                        {r.recruitment_statutLabel}
                      </span>
                    </td>
                    <td>{r.assigned_by_name || r.requested_by_name || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button type="button" className="btn btn-ghost btn-sm" title="Voir" onClick={() => onViewRecruitment?.(r)}><Eye size={13} /></button>
                        <button type="button" className="btn btn-ghost btn-sm" title="Modifier" onClick={() => onEditRecruitment?.(r)}><Pencil size={13} /></button>
                        <button type="button" className="btn btn-ghost btn-sm" title="Clôturer" onClick={() => onCloseRecruitment?.(r)}><CheckCircle size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Block>

      {/* BLOC 4 — Historique */}
      <Block title="Historique" subtitle="Suivi opérationnel des actions RH">
        {(detail.history || []).length === 0 ? (
          <div style={{ color: 'var(--text-3)', fontSize: '0.86rem', textAlign: 'center', padding: '16px 0' }}>Aucun historique.</div>
        ) : (
          <div style={{ position: 'relative', paddingLeft: 20 }}>
            <div style={{ position: 'absolute', left: 7, top: 4, bottom: 4, width: 2, background: 'var(--border)' }} />
            {[...(detail.history || [])].reverse().map((h) => (
              <div key={h.id} style={{ position: 'relative', marginBottom: 16, paddingLeft: 16 }}>
                <div style={{
                  position: 'absolute', left: -17, top: 4, width: 10, height: 10, borderRadius: '50%',
                  background: 'var(--red)', border: '2px solid #fff', boxShadow: '0 0 0 1px var(--border)',
                }}
                />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', alignItems: 'baseline', marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: '0.86rem' }}>{h.action}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>
                    <Clock size={11} style={{ verticalAlign: -2, marginRight: 3 }} />
                    {fmtDate(h.created_at)} · {fmtTime(h.created_at)}
                  </span>
                  {h.actor_name && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>— {h.actor_name}</span>
                  )}
                </div>
                {h.details && (
                  <div style={{ fontSize: '0.84rem', color: 'var(--text-2)', background: 'var(--surface-2)', padding: '8px 10px', borderRadius: 6 }}>
                    {h.details}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Block>

      {/* Décision */}
      <div className="card" style={{ padding: 16, marginBottom: 24 }}>
        <div style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-3)', marginBottom: 10, textTransform: 'uppercase' }}>Décision</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {canAssign && (
            <button type="button" className="btn btn-secondary btn-sm" disabled={saving} onClick={onRefuse} style={{ color: 'var(--red)' }}>
              <XCircle size={13} /> Refuser
            </button>
          )}
          {canCloseRequest(detail) && (
            <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={onCloseRequest}>
              <CheckCircle size={13} /> Clôturer la demande
            </button>
          )}
          {onDelete && (
            <button type="button" className="btn btn-ghost btn-sm" disabled={saving} onClick={onDelete} style={{ color: 'var(--red)' }}>
              <Trash2 size={13} /> Supprimer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

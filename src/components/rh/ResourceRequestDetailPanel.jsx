/**
 * ResourceRequestDetailPanel.jsx — Détail demande RH en 3 blocs
 */
import { X, Users, UserPlus, CheckCircle, XCircle, Eye, Trash2, Pencil } from 'lucide-react';
import {
  recruitmentStatutBadge, recruitmentStatutColor,
} from '../../constants/projectBesoins';
import { requestStatutColor } from '../../services/rh/resourceRequests';

function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR'); } catch { return d; }
}

function fmtDateTime(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleString('fr-FR'); } catch { return d; }
}

function Block({ title, subtitle, children, headerRight }) {
  return (
    <section style={{ marginBottom: 16, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
      <header style={{ padding: '12px 16px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</div>
          {subtitle && <div style={{ fontSize: '0.78rem', color: 'var(--text-3)', marginTop: 2 }}>{subtitle}</div>}
        </div>
        {headerRight}
      </header>
      <div style={{ padding: 16 }}>{children}</div>
    </section>
  );
}

function KpiMini({ label, value, color }) {
  return (
    <div style={{ padding: '12px 14px', background: 'var(--surface-2)', borderRadius: 8, textAlign: 'center' }}>
      <div style={{ fontSize: '1.35rem', fontWeight: 800, color: color || 'var(--text)', lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', marginTop: 4 }}>{label}</div>
    </div>
  );
}

export default function ResourceRequestDetailPanel({
  detail, saving, onClose, onTakeCharge, onAssign, onRecruitment, onRefuse, onCloseRequest,
  onRemoveWorker, onViewWorker, onViewRecruitment, onEditRecruitment, onCloseRecruitment,
}) {
  if (!detail) return null;

  const assignedCount = detail.workers?.length || 0;
  const needed = Number(detail.quantite) || 0;
  const manque = Math.max(0, needed - assignedCount);
  const canAssign = ['en_attente', 'en_cours', 'partielle', 'recrutement_en_cours'].includes(detail.statut);
  const openRecruitments = (detail.recruitments || []).filter(
    (r) => !['cloture', 'annule'].includes(r.recruitment_statut),
  );

  return (
    <div className="rh-emp-modal-overlay" style={{ zIndex: 1200 }}>
      <aside className="rh-emp-docs-drawer" style={{ maxWidth: 820, width: 'min(96vw, 820px)' }} role="dialog">
        <header className="rh-emp-docs-drawer-header">
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)' }}>{detail.ref}</div>
            <h2 className="rh-emp-docs-drawer-title">{detail.fonction} — {detail.project_name}</h2>
          </div>
          <button type="button" className="rh-emp-modal-close" onClick={onClose}><X size={20} /></button>
        </header>

        <div className="rh-emp-docs-drawer-body">
          {/* BLOC 1 — Résumé */}
          <Block title="Résumé du besoin">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
              <KpiMini label="Demandées" value={needed} color="#1565C0" />
              <KpiMini label="Affectées" value={assignedCount} color="#2E7D32" />
              <KpiMini label="À recruter" value={manque} color={manque > 0 ? '#C62828' : '#2E7D32'} />
            </div>
            <div className="rh-emp-docs-info-grid" style={{ fontSize: '0.86rem' }}>
              <div><span style={{ color: 'var(--text-3)', fontSize: '0.72rem', fontWeight: 700 }}>PROJET</span><div style={{ fontWeight: 600 }}>{detail.project_name}</div></div>
              <div><span style={{ color: 'var(--text-3)', fontSize: '0.72rem', fontWeight: 700 }}>FONCTION</span><div style={{ fontWeight: 600 }}>{detail.fonction}</div></div>
              <div><span style={{ color: 'var(--text-3)', fontSize: '0.72rem', fontWeight: 700 }}>PRIORITÉ</span><div>{detail.priorite}</div></div>
              <div><span style={{ color: 'var(--text-3)', fontSize: '0.72rem', fontWeight: 700 }}>DATE SOUHAITÉE</span><div>{fmtDate(detail.date_souhaitee)}</div></div>
              <div><span style={{ color: 'var(--text-3)', fontSize: '0.72rem', fontWeight: 700 }}>DEMANDEUR</span><div>{detail.requested_by_name || '—'}</div></div>
              <div>
                <span style={{ color: 'var(--text-3)', fontSize: '0.72rem', fontWeight: 700 }}>STATUT</span>
                <div><span className="badge" style={{ background: requestStatutColor(detail.statut), color: '#fff' }}>{detail.statutLabel}</span></div>
              </div>
            </div>
            {detail.commentaire && (
              <div style={{ marginTop: 14, padding: 10, background: '#FAFAFA', borderRadius: 8, fontSize: '0.84rem', whiteSpace: 'pre-wrap' }}>
                {detail.commentaire}
              </div>
            )}
          </Block>

          {/* BLOC 2 — Ouvriers affectés */}
          <Block
            title="Ouvriers affectés"
            subtitle="Ressources déjà positionnées sur ce chantier"
            headerRight={canAssign && (
              <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={onAssign}>
                <Users size={13} /> Affecter des ouvriers
              </button>
            )}
          >
            {(detail.workers || []).length === 0 ? (
              <div style={{ color: 'var(--text-3)', fontSize: '0.86rem', textAlign: 'center', padding: '16px 0' }}>
                Aucun ouvrier affecté — utilisez le bouton ci-dessus.
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
                            <button type="button" className="btn btn-ghost btn-sm" title="Retirer" style={{ color: 'var(--red)' }} onClick={() => onRemoveWorker?.(w)}><Trash2 size={13} /></button>
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
            title="Recrutement en cours"
            subtitle={manque > 0 ? `${manque} poste(s) encore à couvrir` : 'Tous les postes sont couverts'}
            headerRight={manque > 0 && canAssign && (
              <button type="button" className="btn btn-secondary btn-sm" disabled={saving} onClick={onRecruitment}>
                <UserPlus size={13} /> Créer demande recrutement
              </button>
            )}
          >
            {openRecruitments.length === 0 ? (
              <div style={{ color: 'var(--text-3)', fontSize: '0.86rem', textAlign: 'center', padding: '16px 0' }}>
                {manque > 0 ? 'Aucune demande de recrutement lancée pour le moment.' : 'Aucun recrutement en cours.'}
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Fonction</th>
                      <th>À recruter</th>
                      <th>Date création</th>
                      <th>Statut</th>
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
                            <button type="button" className="btn btn-ghost btn-sm" title="Modifier statut" onClick={() => onEditRecruitment?.(r)}><Pencil size={13} /></button>
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

          {/* Actions séparées */}
          <div style={{ display: 'grid', gap: 12 }}>
            {detail.statut === 'en_attente' && (
              <div style={{ padding: '12px 14px', border: '1px dashed var(--border)', borderRadius: 8 }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase' }}>Prise en charge</div>
                <button type="button" className="btn btn-secondary btn-sm" disabled={saving} onClick={onTakeCharge}>Prendre en charge</button>
              </div>
            )}
            <div style={{ padding: '12px 14px', border: '1px dashed var(--border)', borderRadius: 8 }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase' }}>Décision</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {canAssign && (
                  <button type="button" className="btn btn-secondary btn-sm" disabled={saving} onClick={onRefuse} style={{ color: 'var(--red)' }}>
                    <XCircle size={13} /> Refuser
                  </button>
                )}
                {['affectee', 'partielle', 'recrutement_en_cours'].includes(detail.statut) && (
                  <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={onCloseRequest}>
                    <CheckCircle size={13} /> Clôturer
                  </button>
                )}
              </div>
            </div>
          </div>

          {detail.history?.length > 0 && (
            <details style={{ marginTop: 16, fontSize: '0.82rem' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 700, color: 'var(--text-3)' }}>Historique ({detail.history.length})</summary>
              <ul style={{ margin: '10px 0 0', paddingLeft: 18 }}>
                {detail.history.map((h) => (
                  <li key={h.id} style={{ marginBottom: 4 }}>
                    {fmtDateTime(h.created_at)} — <strong>{h.action}</strong>
                    {h.details ? ` : ${h.details}` : ''}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </aside>
    </div>
  );
}

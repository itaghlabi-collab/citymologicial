/**
 * BesoinDetailModal.jsx — Fiche complète besoin RH
 */
import { X, Download, Users, Send } from 'lucide-react';
import { prioriteBadgeClass } from '../../../constants/projectBesoins';

function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR'); } catch { return d; }
}

function fmtDateTime(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleString('fr-FR'); } catch { return d; }
}

function InfoRow({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
      <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{value || '—'}</div>
    </div>
  );
}

export default function BesoinDetailModal({
  open, onClose, need, projet, onPdf, onAssign, onRh, onEdit,
}) {
  if (!open || !need) return null;

  const coverageColor = need.manque === 0 ? '#2E7D32' : need.quantite_affectee > 0 ? '#F57C00' : '#C62828';
  const coverageLabel = need.manque === 0 ? 'Couvert' : need.quantite_affectee > 0 ? 'Partiel' : 'Non couvert';

  return (
    <div className="rh-emp-modal-overlay" style={{ zIndex: 1350 }}>
      <aside className="rh-emp-docs-drawer" style={{ maxWidth: 720, width: 'min(96vw, 720px)' }} role="dialog">
        <header className="rh-emp-docs-drawer-header">
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)' }}>{need.ref_besoin || 'Besoin RH'}</div>
            <h2 className="rh-emp-docs-drawer-title">{need.type_besoin} — {need.fonction}</h2>
          </div>
          <button type="button" className="rh-emp-modal-close" onClick={onClose}><X size={20} /></button>
        </header>
        <div className="rh-emp-docs-drawer-body">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            <span className={`badge ${need.statutBadge}`} style={{ fontSize: '0.78rem' }}>{need.statutLabel}</span>
            <span className={`badge ${prioriteBadgeClass(need.priorite)}`}>{need.priorite}</span>
            <span className="badge" style={{ background: `${coverageColor}22`, color: coverageColor }}>{coverageLabel}</span>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
            {onEdit && <button type="button" className="btn btn-secondary btn-sm" onClick={() => onEdit(need)}>Modifier</button>}
            {onAssign && <button type="button" className="btn btn-primary btn-sm" onClick={() => onAssign(need)}><Users size={14} /> Affecter</button>}
            {onRh && need.manque > 0 && !need.resource_request_id && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => onRh(need)}><Send size={14} /> Créer demande RH</button>
            )}
            {onPdf && <button type="button" className="btn btn-ghost btn-sm" onClick={() => onPdf(need)}><Download size={14} /> PDF</button>}
          </div>

          <section style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--red)', textTransform: 'uppercase', marginBottom: 12 }}>Informations générales</h3>
            <div className="rh-emp-docs-info-grid">
              <InfoRow label="Projet" value={projet?.nom} />
              <InfoRow label="Client" value={projet?.client} />
              <InfoRow label="Type" value={need.type_besoin} />
              <InfoRow label="Fonction" value={need.fonction} />
              <InfoRow label="Demandé / Affecté / Manque" value={`${need.quantite_necessaire} / ${need.quantite_affectee} / ${need.manque}`} />
              <InfoRow label="Date début" value={fmtDate(need.date_debut_souhaitee)} />
              <InfoRow label="Date fin" value={fmtDate(need.date_fin_estimee)} />
              <InfoRow label="Durée prévue" value={need.duree_prevue} />
              <InfoRow label="Responsable" value={need.responsable_demande} />
            </div>
          </section>

          {need.description_travaux && (
            <section style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: '0.78rem', fontWeight: 800, marginBottom: 6 }}>Description des travaux</h3>
              <p style={{ fontSize: '0.86rem', margin: 0, whiteSpace: 'pre-wrap' }}>{need.description_travaux}</p>
            </section>
          )}

          {(need.competences || need.epi_obligatoires) && (
            <section style={{ marginBottom: 16, fontSize: '0.86rem' }}>
              {need.competences && <div><strong>Compétences :</strong> {need.competences}</div>}
              {need.epi_obligatoires && <div style={{ marginTop: 6 }}><strong>EPI :</strong> {need.epi_obligatoires}</div>}
            </section>
          )}

          {need.observation && (
            <section style={{ marginBottom: 16, fontSize: '0.86rem' }}>
              <strong>Observation :</strong> {need.observation}
            </section>
          )}

          <section style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: '0.78rem', fontWeight: 800, marginBottom: 8 }}>Ouvriers / ressources affectés</h3>
            {(need.ressources_affectees || []).length ? (
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.86rem' }}>
                {need.ressources_affectees.map((n) => <li key={n}>{n}</li>)}
              </ul>
            ) : (
              <div style={{ color: 'var(--text-3)', fontSize: '0.84rem' }}>Aucune ressource affectée pour le moment.</div>
            )}
          </section>

          {need.history?.length > 0 && (
            <section>
              <h3 style={{ fontSize: '0.78rem', fontWeight: 800, marginBottom: 10 }}>Historique</h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.82rem' }}>
                {need.history.map((h) => (
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
    </div>
  );
}

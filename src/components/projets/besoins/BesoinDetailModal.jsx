/**
 * BesoinDetailModal.jsx — Consultation besoin (lecture seule côté affectation)
 */
import { X, Download } from 'lucide-react';
import { prioriteBadgeClass, canEditProjectNeed } from '../../../constants/projectBesoins';

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
  open, onClose, need, projet, onPdf, onEdit,
}) {
  if (!open || !need) return null;

  const coverageColor = need.manque === 0 ? '#2E7D32' : need.quantite_affectee > 0 ? '#F57C00' : '#C62828';
  const coverageLabel = need.manque === 0 ? 'Couvert' : need.quantite_affectee > 0 ? 'Partiel' : 'Non couvert';
  const editable = canEditProjectNeed(need);

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
          <div style={{ padding: '10px 12px', background: '#F5F5F5', borderRadius: 8, fontSize: '0.82rem', color: 'var(--text-2)', marginBottom: 16 }}>
            L&apos;affectation des ouvriers est gérée par le service RH. Ce besoin est mis à jour automatiquement après validation RH.
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            <span className={`badge ${need.statutBadge}`} style={{ fontSize: '0.78rem' }}>{need.statutLabel}</span>
            <span className={`badge ${prioriteBadgeClass(need.priorite)}`}>{need.priorite}</span>
            <span className="badge" style={{ background: `${coverageColor}22`, color: coverageColor }}>{coverageLabel}</span>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
            {editable && onEdit && <button type="button" className="btn btn-secondary btn-sm" onClick={() => onEdit(need)}>Modifier</button>}
            {onPdf && <button type="button" className="btn btn-ghost btn-sm" onClick={() => onPdf(need)}><Download size={14} /> PDF</button>}
          </div>

          <section style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--red)', textTransform: 'uppercase', marginBottom: 12 }}>Informations générales</h3>
            <div className="rh-emp-docs-info-grid">
              <InfoRow label="Projet" value={projet?.nom} />
              <InfoRow label="Type" value={need.type_besoin} />
              <InfoRow label="Fonction / métier" value={need.fonction} />
              <InfoRow label="Demandé / Affecté / Manque" value={`${need.quantite_necessaire} / ${need.quantite_affectee} / ${need.manque}`} />
              <InfoRow label="Date début" value={fmtDate(need.date_debut_souhaitee)} />
              <InfoRow label="Date fin" value={fmtDate(need.date_fin_estimee)} />
              <InfoRow label="Responsable" value={need.responsable_demande} />
            </div>
          </section>

          {need.description_travaux && (
            <section style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: '0.78rem', fontWeight: 800, marginBottom: 6 }}>Description des travaux</h3>
              <p style={{ fontSize: '0.86rem', margin: 0, whiteSpace: 'pre-wrap' }}>{need.description_travaux}</p>
            </section>
          )}

          {need.observation && (
            <section style={{ marginBottom: 16, fontSize: '0.86rem' }}>
              <strong>Observation :</strong> {need.observation}
            </section>
          )}

          <section style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: '0.78rem', fontWeight: 800, marginBottom: 8 }}>Ouvriers affectés (via RH)</h3>
            {(need.ressources_affectees || []).length ? (
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.86rem' }}>
                {need.ressources_affectees.map((n) => <li key={n}>{n}</li>)}
              </ul>
            ) : (
              <div style={{ color: 'var(--text-3)', fontSize: '0.84rem' }}>En attente d&apos;affectation par le service RH.</div>
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

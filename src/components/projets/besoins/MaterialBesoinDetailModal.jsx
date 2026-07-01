/**
 * MaterialBesoinDetailModal.jsx — Détail fiche besoins matériaux
 */
import { X, Download, Edit2, Trash2, Send } from 'lucide-react';
import { canEditMaterialBesoin, canSubmitMaterialBesoin } from '../../../constants/projectMaterialBesoins';

function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR'); } catch { return d; }
}

export default function MaterialBesoinDetailModal({
  open, onClose, item, projet, onPdf, onEdit, onDelete, onSubmit,
}) {
  if (!open || !item) return null;

  return (
    <div className="rh-emp-modal-overlay" style={{ zIndex: 1290 }}>
      <div className="card" style={{ width: 'min(96vw, 820px)', maxHeight: '92vh', overflow: 'auto', padding: 0 }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
          <div>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>Fiche besoin matériaux</div>
            <h3 style={{ margin: 0, fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.05rem' }}>
              {item.ref_besoin || '—'}
            </h3>
          </div>
          <button type="button" className="rh-emp-modal-close" onClick={onClose}><X size={20} /></button>
        </header>

        <div style={{ padding: '20px 22px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 16, fontSize: '0.86rem' }}>
            <div><span style={{ color: 'var(--text-3)', fontSize: '0.72rem' }}>Projet</span><div style={{ fontWeight: 600 }}>{projet?.nom || item.project_name || '—'}</div></div>
            <div><span style={{ color: 'var(--text-3)', fontSize: '0.72rem' }}>Client</span><div>{projet?.client || item.client_name || '—'}</div></div>
            <div><span style={{ color: 'var(--text-3)', fontSize: '0.72rem' }}>Demandeur</span><div>{item.demandeur_name || '—'}</div></div>
            <div><span style={{ color: 'var(--text-3)', fontSize: '0.72rem' }}>Date</span><div>{fmtDate(item.date_besoin)}</div></div>
            <div><span style={{ color: 'var(--text-3)', fontSize: '0.72rem' }}>Priorité</span><div><span className={`badge ${item.priorite === 'Urgente' ? 'badge-orange' : 'badge-blue'}`}>{item.priorite}</span></div></div>
            <div><span style={{ color: 'var(--text-3)', fontSize: '0.72rem' }}>Statut</span><div><span className={`badge ${item.statutBadge}`}>{item.statutLabel}</span></div></div>
          </div>

          <div className="table-wrap" style={{ marginBottom: 16 }}>
            <table>
              <thead>
                <tr>
                  <th>Désignation</th>
                  <th>Quantité</th>
                  <th>Unité</th>
                  <th>Lot</th>
                  <th>Date souhaitée</th>
                  <th>Observation</th>
                </tr>
              </thead>
              <tbody>
                {(item.lines || []).map((l, i) => (
                  <tr key={l.id || i}>
                    <td style={{ fontWeight: 600 }}>{l.designation}</td>
                    <td>{l.quantite}</td>
                    <td>{l.unite}</td>
                    <td>{l.lot}</td>
                    <td>{fmtDate(l.date_souhaitee)}</td>
                    <td>{l.observation || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {item.observation && (
            <div style={{ marginBottom: 16, fontSize: '0.86rem' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 4 }}>Observation chantier</div>
              <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: 12 }}>{item.observation}</div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onPdf?.(item)}><Download size={13} /> PDF</button>
            {canSubmitMaterialBesoin(item) && (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => onSubmit?.(item)}><Send size={13} /> Soumettre</button>
            )}
            {canEditMaterialBesoin(item) && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => onEdit?.(item)}><Edit2 size={13} /> Modifier</button>
            )}
            <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => onDelete?.(item)}><Trash2 size={13} /> Supprimer</button>
          </div>
        </div>
      </div>
    </div>
  );
}

import { X, FileText } from 'lucide-react';

import { resolveLigneDescription } from '../../utils/crm/devisLineDescription';

function fmtMAD(v) {
  const n = Number(v);
  if (Number.isNaN(n)) return '0,00 MAD';
  return n.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' MAD';
}

function fmtDate(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return d;
  }
}

export default function DevisPreviewModal({ devis, articles = [], onClose }) {
  if (!devis) return null;

  const clientNom = devis.client_nom
    || [devis.client?.prenom, devis.client?.nom].filter(Boolean).join(' ')
    || devis.client?.nom
    || '—';

  const lignes = devis.lignes || [];
  let articleNum = 0;

  return (
    <div className="crm-modal-overlay" onClick={onClose} role="presentation">
      <div
        className="crm-modal crm-devis-preview"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="devis-preview-title"
      >
        <div className="crm-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FileText size={18} style={{ color: 'var(--red)' }} />
            <div>
              <h2 id="devis-preview-title" className="crm-modal-title">Aperçu devis</h2>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-3)' }}>{devis.reference}</div>
            </div>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Fermer">
            <X size={18} />
          </button>
        </div>

        <div className="crm-modal-body">
          <div className="crm-devis-preview-grid">
            <div><span className="crm-preview-label">Titre</span><strong>{devis.titre || '—'}</strong></div>
            <div><span className="crm-preview-label">Client</span><strong>{clientNom}</strong></div>
            <div><span className="crm-preview-label">Commercial</span>{devis.commercial || '—'}</div>
            <div><span className="crm-preview-label">Date</span>{fmtDate(devis.date_creation)}</div>
            <div><span className="crm-preview-label">Validité</span>{fmtDate(devis.date_validite)}</div>
            <div><span className="crm-preview-label">Statut</span>{devis.statut || '—'}</div>
          </div>

          <div style={{ marginTop: 18 }}>
            <div className="crm-preview-section-title">Lignes du devis</div>
            {lignes.length === 0 ? (
              <div style={{ color: 'var(--text-3)', fontSize: '0.85rem' }}>Aucune ligne</div>
            ) : (
              <div className="crm-devis-preview-lines">
                {lignes.map((l, i) => {
                  if (l.type === 'titre') {
                    return (
                      <div key={l._id || l.id || i} className="crm-devis-preview-line crm-devis-preview-line--titre">
                        {l.designation}
                      </div>
                    );
                  }
                  if (l.type === 'sous_titre') {
                    return (
                      <div key={l._id || l.id || i} className="crm-devis-preview-line crm-devis-preview-line--sous-titre">
                        {l.designation}
                      </div>
                    );
                  }
                  if (l.type !== 'article') return null;
                  articleNum += 1;
                  const ht = Number(l.quantite) * Number(l.prix_ht) * (1 - Number(l.remise || 0) / 100);
                  const description = resolveLigneDescription(l, articles);
                  return (
                    <div key={l._id || l.id || i} className="crm-devis-preview-line">
                      <div className="crm-devis-preview-line-head">
                        <span>#{articleNum} {l.designation}</span>
                        <strong>{fmtMAD(ht)}</strong>
                      </div>
                      <div className="crm-devis-preview-line-meta">
                        {l.quantite} {l.unite} × {fmtMAD(l.prix_ht)}
                      </div>
                      {description && (
                        <div className="crm-devis-preview-line-desc">{description}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="crm-devis-preview-totals">
            <div><span>Total HT</span><strong>{fmtMAD(devis.total_ht)}</strong></div>
            <div><span>TVA</span><strong>{fmtMAD(devis.total_tva)}</strong></div>
            <div className="crm-devis-preview-total-ttc"><span>Total TTC</span><strong>{fmtMAD(devis.total_ttc)}</strong></div>
          </div>
        </div>

        <div className="crm-modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );
}

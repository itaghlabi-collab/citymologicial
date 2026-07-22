/**
 * SiteRequestCreateModeModal — Choix catalogue stock vs demande manuelle
 * N'altère pas SiteRequestForm (catalogue).
 */
import { Package, PenLine, X } from 'lucide-react';

export default function SiteRequestCreateModeModal({ open, onClose, onSelectCatalogue, onSelectManual }) {
  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 2100, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-labelledby="sr-create-mode-title"
        style={{
          background: '#fff', borderRadius: 14, width: '100%', maxWidth: 520,
          boxShadow: '0 16px 48px rgba(0,0,0,0.18)', overflow: 'hidden',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 22px', borderBottom: '1px solid var(--border)',
        }}
        >
          <div>
            <div id="sr-create-mode-title" style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.05rem' }}>
              Ajouter un besoin matériel
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-3)', marginTop: 4 }}>
              Choisissez le mode de création
            </div>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '4px 8px' }} onClick={onClose} aria-label="Fermer">
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: 20, display: 'grid', gap: 12 }}>
          <button
            type="button"
            onClick={onSelectCatalogue}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 14, textAlign: 'left',
              padding: '16px 18px', borderRadius: 12, border: '1.5px solid var(--border)',
              background: '#fff', cursor: 'pointer', width: '100%',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--red)'; e.currentTarget.style.background = '#FFF8F8'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = '#fff'; }}
          >
            <span style={{
              width: 42, height: 42, borderRadius: 10, background: '#FFEBEE', color: 'var(--red)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
            >
              <Package size={20} />
            </span>
            <span>
              <span style={{ display: 'block', fontWeight: 800, fontSize: '0.95rem', marginBottom: 4 }}>
                Depuis le catalogue stock
              </span>
              <span style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-2)', lineHeight: 1.4 }}>
                Formulaire actuel — articles du catalogue, mêmes calculs et workflow magasinier.
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={onSelectManual}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 14, textAlign: 'left',
              padding: '16px 18px', borderRadius: 12, border: '1.5px solid var(--border)',
              background: '#fff', cursor: 'pointer', width: '100%',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#EF6C00'; e.currentTarget.style.background = '#FFF8F0'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = '#fff'; }}
          >
            <span style={{
              width: 42, height: 42, borderRadius: 10, background: '#FFF3E0', color: '#EF6C00',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
            >
              <PenLine size={20} />
            </span>
            <span>
              <span style={{ display: 'block', fontWeight: 800, fontSize: '0.95rem', marginBottom: 4 }}>
                Demande manuelle
              </span>
              <span style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-2)', lineHeight: 1.4 }}>
                Matériel hors catalogue — saisie libre, transmission automatique au magasinier.
              </span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * achats/shared.jsx — Composants partagés module Achats ERP CITYMO
 */
import { useState, useRef } from 'react';
import { X, Plus, Loader2, FileText, Image as ImageIcon, Trash2 } from 'lucide-react';
import { uploadPurchaseFile } from '../../services/achats/purchaseStorage';
import { formatFileSize } from '../../services/uploadService';

export const INPUT_STYLE = {
  width: '100%', padding: '8px 11px', border: '1.5px solid var(--border)',
  borderRadius: 6, fontSize: '0.86rem', background: '#fff', outline: 'none',
  fontFamily: 'var(--font-body)', color: 'var(--text)', boxSizing: 'border-box'
};
export const SELECT_STYLE = { ...INPUT_STYLE, cursor: 'pointer' };
export const TEXTAREA_STYLE = { ...INPUT_STYLE, minHeight: 72, resize: 'vertical' };

export const MODES_PAIEMENT   = ['Espèces', 'Virement', 'Chèque', 'Carte bancaire', 'Mobile payment', 'Autre'];
export const STATUTS_DEMANDE  = [
  'Brouillon', 'Soumise', 'En étude', 'Devis reçus', 'En attente validation DG',
  'Devis validé', 'Ordre d\'achat créé', 'Ordre de paiement créé', 'Commande envoyée', 'En attente réception', 'Réceptionnée', 'Clôturée', 'Refusée',
];
export const PRIORITES        = ['Faible', 'Normale', 'Haute', 'Urgente'];
export const STATUTS_BC       = ['Brouillon', 'Envoyé', 'Validé', 'Partiellement reçu', 'Reçu', 'Annulé'];
export const STATUTS_ORDRE    = ['Brouillon', 'Validé', 'Envoyé fournisseur', 'En attente réception', 'Réceptionné', 'Clôturé'];
export const STATUTS_OP_ACHATS = ['À préparer', 'Initié', 'Payé', 'Annulé'];
export const DEVISES          = ['MAD', 'EUR', 'USD'];
export const TVA_OPTIONS      = [0, 7, 10, 14, 20];
export const CATEGORIES_FOURN = ['Matériaux', 'Équipements', 'Services', 'Fournitures', 'Transport', 'Sous-traitance', 'Informatique', 'Autre'];

export const BADGE_DEMANDE = {
  'Brouillon': 'badge-grey', 'Soumise': 'badge-blue', 'En étude': 'badge-orange',
  'Devis reçus': 'badge-purple', 'En attente validation DG': 'badge-orange', 'Devis validé': 'badge-green',
  'Validée': 'badge-green', 'Ordre d\'achat créé': 'badge-green', 'Ordre de paiement créé': 'badge-green', 'Commande envoyée': 'badge-blue',
  'En attente réception': 'badge-orange', 'Réceptionnée': 'badge-purple', 'Clôturée': 'badge-grey', 'Refusée': 'badge-red',
  'En attente': 'badge-orange', 'En cours': 'badge-blue', 'Terminée': 'badge-purple',
  'En étude Achats': 'badge-orange', 'En validation DG': 'badge-orange',
  'Commande en cours': 'badge-blue', 'Commande reçue': 'badge-purple',
};
export const BADGE_BC = {
  'Brouillon': 'badge-grey', 'Envoyé': 'badge-blue', 'Validé': 'badge-green',
  'Partiellement reçu': 'badge-orange', 'Reçu': 'badge-purple', 'Annulé': 'badge-red',
};
export const BADGE_ORDRE = {
  'Brouillon': 'badge-grey', 'Validé': 'badge-green', 'Envoyé fournisseur': 'badge-blue',
  'En attente réception': 'badge-orange', 'Réceptionné': 'badge-purple', 'Clôturé': 'badge-grey',
  'En attente validation': 'badge-orange', 'Refusé': 'badge-red', 'Commandé': 'badge-blue',
};
export const BADGE_OP_ACHATS = {
  'À préparer': 'badge-orange', 'Initié': 'badge-blue', 'Payé': 'badge-green',
  'En attente validation DG': 'badge-orange', 'Validé': 'badge-blue',
  'Annulé': 'badge-red', Brouillon: 'badge-grey', 'En attente': 'badge-orange',
};
export const BADGE_PRIORITE = {
  'Faible': 'badge-grey', 'Normale': 'badge-blue', 'Haute': 'badge-orange', 'Urgente': 'badge-red',
};

export function formatMAD(n) {
  if (n === undefined || n === null || n === '') return '—';
  const num = Number(n);
  if (isNaN(num)) return '—';
  return num.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' MAD';
}

export function genRef(prefix) {
  const y = new Date().getFullYear();
  return prefix + '-' + y + '-' + String(Math.floor(Math.random() * 900) + 100);
}

export function genId() { return Date.now() + Math.random(); }

export function KpiCard({ icon, label, value, sub, color }) {
  const colors = { red: 'var(--red)', blue: '#1565C0', green: '#2E7D32', orange: '#E65100', grey: 'var(--text-3)', purple: '#6A1B9A' };
  const bg     = { red: 'var(--red-light)', blue: '#E3F2FD', green: '#E8F5E9', orange: '#FFF3E0', grey: 'var(--surface-2)', purple: '#F3E5F5' };
  const c = color || 'grey';
  return (
    <div className="stat-card">
      <div className="stat-icon" style={{ background: bg[c], color: colors[c] }}>{icon}</div>
      <div className="stat-body">
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
        {sub && <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, sub, action, onAction }) {
  return (
    <div style={{ textAlign: 'center', padding: '52px 24px', color: 'var(--text-3)' }}>
      <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
        {icon}
      </div>
      <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '1rem', color: 'var(--text-2)', marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: '0.84rem', marginBottom: action ? 20 : 0 }}>{sub}</div>
      {action && (
        <button className="btn btn-primary btn-sm" onClick={onAction} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Plus size={14} /> {action}
        </button>
      )}
    </div>
  );
}

export function Modal({ open, onClose, title, children, width }) {
  if (!open) return null;
  return (
    <div
      className="achats-modal-overlay"
      role="presentation"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="achats-modal-box"
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Dialogue'}
        style={{ maxWidth: width || 640 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="achats-modal-header">
          <h2 className="achats-modal-title">{title}</h2>
          <button
            type="button"
            className="achats-modal-close"
            onClick={onClose}
            aria-label="Fermer"
            title="Fermer"
          >
            <X size={20} strokeWidth={2.5} aria-hidden="true" />
          </button>
        </div>
        <div className="achats-modal-body">{children}</div>
      </div>
    </div>
  );
}

export function SectionTitle({ children, icon }) {
  return (
    <div style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14, paddingBottom: 8, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 7 }}>
      {icon}{children}
    </div>
  );
}

export function FField({ label, required, children }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>
        {label}{required && <span style={{ color: 'var(--red)', marginLeft: 3 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

export function FRow({ children }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 14, marginBottom: 14 }}>{children}</div>;
}

function fileIcon(mime) {
  if (mime?.startsWith('image/')) return <ImageIcon size={13} />;
  return <FileText size={13} />;
}

export function UploadField({
  label,
  value = [],
  onChange,
  multiple = true,
  accept = '.pdf,.jpg,.jpeg,.png,.webp,.gif',
  scope = 'requests',
  scopeId,
  disabled = false,
}) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const files = Array.isArray(value) ? value : (value ? [value] : []);

  async function handleFiles(selected) {
    if (!selected?.length || disabled) return;
    setUploading(true);
    setError('');
    try {
      const uploaded = [];
      for (const file of selected) {
        const storage_path = await uploadPurchaseFile(file, { scope, scopeId: scopeId || 'draft' });
        uploaded.push({
          name: file.name,
          size: file.size,
          type: file.type,
          storage_path,
        });
      }
      const next = multiple ? [...files, ...uploaded] : uploaded.slice(0, 1);
      onChange?.(multiple ? next : next[0] || null);
    } catch (err) {
      setError(err.message || 'Erreur upload');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function removeAt(index) {
    const next = files.filter((_, i) => i !== index);
    onChange?.(multiple ? next : next[0] || null);
  }

  return (
    <div>
      {label && (
        <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>
          {label}
        </label>
      )}
      <label
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
          border: '1.5px dashed var(--border)', borderRadius: 6,
          cursor: disabled || uploading ? 'not-allowed' : 'pointer',
          background: 'var(--surface-2)', fontSize: '0.82rem', color: 'var(--text-3)',
          opacity: disabled || uploading ? 0.65 : 1,
        }}
      >
        {uploading ? <Loader2 size={14} className="cin-spin" /> : <Plus size={14} />}
        <span>{uploading ? 'Envoi en cours…' : 'Cliquer pour ajouter un fichier (PDF, image)'}</span>
        <input
          ref={inputRef}
          type="file"
          multiple={multiple}
          accept={accept}
          style={{ display: 'none' }}
          disabled={disabled || uploading}
          onChange={(e) => handleFiles(Array.from(e.target.files || []))}
        />
      </label>
      {error && <div style={{ color: 'var(--red)', fontSize: '0.72rem', marginTop: 4 }}>{error}</div>}
      {files.length > 0 && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {files.map((f, i) => (
            <div
              key={`${f.storage_path || f.name}-${i}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                background: '#fff', border: '1px solid var(--border)', borderRadius: 6, fontSize: '0.8rem',
              }}
            >
              {fileIcon(f.type)}
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
              {f.size ? <span style={{ color: 'var(--text-3)', fontSize: '0.72rem' }}>{formatFileSize(f.size)}</span> : null}
              {f.url && (
                <a href={f.url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{ padding: '2px 6px' }}>
                  Voir
                </a>
              )}
              {!disabled && (
                <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--red)', padding: '2px 6px' }} onClick={() => removeAt(i)}>
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

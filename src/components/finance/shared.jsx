/**
 * finance/shared.jsx — Composants partagés module Finance ERP CITYMO
 */
import { X, Plus } from 'lucide-react';

export const INPUT_STYLE = {
  width: '100%', padding: '8px 11px', border: '1.5px solid var(--border)',
  borderRadius: 6, fontSize: '0.86rem', background: '#fff', outline: 'none',
  fontFamily: 'var(--font-body)', color: 'var(--text)', boxSizing: 'border-box'
};
export const SELECT_STYLE = { ...INPUT_STYLE, cursor: 'pointer' };
export const TEXTAREA_STYLE = { ...INPUT_STYLE, minHeight: 72, resize: 'vertical' };

export const MODES_PAIEMENT = ['Espèces', 'Virement', 'Chèque', 'Carte bancaire', 'Mobile payment', 'Autre'];
export const STATUTS_CHARGE = ['Brouillon', 'Validé', 'Payé', 'Annulé', 'En attente validation', 'Validée', 'Refusée', 'Comptabilisée'];
export const STATUTS_ORDRE  = ['Brouillon', 'Soumis', 'Validé', 'Payé', 'Annulé', 'En attente', 'Exécuté', 'Refusé', 'Comptabilisé'];
export const TYPES_ENTREE_CAISSE = ['alimentation_caisse', 'reglement_client', 'remboursement', 'autre_entree'];
export const TYPES_SORTIE_CAISSE = ['charge', 'ordre_paiement', 'autre_sortie'];
export const STATUTS_CAT    = ['Active', 'Inactive', 'Archivée'];
export const TYPES_BENEF    = ['Fournisseur', 'Employé', 'Sous-traitant', 'Autre'];

export const BADGE_STATUT_CHARGE = {
  'Brouillon':             'badge-grey',
  'Validé':                'badge-green',
  'Payé':                  'badge-blue',
  'Annulé':                'badge-red',
  'En attente validation': 'badge-orange',
  'Validée':               'badge-green',
  'Refusée':               'badge-red',
  'Comptabilisée':         'badge-blue',
};
export const BADGE_STATUT_ORDRE = {
  'Brouillon':    'badge-grey',
  'Soumis':       'badge-orange',
  'Validé':       'badge-green',
  'Payé':         'badge-blue',
  'Annulé':       'badge-red',
  'En attente':   'badge-orange',
  'Exécuté':      'badge-blue',
  'Refusé':       'badge-red',
  'Comptabilisé': 'badge-purple',
};
export const BADGE_STATUT_CAT = {
  'Active':    'badge-green',
  'Inactive':  'badge-grey',
  'Archivée':  'badge-orange',
};

export function formatMAD(n) {
  if (n === undefined || n === null || n === '') return '—';
  const num = Number(n);
  if (isNaN(num)) return '—';
  // Compact: 1 234 567,00 MAD
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
        {sub && <div className="stat-sub" style={{ fontSize: '0.7rem', color: 'var(--text-3)', marginTop: 2 }}>{sub}</div>}
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
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: width || 640, maxHeight: '92vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
          <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.05rem', letterSpacing: '0.04em' }}>{title}</div>
          <button className="btn btn-ghost btn-sm" style={{ padding: '4px 8px' }} onClick={onClose}><X size={16} /></button>
        </div>
        <div style={{ padding: '24px' }}>{children}</div>
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
  return <div className="finance-form-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 14, marginBottom: 14 }}>{children}</div>;
}

export function UploadField({ label, onFiles }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>{label}</label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', border: '1.5px dashed var(--border)', borderRadius: 6, cursor: 'pointer', background: 'var(--surface-2)', fontSize: '0.82rem', color: 'var(--text-3)' }}>
        <Plus size={14} />
        <span>Cliquer pour ajouter un fichier</span>
        <input type="file" multiple style={{ display: 'none' }} onChange={e => onFiles && onFiles(Array.from(e.target.files))} />
      </label>
    </div>
  );
}

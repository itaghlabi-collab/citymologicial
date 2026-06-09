/**
 * documents/shared.jsx — Composants partagés module Documents ERP CITYMO
 */
import { useState } from 'react';
import { X, Plus, Share2 } from 'lucide-react';
import { DOCUMENT_DEPARTMENTS, normalizeDocumentDepartment } from '../../constants/documentDepartments';

export { DOCUMENT_DEPARTMENTS, normalizeDocumentDepartment };

export const INPUT_STYLE = {
  width: '100%', padding: '8px 11px', border: '1.5px solid var(--border)',
  borderRadius: 6, fontSize: '0.86rem', background: '#fff', outline: 'none',
  fontFamily: 'var(--font-body)', color: 'var(--text)', boxSizing: 'border-box'
};
export const SELECT_STYLE = { ...INPUT_STYLE, cursor: 'pointer' };
export const TEXTAREA_STYLE = { ...INPUT_STYLE, minHeight: 72, resize: 'vertical' };

export function KpiCard({ icon, label, value, sub, color }) {
  const colors = { red: 'var(--red)', blue: '#1565C0', green: '#2E7D32', orange: '#E65100', grey: 'var(--text-3)' };
  const bg     = { red: 'var(--red-light)', blue: '#E3F2FD', green: '#E8F5E9', orange: '#FFF3E0', grey: 'var(--surface-2)' };
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
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 14, marginBottom: 14 }}>{children}</div>;
}

export const TYPE_COLORS = {
  PDF: 'badge-red', Excel: 'badge-green', Word: 'badge-blue',
  Image: 'badge-orange', ZIP: 'badge-grey', Video: 'badge-grey', Autre: 'badge-grey'
};

export const TYPES_FICHIER = ['PDF', 'Word', 'Excel', 'Image', 'ZIP', 'Video', 'Autre'];
export const CATEGORIES_DOC = ['Contrat', 'Devis', 'Facture', 'Plan', 'Rapport', 'Photo', 'Juridique', 'RH', 'Comptabilite', 'Autre'];
export const NIVEAUX_ACCES = ['Privé', 'Équipe', 'Département', 'Entreprise'];
export const PERMISSIONS = ['Lecture seule', 'Téléchargement', 'Modification', 'Accès complet'];

export function DepartmentSelect({
  value,
  onChange,
  required = false,
  style,
  placeholder = 'Sélectionner un département',
  disabled = false,
}) {
  const normalized = normalizeDocumentDepartment(value);
  return (
    <select
      value={normalized}
      onChange={(e) => onChange(e.target.value)}
      style={{ ...(style || SELECT_STYLE), ...(disabled ? { background: 'var(--surface-2)', cursor: 'not-allowed' } : {}) }}
      required={required}
      disabled={disabled}
    >
      <option value="">{placeholder}</option>
      {DOCUMENT_DEPARTMENTS.map((d) => (
        <option key={d} value={d}>{d}</option>
      ))}
    </select>
  );
}

export function DepartmentFilterSelect({ value, onChange, style, allLabel = 'Tous départements' }) {
  return (
    <select value={value || ''} onChange={(e) => onChange(e.target.value)} style={style || SELECT_STYLE}>
      <option value="">{allLabel}</option>
      {DOCUMENT_DEPARTMENTS.map((d) => (
        <option key={d} value={d}>{d}</option>
      ))}
    </select>
  );
}

export function formatBytes(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export const EMPTY_DOCUMENT_SHARE = {
  document: '',
  partage_par: '',
  partage_avec: '',
  departement: '',
  date_partage: new Date().toISOString().slice(0, 10),
  date_expiration: '',
  permissions: 'Lecture seule',
  notes: '',
};

export function DocumentShareForm({
  initial,
  onSave,
  onCancel,
  lockDocument = false,
  saving = false,
  submitLabel,
}) {
  const [form, setForm] = useState(initial || EMPTY_DOCUMENT_SHARE);
  const [errors, setErrors] = useState({});
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  function validate() {
    const e = {};
    if (!form.document.trim()) e.document = 'Requis';
    if (!form.partage_avec.trim()) e.partage_avec = 'Requis';
    return e;
  }

  function handleSubmit(ev) {
    ev.preventDefault();
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    onSave({ ...form, departement: normalizeDocumentDepartment(form.departement) });
  }

  return (
    <form onSubmit={handleSubmit}>
      <SectionTitle icon={<Share2 size={12} />}>Document à partager</SectionTitle>
      <FRow>
        <FField label="Document" required>
          <input
            value={form.document}
            onChange={(e) => set('document', e.target.value)}
            placeholder="Nom du document..."
            readOnly={lockDocument}
            style={{
              ...INPUT_STYLE,
              borderColor: errors.document ? 'var(--red)' : 'var(--border)',
              ...(lockDocument ? { background: 'var(--surface-2)', cursor: 'default' } : {}),
            }}
          />
          {errors.document && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors.document}</div>}
        </FField>
        <FField label="Partagé par">
          <input value={form.partage_par} onChange={(e) => set('partage_par', e.target.value)} placeholder="Nom utilisateur..." style={INPUT_STYLE} />
        </FField>
      </FRow>
      <FRow>
        <FField label="Partagé avec" required>
          <input
            value={form.partage_avec}
            onChange={(e) => set('partage_avec', e.target.value)}
            placeholder="Utilisateur, équipe..."
            style={{ ...INPUT_STYLE, borderColor: errors.partage_avec ? 'var(--red)' : 'var(--border)' }}
          />
          {errors.partage_avec && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors.partage_avec}</div>}
        </FField>
        <FField label="Département">
          <DepartmentSelect value={form.departement} onChange={(v) => set('departement', v)} style={SELECT_STYLE} />
        </FField>
      </FRow>
      <FRow>
        <FField label="Date partage">
          <input type="date" value={form.date_partage} onChange={(e) => set('date_partage', e.target.value)} style={INPUT_STYLE} />
        </FField>
        <FField label="Expiration">
          <input type="date" value={form.date_expiration} onChange={(e) => set('date_expiration', e.target.value)} style={INPUT_STYLE} />
        </FField>
        <FField label="Permissions">
          <select value={form.permissions} onChange={(e) => set('permissions', e.target.value)} style={SELECT_STYLE}>
            {PERMISSIONS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </FField>
      </FRow>
      <div style={{ marginBottom: 20 }}>
        <FField label="Notes">
          <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Notes internes..." style={TEXTAREA_STYLE} />
        </FField>
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>Annuler</button>
        <button type="submit" className="btn btn-primary" disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Share2 size={14} /> {submitLabel || (initial?.id ? 'Enregistrer' : 'Créer le partage')}
        </button>
      </div>
    </form>
  );
}

export function Toast({ toast }) {
  if (!toast) return null;
  const bg = toast.type === 'success' ? '#2E7D32' : '#D32F2F';
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999, background: bg, color: '#fff',
      padding: '12px 20px', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.22)',
      fontSize: '0.88rem', fontWeight: 600, maxWidth: 360,
    }}
    >
      {toast.msg}
    </div>
  );
}

export function genId() { return Date.now() + Math.random(); }

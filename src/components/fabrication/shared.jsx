import { X } from 'lucide-react';
import {
  fabStatutMeta,
  fabPrioriteMeta,
  fabAtelierLabel,
} from '../../constants/fabrication';

export const FAB_INPUT = {
  width: '100%', padding: '8px 11px', border: '1.5px solid var(--border)',
  borderRadius: 6, fontSize: '0.86rem', background: '#fff', outline: 'none',
  fontFamily: 'var(--font-body)', color: 'var(--text)', boxSizing: 'border-box',
};
export const FAB_SELECT = { ...FAB_INPUT, cursor: 'pointer' };
export const FAB_TEXTAREA = { ...FAB_INPUT, minHeight: 80, resize: 'vertical' };

export function FabKpiCard({ icon, label, value, sub, color }) {
  const colors = { red: 'var(--red)', blue: '#1565C0', green: '#2E7D32', orange: '#E65100', grey: 'var(--text-3)', purple: '#6A1B9A' };
  const bg = { red: 'var(--red-light)', blue: '#E3F2FD', green: '#E8F5E9', orange: '#FFF3E0', grey: 'var(--surface-2)', purple: '#F3E5F5' };
  const c = color || 'grey';
  return (
    <div className="stat-card">
      <div className="stat-icon" style={{ background: bg[c], color: colors[c] }}>{icon}</div>
      <div className="stat-body">
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
        {sub ? <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', marginTop: 2 }}>{sub}</div> : null}
      </div>
    </div>
  );
}

export function FabBadge({ statut, priorite, children }) {
  if (priorite) {
    const meta = fabPrioriteMeta(priorite);
    return <span className={`badge ${meta.badge}`}>{children || meta.label}</span>;
  }
  const meta = fabStatutMeta(statut);
  return <span className={`badge ${meta.badge}`}>{children || meta.label}</span>;
}

export function FabField({ label, required, error, children }) {
  return (
    <div>
      <label style={{
        display: 'block', fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-3)',
        textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5,
      }}>
        {label}{required ? <span style={{ color: 'var(--red)' }}> *</span> : null}
      </label>
      {children}
      {error ? <div style={{ color: 'var(--red)', fontSize: '0.75rem', marginTop: 4 }}>{error}</div> : null}
    </div>
  );
}

export function FabModal({ open, onClose, title, children, width }) {
  if (!open) return null;
  return (
    <div
      className="fab-modal-overlay"
      role="presentation"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="fab-modal-box" role="dialog" aria-modal="true" style={{ maxWidth: width || 640 }}>
        <div className="fab-modal-head">
          <div className="fab-modal-title">{title}</div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Fermer">
            <X size={16} />
          </button>
        </div>
        <div className="fab-modal-body">{children}</div>
      </div>
    </div>
  );
}

export function FabEmpty({ icon, title, sub, hint }) {
  return (
    <div style={{ textAlign: 'center', padding: '52px 24px', color: 'var(--text-3)' }}>
      <div style={{
        width: 56, height: 56, borderRadius: '50%', background: 'var(--surface-2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
      }}>
        {icon}
      </div>
      <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '1rem', color: 'var(--text-2)', marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: '0.84rem' }}>{sub}</div>
      {hint ? <div className="fab-empty-hint">{hint}</div> : null}
    </div>
  );
}

export function FabProgress({ value }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className="fab-progress">
      <div className="fab-progress-track">
        <div className="fab-progress-fill" style={{ width: `${v}%` }} />
      </div>
      <span className="fab-progress-label">{v} %</span>
    </div>
  );
}

export function fmtDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) {
      const [y, m, day] = String(iso).slice(0, 10).split('-');
      if (y && m && day) return `${day}/${m}/${y}`;
      return iso;
    }
    return d.toLocaleDateString('fr-MA');
  } catch {
    return iso;
  }
}

export function fmtDateTime(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('fr-MA'); } catch { return iso; }
}

export function planFile(plan) {
  return (plan?.attachments || []).find((a) => a.kind === 'plan') || null;
}

export function planPhotos(plan) {
  return (plan?.attachments || []).filter((a) => a.kind === 'photo');
}

export { fabAtelierLabel };

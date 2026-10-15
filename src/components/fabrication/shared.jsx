import { X } from 'lucide-react';
import {
  fabStatutMeta,
  fabPrioriteMeta,
  fabAtelierLabel,
  fabIsLate,
  fabIsDueSoon,
  fabDelayDays,
  fabAtelierColor,
} from '../../constants/fabrication';

/** Badges d'échéance — n'altèrent jamais le statut. */
export function FabDeadlineBadges({ plan }) {
  if (fabIsLate(plan)) {
    const d = fabDelayDays(plan);
    return <span className="badge badge-red" title={`${d} jour${d > 1 ? 's' : ''} de retard`}>🔴 EN RETARD</span>;
  }
  if (fabIsDueSoon(plan)) return <span className="badge badge-orange">🟠 ÉCHÉANCE PROCHE</span>;
  return null;
}

export const FAB_INPUT = {
  width: '100%', padding: '8px 11px', border: '1.5px solid var(--border)',
  borderRadius: 6, fontSize: '0.86rem', background: '#fff', outline: 'none',
  fontFamily: 'var(--font-body)', color: 'var(--text)', boxSizing: 'border-box',
};
export const FAB_SELECT = { ...FAB_INPUT, cursor: 'pointer' };
export const FAB_TEXTAREA = { ...FAB_INPUT, minHeight: 80, resize: 'vertical' };

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

export function FabProgress({ value, compact = false }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  const tone = v >= 100 ? 'is-done' : v >= 50 ? 'is-mid' : '';
  return (
    <div className={`fab-progress${compact ? ' is-compact' : ''}`}>
      <div className="fab-progress-track">
        <div className={`fab-progress-fill ${tone}`} style={{ width: `${v}%` }} />
      </div>
      <span className="fab-progress-label">{v} %</span>
    </div>
  );
}

/** Indicateur compact et cliquable. */
export function FabStat({ icon, label, value, sub, tone = 'grey', active = false, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className={`fab-stat tone-${tone}${active ? ' is-active' : ''}${onClick ? ' is-clickable' : ''}`}
      onClick={onClick}
    >
      <span className="fab-stat-icon">{icon}</span>
      <span className="fab-stat-body">
        <span className="fab-stat-value">{value}</span>
        <span className="fab-stat-label">{label}</span>
        {sub ? <span className="fab-stat-sub">{sub}</span> : null}
      </span>
    </Tag>
  );
}

/** Filtres rapides en puces (défilement horizontal sur mobile). */
export function FabChips({ options, value, onChange }) {
  return (
    <div className="fab-chips" role="tablist">
      {options.filter((o) => !o.hidden).map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          className={`fab-chip-btn tone-${o.tone || 'grey'}${value === o.value ? ' is-on' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
          {o.count != null ? <span className="fab-chip-count">{o.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function FabPageHeader({ title, subtitle, children }) {
  return (
    <div className="fab-header">
      <div className="fab-header-text">
        <h1 className="page-title">{title}</h1>
        {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
      </div>
      {children ? <div className="fab-header-actions">{children}</div> : null}
    </div>
  );
}

export function FabSkeleton({ rows = 4 }) {
  return (
    <div className="fab-skeleton">
      {Array.from({ length: rows }).map((_, i) => <div key={i} className="fab-skeleton-row" />)}
    </div>
  );
}

export function FabRing({ value, size = 92, label }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="fab-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} className="fab-ring-track" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className="fab-ring-fill"
          strokeDasharray={c}
          strokeDashoffset={c - (c * v) / 100}
        />
      </svg>
      <div className="fab-ring-text">
        <strong>{v}%</strong>
        {label ? <span>{label}</span> : null}
      </div>
    </div>
  );
}

export function FabAtelierDot({ atelier }) {
  return <span className="fab-atelier-dot" style={{ background: fabAtelierColor(atelier) }} />;
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

/** Fichiers du plan : pièces propres à la production, sinon ceux de la bibliothèque. */
export function planFiles(plan) {
  const own = (plan?.attachments || []).filter((a) => a.kind === 'plan');
  if (own.length) return own;
  return plan?.library_plan?.files || plan?.files || [];
}

export function planFile(plan) {
  return planFiles(plan)[0] || null;
}

export function isImageFile(f) {
  return /^image\//.test(f?.mime_type || '') || /\.(jpe?g|png|webp|gif)$/i.test(f?.file_name || '');
}

export function isPdfFile(f) {
  return f?.mime_type === 'application/pdf' || /\.pdf$/i.test(f?.file_name || '');
}

export function planPhotos(plan) {
  return (plan?.attachments || []).filter((a) => a.kind === 'photo');
}

export { fabAtelierLabel };

import { useEffect, useRef } from 'react';
import { XCircle } from 'lucide-react';
import {
  TASK_PRIORITE_META,
  isTaskEnRetard,
  relanceDgState,
} from '../../../services/commercial/suiviTaches';

export function inputStyle(err) {
  return {
    padding: '9px 12px',
    border: '1.5px solid ' + (err ? 'var(--red)' : 'var(--border)'),
    borderRadius: 6,
    fontSize: '0.875rem',
    background: '#fff',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  };
}

export function Field({ label, children, full }) {
  return (
    <div className={full ? 'sta-field sta-field--full' : 'sta-field'}>
      <label className="sta-label">{label}</label>
      {children}
    </div>
  );
}

export function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return d && m && y ? `${d}/${m}/${y}` : '';
}

export function fmtDateTime(raw) {
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}

export function PrioriteTag({ priorite }) {
  const meta = TASK_PRIORITE_META[priorite] || TASK_PRIORITE_META.normale;
  return (
    <span className="sta-prio" style={{ color: meta.color, background: meta.bg }}>
      <span aria-hidden>{meta.dot}</span> {meta.label}
    </span>
  );
}

/** Badges indicateurs : calculés à l'affichage, jamais écrits en base. */
export function TaskBadges({ task, today }) {
  const retard = isTaskEnRetard(task, today);
  const relance = relanceDgState(task, today);
  const aValider = task.statut === 'en_attente_validation';
  if (!retard && !relance && !task.bloque && !aValider) return null;
  return (
    <div className="sta-badges">
      {retard && <span className="sta-badge sta-badge--retard">EN RETARD</span>}
      {relance === 'retard' && <span className="sta-badge sta-badge--relance-retard">🔴 RELANCE DG EN RETARD</span>}
      {relance === 'aujourdhui' && <span className="sta-badge sta-badge--relance-today">🔔 RELANCE DG AUJOURD'HUI</span>}
      {relance === 'active' && <span className="sta-badge sta-badge--relance">🔔 RELANCE DG</span>}
      {task.bloque && <span className="sta-badge sta-badge--bloque">BLOQUÉ</span>}
      {aValider && <span className="sta-badge sta-badge--valider">À VALIDER</span>}
    </div>
  );
}

export function ModalShell({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="sta-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={'sta-modal' + (wide ? ' sta-modal--wide' : '')} role="dialog" aria-modal="true">
        <div className="sta-modal-head">
          <h2 className="sta-modal-title">{title}</h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Fermer"><XCircle size={18} /></button>
        </div>
        <div className="sta-modal-body">{children}</div>
        {footer && <div className="sta-modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Toast({ msg, onClose }) {
  const t = useRef();
  useEffect(() => {
    if (!msg) return undefined;
    t.current = setTimeout(onClose, 3000);
    return () => clearTimeout(t.current);
  }, [msg, onClose]);
  if (!msg) return null;
  return <div className="sta-toast">{msg}</div>;
}

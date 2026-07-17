/**
 * CrmOverflowMenu — menu « … » mobile (présentation only)
 * Réutilise le positionnement de DevisActionsMenu.
 */
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';

function MenuItem({ icon: Icon, label, onClick, disabled, danger }) {
  return (
    <button
      type="button"
      className={`crm-devis-menu-item${danger ? ' crm-devis-menu-item--danger' : ''}${disabled ? ' crm-devis-menu-item--disabled' : ''}`}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
    >
      {Icon ? <Icon size={15} /> : null}
      <span>{label}</span>
    </button>
  );
}

/**
 * @param {{ items: Array<{ id?: string, icon?: any, label: string, onClick?: Function, disabled?: boolean, danger?: boolean, divider?: boolean }>, title?: string, ariaLabel?: string }} props
 */
export default function CrmOverflowMenu({ items = [], title = 'Actions', ariaLabel = 'Plus d\'actions' }) {
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState(null);

  function updateRect() {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const menuW = 220;
    const gap = 6;
    const margin = 8;
    let left = r.right - menuW;
    if (left < margin) left = margin;
    if (left + menuW > window.innerWidth - margin) left = window.innerWidth - menuW - margin;

    const spaceBelow = window.innerHeight - r.bottom - gap - margin;
    const spaceAbove = r.top - gap - margin;
    const openBelow = spaceBelow >= 160 || spaceBelow >= spaceAbove;
    const maxHeight = Math.max(120, Math.min(openBelow ? spaceBelow : spaceAbove, 360, window.innerHeight * 0.7));

    if (openBelow) {
      setRect({ left, width: menuW, maxHeight, top: r.bottom + gap, bottom: null });
    } else {
      setRect({ left, width: menuW, maxHeight, top: null, bottom: window.innerHeight - r.top + gap });
    }
  }

  useEffect(() => {
    if (!open) return undefined;
    updateRect();
    const onReposition = () => updateRect();
    window.addEventListener('scroll', onReposition, true);
    window.addEventListener('resize', onReposition);
    return () => {
      window.removeEventListener('scroll', onReposition, true);
      window.removeEventListener('resize', onReposition);
    };
  }, [open]);

  useEffect(() => {
    function onDocClick(e) {
      if (btnRef.current?.contains(e.target)) return;
      if (menuRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  function closeAnd(fn) {
    return (...args) => {
      setOpen(false);
      fn?.(...args);
    };
  }

  const visible = items.filter(Boolean);

  const menu = open && rect && createPortal(
    <div
      ref={menuRef}
      className="crm-devis-actions-menu"
      role="menu"
      aria-label={title}
      style={{
        position: 'fixed',
        left: rect.left,
        width: rect.width,
        zIndex: 10000,
        maxHeight: rect.maxHeight,
        overflowY: 'auto',
        ...(rect.top != null ? { top: rect.top } : { bottom: rect.bottom }),
      }}
    >
      {visible.map((item, i) => (
        item.divider ? (
          <div key={`div-${i}`} className="crm-devis-menu-divider" />
        ) : (
          <MenuItem
            key={item.id || item.label || i}
            icon={item.icon}
            label={item.label}
            disabled={item.disabled}
            danger={item.danger}
            onClick={closeAnd(item.onClick)}
          />
        )
      ))}
    </div>,
    document.body,
  );

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="btn btn-ghost btn-sm crm-devis-menu-trigger crm-icon-btn"
        title={title}
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <MoreHorizontal size={16} />
      </button>
      {menu}
    </>
  );
}

/**
 * Menu d'actions ⋯ pour une ligne article (UI uniquement, portal fixed).
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  MoreHorizontal, Eye, Edit2, Zap, History, Copy, Trash2,
} from 'lucide-react';

const ITEM_STYLE = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '9px 14px',
  width: '100%',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: '0.84rem',
  color: 'var(--text)',
  textAlign: 'left',
};

export default function ArticleRowActions({
  onOpen,
  onEdit,
  onMouvementRapide,
  onHistory,
  onDuplicate,
  onDelete,
  canDelete = true,
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const [menuPos, setMenuPos] = useState(null);

  const updatePos = useCallback(() => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const menuW = 210;
    const left = Math.max(8, Math.min(r.right - menuW, window.innerWidth - menuW - 8));
    const spaceBelow = window.innerHeight - r.bottom;
    const openUp = spaceBelow < 220;
    setMenuPos({
      top: openUp ? undefined : r.bottom + 4,
      bottom: openUp ? window.innerHeight - r.top + 4 : undefined,
      left,
      width: menuW,
    });
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    updatePos();
    const onReposition = () => updatePos();
    window.addEventListener('scroll', onReposition, true);
    window.addEventListener('resize', onReposition);
    return () => {
      window.removeEventListener('scroll', onReposition, true);
      window.removeEventListener('resize', onReposition);
    };
  }, [open, updatePos]);

  useEffect(() => {
    if (!open) return undefined;
    function onDocClick(e) {
      if (btnRef.current?.contains(e.target)) return;
      if (menuRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const run = (fn) => () => {
    setOpen(false);
    fn?.();
  };

  const menu = open && menuPos && createPortal(
    <div
      ref={menuRef}
      className="inv-article-row-menu"
      role="menu"
      style={{
        position: 'fixed',
        top: menuPos.top,
        bottom: menuPos.bottom,
        left: menuPos.left,
        width: menuPos.width,
        zIndex: 10050,
        background: '#fff',
        borderRadius: 8,
        boxShadow: '0 12px 32px rgba(0,0,0,0.16)',
        border: '1px solid var(--border)',
        padding: '4px 0',
      }}
    >
      <button type="button" role="menuitem" onClick={run(onOpen)} style={ITEM_STYLE}>
        <Eye size={14} /> Ouvrir la fiche
      </button>
      {onEdit && (
        <button type="button" role="menuitem" onClick={run(onEdit)} style={ITEM_STYLE}>
          <Edit2 size={14} /> Modifier
        </button>
      )}
      {onMouvementRapide && (
        <button type="button" role="menuitem" onClick={run(onMouvementRapide)} style={ITEM_STYLE}>
          <Zap size={14} /> Mouvement rapide
        </button>
      )}
      {onHistory && (
        <button type="button" role="menuitem" onClick={run(onHistory)} style={ITEM_STYLE}>
          <History size={14} /> Voir les mouvements
        </button>
      )}
      {onDuplicate && (
        <button type="button" role="menuitem" onClick={run(onDuplicate)} style={ITEM_STYLE}>
          <Copy size={14} /> Dupliquer
        </button>
      )}
      {canDelete && onDelete && (
        <button
          type="button"
          role="menuitem"
          onClick={run(onDelete)}
          style={{ ...ITEM_STYLE, color: 'var(--red)' }}
        >
          <Trash2 size={14} /> Supprimer
        </button>
      )}
    </div>,
    document.body,
  );

  return (
    <div className="inv-article-row-actions" style={{ position: 'relative', display: 'inline-flex' }} onClick={(e) => e.stopPropagation()}>
      <button
        ref={btnRef}
        type="button"
        className="btn btn-ghost btn-sm inv-article-row-actions-btn"
        onClick={() => setOpen((v) => !v)}
        title="Actions"
        aria-label="Actions"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <MoreHorizontal size={16} />
      </button>
      {menu}
    </div>
  );
}

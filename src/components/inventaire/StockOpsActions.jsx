/**
 * Menu ⋯ opérationnel pour la page Stocks.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  MoreHorizontal, Eye, Edit2, ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight,
  Scale, History, FileText, Package, Archive, Trash2, Zap,
} from 'lucide-react';

const ITEM = {
  display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', width: '100%',
  background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.84rem',
  color: 'var(--text)', textAlign: 'left',
};

export default function StockOpsActions({
  onOpenFiche,
  onEditFiche,
  onEntree,
  onSortie,
  onTransfert,
  onRegulariser,
  onHistory,
  onDocuments,
  onEditCatalog,
  onMouvementRapide,
  onDesactiver,
  onDelete,
  canDelete = false,
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const [menuPos, setMenuPos] = useState(null);

  const updatePos = useCallback(() => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const menuW = 230;
    const left = Math.max(8, Math.min(r.right - menuW, window.innerWidth - menuW - 8));
    const openUp = window.innerHeight - r.bottom < 320;
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
    const onR = () => updatePos();
    window.addEventListener('scroll', onR, true);
    window.addEventListener('resize', onR);
    return () => {
      window.removeEventListener('scroll', onR, true);
      window.removeEventListener('resize', onR);
    };
  }, [open, updatePos]);

  useEffect(() => {
    if (!open) return undefined;
    function onDoc(e) {
      if (btnRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const run = (fn) => () => { setOpen(false); fn?.(); };

  const menu = open && menuPos && createPortal(
    <div
      ref={menuRef}
      role="menu"
      style={{
        position: 'fixed', top: menuPos.top, bottom: menuPos.bottom, left: menuPos.left,
        width: menuPos.width, zIndex: 10050, background: '#fff', borderRadius: 8,
        boxShadow: '0 12px 32px rgba(0,0,0,0.16)', border: '1px solid var(--border)', padding: '4px 0',
        maxHeight: '70vh', overflowY: 'auto',
      }}
    >
      <button type="button" role="menuitem" style={ITEM} onClick={run(onOpenFiche)}><Eye size={14} /> Ouvrir la fiche stock</button>
      <button type="button" role="menuitem" style={ITEM} onClick={run(onEditFiche)}><Edit2 size={14} /> Modifier la fiche stock</button>
      <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
      <button type="button" role="menuitem" style={ITEM} onClick={run(onEntree)}><ArrowDownToLine size={14} /> Faire une entrée</button>
      <button type="button" role="menuitem" style={ITEM} onClick={run(onSortie)}><ArrowUpFromLine size={14} /> Faire une sortie</button>
      <button type="button" role="menuitem" style={ITEM} onClick={run(onTransfert)}><ArrowLeftRight size={14} /> Faire un transfert</button>
      <button type="button" role="menuitem" style={ITEM} onClick={run(onRegulariser)}><Scale size={14} /> Régulariser le stock</button>
      {onMouvementRapide && (
        <button type="button" role="menuitem" style={ITEM} onClick={run(onMouvementRapide)}><Zap size={14} /> Mouvement rapide</button>
      )}
      <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
      <button type="button" role="menuitem" style={ITEM} onClick={run(onHistory)}><History size={14} /> Voir les mouvements</button>
      <button type="button" role="menuitem" style={ITEM} onClick={run(onDocuments)}><FileText size={14} /> Voir les documents</button>
      <button type="button" role="menuitem" style={ITEM} onClick={run(onEditCatalog)}><Package size={14} /> Modifier l&apos;article catalogue</button>
      {onDesactiver && (
        <button type="button" role="menuitem" style={ITEM} onClick={run(onDesactiver)}><Archive size={14} /> Désactiver</button>
      )}
      {canDelete && onDelete && (
        <button type="button" role="menuitem" style={{ ...ITEM, color: 'var(--red)' }} onClick={run(onDelete)}>
          <Trash2 size={14} /> Supprimer
        </button>
      )}
    </div>,
    document.body,
  );

  return (
    <div style={{ display: 'inline-flex' }} onClick={(e) => e.stopPropagation()}>
      <button
        ref={btnRef}
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => setOpen((v) => !v)}
        aria-label="Actions"
        aria-expanded={open}
        style={{ padding: '4px 8px' }}
      >
        <MoreHorizontal size={16} />
      </button>
      {menu}
    </div>
  );
}

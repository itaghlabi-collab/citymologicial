import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  MoreHorizontal, Eye, Download, FolderKanban, CheckCircle, XCircle,
  Edit2, Copy, Trash2, ClipboardCheck, Receipt, FileText,
} from 'lucide-react';

function MenuItem({ icon: Icon, label, onClick, disabled, danger }) {
  return (
    <button
      type="button"
      className={`crm-devis-menu-item${danger ? ' crm-devis-menu-item--danger' : ''}${disabled ? ' crm-devis-menu-item--disabled' : ''}`}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
    >
      <Icon size={15} />
      <span>{label}</span>
    </button>
  );
}

export default function DevisActionsMenu({
  devis,
  isConverted,
  pdfLoading,
  checklistLoading,
  onPreview,
  onPdf,
  onReceptionChecklist,
  onConvert,
  onConvertToFacture,
  factureLoading,
  onGenerateProforma,
  proformaLoading,
  onApprove,
  onRefuse,
  onEdit,
  onDuplicate,
  onDelete,
}) {
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState(null);

  const convertDisabled = isConverted || devis.statut === 'converti';

  function updateRect() {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const menuW = 248;
    const gap = 6;
    const margin = 8;
    let left = r.right - menuW;
    if (left < margin) left = margin;
    if (left + menuW > window.innerWidth - margin) left = window.innerWidth - menuW - margin;

    const spaceBelow = window.innerHeight - r.bottom - gap - margin;
    const spaceAbove = r.top - gap - margin;
    const openBelow = spaceBelow >= 220 || spaceBelow >= spaceAbove;
    const maxHeight = Math.max(
      160,
      Math.min(openBelow ? spaceBelow : spaceAbove, 420, window.innerHeight * 0.75),
    );

    if (openBelow) {
      setRect({
        left,
        width: menuW,
        maxHeight,
        top: r.bottom + gap,
        bottom: null,
      });
      return;
    }

    setRect({
      left,
      width: menuW,
      maxHeight,
      top: null,
      bottom: window.innerHeight - r.top + gap,
    });
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

  const menu = open && rect && createPortal(
    <div
      ref={menuRef}
      className="crm-devis-actions-menu"
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
      <MenuItem icon={Eye} label="Aperçu" onClick={closeAnd(onPreview)} />
      <MenuItem icon={Download} label="Télécharger PDF" onClick={closeAnd(onPdf)} disabled={pdfLoading} />
      <MenuItem
        icon={ClipboardCheck}
        label="Liste de réception"
        onClick={closeAnd(onReceptionChecklist)}
        disabled={checklistLoading}
      />
      <MenuItem
        icon={FolderKanban}
        label={convertDisabled ? 'Convertir en projet (déjà converti)' : 'Convertir en projet'}
        onClick={closeAnd(onConvert)}
        disabled={convertDisabled}
      />
      <MenuItem
        icon={Receipt}
        label="Convertir en facture"
        onClick={closeAnd(onConvertToFacture)}
        disabled={factureLoading}
      />
      <MenuItem
        icon={FileText}
        label="Générer une proforma"
        onClick={closeAnd(onGenerateProforma)}
        disabled={proformaLoading}
      />

      <div className="crm-devis-menu-divider" />

      <MenuItem icon={CheckCircle} label="Approuver" onClick={closeAnd(onApprove)} />
      <MenuItem icon={XCircle} label="Refuser" onClick={closeAnd(onRefuse)} />

      <div className="crm-devis-menu-divider" />

      <MenuItem icon={Edit2} label="Modifier" onClick={closeAnd(onEdit)} />
      <MenuItem icon={Copy} label="Dupliquer" onClick={closeAnd(onDuplicate)} />
      <MenuItem icon={Trash2} label="Supprimer" onClick={closeAnd(onDelete)} danger />
    </div>,
    document.body,
  );

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="btn btn-ghost btn-sm crm-devis-menu-trigger"
        title="Actions"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <MoreHorizontal size={16} />
      </button>
      {menu}
    </>
  );
}

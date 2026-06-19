import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  MoreHorizontal, Eye, Download, FolderKanban, CheckCircle, XCircle,
  Edit2, Copy, Trash2, ChevronRight, ClipboardCheck,
} from 'lucide-react';

const QUICK_STATUTS = [
  { value: 'brouillon', label: 'Brouillon' },
  { value: 'envoye', label: 'Envoyé' },
  { value: 'valide', label: 'Approuvé' },
  { value: 'refuse', label: 'Refusé' },
  { value: 'expire', label: 'Expiré' },
  { value: 'converti', label: 'Converti en projet' },
];

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
  onApprove,
  onRefuse,
  onEdit,
  onDuplicate,
  onDelete,
  onStatutChange,
}) {
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState(null);
  const [showStatuts, setShowStatuts] = useState(false);

  const convertDisabled = isConverted || devis.statut === 'converti';

  function updateRect() {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const menuW = 248;
    let left = r.right - menuW;
    if (left < 8) left = 8;
    if (left + menuW > window.innerWidth - 8) left = window.innerWidth - menuW - 8;
    setRect({ top: r.bottom + 6, left, width: menuW });
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
      setShowStatuts(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  function closeAnd(fn) {
    return (...args) => {
      setOpen(false);
      setShowStatuts(false);
      fn?.(...args);
    };
  }

  const menu = open && rect && createPortal(
    <div
      ref={menuRef}
      className="crm-devis-actions-menu"
      style={{ position: 'fixed', top: rect.top, left: rect.left, width: rect.width, zIndex: 10000 }}
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

      <div className="crm-devis-menu-divider" />

      <MenuItem icon={CheckCircle} label="Approuver" onClick={closeAnd(onApprove)} />
      <MenuItem icon={XCircle} label="Refuser" onClick={closeAnd(onRefuse)} />

      <div className="crm-devis-menu-divider" />

      <MenuItem icon={Edit2} label="Modifier" onClick={closeAnd(onEdit)} />
      <MenuItem icon={Copy} label="Dupliquer" onClick={closeAnd(onDuplicate)} />
      <MenuItem icon={Trash2} label="Supprimer" onClick={closeAnd(onDelete)} danger />

      <div className="crm-devis-menu-divider" />

      <button
        type="button"
        className="crm-devis-menu-item crm-devis-menu-item--statut"
        onClick={() => setShowStatuts((v) => !v)}
      >
        <span>Changer le statut</span>
        <ChevronRight size={14} style={{ transform: showStatuts ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>
      {showStatuts && (
        <div className="crm-devis-menu-statuts">
          {QUICK_STATUTS.map((s) => (
            <button
              key={s.value}
              type="button"
              className={`crm-devis-menu-statut${devis.statut === s.value ? ' crm-devis-menu-statut--active' : ''}`}
              onClick={closeAnd(() => onStatutChange(s.value))}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
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
        onClick={() => { setOpen((v) => !v); setShowStatuts(false); }}
        aria-expanded={open}
      >
        <MoreHorizontal size={16} />
      </button>
      {menu}
    </>
  );
}

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Loader2 } from 'lucide-react';
import { INPUT_STYLE } from './shared.jsx';

export function supplierLabel(s) {
  const name = s.raison_sociale || s.company_name || s.trade_name || '';
  const city = s.ville || s.city || '';
  return city ? `${name} — ${city}` : name;
}

export function supplierMatchesQuery(s, rawQuery) {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    s.raison_sociale,
    s.company_name,
    s.trade_name,
    s.ville,
    s.city,
    s.supplier_category,
    s.categorie,
  ].filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(q);
}

export default function SupplierSearch({
  suppliers = [],
  supplierId = '',
  value = '',
  onChange,
  loading = false,
  error = false,
  inputStyle,
  placeholder = 'Tapez pour rechercher un fournisseur…',
}) {
  const wrapRef = useRef(null);
  const dropdownRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [dropdownRect, setDropdownRect] = useState(null);
  const fieldStyle = {
    ...(inputStyle || INPUT_STYLE),
    borderColor: error ? 'var(--red)' : (inputStyle || INPUT_STYLE).borderColor || 'var(--border)',
  };

  const updateDropdownRect = () => {
    if (!wrapRef.current) return;
    const r = wrapRef.current.getBoundingClientRect();
    setDropdownRect({ top: r.bottom + 4, left: r.left, width: r.width });
  };

  useEffect(() => {
    if (!open) return undefined;
    updateDropdownRect();
    const onReposition = () => updateDropdownRect();
    window.addEventListener('scroll', onReposition, true);
    window.addEventListener('resize', onReposition);
    return () => {
      window.removeEventListener('scroll', onReposition, true);
      window.removeEventListener('resize', onReposition);
    };
  }, [open, value]);

  useEffect(() => {
    function onDocClick(e) {
      if (wrapRef.current?.contains(e.target)) return;
      if (dropdownRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const query = value || '';
  const filtered = open
    ? suppliers
      .filter((s) => supplierMatchesQuery(s, query))
      .sort((a, b) => supplierLabel(a).localeCompare(supplierLabel(b), 'fr'))
      .slice(0, 50)
    : [];

  function pick(s) {
    onChange?.({
      supplier_id: s.id,
      fournisseur: s.raison_sociale || s.company_name || '',
    });
    setOpen(false);
  }

  const dropdown = open && dropdownRect && createPortal(
    <div
      ref={dropdownRef}
      style={{
        position: 'fixed',
        top: dropdownRect.top,
        left: dropdownRect.left,
        width: dropdownRect.width,
        zIndex: 10000,
        background: '#fff',
        border: '1.5px solid var(--border)',
        borderRadius: 8,
        boxShadow: '0 12px 32px rgba(0,0,0,0.14)',
        maxHeight: 280,
        overflowY: 'auto',
      }}
    >
      {filtered.length === 0 ? (
        <div style={{ padding: '12px 14px', fontSize: '0.85rem', color: 'var(--text-3)' }}>
          Aucun fournisseur trouvé
        </div>
      ) : filtered.map((s) => {
        const selected = String(s.id) === String(supplierId);
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => pick(s)}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: '10px 14px',
              border: 'none',
              background: selected ? '#FFF5F5' : '#fff',
              cursor: 'pointer',
              fontSize: '0.86rem',
              borderBottom: '1px solid var(--border)',
              color: 'var(--text)',
            }}
          >
            <div style={{ fontWeight: 700 }}>{s.raison_sociale || s.company_name}</div>
            {(s.ville || s.city) && (
              <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginTop: 2 }}>
                {s.ville || s.city}
                {s.supplier_category || s.categorie ? ` · ${s.supplier_category || s.categorie}` : ''}
              </div>
            )}
          </button>
        );
      })}
    </div>,
    document.body,
  );

  if (loading) {
    return (
      <div style={{ fontSize: '0.8rem', color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Loader2 size={14} className="spin" /> Chargement des fournisseurs...
      </div>
    );
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange?.({ supplier_id: '', fournisseur: e.target.value });
          setOpen(true);
          updateDropdownRect();
        }}
        onFocus={() => {
          setOpen(true);
          updateDropdownRect();
        }}
        placeholder={placeholder}
        autoComplete="off"
        style={fieldStyle}
      />
      {dropdown}
    </div>
  );
}

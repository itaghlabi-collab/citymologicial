import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { formatCategoryDisplayName } from '../../utils/crm/categoryDisplay';

export function articleMatchesQuery(art, rawQuery, categoryName = '') {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return false;
  const tokens = [
    art.nom,
    art.reference,
    categoryName,
  ].filter(Boolean).map((s) => String(s).toLowerCase());
  return tokens.some((t) => t.startsWith(q) || t.split(/\s+/).some((w) => w.startsWith(q)));
}

const DEFAULT_INPUT_STYLE = {
  padding: '8px 11px',
  border: '1.5px solid var(--border)',
  borderRadius: 6,
  fontSize: '0.86rem',
  background: '#fff',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
  fontFamily: 'var(--font-body)',
  color: 'var(--text)',
};

export default function ArticleDesignationSearch({
  value,
  onChange,
  articles,
  categories,
  onPickArticle,
  inputStyle,
}) {
  const wrapRef = useRef(null);
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [dropdownRect, setDropdownRect] = useState(null);
  const fieldStyle = inputStyle || DEFAULT_INPUT_STYLE;

  const updateDropdownRect = () => {
    if (!wrapRef.current) return;
    const r = wrapRef.current.getBoundingClientRect();
    setDropdownRect({
      top: r.bottom + 4,
      left: r.left,
      width: r.width,
    });
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
  const showList = open && query.trim().length > 0;
  const filtered = showList
    ? articles
      .filter((a) => {
        const cat = categories.find((c) => String(c.id) === String(a.categorie_id));
        const catName = cat ? formatCategoryDisplayName(cat.nom) : '';
        return articleMatchesQuery(a, query, catName);
      })
      .slice(0, 25)
    : [];

  function pick(art) {
    onPickArticle?.(String(art.id));
    setOpen(false);
  }

  const dropdown = showList && dropdownRect && createPortal(
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
        maxHeight: 260,
        overflowY: 'auto',
      }}
    >
      {filtered.length === 0 ? (
        <div style={{ padding: '12px 14px', fontSize: '0.85rem', color: 'var(--text-3)' }}>
          Aucun article trouvé — saisie libre conservée
        </div>
      ) : filtered.map((a) => {
        const cat = categories.find((c) => String(c.id) === String(a.categorie_id));
        const catName = cat ? formatCategoryDisplayName(cat.nom) : 'Sans catégorie';
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => pick(a)}
            style={{
              display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px',
              border: 'none', background: '#fff', cursor: 'pointer',
              fontSize: '0.86rem', borderBottom: '1px solid var(--border)',
              color: 'var(--text)',
            }}
          >
            <div style={{ fontWeight: 700 }}>{a.nom}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginTop: 2 }}>
              {[catName, a.reference, a.unite ? `Unité : ${a.unite}` : ''].filter(Boolean).join(' · ')}
            </div>
          </button>
        );
      })}
    </div>,
    document.body,
  );

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          updateDropdownRect();
        }}
        onFocus={() => {
          if (query.trim()) {
            setOpen(true);
            updateDropdownRect();
          }
        }}
        placeholder="Tapez pour rechercher un article ou saisir librement…"
        autoComplete="off"
        style={fieldStyle}
      />
      {dropdown}
    </div>
  );
}

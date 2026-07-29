/**
 * Recherche article stock — suggestions dès 1 caractère (code / désignation commence par…).
 */
import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Search } from 'lucide-react';

function norm(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function stockArticleMatchesQuery(art, rawQuery) {
  const q = norm(rawQuery);
  if (!q) return false;
  const code = norm(art.code || art.reference);
  const name = norm(art.designation || art.nom);
  if (code.startsWith(q) || name.startsWith(q)) return true;
  return name.split(/\s+/).some((w) => w.startsWith(q));
}

function articleLabel(art) {
  const code = art.code || art.reference || '';
  const name = art.designation || art.nom || '';
  return code && name ? `${code} — ${name}` : (code || name || '—');
}

const DEFAULT_STYLE = {
  width: '100%',
  padding: '8px 11px 8px 32px',
  border: '1.5px solid var(--border)',
  borderRadius: 6,
  fontSize: '0.86rem',
  background: '#fff',
  outline: 'none',
  fontFamily: 'var(--font-body)',
  color: 'var(--text)',
  boxSizing: 'border-box',
};

/**
 * @param {{
 *   articles: Array,
 *   value: string,           // article_id sélectionné
 *   onChange: (id: string) => void,
 *   inputStyle?: object,
 *   placeholder?: string,
 *   disabled?: boolean,
 * }} props
 */
export default function StockArticleSearch({
  articles = [],
  value = '',
  onChange,
  inputStyle,
  placeholder = 'Tapez une lettre pour rechercher…',
  disabled = false,
}) {
  const wrapRef = useRef(null);
  const dropdownRef = useRef(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [dropdownRect, setDropdownRect] = useState(null);
  const [touched, setTouched] = useState(false);

  const selected = useMemo(
    () => (articles || []).find((a) => String(a.id) === String(value)),
    [articles, value],
  );

  // Sync display when parent sets value (scan, reset…)
  useEffect(() => {
    if (!touched) {
      setQuery(selected ? articleLabel(selected) : '');
    }
  }, [selected, touched]);

  const activeList = useMemo(
    () => (articles || []).filter((a) => a.statut !== 'Archivé'),
    [articles],
  );

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    // Si le champ affiche déjà l'article sélectionné complet, ne pas relister tout
    if (selected && articleLabel(selected) === q) return [];
    return activeList
      .filter((a) => stockArticleMatchesQuery(a, q))
      .slice(0, 40);
  }, [activeList, query, selected]);

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
  }, [open, query]);

  useEffect(() => {
    function onDocClick(e) {
      if (wrapRef.current?.contains(e.target)) return;
      if (dropdownRef.current?.contains(e.target)) return;
      setOpen(false);
      if (selected) {
        setQuery(articleLabel(selected));
        setTouched(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [selected]);

  function pick(art) {
    onChange?.(String(art.id));
    setQuery(articleLabel(art));
    setTouched(false);
    setOpen(false);
  }

  function handleChange(e) {
    const next = e.target.value;
    setTouched(true);
    setQuery(next);
    setOpen(true);
    updateDropdownRect();
    // Effacer la sélection si l'utilisateur retape
    if (value) onChange?.('');
  }

  const showList = open && query.trim().length > 0 && !(selected && articleLabel(selected) === query.trim());

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
        maxHeight: 280,
        overflowY: 'auto',
      }}
    >
      {filtered.length === 0 ? (
        <div style={{ padding: '12px 14px', fontSize: '0.85rem', color: 'var(--text-3)' }}>
          Aucun article ne commence par « {query.trim()} »
        </div>
      ) : filtered.map((a) => (
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
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; }}
        >
          <div style={{ fontWeight: 700, color: 'var(--red)' }}>{a.code || a.reference}</div>
          <div style={{ fontSize: '0.8rem', marginTop: 2 }}>{a.designation || a.nom}</div>
          {a.unite && (
            <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 2 }}>Unité : {a.unite}</div>
          )}
        </button>
      ))}
    </div>,
    document.body,
  );

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none', zIndex: 1 }} />
      <input
        type="text"
        value={query}
        onChange={handleChange}
        onFocus={() => {
          if (query.trim() && !(selected && articleLabel(selected) === query.trim())) {
            setOpen(true);
            updateDropdownRect();
          }
        }}
        placeholder={placeholder}
        autoComplete="off"
        disabled={disabled}
        style={{ ...DEFAULT_STYLE, ...inputStyle }}
      />
      {dropdown}
    </div>
  );
}

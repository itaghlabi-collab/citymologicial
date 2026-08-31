import { useMemo } from 'react';
import { Loader2, Search } from 'lucide-react';
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
  placeholder = 'Rechercher un fournisseur…',
  listMaxHeight = 240,
}) {
  const fieldStyle = {
    ...(inputStyle || INPUT_STYLE),
    borderColor: error ? 'var(--red)' : (inputStyle || INPUT_STYLE).borderColor || 'var(--border)',
  };

  const filtered = useMemo(
    () => suppliers
      .filter((s) => supplierMatchesQuery(s, value))
      .sort((a, b) => supplierLabel(a).localeCompare(supplierLabel(b), 'fr')),
    [suppliers, value],
  );

  function pick(s) {
    onChange?.({
      supplier_id: s.id,
      fournisseur: supplierLabel(s),
    });
  }

  if (loading) {
    return (
      <div style={{ fontSize: '0.8rem', color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 6, padding: '10px 0' }}>
        <Loader2 size={14} className="spin" /> Chargement des fournisseurs...
      </div>
    );
  }

  return (
    <div>
      <div style={{ position: 'relative' }}>
        <Search
          size={15}
          style={{
            position: 'absolute',
            left: 10,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--text-3)',
            pointerEvents: 'none',
          }}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => {
            onChange?.({ supplier_id: '', fournisseur: e.target.value });
          }}
          placeholder={placeholder}
          autoComplete="off"
          style={{ ...fieldStyle, paddingLeft: 34 }}
        />
      </div>

      <div
        style={{
          marginTop: 8,
          border: `1.5px solid ${error ? 'var(--red)' : 'var(--border)'}`,
          borderRadius: 8,
          background: '#fff',
          maxHeight: listMaxHeight,
          overflowY: 'auto',
        }}
      >
        {filtered.length === 0 ? (
          <div style={{ padding: '14px 12px', fontSize: '0.84rem', color: 'var(--text-3)', textAlign: 'center' }}>
            Aucun fournisseur ne correspond
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
                padding: '10px 12px',
                border: 'none',
                borderBottom: '1px solid var(--border)',
                background: selected ? '#FFEBEE' : '#fff',
                cursor: 'pointer',
                fontSize: '0.84rem',
                color: 'var(--text)',
              }}
            >
              <div style={{ fontWeight: selected ? 800 : 600, color: selected ? 'var(--red)' : 'var(--text)' }}>
                {s.raison_sociale || s.company_name}
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-3)', marginTop: 2 }}>
                {[s.ville || s.city, s.supplier_category || s.categorie].filter(Boolean).join(' · ') || '—'}
              </div>
            </button>
          );
        })}
      </div>

      <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 6 }}>
        {filtered.length} fournisseur{filtered.length > 1 ? 's' : ''} affiché{filtered.length > 1 ? 's' : ''}
        {value.trim() ? ` pour « ${value.trim()} »` : ''}
      </div>
    </div>
  );
}

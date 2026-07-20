/** Onglets Factures comptables ↔ Proformas (même page CRM) */
export default function CrmDocTabs({ active, onChange }) {
  const tabs = [
    { id: 'factures', label: 'Factures' },
    { id: 'proformas', label: 'Proformas' },
  ];
  return (
    <div
      style={{
        display: 'flex',
        gap: 0,
        marginBottom: 20,
        borderBottom: '2px solid var(--border)',
        overflowX: 'auto',
      }}
      role="tablist"
      aria-label="Type de document"
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={active === t.id}
          onClick={() => onChange?.(t.id)}
          style={{
            padding: '10px 18px',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'var(--font-body)',
            fontWeight: 600,
            fontSize: '0.85rem',
            background: 'none',
            whiteSpace: 'nowrap',
            color: active === t.id ? 'var(--red)' : 'var(--text-2)',
            borderBottom: active === t.id ? '2px solid var(--red)' : '2px solid transparent',
            marginBottom: -2,
            transition: 'all 0.15s',
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

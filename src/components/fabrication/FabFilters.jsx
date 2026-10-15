import { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';

function initiallyOpen() {
  return typeof window === 'undefined' || window.innerWidth > 768;
}

/** Recherche toujours visible + filtres repliables (repliés par défaut sur mobile). */
export default function FabFilters({ search, activeCount = 0, children }) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <div className="card fab-filters-card">
      <div className="fab-toolbar" style={{ marginBottom: 0 }}>
        {search}
        <button
          type="button"
          className={`btn btn-ghost btn-sm fab-filters-toggle${open ? ' is-on' : ''}`}
          onClick={() => setOpen((v) => !v)}
        >
          <SlidersHorizontal size={14} /> Filtres{activeCount ? ` (${activeCount})` : ''}
        </button>
      </div>
      {open ? <div className="fab-toolbar" style={{ marginTop: 10, marginBottom: 0 }}>{children}</div> : null}
    </div>
  );
}

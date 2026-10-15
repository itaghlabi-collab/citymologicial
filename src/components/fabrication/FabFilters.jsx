import { useState } from 'react';
import { RotateCcw, SlidersHorizontal } from 'lucide-react';

/** Recherche + filtres rapides toujours visibles ; filtres détaillés repliables (repliés par défaut). */
export default function FabFilters({ search, chips, activeCount = 0, onReset, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="fab-filterbar">
      <div className="fab-filterbar-row">
        {search}
        {children ? (
          <button
            type="button"
            className={`btn btn-ghost btn-sm fab-filters-toggle${open || activeCount ? ' is-on' : ''}`}
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            <SlidersHorizontal size={14} /> Filtres{activeCount ? <span className="fab-chip-count">{activeCount}</span> : null}
          </button>
        ) : null}
        {activeCount && onReset ? (
          <button type="button" className="btn btn-ghost btn-sm fab-filters-reset" onClick={onReset} title="Réinitialiser les filtres">
            <RotateCcw size={13} />
          </button>
        ) : null}
      </div>
      {chips ? <div className="fab-filterbar-chips">{chips}</div> : null}
      {open && children ? <div className="fab-filterbar-panel">{children}</div> : null}
    </div>
  );
}

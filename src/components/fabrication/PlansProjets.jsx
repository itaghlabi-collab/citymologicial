import { useMemo, useState } from 'react';
import {
  AlertCircle, Download, Eye, FileText, FolderOpen, Layers, Pencil, Plus, RefreshCw, Search,
} from 'lucide-react';
import {
  FAB_ATELIERS, FAB_LIBRARY_STATUTS, fabAtelierFullLabel, fabAtelierColor,
} from '../../constants/fabrication';
import {
  FabEmpty, FabChips, FabPageHeader, FabSkeleton, FabAtelierDot, fmtDate, isImageFile,
} from './shared';
import { LibraryStatutBadge } from './LibraryPlanDetail';
import { downloadUrl } from './FilePreview';
import FabFilters from './FabFilters';

export default function PlansProjets({
  library, loading, error, onReload, canCreate, canEdit, onCreate, onEdit, onView,
}) {
  const [search, setSearch] = useState('');
  const [projet, setProjet] = useState('');
  const [atelier, setAtelier] = useState('');
  const [statut, setStatut] = useState('all');

  const projets = useMemo(() => {
    const s = new Set();
    library.forEach((p) => { if (p.projet_nom) s.add(p.projet_nom); });
    return [...s].sort();
  }, [library]);

  const base = useMemo(() => {
    const q = search.trim().toLowerCase();
    return library.filter((p) => {
      if (projet && p.projet_nom !== projet) return false;
      if (atelier && p.atelier !== atelier) return false;
      if (q) {
        const blob = `${p.reference} ${p.nom} ${p.projet_nom} ${p.client_nom} ${p.designation}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [library, search, projet, atelier]);

  const rows = statut === 'all' ? base : base.filter((p) => p.statut === statut);

  const chipOptions = [
    { value: 'all', label: 'Tous', count: base.length },
    ...Object.entries(FAB_LIBRARY_STATUTS).map(([k, v]) => ({
      value: k,
      label: v.label,
      count: base.filter((p) => p.statut === k).length,
      tone: k === 'disponible' ? 'blue' : k === 'en_production' ? 'orange' : 'green',
    })),
  ];

  const activeFilters = [projet, atelier].filter(Boolean).length;

  return (
    <div className="fab-page animate-fade-in">
      <FabPageHeader title="Plans / Projets" subtitle="Bibliothèque des plans techniques, réutilisables pour plusieurs productions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onReload} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'spin' : ''} /> Actualiser
        </button>
        {canCreate ? (
          <button type="button" className="btn btn-primary btn-sm" onClick={onCreate}>
            <Plus size={14} /> Ajouter un plan
          </button>
        ) : null}
      </FabPageHeader>

      {error ? <div className="fab-alert"><AlertCircle size={16} /> {error}</div> : null}

      <FabFilters
        search={(
          <div className="fab-search">
            <Search size={15} className="fab-search-icon" aria-hidden />
            <input
              className="fab-search-input"
              placeholder="Rechercher nom, projet, client, référence…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        )}
        chips={<FabChips options={chipOptions} value={statut} onChange={setStatut} />}
        activeCount={activeFilters}
        onReset={() => { setProjet(''); setAtelier(''); }}
      >
        <select className="fab-filter" value={projet} onChange={(e) => setProjet(e.target.value)}>
          <option value="">Tous les projets</option>
          {projets.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <select className="fab-filter" value={atelier} onChange={(e) => setAtelier(e.target.value)}>
          <option value="">Tous les ateliers</option>
          {FAB_ATELIERS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
      </FabFilters>

      {loading ? (
        <div className="card fab-pad"><FabSkeleton rows={5} /></div>
      ) : rows.length === 0 ? (
        <div className="card">
          <FabEmpty
            icon={<FolderOpen size={22} />}
            title="Aucun plan"
            sub={base.length ? 'Aucun plan ne correspond à ce statut.' : 'Ajoutez un plan ou transmettez-le depuis un projet.'}
          />
        </div>
      ) : (
        <>
          <div className="card fab-table-desktop" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="table-wrap">
              <table className="fab-table">
                <thead>
                  <tr>
                    <th>Plan</th>
                    <th>Projet</th>
                    <th>Atelier</th>
                    <th>Date</th>
                    <th>Statut</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.id} className="fab-row-click" onClick={() => onView(p)}>
                      <td>
                        <div className="fab-cell-main">
                          <Thumb plan={p} />
                          <div>
                            <strong>{p.nom}</strong>
                            <div className="fab-card-meta">{p.reference}{p.source === 'projets' ? ' · depuis Projets' : ''}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        {p.projet_nom || '—'}
                        {p.client_nom ? <div className="fab-card-meta">{p.client_nom}</div> : null}
                      </td>
                      <td>
                        {p.atelier ? (
                          <span className="fab-atelier-tag"><FabAtelierDot atelier={p.atelier} />{fabAtelierFullLabel(p.atelier, p.machine_type)}</span>
                        ) : '—'}
                      </td>
                      <td className="fab-nowrap">{fmtDate(p.created_at)}</td>
                      <td><LibraryStatutBadge statut={p.statut} /></td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <Actions plan={p} canEdit={canEdit} onEdit={onEdit} onView={onView} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="fab-cards-mobile fab-grid-cards">
            {rows.map((p) => (
              <div key={p.id} className="fab-card fab-card-accent" style={{ '--atelier': fabAtelierColor(p.atelier) }}>
                <div className="fab-card-top">
                  <Thumb plan={p} />
                  <div className="fab-card-top-text">
                    <div className="fab-card-title">{p.nom}</div>
                    <div className="fab-card-sub">{p.reference} · {p.projet_nom || '—'}</div>
                  </div>
                  <LibraryStatutBadge statut={p.statut} />
                </div>
                <div className="fab-card-meta">
                  {p.atelier ? <span className="fab-atelier-tag"><FabAtelierDot atelier={p.atelier} />{fabAtelierFullLabel(p.atelier, p.machine_type)}</span> : 'Atelier non défini'}
                  {' · '}{fmtDate(p.created_at)}
                  {p.client_nom ? ` · ${p.client_nom}` : ''}
                </div>
                <div className="fab-card-actions">
                  <Actions plan={p} canEdit={canEdit} onEdit={onEdit} onView={onView} labels />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Thumb({ plan }) {
  const first = (plan.files || [])[0];
  const count = (plan.files || []).length;
  return (
    <span className="fab-thumb" title={`${count} fichier${count > 1 ? 's' : ''}`}>
      {first?.url && isImageFile(first) ? <img src={first.url} alt="" loading="lazy" /> : <FileText size={18} />}
      {count > 1 ? <span className="fab-thumb-count">{count}</span> : null}
    </span>
  );
}

function Actions({ plan, canEdit, onEdit, onView, labels = false }) {
  const first = (plan.files || [])[0];
  const prodCount = (plan.productions || []).length;
  return (
    <div className="fab-actions">
      <button type="button" className="btn btn-ghost btn-sm" title="Consulter" onClick={() => onView(plan)}>
        <Eye size={13} />{labels ? ' Consulter' : null}
      </button>
      {canEdit ? (
        <button type="button" className="btn btn-ghost btn-sm" title="Modifier" onClick={() => onEdit(plan)}>
          <Pencil size={13} />{labels ? ' Modifier' : null}
        </button>
      ) : null}
      {first?.url ? (
        <a className="btn btn-ghost btn-sm" title="Télécharger" href={downloadUrl(first)} rel="noreferrer">
          <Download size={13} />{labels ? ' Télécharger' : null}
        </a>
      ) : null}
      <button type="button" className="btn btn-ghost btn-sm" title="Productions associées" onClick={() => onView(plan, 'productions')}>
        <Layers size={13} /> {labels ? `Productions (${prodCount})` : prodCount}
      </button>
    </div>
  );
}

import { useMemo, useState } from 'react';
import {
  AlertCircle, ArrowLeft, ChevronRight, Download, Eye, FileText, FolderOpen,
  Layers, Pencil, Plus, RefreshCw, Search,
} from 'lucide-react';
import {
  FAB_ATELIERS, FAB_LIBRARY_STATUTS, fabAtelierFullLabel, fabAtelierColor, groupByProjetNom,
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
  const [atelier, setAtelier] = useState('');
  const [statut, setStatut] = useState('all');
  const [selectedProjet, setSelectedProjet] = useState(null);

  const base = useMemo(() => {
    const q = search.trim().toLowerCase();
    return library.filter((p) => {
      if (atelier && p.atelier !== atelier) return false;
      if (q) {
        const blob = `${p.reference} ${p.nom} ${p.projet_nom} ${p.client_nom} ${p.designation}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [library, search, atelier]);

  const projectGroups = useMemo(() => groupByProjetNom(base), [base]);

  const selectedPlans = useMemo(() => {
    if (!selectedProjet) return [];
    const group = projectGroups.find((g) => g.nom === selectedProjet);
    const rows = group?.rows || [];
    return statut === 'all' ? rows : rows.filter((p) => p.statut === statut);
  }, [projectGroups, selectedProjet, statut]);

  const selectedBase = useMemo(() => {
    if (!selectedProjet) return [];
    return projectGroups.find((g) => g.nom === selectedProjet)?.rows || [];
  }, [projectGroups, selectedProjet]);

  const chipOptions = [
    { value: 'all', label: 'Tous', count: selectedBase.length },
    ...Object.entries(FAB_LIBRARY_STATUTS).map(([k, v]) => ({
      value: k,
      label: v.label,
      count: selectedBase.filter((p) => p.statut === k).length,
      tone: k === 'disponible' ? 'blue' : k === 'en_production' ? 'orange' : 'green',
    })),
  ];

  const activeFilters = atelier ? 1 : 0;
  const clientOf = (rows) => rows.find((p) => p.client_nom)?.client_nom || '';

  return (
    <div className="fab-page animate-fade-in">
      <FabPageHeader
        title={selectedProjet ? selectedProjet : 'Plans / Projets'}
        subtitle={selectedProjet
          ? `${selectedBase.length} plan${selectedBase.length > 1 ? 's' : ''} · ${clientOf(selectedBase) || 'Bibliothèque projet'}`
          : 'Bibliothèque des plans techniques, organisée par projet'}
      >
        {selectedProjet ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setSelectedProjet(null); setStatut('all'); }}>
            <ArrowLeft size={14} /> Projets
          </button>
        ) : null}
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
              placeholder={selectedProjet ? 'Rechercher un plan…' : 'Rechercher projet, plan, client, référence…'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        )}
        chips={selectedProjet ? <FabChips options={chipOptions} value={statut} onChange={setStatut} /> : null}
        activeCount={activeFilters}
        onReset={() => setAtelier('')}
      >
        <select className="fab-filter" value={atelier} onChange={(e) => setAtelier(e.target.value)}>
          <option value="">Tous les ateliers</option>
          {FAB_ATELIERS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
      </FabFilters>

      {loading ? (
        <div className="card fab-pad"><FabSkeleton rows={5} /></div>
      ) : !selectedProjet ? (
        projectGroups.length === 0 ? (
          <div className="card">
            <FabEmpty
              icon={<FolderOpen size={22} />}
              title="Aucun projet"
              sub="Ajoutez un plan ou transmettez-le depuis un projet."
            />
          </div>
        ) : (
          <div className="fab-grid-cards fab-project-grid">
            {projectGroups.map(({ nom, rows }) => {
              const client = clientOf(rows);
              const dispo = rows.filter((p) => p.statut === 'disponible').length;
              const enProd = rows.filter((p) => p.statut === 'en_production').length;
              const ateliers = [...new Set(rows.map((p) => p.atelier).filter(Boolean))];
              return (
                <button
                  key={nom}
                  type="button"
                  className="fab-card fab-project-card"
                  onClick={() => setSelectedProjet(nom)}
                >
                  <div className="fab-project-card-top">
                    <span className="fab-project-icon"><FolderOpen size={18} /></span>
                    <ChevronRight size={18} className="fab-project-chevron" aria-hidden />
                  </div>
                  <div className="fab-card-title">{nom}</div>
                  {client ? <div className="fab-card-sub">{client}</div> : null}
                  <div className="fab-project-stats">
                    <span><strong>{rows.length}</strong> plan{rows.length > 1 ? 's' : ''}</span>
                    {dispo ? <span className="fab-pill tone-blue">{dispo} dispo.</span> : null}
                    {enProd ? <span className="fab-pill tone-orange">{enProd} en prod.</span> : null}
                  </div>
                  {ateliers.length ? (
                    <div className="fab-card-meta" style={{ marginTop: 6 }}>
                      {ateliers.slice(0, 3).map((a) => (
                        <span key={a} className="fab-atelier-tag" style={{ marginRight: 6 }}>
                          <FabAtelierDot atelier={a} />{FAB_ATELIERS.find((x) => x.value === a)?.label || a}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>
        )
      ) : selectedPlans.length === 0 ? (
        <div className="card">
          <FabEmpty
            icon={<FolderOpen size={22} />}
            title="Aucun plan"
            sub={selectedBase.length ? 'Aucun plan ne correspond à ce statut.' : 'Ajoutez un plan pour ce projet.'}
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
                    <th>Atelier</th>
                    <th>Date</th>
                    <th>Statut</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {selectedPlans.map((p) => (
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
            {selectedPlans.map((p) => (
              <div key={p.id} className="fab-card fab-card-accent" style={{ '--atelier': fabAtelierColor(p.atelier) }}>
                <div className="fab-card-top">
                  <Thumb plan={p} />
                  <div className="fab-card-top-text">
                    <div className="fab-card-title">{p.nom}</div>
                    <div className="fab-card-sub">{p.reference}</div>
                  </div>
                  <LibraryStatutBadge statut={p.statut} />
                </div>
                <div className="fab-card-meta">
                  {p.atelier ? <span className="fab-atelier-tag"><FabAtelierDot atelier={p.atelier} />{fabAtelierFullLabel(p.atelier, p.machine_type)}</span> : 'Atelier non défini'}
                  {' · '}{fmtDate(p.created_at)}
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

import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, ArrowLeft, ChevronRight, Eye, FileEdit, FileText, FolderOpen,
  Inbox, Play, Plus, RefreshCw, Search,
} from 'lucide-react';
import { FAB_ATELIERS, fabAtelierFullLabel, fabAtelierColor, groupByProjetNom } from '../../constants/fabrication';
import {
  FabEmpty, FabChips, FabPageHeader, FabSkeleton, FabAtelierDot, fmtDate, fmtDateTime, isImageFile,
} from './shared';
import FabFilters from './FabFilters';

function matches(q, ...parts) {
  return !q || parts.join(' ').toLowerCase().includes(q);
}

export default function PlansAFabriquer({
  library, records, loading, error, onReload, canStart, canAssign, preset,
  onStart, onResumeDraft, onViewPlan, onViewProduction, onAssignLegacy,
}) {
  const [search, setSearch] = useState('');
  const [atelier, setAtelier] = useState('');
  const [tab, setTab] = useState('disponibles');
  const [selectedProjet, setSelectedProjet] = useState(null);
  const q = search.trim().toLowerCase();

  useEffect(() => {
    if (preset?.tab) setTab(preset.tab);
    if (preset?.start) setSelectedProjet(null);
  }, [preset]);

  const disponibles = useMemo(() => library.filter((p) => (
    p.statut === 'disponible'
    && (!atelier || p.atelier === atelier)
    && matches(q, p.reference, p.nom, p.projet_nom, p.client_nom, p.designation)
  )), [library, atelier, q]);

  const { brouillons, legacy } = useMemo(() => {
    const keep = records.filter((p) => (!atelier || p.atelier === atelier)
      && matches(q, p.reference, p.designation, p.projet_nom));
    return {
      brouillons: keep.filter((p) => p.statut === 'brouillon'),
      legacy: keep.filter((p) => p.statut === 'plan_recu'),
    };
  }, [records, atelier, q]);

  const sourceRows = tab === 'disponibles' ? disponibles : tab === 'brouillons' ? brouillons : legacy;
  const projectGroups = useMemo(() => groupByProjetNom(sourceRows), [sourceRows]);

  const selectedRows = useMemo(() => {
    if (!selectedProjet) return [];
    return projectGroups.find((g) => g.nom === selectedProjet)?.rows || [];
  }, [projectGroups, selectedProjet]);

  const chipOptions = [
    { value: 'disponibles', label: 'Disponibles', count: disponibles.length, tone: 'blue' },
    { value: 'brouillons', label: 'Brouillons', count: brouillons.length, tone: 'grey' },
    { value: 'legacy', label: 'Ancien circuit', count: legacy.length, tone: 'purple', hidden: !legacy.length && tab !== 'legacy' },
  ];

  const clientOf = (rows) => rows.find((p) => p.client_nom)?.client_nom || '';

  function switchTab(next) {
    setTab(next);
    setSelectedProjet(null);
  }

  return (
    <div className="fab-page animate-fade-in">
      <FabPageHeader
        title={selectedProjet ? selectedProjet : 'Démarrage de production'}
        subtitle={selectedProjet
          ? `${selectedRows.length} élément${selectedRows.length > 1 ? 's' : ''} · ${clientOf(selectedRows) || 'Lancement par projet'}`
          : 'Productions à démarrer, organisées par projet'}
      >
        {selectedProjet ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelectedProjet(null)}>
            <ArrowLeft size={14} /> Projets
          </button>
        ) : null}
        <button type="button" className="btn btn-ghost btn-sm" onClick={onReload} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'spin' : ''} /> Actualiser
        </button>
        {canStart ? (
          <button type="button" className="btn btn-primary fab-cta" onClick={() => onStart(null)}>
            <Plus size={16} /> DÉBUTER UNE PRODUCTION
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
              placeholder={selectedProjet ? 'Rechercher dans ce projet…' : 'Rechercher plan, projet, client, référence…'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        )}
        chips={<FabChips options={chipOptions} value={tab} onChange={switchTab} />}
        activeCount={atelier ? 1 : 0}
        onReset={() => setAtelier('')}
      >
        <select className="fab-filter" value={atelier} onChange={(e) => setAtelier(e.target.value)}>
          <option value="">Tous les ateliers</option>
          {FAB_ATELIERS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
      </FabFilters>

      {loading ? (
        <div className="card fab-pad"><FabSkeleton rows={4} /></div>
      ) : !selectedProjet ? (
        projectGroups.length === 0 ? (
          <div className="card">
            <FabEmpty
              icon={tab === 'brouillons' ? <FileEdit size={22} /> : <Inbox size={22} />}
              title={tab === 'brouillons' ? 'Aucun brouillon' : tab === 'legacy' ? 'Aucun plan de l’ancien circuit' : 'Aucun plan en attente de lancement'}
              sub={tab === 'disponibles'
                ? 'Les plans ajoutés dans « Plans / Projets » apparaissent ici, regroupés par projet.'
                : tab === 'brouillons'
                  ? 'Les productions enregistrées en brouillon apparaissent ici, avant leur démarrage.'
                  : 'Tous les anciens plans reçus ont été affectés.'}
            />
          </div>
        ) : (
          <div className="fab-grid-cards fab-project-grid">
            {projectGroups.map(({ nom, rows }) => {
              const client = clientOf(rows);
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
                    <span>
                      <strong>{rows.length}</strong>
                      {' '}
                      {tab === 'brouillons' ? `brouillon${rows.length > 1 ? 's' : ''}` : `plan${rows.length > 1 ? 's' : ''}`}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )
      ) : (
        <>
          {tab === 'brouillons' ? <div className="fab-hint">Non démarrés — n’apparaissent pas dans le suivi.</div> : null}
          <div className="fab-grid-cards">
            {selectedRows.map((p) => {
              if (tab === 'disponibles') {
                const files = p.files || [];
                const first = files[0];
                return (
                  <div key={p.id} className="fab-card fab-card-accent" style={{ '--atelier': fabAtelierColor(p.atelier) }}>
                    <div className="fab-card-top">
                      <button type="button" className="fab-thumb" onClick={() => onViewPlan(p)} title="Consulter le plan">
                        {first?.url && isImageFile(first) ? <img src={first.url} alt="" loading="lazy" /> : <FileText size={18} />}
                        {files.length > 1 ? <span className="fab-thumb-count">{files.length}</span> : null}
                      </button>
                      <div className="fab-card-top-text">
                        <div className="fab-card-title">{p.nom}</div>
                        <div className="fab-card-sub">{p.reference}</div>
                      </div>
                    </div>
                    <div className="fab-card-meta">
                      {p.atelier ? <span className="fab-atelier-tag"><FabAtelierDot atelier={p.atelier} />{fabAtelierFullLabel(p.atelier, p.machine_type)}</span> : 'Atelier non défini'}
                      {p.client_nom ? ` · ${p.client_nom}` : ''}
                    </div>
                    <div className="fab-card-meta">
                      {p.source === 'projets' ? 'Transmis depuis Projets' : 'Ajouté'} le {fmtDate(p.created_at)}{p.created_by_nom ? ` · ${p.created_by_nom}` : ''}
                    </div>
                    <div className="fab-card-actions">
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onViewPlan(p)}><Eye size={13} /> Consulter</button>
                      {canStart ? (
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => onStart(p)}><Play size={13} /> Débuter</button>
                      ) : null}
                    </div>
                  </div>
                );
              }
              if (tab === 'brouillons') {
                return (
                  <div key={p.id} className="fab-card fab-card-accent" style={{ '--atelier': fabAtelierColor(p.atelier) }}>
                    <div className="fab-card-title">{p.designation || 'Brouillon'}</div>
                    <div className="fab-card-sub">{p.reference}</div>
                    <div className="fab-card-meta">
                      <span className="fab-atelier-tag"><FabAtelierDot atelier={p.atelier} />{fabAtelierFullLabel(p.atelier, p.machine_type)}</span>
                      {' · '}modifié le {fmtDateTime(p.updated_at)}
                    </div>
                    <div className="fab-card-actions">
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onViewProduction(p)}><Eye size={13} /> Voir</button>
                      {canStart ? (
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => onResumeDraft(p)}><FileEdit size={13} /> Reprendre</button>
                      ) : null}
                    </div>
                  </div>
                );
              }
              return (
                <div key={p.id} className="fab-card">
                  <div className="fab-card-title">{p.designation || p.projet_nom || 'Plan'}</div>
                  <div className="fab-card-meta">Transmis le {fmtDate(p.date_transmission)} · {p.transmetteur_nom || '—'}</div>
                  <div className="fab-card-actions">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => onViewProduction(p)}><Eye size={13} /> Voir</button>
                    {canAssign ? (
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => onAssignLegacy(p)}>Affecter</button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

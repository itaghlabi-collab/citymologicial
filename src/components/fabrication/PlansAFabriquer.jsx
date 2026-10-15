import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, Eye, FileEdit, FileText, Inbox, Play, Plus, RefreshCw, Search,
} from 'lucide-react';
import { FAB_ATELIERS, fabAtelierFullLabel, fabAtelierColor } from '../../constants/fabrication';
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
  const [projet, setProjet] = useState('');
  const [atelier, setAtelier] = useState('');
  const [tab, setTab] = useState('disponibles');
  const q = search.trim().toLowerCase();

  useEffect(() => {
    if (preset?.tab) setTab(preset.tab);
  }, [preset]);

  const projets = useMemo(() => {
    const s = new Set();
    library.forEach((p) => { if (p.projet_nom) s.add(p.projet_nom); });
    records.forEach((p) => { if (p.projet_nom) s.add(p.projet_nom); });
    return [...s].sort();
  }, [library, records]);

  const disponibles = useMemo(() => library.filter((p) => (
    p.statut === 'disponible'
    && (!projet || p.projet_nom === projet)
    && (!atelier || p.atelier === atelier)
    && matches(q, p.reference, p.nom, p.projet_nom, p.client_nom, p.designation)
  )), [library, projet, atelier, q]);

  const { brouillons, legacy } = useMemo(() => {
    const keep = records.filter((p) => (!projet || p.projet_nom === projet)
      && (!atelier || p.atelier === atelier)
      && matches(q, p.reference, p.designation, p.projet_nom));
    return {
      brouillons: keep.filter((p) => p.statut === 'brouillon'),
      legacy: keep.filter((p) => p.statut === 'plan_recu'),
    };
  }, [records, projet, atelier, q]);

  const chipOptions = [
    { value: 'disponibles', label: 'Disponibles', count: disponibles.length, tone: 'blue' },
    { value: 'brouillons', label: 'Brouillons', count: brouillons.length, tone: 'grey' },
    { value: 'legacy', label: 'Ancien circuit', count: legacy.length, tone: 'purple', hidden: !legacy.length && tab !== 'legacy' },
  ];

  return (
    <div className="fab-page animate-fade-in">
      <FabPageHeader title="Plans à fabriquer" subtitle="Plans disponibles à lancer et productions en préparation">
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
              placeholder="Rechercher plan, projet, client, référence…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        )}
        chips={<FabChips options={chipOptions} value={tab} onChange={setTab} />}
        activeCount={[projet, atelier].filter(Boolean).length}
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
        <div className="card fab-pad"><FabSkeleton rows={4} /></div>
      ) : (
        <>
          {tab === 'disponibles' && (
            disponibles.length === 0 ? (
              <div className="card">
                <FabEmpty
                  icon={<Inbox size={22} />}
                  title="Aucun plan en attente de lancement"
                  sub="Les plans ajoutés dans « Plans / Projets » ou transmis depuis un projet apparaissent ici."
                />
              </div>
            ) : (
              <div className="fab-grid-cards">
                {disponibles.map((p) => {
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
                          <div className="fab-card-sub">{p.reference} · {p.projet_nom || '—'}</div>
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
                })}
              </div>
            )
          )}

          {tab === 'brouillons' && (
            brouillons.length === 0 ? (
              <div className="card">
                <FabEmpty icon={<FileEdit size={22} />} title="Aucun brouillon" sub="Les productions enregistrées en brouillon apparaissent ici, avant leur démarrage." />
              </div>
            ) : (
              <>
                <div className="fab-hint">Non démarrés — n’apparaissent pas dans le suivi.</div>
                <div className="fab-grid-cards">
                  {brouillons.map((p) => (
                    <div key={p.id} className="fab-card fab-card-accent" style={{ '--atelier': fabAtelierColor(p.atelier) }}>
                      <div className="fab-card-title">{p.designation || 'Brouillon'}</div>
                      <div className="fab-card-sub">{p.reference} · {p.projet_nom || '—'}</div>
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
                  ))}
                </div>
              </>
            )
          )}

          {tab === 'legacy' && (
            legacy.length === 0 ? (
              <div className="card">
                <FabEmpty icon={<Inbox size={22} />} title="Aucun plan de l’ancien circuit" sub="Tous les anciens plans reçus ont été affectés." />
              </div>
            ) : (
              <div className="fab-grid-cards">
                {legacy.map((p) => (
                  <div key={p.id} className="fab-card">
                    <div className="fab-card-title">{p.projet_nom || 'Projet'}</div>
                    <div className="fab-card-sub">{p.designation}</div>
                    <div className="fab-card-meta">Transmis le {fmtDate(p.date_transmission)} · {p.transmetteur_nom || '—'}</div>
                    <div className="fab-card-actions">
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onViewProduction(p)}><Eye size={13} /> Voir</button>
                      {canAssign ? (
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => onAssignLegacy(p)}>Affecter</button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </>
      )}
    </div>
  );
}

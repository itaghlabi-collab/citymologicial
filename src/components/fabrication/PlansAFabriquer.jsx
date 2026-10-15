import { useMemo, useState } from 'react';
import {
  AlertCircle, Eye, FileEdit, Inbox, Loader2, Play, Plus, RefreshCw, Search,
} from 'lucide-react';
import { FAB_ATELIERS, fabAtelierFullLabel } from '../../constants/fabrication';
import { FabBadge, FabEmpty, fmtDate, fmtDateTime } from './shared';
import FabFilters from './FabFilters';

function matches(q, ...parts) {
  return !q || parts.join(' ').toLowerCase().includes(q);
}

export default function PlansAFabriquer({
  library, records, loading, error, onReload, canStart, canAssign,
  onStart, onResumeDraft, onViewPlan, onViewProduction, onAssignLegacy,
}) {
  const [search, setSearch] = useState('');
  const [projet, setProjet] = useState('');
  const [atelier, setAtelier] = useState('');
  const q = search.trim().toLowerCase();

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

  return (
    <div className="fab-page animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Plans à fabriquer</h1>
          <p className="page-subtitle">Plans disponibles à lancer et productions en préparation</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onReload} disabled={loading}>
            <RefreshCw size={14} /> Actualiser
          </button>
          {canStart ? (
            <button type="button" className="btn btn-primary fab-cta" onClick={() => onStart(null)}>
              <Plus size={16} /> DÉBUTER UNE PRODUCTION
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="card" style={{ padding: 14, marginBottom: 16, color: 'var(--red)', display: 'flex', gap: 8 }}>
          <AlertCircle size={16} /> {error}
        </div>
      ) : null}

      <FabFilters
        search={(
          <div className="fab-search">
            <Search size={15} className="fab-search-icon" aria-hidden />
            <input
              className="fab-search-input"
              placeholder="Recherche plan, projet, client, référence"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        )}
        activeCount={[projet, atelier].filter(Boolean).length}
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
        <div className="card" style={{ padding: 40, textAlign: 'center' }}><Loader2 size={22} /></div>
      ) : (
        <>
          <Section title={`Plans disponibles à lancer (${disponibles.length})`}>
            {disponibles.length === 0 ? (
              <FabEmpty
                icon={<Inbox size={22} />}
                title="Aucun plan en attente de lancement"
                sub="Les plans ajoutés dans « Plans / Projets » ou transmis depuis un projet apparaissent ici."
              />
            ) : (
              <div className="fab-grid-cards">
                {disponibles.map((p) => (
                  <div key={p.id} className="fab-card">
                    <div className="fab-card-title">{p.nom}</div>
                    <div className="fab-card-sub">{p.reference} · {p.projet_nom || '—'}{p.client_nom ? ` · ${p.client_nom}` : ''}</div>
                    <div className="fab-card-meta">
                      {p.atelier ? fabAtelierFullLabel(p.atelier, p.machine_type) : 'Atelier non défini'} · {(p.files || []).length} fichier(s)
                    </div>
                    <div className="fab-card-meta">
                      {p.source === 'projets' ? 'Transmis depuis Projets' : 'Ajouté'} le {fmtDate(p.created_at)} · {p.created_by_nom || '—'}
                    </div>
                    <div className="fab-card-actions">
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onViewPlan(p)}><Eye size={13} /> Consulter</button>
                      {canStart ? (
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => onStart(p)}><Play size={13} /> Débuter</button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {brouillons.length ? (
            <Section title={`Brouillons (${brouillons.length})`} hint="Non démarrés — n’apparaissent pas dans le suivi.">
              <div className="fab-grid-cards">
                {brouillons.map((p) => (
                  <div key={p.id} className="fab-card">
                    <div className="fab-card-title">{p.designation || 'Brouillon'}</div>
                    <div className="fab-card-sub">{p.reference} · {p.projet_nom || '—'}</div>
                    <div className="fab-card-meta">{fabAtelierFullLabel(p.atelier, p.machine_type)} · modifié le {fmtDateTime(p.updated_at)}</div>
                    <div style={{ marginTop: 6 }}><FabBadge statut={p.statut} /></div>
                    <div className="fab-card-actions">
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onViewProduction(p)}><Eye size={13} /> Voir</button>
                      {canStart ? (
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => onResumeDraft(p)}><FileEdit size={13} /> Reprendre</button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          ) : null}

          {legacy.length ? (
            <Section title={`Plans reçus — ancien circuit (${legacy.length})`}>
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
            </Section>
          ) : null}
        </>
      )}
    </div>
  );
}

function Section({ title, hint, children }) {
  return (
    <div className="card" style={{ padding: 16, marginBottom: 16 }}>
      <div className="fab-section-title" style={{ fontSize: '1rem' }}>{title}</div>
      {hint ? <div className="fab-card-meta" style={{ marginTop: -6, marginBottom: 10 }}>{hint}</div> : null}
      {children}
    </div>
  );
}

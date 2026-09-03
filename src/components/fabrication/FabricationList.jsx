import { useMemo, useState } from 'react';
import { Search, RefreshCw, Eye, ExternalLink, Loader2, AlertCircle, Hammer, Inbox, CheckCircle2 } from 'lucide-react';
import {
  FAB_ATELIERS,
  FAB_STATUTS,
  FAB_PRIORITES,
  fabAtelierLabel,
  fabOnTimeLabel,
  fabDelayDays,
} from '../../constants/fabrication';
import {
  FabBadge, FabEmpty, FabProgress, fmtDate, fmtDateTime, planFile,
} from './shared';

const MODES = {
  inbox: {
    title: 'Plans à fabriquer',
    subtitle: 'Boîte de réception des plans transmis par les chefs de projet',
    defaultStatut: 'plan_recu',
    empty: 'Aucun plan reçu',
    emptyHint: 'Ouvrez un projet → Transmettre à Fabrication (plan + désignation).',
    icon: Inbox,
  },
  suivi: {
    title: 'Suivi de production',
    subtitle: 'Ateliers en cours — avancement et retards',
    defaultStatut: '',
    empty: 'Aucune production en cours',
    emptyHint: 'Les plans affectés à un atelier apparaissent ici.',
    icon: Hammer,
  },
  termine: {
    title: 'Production terminée',
    subtitle: 'Fabrications clôturées',
    defaultStatut: 'termine',
    empty: 'Aucune production terminée',
    emptyHint: 'Les fabrications à 100 % / statut Terminé s’affichent ici.',
    icon: CheckCircle2,
  },
};

function inMode(plan, mode) {
  if (mode === 'inbox') return true;
  if (mode === 'suivi') return plan.statut === 'a_lancer' || plan.statut === 'en_fabrication' || plan.statut === 'bloque';
  if (mode === 'termine') return plan.statut === 'termine';
  return true;
}

export default function FabricationList({
  mode,
  records,
  loading,
  error,
  onReload,
  canAssign,
  canUpdate,
  onView,
  onAssign,
  onUpdate,
}) {
  const cfg = MODES[mode] || MODES.suivi;
  const Icon = cfg.icon;
  const [search, setSearch] = useState('');
  const [projet, setProjet] = useState('');
  const [atelier, setAtelier] = useState('');
  const [statut, setStatut] = useState(cfg.defaultStatut);
  const [priorite, setPriorite] = useState('');
  const [dateFrom, setDateFrom] = useState('');

  const projets = useMemo(() => {
    const s = new Set();
    records.forEach((p) => { if (p.projet_nom) s.add(p.projet_nom); });
    return [...s].sort();
  }, [records]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter((p) => {
      if (!inMode(p, mode)) return false;
      if (mode === 'inbox' && !statut && p.statut !== 'plan_recu') return false;
      if (statut && p.statut !== statut) return false;
      if (projet && p.projet_nom !== projet) return false;
      if (atelier && p.atelier !== atelier) return false;
      if (priorite && p.priorite !== priorite) return false;
      if (dateFrom) {
        const d = String(p.date_transmission || '').slice(0, 10);
        if (d < dateFrom) return false;
      }
      if (q) {
        const blob = `${p.projet_nom} ${p.designation} ${p.reference} ${p.chef_atelier_nom}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [records, mode, search, projet, atelier, statut, priorite, dateFrom]);

  return (
    <div className="fab-page animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">{cfg.title}</h1>
          <p className="page-subtitle">{cfg.subtitle}</p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onReload} disabled={loading}>
          <RefreshCw size={14} /> Actualiser
        </button>
      </div>

      {error ? (
        <div className="card" style={{ padding: 14, marginBottom: 16, color: 'var(--red)', display: 'flex', gap: 8 }}>
          <AlertCircle size={16} /> {error}
        </div>
      ) : null}

      <div className="card fab-filters-card">
        <div className="fab-toolbar" style={{ marginBottom: 0 }}>
          <div className="fab-search">
            <Search size={15} className="fab-search-icon" aria-hidden />
            <input
              className="fab-search-input"
              placeholder="Recherche projet / désignation"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select className="fab-filter" value={projet} onChange={(e) => setProjet(e.target.value)}>
            <option value="">Projet</option>
            {projets.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <select className="fab-filter" value={atelier} onChange={(e) => setAtelier(e.target.value)}>
            <option value="">Atelier</option>
            {FAB_ATELIERS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
          {mode !== 'termine' ? (
            <select className="fab-filter" value={statut} onChange={(e) => setStatut(e.target.value)}>
              <option value="">Statut</option>
              {FAB_STATUTS.filter((s) => (
                mode !== 'suivi' || s.value === 'a_lancer' || s.value === 'en_fabrication' || s.value === 'bloque'
              )).map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          ) : null}
          {mode === 'inbox' ? (
            <select className="fab-filter" value={priorite} onChange={(e) => setPriorite(e.target.value)}>
              <option value="">Priorité</option>
              {FAB_PRIORITES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          ) : null}
          <input type="date" className="fab-filter" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}><Loader2 size={22} /></div>
        ) : rows.length === 0 ? (
          <FabEmpty
            icon={<Icon size={22} />}
            title={cfg.empty}
            sub="Les données affichées proviennent uniquement des plans transmis."
            hint={cfg.emptyHint}
          />
        ) : (
          <>
            <div className="table-wrap fab-table-desktop">
              <table>
                <thead>
                  <tr>
                    <th>Projet</th>
                    <th>Fabrication</th>
                    {mode === 'inbox' ? <th>Plan</th> : null}
                    {mode === 'inbox' ? <th>Chef de projet</th> : <th>Atelier</th>}
                    {mode === 'inbox' ? <th>Date</th> : <th>Chef d’atelier</th>}
                    {mode === 'suivi' || mode === 'termine' ? <th>Début</th> : null}
                    {mode !== 'inbox' ? <th>Fin prévue</th> : null}
                    {mode === 'termine' ? <th>Fin réelle</th> : null}
                    {mode !== 'inbox' ? <th>Avancement</th> : <th>Atelier</th>}
                    <th>Statut</th>
                    {mode === 'inbox' ? <th>Priorité</th> : null}
                    {mode === 'termine' ? <th>Délai</th> : null}
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <PlanRow
                      key={p.id}
                      plan={p}
                      mode={mode}
                      canAssign={canAssign}
                      canUpdate={canUpdate}
                      onView={onView}
                      onAssign={onAssign}
                      onUpdate={onUpdate}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="fab-cards-mobile" style={{ padding: 12 }}>
              {rows.map((p) => (
                <PlanCard
                  key={p.id}
                  plan={p}
                  mode={mode}
                  canAssign={canAssign}
                  canUpdate={canUpdate}
                  onView={onView}
                  onAssign={onAssign}
                  onUpdate={onUpdate}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PlanRow({ plan, mode, canAssign, canUpdate, onView, onAssign, onUpdate }) {
  const file = planFile(plan);
  const delay = mode === 'termine' ? fabOnTimeLabel(plan) : '';
  return (
    <tr>
      <td data-label="Projet"><strong>{plan.projet_nom || '—'}</strong></td>
      <td data-label="Fabrication">{plan.designation}</td>
      {mode === 'inbox' ? (
        <td data-label="Plan">
          {file?.url ? (
            <a href={file.url} target="_blank" rel="noreferrer">{file.file_name || 'Plan'}</a>
          ) : '—'}
        </td>
      ) : null}
      {mode === 'inbox' ? <td data-label="Chef de projet">{plan.transmetteur_nom || '—'}</td> : <td data-label="Atelier">{fabAtelierLabel(plan.atelier)}</td>}
      {mode === 'inbox' ? <td data-label="Date">{fmtDateTime(plan.date_transmission)}</td> : <td data-label="Chef d’atelier">{plan.chef_atelier_nom || '—'}</td>}
      {mode === 'suivi' || mode === 'termine' ? <td data-label="Début">{fmtDate(plan.date_debut_prevue || plan.date_debut_reelle)}</td> : null}
      {mode !== 'inbox' ? <td data-label="Fin prévue">{fmtDate(plan.date_fin_prevue)}</td> : null}
      {mode === 'termine' ? <td data-label="Fin réelle">{fmtDate(plan.date_fin_reelle)}</td> : null}
      {mode !== 'inbox' ? <td data-label="Avancement"><FabProgress value={plan.avancement} /></td> : <td data-label="Atelier">{fabAtelierLabel(plan.atelier)}</td>}
      <td data-label="Statut"><FabBadge statut={plan.statut} /></td>
      {mode === 'inbox' ? <td data-label="Priorité"><FabBadge priorite={plan.priorite} /></td> : null}
      {mode === 'termine' ? (
        <td data-label="Délai">
          <span className={`badge ${delay.startsWith('Retard') ? 'badge-red' : 'badge-green'}`}>{delay}</span>
        </td>
      ) : null}
      <td data-label="Actions">
        <RowActions plan={plan} mode={mode} canAssign={canAssign} canUpdate={canUpdate} onView={onView} onAssign={onAssign} onUpdate={onUpdate} />
      </td>
    </tr>
  );
}

function PlanCard({ plan, mode, canAssign, canUpdate, onView, onAssign, onUpdate }) {
  const file = planFile(plan);
  const delay = mode === 'termine' ? fabOnTimeLabel(plan) : (fabDelayDays(plan) > 0 && plan.statut !== 'termine' ? `Retard : ${fabDelayDays(plan)} j` : '');
  return (
    <div className="fab-card">
      <div className="fab-card-title">{plan.projet_nom || 'Projet'}</div>
      <div className="fab-card-sub">{plan.designation}</div>
      <div className="fab-card-meta">{fabAtelierLabel(plan.atelier)}</div>
      {plan.chef_atelier_nom ? <div className="fab-card-meta">Chef atelier : {plan.chef_atelier_nom}</div> : null}
      {mode !== 'inbox' ? (
        <div className="fab-card-meta">{fmtDate(plan.date_debut_prevue)} → {fmtDate(plan.date_fin_prevue)}</div>
      ) : (
        <div className="fab-card-meta">Transmis le {fmtDate(plan.date_transmission)} · {plan.transmetteur_nom || '—'}</div>
      )}
      {mode !== 'inbox' ? <FabProgress value={plan.avancement} /> : null}
      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        <FabBadge statut={plan.statut} />
        {mode === 'inbox' ? <FabBadge priorite={plan.priorite} /> : null}
        {delay ? <span className="badge badge-red">{delay}</span> : null}
      </div>
      <div className="fab-card-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onView(plan)}><Eye size={13} /> Voir</button>
        {file?.url ? (
          <a className="btn btn-ghost btn-sm" href={file.url} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Plan</a>
        ) : null}
        {canAssign && plan.statut === 'plan_recu' ? (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => onAssign(plan)}>Affecter</button>
        ) : null}
        {canUpdate && plan.statut !== 'plan_recu' ? (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onUpdate(plan)}>Mettre à jour</button>
        ) : null}
      </div>
    </div>
  );
}

function RowActions({ plan, mode, canAssign, canUpdate, onView, onAssign, onUpdate }) {
  const file = planFile(plan);
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onView(plan)}><Eye size={13} /></button>
      {file?.url ? (
        <a className="btn btn-ghost btn-sm" href={file.url} target="_blank" rel="noreferrer" title="Voir plan"><ExternalLink size={13} /></a>
      ) : null}
      {canAssign && plan.statut === 'plan_recu' ? (
        <button type="button" className="btn btn-primary btn-sm" onClick={() => onAssign(plan)}>Affecter</button>
      ) : null}
      {canUpdate && mode !== 'inbox' && plan.statut !== 'plan_recu' ? (
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onUpdate(plan)}>Mettre à jour</button>
      ) : null}
    </div>
  );
}

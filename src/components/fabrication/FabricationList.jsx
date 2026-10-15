import { useMemo, useState } from 'react';
import {
  Search, RefreshCw, Eye, Loader2, AlertCircle, Hammer, CheckCircle2, TrendingUp,
} from 'lucide-react';
import {
  FAB_ATELIERS,
  FAB_MACHINES,
  FAB_STATUTS,
  FAB_SUIVI_STATUTS,
  fabAtelierFullLabel,
  fabOnTimeLabel,
  fabIsLate,
  fabIsDueSoon,
  fabUniteLabel,
  fabFmtQty,
} from '../../constants/fabrication';
import {
  FabBadge, FabDeadlineBadges, FabEmpty, FabProgress, fmtDate, planFile,
} from './shared';
import { downloadUrl } from './FilePreview';
import FabFilters from './FabFilters';

const MODES = {
  suivi: {
    title: 'Suivi de production',
    subtitle: 'Productions lancées — quantités, avancement et échéances',
    empty: 'Aucune production en cours',
    emptyHint: 'Les productions débutées depuis « Plans à fabriquer » apparaissent ici.',
    icon: Hammer,
  },
  termine: {
    title: 'Production terminée',
    subtitle: 'Fabrications clôturées',
    empty: 'Aucune production terminée',
    emptyHint: 'Les productions au statut Terminée s’affichent ici.',
    icon: CheckCircle2,
  },
};

function inMode(plan, mode) {
  if (mode === 'suivi') return FAB_SUIVI_STATUTS.includes(plan.statut);
  if (mode === 'termine') return plan.statut === 'termine';
  return true;
}

function productionMachines(p) {
  const set = new Set();
  if (p.atelier === 'machinerie' && p.machine_type) set.add(p.machine_type);
  (p.lines || []).forEach((l) => { if (l.atelier === 'machinerie' && l.machine_type) set.add(l.machine_type); });
  return set;
}

function productionAteliers(p) {
  const set = new Set();
  if (p.atelier) set.add(p.atelier);
  (p.lines || []).forEach((l) => { if (l.atelier) set.add(l.atelier); });
  return set;
}

/** Quantités par désignation — jamais additionnées entre lignes. */
function QtyCell({ plan, field }) {
  const lines = plan.lines || [];
  if (!lines.length) return <span>—</span>;
  return (
    <div className="fab-qty-list">
      {lines.map((l) => (
        <div key={l.id} title={l.designation}>
          {fabFmtQty(l[field])} {fabUniteLabel(l.unite, l.unite_autre)}
          {lines.length > 1 ? <span className="fab-qty-name"> · {l.designation}</span> : null}
        </div>
      ))}
    </div>
  );
}

export default function FabricationList({
  mode,
  records,
  loading,
  error,
  onReload,
  canUpdate,
  onView,
  onUpdate,
  onProgress,
}) {
  const cfg = MODES[mode] || MODES.suivi;
  const Icon = cfg.icon;
  const [search, setSearch] = useState('');
  const [projet, setProjet] = useState('');
  const [atelier, setAtelier] = useState('');
  const [machine, setMachine] = useState('');
  const [statut, setStatut] = useState('');
  const [responsable, setResponsable] = useState('');
  const [echeance, setEcheance] = useState('');

  const scoped = useMemo(() => records.filter((p) => inMode(p, mode)), [records, mode]);

  const projets = useMemo(() => [...new Set(scoped.map((p) => p.projet_nom).filter(Boolean))].sort(), [scoped]);
  const responsables = useMemo(() => [...new Set(scoped.map((p) => p.chef_atelier_nom).filter(Boolean))].sort(), [scoped]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scoped.filter((p) => {
      if (statut && p.statut !== statut) return false;
      if (projet && p.projet_nom !== projet) return false;
      if (atelier && !productionAteliers(p).has(atelier)) return false;
      if (machine && !productionMachines(p).has(machine)) return false;
      if (responsable && p.chef_atelier_nom !== responsable) return false;
      if (echeance === 'retard' && !fabIsLate(p)) return false;
      if (echeance === 'proche' && !fabIsDueSoon(p)) return false;
      if (q) {
        const blob = `${p.reference} ${p.projet_nom} ${p.designation} ${p.chef_atelier_nom} ${(p.lines || []).map((l) => l.designation).join(' ')}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [scoped, search, statut, projet, atelier, machine, responsable, echeance]);

  const activeFilters = [projet, atelier, machine, statut, responsable, echeance].filter(Boolean).length;
  const update = (p) => ((p.lines || []).length ? onProgress(p) : onUpdate(p));

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

      <FabFilters
        search={(
          <div className="fab-search">
            <Search size={15} className="fab-search-icon" aria-hidden />
            <input
              className="fab-search-input"
              placeholder="Recherche référence, projet, désignation"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        )}
        activeCount={activeFilters}
      >
        <select className="fab-filter" value={projet} onChange={(e) => setProjet(e.target.value)}>
          <option value="">Tous les projets</option>
          {projets.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <select className="fab-filter" value={atelier} onChange={(e) => { setAtelier(e.target.value); setMachine(''); }}>
          <option value="">Tous les ateliers</option>
          {FAB_ATELIERS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
        {atelier === 'machinerie' ? (
          <select className="fab-filter" value={machine} onChange={(e) => setMachine(e.target.value)}>
            <option value="">Toutes machines</option>
            {FAB_MACHINES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        ) : null}
        {mode === 'suivi' ? (
          <select className="fab-filter" value={statut} onChange={(e) => setStatut(e.target.value)}>
            <option value="">Tous les statuts</option>
            {FAB_STATUTS.filter((s) => FAB_SUIVI_STATUTS.includes(s.value)).map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        ) : null}
        <select className="fab-filter" value={responsable} onChange={(e) => setResponsable(e.target.value)}>
          <option value="">Tous les responsables</option>
          {responsables.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        {mode === 'suivi' ? (
          <select className="fab-filter" value={echeance} onChange={(e) => setEcheance(e.target.value)}>
            <option value="">Toutes échéances</option>
            <option value="retard">En retard</option>
            <option value="proche">Échéance proche</option>
          </select>
        ) : null}
      </FabFilters>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}><Loader2 size={22} /></div>
        ) : rows.length === 0 ? (
          <FabEmpty icon={<Icon size={22} />} title={cfg.empty} sub="Données réelles uniquement." hint={cfg.emptyHint} />
        ) : (
          <>
            <div className="table-wrap fab-table-desktop">
              <table>
                <thead>
                  {mode === 'suivi' ? (
                    <tr>
                      <th>Référence</th>
                      <th>Projet</th>
                      <th>Désignation</th>
                      <th>Atelier</th>
                      <th>Qté demandée</th>
                      <th>Qté réalisée</th>
                      <th>Responsable</th>
                      <th>Date limite</th>
                      <th>Avancement</th>
                      <th>Statut</th>
                      <th>Actions</th>
                    </tr>
                  ) : (
                    <tr>
                      <th>Référence</th>
                      <th>Projet</th>
                      <th>Désignation</th>
                      <th>Qté demandée</th>
                      <th>Qté produite</th>
                      <th>Atelier</th>
                      <th>Responsable</th>
                      <th>Date fin</th>
                      <th>Délai</th>
                      <th>Plan</th>
                      <th>Actions</th>
                    </tr>
                  )}
                </thead>
                <tbody>
                  {rows.map((p) => (mode === 'suivi' ? (
                    <tr key={p.id}>
                      <td><strong>{p.reference}</strong></td>
                      <td>{p.projet_nom || '—'}</td>
                      <td>{p.designation}</td>
                      <td>{fabAtelierFullLabel(p.atelier, p.machine_type)}</td>
                      <td><QtyCell plan={p} field="quantite" /></td>
                      <td><QtyCell plan={p} field="quantite_realisee" /></td>
                      <td>{p.chef_atelier_nom || <span className="badge badge-grey">Sans responsable</span>}</td>
                      <td>{fmtDate(p.date_fin_prevue)}</td>
                      <td><FabProgress value={p.avancement} /></td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                          <FabBadge statut={p.statut} />
                          <FabDeadlineBadges plan={p} />
                        </div>
                      </td>
                      <td><RowActions plan={p} canUpdate={canUpdate} onView={onView} onUpdate={update} /></td>
                    </tr>
                  ) : (
                    <TermineRow key={p.id} plan={p} onView={onView} />
                  )))}
                </tbody>
              </table>
            </div>
            <div className="fab-cards-mobile" style={{ padding: 12 }}>
              {rows.map((p) => (
                <ProductionCard key={p.id} plan={p} mode={mode} canUpdate={canUpdate} onView={onView} onUpdate={update} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function TermineRow({ plan, onView }) {
  const file = planFile(plan);
  const delay = fabOnTimeLabel(plan);
  return (
    <tr>
      <td><strong>{plan.reference}</strong></td>
      <td>{plan.projet_nom || '—'}</td>
      <td>{plan.designation}</td>
      <td><QtyCell plan={plan} field="quantite" /></td>
      <td><QtyCell plan={plan} field="quantite_realisee" /></td>
      <td>{fabAtelierFullLabel(plan.atelier, plan.machine_type)}</td>
      <td>{plan.chef_atelier_nom || '—'}</td>
      <td>{fmtDate(plan.date_fin_reelle)}</td>
      <td><span className={`badge ${delay.startsWith('Retard') ? 'badge-red' : 'badge-green'}`}>{delay}</span></td>
      <td>
        {file?.url ? (
          <a href={downloadUrl(file)} rel="noreferrer">{plan.library_plan?.reference || file.file_name || 'Plan'}</a>
        ) : (plan.library_plan?.reference || '—')}
      </td>
      <td>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onView(plan)}><Eye size={13} /></button>
      </td>
    </tr>
  );
}

function ProductionCard({ plan, mode, canUpdate, onView, onUpdate }) {
  const lines = plan.lines || [];
  return (
    <div className="fab-card">
      <div className="fab-card-title">{plan.designation}</div>
      <div className="fab-card-sub">{plan.reference} · {plan.projet_nom || '—'}</div>
      <div className="fab-card-meta">{fabAtelierFullLabel(plan.atelier, plan.machine_type)} · {plan.chef_atelier_nom || 'Sans responsable'}</div>
      {lines.length ? (
        <div className="fab-card-meta">
          {lines.map((l) => (
            <div key={l.id}>
              {l.designation} : {fabFmtQty(l.quantite_realisee)} / {fabFmtQty(l.quantite)} {fabUniteLabel(l.unite, l.unite_autre)}
            </div>
          ))}
        </div>
      ) : null}
      <div className="fab-card-meta">
        {mode === 'termine' ? `Terminée le ${fmtDate(plan.date_fin_reelle)}` : `Limite : ${fmtDate(plan.date_fin_prevue)}`}
      </div>
      <FabProgress value={plan.avancement} />
      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        <FabBadge statut={plan.statut} />
        {mode === 'suivi' ? <FabDeadlineBadges plan={plan} /> : null}
        {mode === 'termine' ? (
          <span className={`badge ${fabOnTimeLabel(plan).startsWith('Retard') ? 'badge-red' : 'badge-green'}`}>{fabOnTimeLabel(plan)}</span>
        ) : null}
      </div>
      <div className="fab-card-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onView(plan)}><Eye size={13} /> Détail</button>
        {mode === 'suivi' && canUpdate ? (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => onUpdate(plan)}><TrendingUp size={13} /> Avancement</button>
        ) : null}
      </div>
    </div>
  );
}

function RowActions({ plan, canUpdate, onView, onUpdate }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <button type="button" className="btn btn-ghost btn-sm" title="Détail" onClick={() => onView(plan)}><Eye size={13} /></button>
      {canUpdate ? (
        <button type="button" className="btn btn-secondary btn-sm" title="Mettre à jour l’avancement" onClick={() => onUpdate(plan)}>
          <TrendingUp size={13} />
        </button>
      ) : null}
    </div>
  );
}

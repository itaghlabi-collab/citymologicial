import { useEffect, useMemo, useState } from 'react';
import {
  Search, RefreshCw, Eye, AlertCircle, Hammer, CheckCircle2, TrendingUp, Clock, Timer, FileText,
} from 'lucide-react';
import {
  FAB_ATELIERS,
  FAB_MACHINES,
  FAB_SUIVI_STATUTS,
  fabAtelierFullLabel,
  fabAtelierColor,
  fabOnTimeLabel,
  fabIsLate,
  fabIsDueSoon,
  fabDelayDays,
  fabDueLabel,
  fabUniteLabel,
  fabFmtQty,
} from '../../constants/fabrication';
import {
  FabBadge, FabEmpty, FabProgress, FabChips, FabPageHeader, FabSkeleton, FabStat, FabAtelierDot,
  fmtDate, planFile,
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

const SUIVI_CHIPS = [
  { value: 'all', label: 'Toutes', test: () => true },
  { value: 'en_fabrication', label: 'En cours', tone: 'orange', test: (p) => p.statut === 'en_fabrication' },
  { value: 'a_lancer', label: 'À lancer', tone: 'grey', test: (p) => p.statut === 'a_lancer' },
  { value: 'en_attente', label: 'En attente', tone: 'blue', test: (p) => p.statut === 'en_attente' },
  { value: 'bloque', label: 'Bloquées', tone: 'red', test: (p) => p.statut === 'bloque' },
  { value: 'retard', label: 'En retard', tone: 'red', test: (p) => fabIsLate(p) },
  { value: 'proche', label: 'Échéance proche', tone: 'orange', test: (p) => fabIsDueSoon(p) },
];

const isLateDone = (p) => fabOnTimeLabel(p).startsWith('Retard');

const TERMINE_CHIPS = [
  { value: 'all', label: 'Toutes', test: () => true },
  { value: 'ontime', label: 'Dans les délais', tone: 'green', test: (p) => !isLateDone(p) },
  { value: 'late', label: 'En retard', tone: 'red', test: (p) => isLateDone(p) },
];

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

/** Quantités réalisée / demandée par désignation — jamais additionnées entre lignes. */
function QtyCell({ plan, max = 2 }) {
  const lines = plan.lines || [];
  if (!lines.length) return <span className="fab-muted">—</span>;
  const shown = lines.slice(0, max);
  return (
    <div className="fab-qty-list">
      {shown.map((l) => (
        <div key={l.id} title={l.designation}>
          <strong>{fabFmtQty(l.quantite_realisee)}</strong>
          <span className="fab-muted"> / {fabFmtQty(l.quantite)} {fabUniteLabel(l.unite, l.unite_autre)}</span>
          {lines.length > 1 ? <span className="fab-qty-name"> · {l.designation}</span> : null}
        </div>
      ))}
      {lines.length > max ? <div className="fab-qty-name">+ {lines.length - max} autre(s) désignation(s)</div> : null}
    </div>
  );
}

function DueCell({ plan }) {
  const label = fabDueLabel(plan);
  const cls = fabIsLate(plan) ? 'is-late' : fabIsDueSoon(plan) ? 'is-soon' : '';
  return (
    <div className="fab-due-cell">
      <span>{fmtDate(plan.date_fin_prevue)}</span>
      {label ? <span className={`fab-due ${cls}`}>{label}</span> : null}
    </div>
  );
}

function AtelierCell({ plan }) {
  return (
    <span className="fab-atelier-tag">
      <FabAtelierDot atelier={plan.atelier} />{fabAtelierFullLabel(plan.atelier, plan.machine_type)}
    </span>
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
  preset,
}) {
  const cfg = MODES[mode] || MODES.suivi;
  const Icon = cfg.icon;
  const chips = mode === 'suivi' ? SUIVI_CHIPS : TERMINE_CHIPS;
  const [search, setSearch] = useState('');
  const [projet, setProjet] = useState('');
  const [atelier, setAtelier] = useState('');
  const [machine, setMachine] = useState('');
  const [responsable, setResponsable] = useState('');
  const [chip, setChip] = useState('all');

  useEffect(() => {
    if (!preset) return;
    setChip(preset.chip || 'all');
    setAtelier(preset.atelier || '');
    setMachine('');
  }, [preset]);

  const scoped = useMemo(() => records.filter((p) => inMode(p, mode)), [records, mode]);

  const projets = useMemo(() => [...new Set(scoped.map((p) => p.projet_nom).filter(Boolean))].sort(), [scoped]);
  const responsables = useMemo(() => [...new Set(scoped.map((p) => p.chef_atelier_nom).filter(Boolean))].sort(), [scoped]);

  const base = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scoped.filter((p) => {
      if (projet && p.projet_nom !== projet) return false;
      if (atelier && !productionAteliers(p).has(atelier)) return false;
      if (machine && !productionMachines(p).has(machine)) return false;
      if (responsable && p.chef_atelier_nom !== responsable) return false;
      if (q) {
        const blob = `${p.reference} ${p.projet_nom} ${p.designation} ${p.chef_atelier_nom} ${(p.lines || []).map((l) => l.designation).join(' ')}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [scoped, search, projet, atelier, machine, responsable]);

  const activeChip = chips.find((c) => c.value === chip) || chips[0];
  const rows = useMemo(() => {
    const list = base.filter(activeChip.test);
    if (mode === 'suivi') {
      return [...list].sort((a, b) => String(a.date_fin_prevue || '9999').localeCompare(String(b.date_fin_prevue || '9999')));
    }
    return [...list].sort((a, b) => String(b.date_fin_reelle || '').localeCompare(String(a.date_fin_reelle || '')));
  }, [base, activeChip, mode]);

  const chipOptions = chips.map((c) => {
    const count = base.filter(c.test).length;
    return {
      value: c.value, label: c.label, tone: c.tone, count, hidden: c.value !== 'all' && c.value !== chip && !count,
    };
  });

  const termineStats = useMemo(() => {
    if (mode !== 'termine') return null;
    const late = base.filter(isLateDone);
    const avgDelay = late.length
      ? Math.round(late.reduce((s, p) => s + fabDelayDays(p, p.date_fin_reelle), 0) / late.length)
      : 0;
    return {
      total: base.length,
      onTimePct: base.length ? Math.round(((base.length - late.length) / base.length) * 100) : null,
      late: late.length,
      avgDelay,
    };
  }, [base, mode]);

  const activeFilters = [projet, atelier, machine, responsable].filter(Boolean).length;
  const resetFilters = () => { setProjet(''); setAtelier(''); setMachine(''); setResponsable(''); };
  const update = (p) => ((p.lines || []).length ? onProgress(p) : onUpdate(p));

  return (
    <div className="fab-page animate-fade-in">
      <FabPageHeader title={cfg.title} subtitle={cfg.subtitle}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onReload} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'spin' : ''} /> Actualiser
        </button>
      </FabPageHeader>

      {error ? <div className="fab-alert"><AlertCircle size={16} /> {error}</div> : null}

      {termineStats ? (
        <div className="fab-stats fab-stats-3">
          <FabStat icon={<CheckCircle2 size={17} />} tone="green" label="Terminées" value={loading ? '…' : termineStats.total} />
          <FabStat
            icon={<Clock size={17} />}
            tone="blue"
            label="Dans les délais"
            value={loading ? '…' : termineStats.onTimePct == null ? '—' : `${termineStats.onTimePct} %`}
            active={chip === 'ontime'}
            onClick={() => setChip(chip === 'ontime' ? 'all' : 'ontime')}
          />
          <FabStat
            icon={<Timer size={17} />}
            tone="red"
            label="Livrées en retard"
            value={loading ? '…' : termineStats.late}
            sub={termineStats.late ? `${termineStats.avgDelay} j de retard en moyenne` : null}
            active={chip === 'late'}
            onClick={() => setChip(chip === 'late' ? 'all' : 'late')}
          />
        </div>
      ) : null}

      <FabFilters
        search={(
          <div className="fab-search">
            <Search size={15} className="fab-search-icon" aria-hidden />
            <input
              className="fab-search-input"
              placeholder="Rechercher référence, projet, désignation…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        )}
        chips={<FabChips options={chipOptions} value={chip} onChange={setChip} />}
        activeCount={activeFilters}
        onReset={resetFilters}
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
        <select className="fab-filter" value={responsable} onChange={(e) => setResponsable(e.target.value)}>
          <option value="">Tous les responsables</option>
          {responsables.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </FabFilters>

      {loading ? (
        <div className="card fab-pad"><FabSkeleton rows={5} /></div>
      ) : rows.length === 0 ? (
        <div className="card">
          <FabEmpty
            icon={<Icon size={22} />}
            title={base.length ? 'Aucun résultat pour ce filtre' : cfg.empty}
            sub="Données réelles uniquement."
            hint={base.length ? null : cfg.emptyHint}
          />
        </div>
      ) : (
        <>
          <div className="card fab-list-table" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="table-wrap">
              <table className="fab-table">
                <thead>
                  {mode === 'suivi' ? (
                    <tr>
                      <th>Production</th>
                      <th>Atelier</th>
                      <th>Réalisé / demandé</th>
                      <th>Responsable</th>
                      <th>Échéance</th>
                      <th>Avancement</th>
                      <th>Statut</th>
                      <th aria-label="Actions" />
                    </tr>
                  ) : (
                    <tr>
                      <th>Production</th>
                      <th>Atelier</th>
                      <th>Produit / demandé</th>
                      <th>Responsable</th>
                      <th>Fin</th>
                      <th>Délai</th>
                      <th>Plan</th>
                      <th aria-label="Actions" />
                    </tr>
                  )}
                </thead>
                <tbody>
                  {rows.map((p) => (mode === 'suivi' ? (
                    <tr key={p.id} className="fab-row-click" onClick={() => onView(p)}>
                      <td>
                        <strong>{p.designation}</strong>
                        <div className="fab-card-meta">{p.reference} · {p.projet_nom || '—'}</div>
                      </td>
                      <td><AtelierCell plan={p} /></td>
                      <td><QtyCell plan={p} /></td>
                      <td>{p.chef_atelier_nom || <span className="badge badge-orange">Sans responsable</span>}</td>
                      <td><DueCell plan={p} /></td>
                      <td><FabProgress value={p.avancement} /></td>
                      <td><FabBadge statut={p.statut} /></td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <RowActions plan={p} canUpdate={canUpdate} onView={onView} onUpdate={update} />
                      </td>
                    </tr>
                  ) : (
                    <TermineRow key={p.id} plan={p} onView={onView} />
                  )))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="fab-list-cards fab-grid-cards">
            {rows.map((p) => (
              <ProductionCard key={p.id} plan={p} mode={mode} canUpdate={canUpdate} onView={onView} onUpdate={update} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function TermineRow({ plan, onView }) {
  const file = planFile(plan);
  const delay = fabOnTimeLabel(plan);
  return (
    <tr className="fab-row-click" onClick={() => onView(plan)}>
      <td>
        <strong>{plan.designation}</strong>
        <div className="fab-card-meta">{plan.reference} · {plan.projet_nom || '—'}</div>
      </td>
      <td><AtelierCell plan={plan} /></td>
      <td><QtyCell plan={plan} /></td>
      <td>{plan.chef_atelier_nom || '—'}</td>
      <td className="fab-nowrap">{fmtDate(plan.date_fin_reelle)}</td>
      <td><span className={`badge ${isLateDone(plan) ? 'badge-red' : 'badge-green'}`}>{delay.replace('Terminé dans les délais', 'Dans les délais')}</span></td>
      <td onClick={(e) => e.stopPropagation()}>
        {file?.url ? (
          <a className="fab-link" href={downloadUrl(file)} rel="noreferrer"><FileText size={13} /> {plan.library_plan?.reference || 'Plan'}</a>
        ) : (plan.library_plan?.reference || '—')}
      </td>
      <td onClick={(e) => e.stopPropagation()}>
        <button type="button" className="btn btn-ghost btn-sm" title="Détail" onClick={() => onView(plan)}><Eye size={13} /></button>
      </td>
    </tr>
  );
}

function ProductionCard({ plan, mode, canUpdate, onView, onUpdate }) {
  const lines = plan.lines || [];
  const late = mode === 'termine' && isLateDone(plan);
  return (
    <div className="fab-card fab-card-accent" style={{ '--atelier': fabAtelierColor(plan.atelier) }}>
      <div className="fab-card-top">
        <div className="fab-card-top-text">
          <div className="fab-card-title">{plan.designation}</div>
          <div className="fab-card-sub">{plan.reference} · {plan.projet_nom || '—'}</div>
        </div>
        <FabBadge statut={plan.statut} />
      </div>
      <div className="fab-card-meta">
        <AtelierCell plan={plan} /> · {plan.chef_atelier_nom || <span className="fab-warn-text">Sans responsable</span>}
      </div>
      {lines.length ? (
        <div className="fab-card-lines">
          {lines.slice(0, 3).map((l) => (
            <div key={l.id} className="fab-card-line">
              <span className="fab-card-line-name">{l.designation}</span>
              <span><strong>{fabFmtQty(l.quantite_realisee)}</strong> / {fabFmtQty(l.quantite)} {fabUniteLabel(l.unite, l.unite_autre)}</span>
            </div>
          ))}
          {lines.length > 3 ? <div className="fab-qty-name">+ {lines.length - 3} autre(s)</div> : null}
        </div>
      ) : null}
      <div className="fab-card-foot">
        <FabProgress value={plan.avancement} />
        {mode === 'suivi' ? (
          <span className={`fab-due ${fabIsLate(plan) ? 'is-late' : fabIsDueSoon(plan) ? 'is-soon' : ''}`}>
            {fabDueLabel(plan) || fmtDate(plan.date_fin_prevue)}
          </span>
        ) : (
          <span className={`fab-due ${late ? 'is-late' : 'is-ok'}`}>
            {late ? fabOnTimeLabel(plan).replace('Retard : ', 'Retard ') : 'Dans les délais'}
          </span>
        )}
      </div>
      {mode === 'suivi' && plan.statut === 'bloque' && plan.motif_blocage ? (
        <div className="fab-card-meta fab-warn-text">Blocage : {plan.motif_blocage}</div>
      ) : null}
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
    <div className="fab-actions">
      <button type="button" className="btn btn-ghost btn-sm" title="Détail" onClick={() => onView(plan)}><Eye size={13} /></button>
      {canUpdate ? (
        <button type="button" className="btn btn-secondary btn-sm" title="Mettre à jour l’avancement" onClick={() => onUpdate(plan)}>
          <TrendingUp size={13} />
        </button>
      ) : null}
    </div>
  );
}

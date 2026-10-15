import { useMemo, useState } from 'react';
import {
  Inbox, Play, Hammer, AlertTriangle, CheckCircle2, AlertCircle, RefreshCw, Plus, ChevronRight, ShieldCheck,
} from 'lucide-react';
import {
  FAB_ATELIERS,
  FAB_MACHINES,
  FAB_STATUTS,
  FAB_SUIVI_STATUTS,
  fabIsLate,
  fabIsDueSoon,
  fabDelayDays,
  fabDueLabel,
  fabAtelierFullLabel,
  fabAtelierColor,
  fabOnTimeLabel,
} from '../../constants/fabrication';
import {
  FabStat, FabChips, FabPageHeader, FabSkeleton, FabRing, FabProgress, FabAtelierDot, FabBadge,
} from './shared';
import FabFilters from './FabFilters';

function inPeriod(dateIso, from, to) {
  if (!from && !to) return true;
  const d = String(dateIso || '').slice(0, 10);
  if (!d) return false;
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

/** Ateliers touchés par une production (atelier principal + ateliers des désignations). */
function ateliersOf(p) {
  const set = new Set();
  if (p.atelier) set.add(p.atelier);
  (p.lines || []).forEach((l) => { if (l.atelier) set.add(l.atelier); });
  return set;
}

function machinesOf(p) {
  const set = new Set();
  if (p.atelier === 'machinerie' && p.machine_type) set.add(p.machine_type);
  (p.lines || []).forEach((l) => { if (l.atelier === 'machinerie' && l.machine_type) set.add(l.machine_type); });
  return set;
}

function counts(rows) {
  return {
    aLancer: rows.filter((p) => p.statut === 'a_lancer' || p.statut === 'brouillon').length,
    enCours: rows.filter((p) => ['en_fabrication', 'en_attente', 'bloque'].includes(p.statut) && !fabIsLate(p)).length,
    retard: rows.filter((p) => fabIsLate(p)).length,
    termines: rows.filter((p) => p.statut === 'termine').length,
  };
}

const WATCH_META = {
  late: { label: 'En retard', tone: 'red' },
  blocked: { label: 'Bloquées', tone: 'red' },
  soon: { label: 'Échéance proche', tone: 'orange' },
  nobody: { label: 'Sans responsable', tone: 'orange' },
};

export default function FabricationDashboard({
  records, library = [], loading, error, onReload, onOpenPlan, onGo, canStart,
}) {
  const [projet, setProjet] = useState('');
  const [atelier, setAtelier] = useState('');
  const [statut, setStatut] = useState('');
  const [chef, setChef] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [watchKind, setWatchKind] = useState('all');

  const projets = useMemo(() => {
    const s = new Set();
    records.forEach((p) => { if (p.projet_nom) s.add(p.projet_nom); });
    library.forEach((p) => { if (p.projet_nom) s.add(p.projet_nom); });
    return [...s].sort();
  }, [records, library]);

  const chefs = useMemo(() => [...new Set(records.map((p) => p.chef_atelier_nom).filter(Boolean))].sort(), [records]);

  const filtered = useMemo(() => records.filter((p) => {
    if (projet && p.projet_nom !== projet) return false;
    if (atelier && !ateliersOf(p).has(atelier)) return false;
    if (statut && p.statut !== statut) return false;
    if (chef && p.chef_atelier_nom !== chef) return false;
    if (!inPeriod(p.date_transmission, from, to)) return false;
    return true;
  }), [records, projet, atelier, statut, chef, from, to]);

  const libFiltered = useMemo(() => library.filter((p) => {
    if (projet && p.projet_nom !== projet) return false;
    if (atelier && p.atelier !== atelier) return false;
    if (!inPeriod(p.created_at, from, to)) return false;
    return true;
  }), [library, projet, atelier, from, to]);

  const active = useMemo(() => filtered.filter((p) => FAB_SUIVI_STATUTS.includes(p.statut)), [filtered]);

  const kpis = useMemo(() => {
    const dispo = libFiltered.filter((p) => p.statut === 'disponible');
    const termines = filtered.filter((p) => p.statut === 'termine');
    const onTime = termines.filter((p) => !fabOnTimeLabel(p).startsWith('Retard')).length;
    const enFab = filtered.filter((p) => p.statut === 'en_fabrication');
    return {
      recus: dispo.length + filtered.filter((p) => p.statut === 'plan_recu').length,
      recusProjets: dispo.filter((p) => p.source === 'projets').length,
      aLancer: filtered.filter((p) => p.statut === 'a_lancer' || p.statut === 'brouillon').length,
      brouillons: filtered.filter((p) => p.statut === 'brouillon').length,
      enFab: enFab.length,
      retard: filtered.filter((p) => fabIsLate(p)).length,
      proches: filtered.filter((p) => fabIsDueSoon(p)).length,
      termines: termines.length,
      onTimePct: termines.length ? Math.round((onTime / termines.length) * 100) : null,
      avgActive: active.length
        ? Math.round(active.reduce((s, p) => s + (Number(p.avancement) || 0), 0) / active.length)
        : 0,
    };
  }, [filtered, libFiltered, active]);

  /** Une entrée par production, avec toutes ses alertes. */
  const watch = useMemo(() => {
    const items = [];
    filtered.forEach((p) => {
      const tags = [];
      if (p.statut === 'bloque') {
        tags.push({ kind: 'blocked', label: p.motif_blocage ? `Bloquée : ${p.motif_blocage}` : 'Bloquée' });
      }
      if (fabIsLate(p)) tags.push({ kind: 'late', label: `Retard ${fabDelayDays(p)} j` });
      else if (fabIsDueSoon(p)) tags.push({ kind: 'soon', label: fabDueLabel(p) });
      if (FAB_SUIVI_STATUTS.includes(p.statut) && !p.chef_atelier_nom) {
        tags.push({ kind: 'nobody', label: 'Sans responsable' });
      }
      if (tags.length) items.push({ plan: p, tags });
    });
    const order = { blocked: 0, late: 1, soon: 2, nobody: 3 };
    const rank = (w) => Math.min(...w.tags.map((t) => order[t.kind]));
    return items.sort((a, b) => rank(a) - rank(b));
  }, [filtered]);

  const watchCounts = useMemo(() => {
    const c = { late: 0, blocked: 0, soon: 0, nobody: 0 };
    watch.forEach((w) => w.tags.forEach((t) => { c[t.kind] += 1; }));
    return c;
  }, [watch]);

  const watchShown = watchKind === 'all' ? watch : watch.filter((w) => w.tags.some((t) => t.kind === watchKind));

  const upcoming = useMemo(() => active
    .filter((p) => p.date_fin_prevue)
    .sort((a, b) => String(a.date_fin_prevue).localeCompare(String(b.date_fin_prevue)))
    .slice(0, 5), [active]);

  const byAtelier = FAB_ATELIERS.map((a) => {
    const rows = filtered.filter((p) => ateliersOf(p).has(a.value));
    const machines = a.value === 'machinerie'
      ? FAB_MACHINES.map((m) => {
        const mRows = rows.filter((p) => machinesOf(p).has(m.value));
        return { ...m, actifs: mRows.filter((p) => FAB_SUIVI_STATUTS.includes(p.statut)).length, total: mRows.length };
      })
      : null;
    return { ...a, ...counts(rows), total: rows.length, machines };
  });
  const maxAtelier = Math.max(1, ...byAtelier.map((a) => a.total));

  const activeFilters = [projet, atelier, statut, chef, from, to].filter(Boolean).length;
  const resetFilters = () => { setProjet(''); setAtelier(''); setStatut(''); setChef(''); setFrom(''); setTo(''); };
  const v = (n) => (loading ? '…' : n);

  return (
    <div className="fab-page animate-fade-in">
      <FabPageHeader title="Fabrication" subtitle="Tableau de bord ateliers — données réelles">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onReload} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'spin' : ''} /> Actualiser
        </button>
        {canStart ? (
          <button type="button" className="btn btn-primary btn-sm fab-cta" onClick={() => onGo?.('fabrication-plans', { start: true })}>
            <Plus size={14} /> Débuter une production
          </button>
        ) : null}
      </FabPageHeader>

      {error ? (
        <div className="fab-alert"><AlertCircle size={16} /> {error}</div>
      ) : null}

      <FabFilters activeCount={activeFilters} onReset={resetFilters}>
        <select className="fab-filter" value={projet} onChange={(e) => setProjet(e.target.value)}>
          <option value="">Tous les projets</option>
          {projets.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <select className="fab-filter" value={atelier} onChange={(e) => setAtelier(e.target.value)}>
          <option value="">Tous les ateliers</option>
          {FAB_ATELIERS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
        <select className="fab-filter" value={statut} onChange={(e) => setStatut(e.target.value)}>
          <option value="">Tous les statuts</option>
          {FAB_STATUTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select className="fab-filter" value={chef} onChange={(e) => setChef(e.target.value)}>
          <option value="">Tous les responsables</option>
          {chefs.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <label className="fab-date-filter"><span>Du</span><input type="date" className="fab-filter" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="fab-date-filter"><span>Au</span><input type="date" className="fab-filter" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </FabFilters>

      <div className="fab-stats">
        <FabStat
          icon={<Inbox size={17} />}
          tone="blue"
          label="Plans reçus"
          value={v(kpis.recus)}
          sub={kpis.recusProjets ? `${kpis.recusProjets} depuis Projets` : 'à lancer'}
          onClick={() => onGo?.('fabrication-plans', { tab: 'disponibles' })}
        />
        <FabStat
          icon={<Play size={17} />}
          tone="grey"
          label="À lancer"
          value={v(kpis.aLancer)}
          sub={kpis.brouillons ? `${kpis.brouillons} brouillon(s)` : 'aucun brouillon'}
          onClick={() => onGo?.('fabrication-plans', { tab: 'brouillons' })}
        />
        <FabStat
          icon={<Hammer size={17} />}
          tone="orange"
          label="En fabrication"
          value={v(kpis.enFab)}
          sub={`Avancement moyen ${kpis.avgActive} %`}
          onClick={() => onGo?.('fabrication-suivi', { chip: 'en_fabrication' })}
        />
        <FabStat
          icon={<AlertTriangle size={17} />}
          tone="red"
          label="En retard"
          value={v(kpis.retard)}
          sub={kpis.proches ? `${kpis.proches} échéance(s) proche(s)` : 'aucune échéance proche'}
          onClick={() => onGo?.('fabrication-suivi', { chip: 'retard' })}
        />
        <FabStat
          icon={<CheckCircle2 size={17} />}
          tone="green"
          label="Terminés"
          value={v(kpis.termines)}
          sub={kpis.onTimePct == null ? '—' : `${kpis.onTimePct} % dans les délais`}
          onClick={() => onGo?.('fabrication-terminee')}
        />
      </div>

      <div className="fab-dash-grid">
        <div className="fab-dash-main">
        <section className="fab-panel">
          <div className="fab-panel-head">
            <h2>Production par atelier</h2>
            <div className="fab-legend">
              <span><i className="lg-grey" />À lancer</span>
              <span><i className="lg-orange" />En cours</span>
              <span><i className="lg-red" />Retard</span>
              <span><i className="lg-green" />Terminés</span>
            </div>
          </div>
          {loading ? <FabSkeleton rows={4} /> : (
            <div className="fab-atelier-rows">
              {byAtelier.map((a) => (
                <button
                  key={a.value}
                  type="button"
                  className="fab-atelier-row"
                  onClick={() => onGo?.('fabrication-suivi', { atelier: a.value })}
                  style={{ '--atelier': fabAtelierColor(a.value) }}
                >
                  <div className="fab-atelier-row-head">
                    <span className="fab-atelier-name"><FabAtelierDot atelier={a.value} />{a.label}</span>
                    <span className="fab-atelier-total">{a.total}</span>
                  </div>
                  <div className="fab-stack" style={{ width: `${Math.max(6, (a.total / maxAtelier) * 100)}%` }}>
                    {a.total === 0 ? <span className="seg seg-empty" style={{ flex: 1 }} /> : null}
                    {a.aLancer ? <span className="seg seg-grey" style={{ flex: a.aLancer }} /> : null}
                    {a.enCours ? <span className="seg seg-orange" style={{ flex: a.enCours }} /> : null}
                    {a.retard ? <span className="seg seg-red" style={{ flex: a.retard }} /> : null}
                    {a.termines ? <span className="seg seg-green" style={{ flex: a.termines }} /> : null}
                  </div>
                  <div className="fab-atelier-nums">
                    <span>{a.aLancer} à lancer</span>
                    <span>{a.enCours} en cours</span>
                    <span className={a.retard ? 'is-red' : ''}>{a.retard} retard</span>
                    <span>{a.termines} terminés</span>
                  </div>
                  {a.machines ? (
                    <div className="fab-machine-pills">
                      {a.machines.map((m) => (
                        <span key={m.value} className={`fab-machine-pill${m.actifs ? ' is-on' : ''}`}>
                          {m.label} <b>{m.actifs}</b>
                        </span>
                      ))}
                    </div>
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="fab-panel">
          <div className="fab-panel-head">
            <h2><AlertTriangle size={16} /> À surveiller</h2>
            {watch.length ? (
              <FabChips
                value={watchKind}
                onChange={setWatchKind}
                options={[
                  { value: 'all', label: 'Tout', count: watch.length },
                  ...Object.entries(WATCH_META).map(([k, m]) => ({
                    value: k, label: m.label, count: watchCounts[k], tone: m.tone, hidden: !watchCounts[k] && watchKind !== k,
                  })),
                ]}
              />
            ) : null}
          </div>
          {loading ? <FabSkeleton rows={2} /> : watch.length === 0 ? (
            <div className="fab-ok-banner"><ShieldCheck size={18} /> Tout est sous contrôle : aucune production en retard, bloquée, à échéance proche ou sans responsable.</div>
          ) : (
            <div className="fab-watch-grid">
              {watchShown.map(({ plan, tags }) => (
                <button
                  key={plan.id}
                  type="button"
                  className={`fab-watch-card tone-${WATCH_META[tags[0].kind].tone}`}
                  onClick={() => onOpenPlan?.(plan)}
                >
                  <div className="fab-watch-card-top">
                    <FabBadge statut={plan.statut} />
                    <span className="fab-watch-open">Ouvrir <ChevronRight size={13} /></span>
                  </div>
                  <strong>{plan.designation}</strong>
                  <span className="fab-muted">{plan.reference} · {plan.projet_nom || '—'}</span>
                  <span className="fab-muted">{fabAtelierFullLabel(plan.atelier, plan.machine_type)} · {plan.chef_atelier_nom || 'Sans responsable'}</span>
                  <span className="fab-watch-tags">
                    {tags.map((t) => (
                      <span key={t.kind} className={`fab-watch-tag tone-${WATCH_META[t.kind].tone}`}>{t.label}</span>
                    ))}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
        </div>

        <section className="fab-panel fab-panel-side">
          <div className="fab-panel-head"><h2>Avancement global</h2></div>
          <div className="fab-ring-wrap">
            <FabRing value={kpis.avgActive} label="moyen" />
            <div className="fab-ring-meta">
              <div><strong>{v(active.length)}</strong> production(s) active(s)</div>
              <div><strong>{v(kpis.proches)}</strong> échéance(s) sous 2 jours</div>
              <div><strong>{v(kpis.retard)}</strong> en retard</div>
            </div>
          </div>
          <div className="fab-panel-head" style={{ marginTop: 14 }}><h2>Prochaines échéances</h2></div>
          {loading ? <FabSkeleton rows={3} /> : upcoming.length === 0 ? (
            <div className="fab-muted">Aucune production active.</div>
          ) : (
            <div className="fab-mini-list">
              {upcoming.map((p) => (
                <button key={p.id} type="button" className="fab-mini-item" onClick={() => onOpenPlan?.(p)}>
                  <FabAtelierDot atelier={p.atelier} />
                  <span className="fab-mini-main">
                    <strong>{p.designation}</strong>
                    <span>{p.reference} · {p.projet_nom || '—'}</span>
                    <FabProgress value={p.avancement} compact />
                  </span>
                  <span className={`fab-due ${fabIsLate(p) ? 'is-late' : fabIsDueSoon(p) ? 'is-soon' : ''}`}>{fabDueLabel(p)}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

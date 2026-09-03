import { useMemo, useState } from 'react';
import {
  Inbox, Play, Hammer, AlertTriangle, CheckCircle2, AlertCircle, RefreshCw, Loader2,
} from 'lucide-react';
import {
  FAB_ATELIERS,
  FAB_STATUTS,
  fabIsLate,
  fabIsDueSoon,
  fabDelayDays,
  fabAtelierLabel,
} from '../../constants/fabrication';
import { FabKpiCard, FabEmpty, fmtDate } from './shared';

function inPeriod(plan, from, to) {
  if (!from && !to) return true;
  const d = String(plan.date_transmission || '').slice(0, 10);
  if (!d) return false;
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

export default function FabricationDashboard({ records, loading, error, onReload, onOpenPlan }) {
  const [projet, setProjet] = useState('');
  const [atelier, setAtelier] = useState('');
  const [statut, setStatut] = useState('');
  const [chef, setChef] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const projets = useMemo(() => {
    const s = new Set();
    records.forEach((p) => { if (p.projet_nom) s.add(p.projet_nom); });
    return [...s].sort();
  }, [records]);

  const chefs = useMemo(() => {
    const s = new Set();
    records.forEach((p) => { if (p.chef_atelier_nom) s.add(p.chef_atelier_nom); });
    return [...s].sort();
  }, [records]);

  const filtered = useMemo(() => records.filter((p) => {
    if (projet && p.projet_nom !== projet) return false;
    if (atelier && p.atelier !== atelier) return false;
    if (statut && p.statut !== statut) return false;
    if (chef && p.chef_atelier_nom !== chef) return false;
    if (!inPeriod(p, from, to)) return false;
    return true;
  }), [records, projet, atelier, statut, chef, from, to]);

  const kpis = useMemo(() => ({
    recus: filtered.filter((p) => p.statut === 'plan_recu').length,
    aLancer: filtered.filter((p) => p.statut === 'a_lancer').length,
    enFab: filtered.filter((p) => p.statut === 'en_fabrication').length,
    retard: filtered.filter((p) => fabIsLate(p)).length,
    termines: filtered.filter((p) => p.statut === 'termine').length,
  }), [filtered]);

  const watch = useMemo(() => {
    const items = [];
    filtered.forEach((p) => {
      if (p.statut === 'bloque') {
        items.push({ plan: p, kind: 'blocked', label: p.motif_blocage ? `Bloqué : ${p.motif_blocage}` : 'Production bloquée' });
      } else if (fabIsLate(p)) {
        const d = fabDelayDays(p);
        items.push({ plan: p, kind: 'late', label: `Retard : ${d} jour${d > 1 ? 's' : ''}` });
      } else if (fabIsDueSoon(p)) {
        items.push({ plan: p, kind: 'soon', label: 'Échéance proche' });
      }
    });
    const order = { blocked: 0, late: 1, soon: 2 };
    return items.sort((a, b) => order[a.kind] - order[b.kind]);
  }, [filtered]);

  const byAtelier = FAB_ATELIERS.map((a) => {
    const rows = filtered.filter((p) => p.atelier === a.value);
    return {
      ...a,
      aLancer: rows.filter((p) => p.statut === 'a_lancer').length,
      enCours: rows.filter((p) => p.statut === 'en_fabrication').length,
      retard: rows.filter((p) => fabIsLate(p)).length,
      termines: rows.filter((p) => p.statut === 'termine').length,
    };
  });

  return (
    <div className="fab-page animate-fade-in">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 className="page-title">Fabrication</h1>
          <p className="page-subtitle">Tableau de bord ateliers — données réelles</p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onReload} disabled={loading}>
          <RefreshCw size={14} /> Actualiser
        </button>
      </div>

      {error ? (
        <div className="card" style={{ padding: 14, marginBottom: 16, color: 'var(--red)', display: 'flex', gap: 8, alignItems: 'center' }}>
          <AlertCircle size={16} /> {error}
        </div>
      ) : null}

      <div className="fab-toolbar">
        <select className="fab-filter" style={{ ...selectStyle }} value={projet} onChange={(e) => setProjet(e.target.value)}>
          <option value="">Tous les projets</option>
          {projets.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <select className="fab-filter" style={selectStyle} value={atelier} onChange={(e) => setAtelier(e.target.value)}>
          <option value="">Tous les ateliers</option>
          {FAB_ATELIERS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
        <select className="fab-filter" style={selectStyle} value={statut} onChange={(e) => setStatut(e.target.value)}>
          <option value="">Tous les statuts</option>
          {FAB_STATUTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select className="fab-filter" style={selectStyle} value={chef} onChange={(e) => setChef(e.target.value)}>
          <option value="">Tous les chefs d’atelier</option>
          {chefs.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <input type="date" className="fab-filter" style={selectStyle} value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" className="fab-filter" style={selectStyle} value={to} onChange={(e) => setTo(e.target.value)} />
      </div>

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', marginBottom: 20 }}>
        <FabKpiCard icon={<Inbox size={17} />} label="Plans reçus" value={loading ? '…' : kpis.recus} color="blue" />
        <FabKpiCard icon={<Play size={17} />} label="À lancer" value={loading ? '…' : kpis.aLancer} color="grey" />
        <FabKpiCard icon={<Hammer size={17} />} label="En fabrication" value={loading ? '…' : kpis.enFab} color="orange" />
        <FabKpiCard icon={<AlertTriangle size={17} />} label="En retard" value={loading ? '…' : kpis.retard} color="red" />
        <FabKpiCard icon={<CheckCircle2 size={17} />} label="Terminés" value={loading ? '…' : kpis.termines} color="green" />
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.05rem', margin: '0 0 14px' }}>
          Production par atelier
        </h2>
        <div className="fab-atelier-grid">
          {byAtelier.map((a) => (
            <div key={a.value} className="fab-atelier-card">
              <h3>{a.label}</h3>
              <div className="fab-atelier-stats">
                <div>À lancer<strong>{a.aLancer}</strong></div>
                <div>En cours<strong>{a.enCours}</strong></div>
                <div>En retard<strong>{a.retard}</strong></div>
                <div>Terminés<strong>{a.termines}</strong></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.05rem', margin: '0 0 14px' }}>
          ⚠ À surveiller
        </h2>
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center' }}><Loader2 size={20} /></div>
        ) : watch.length === 0 ? (
          <FabEmpty icon={<CheckCircle2 size={22} />} title="Rien à surveiller" sub="Aucune production en retard, bloquée ou à échéance proche." />
        ) : (
          <div className="fab-watch-list">
            {watch.map(({ plan, kind, label }) => (
              <button
                key={`${plan.id}-${kind}`}
                type="button"
                className={`fab-watch-item ${kind === 'late' || kind === 'blocked' ? 'is-late' : ''} ${kind === 'blocked' ? 'is-blocked' : ''} ${kind === 'soon' ? 'is-soon' : ''}`}
                onClick={() => onOpenPlan?.(plan)}
                style={{ textAlign: 'left', cursor: 'pointer', width: '100%' }}
              >
                <div className="fab-watch-dot">{kind === 'soon' ? '🟠' : '🔴'}</div>
                <div>
                  <div className="fab-watch-title">{plan.projet_nom || 'Projet'}</div>
                  <div className="fab-watch-meta">
                    {fabAtelierLabel(plan.atelier)} · {plan.designation}
                  </div>
                </div>
                <div style={{ fontSize: '0.8rem', fontWeight: 700 }}>
                  {label}
                  {plan.date_fin_prevue ? <div style={{ fontWeight: 500, color: 'var(--text-2)' }}>Fin {fmtDate(plan.date_fin_prevue)}</div> : null}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const selectStyle = {
  width: '100%', padding: '8px 11px', border: '1.5px solid var(--border)',
  borderRadius: 6, fontSize: '0.86rem', background: '#fff', fontFamily: 'var(--font-body)',
};

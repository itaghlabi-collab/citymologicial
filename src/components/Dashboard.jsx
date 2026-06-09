import { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp, TrendingDown, DollarSign, FileText, FolderOpen,
  Users, HardHat, Package, ShoppingCart, AlertTriangle,
  CheckCircle, Clock, Calendar, UserCheck, BarChart2,
  RefreshCw, AlertCircle, ArrowUpRight, MapPin
} from 'lucide-react';
import { loadMainDashboardData } from '../services/dashboard/dashboardData';

/* ── Helpers ─────────────────────────────────────────────────────── */
function fmt(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + ' M';
  if (n >= 1000) return (n / 1000).toFixed(0) + ' K';
  return n.toLocaleString('fr-FR');
}
function fmtMAD(n) { return fmt(n) + ' MAD'; }

/* ── Curved Line Chart (SVG cubic bezier) ───────────────────────── */
function CurvedLineChart({ series, labels }) {
  const W = 600, H = 180, PL = 48, PR = 16, PT = 12, PB = 28;
  const cW = W - PL - PR, cH = H - PT - PB;
  const allVals = series.flatMap(s => s.data);
  const maxV = Math.max(...allVals, 1);
  const xs = labels.map((_, i) => PL + (i / Math.max(labels.length - 1, 1)) * cW);
  const ys = v => PT + cH - (v / maxV) * cH;
  const colors = ['#D32F2F', '#1565C0', '#E65100'];
  const gridLines = [0, 0.25, 0.5, 0.75, 1];

  function smoothPath(pts) {
    if (pts.length < 2) return '';
    let d = `M ${pts[0][0]},${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const x0 = pts[i][0], y0 = pts[i][1];
      const x1 = pts[i + 1][0], y1 = pts[i + 1][1];
      const cpX = (x0 + x1) / 2;
      d += ` C ${cpX},${y0} ${cpX},${y1} ${x1},${y1}`;
    }
    return d;
  }

  function smoothArea(pts) {
    const line = smoothPath(pts);
    const last = pts[pts.length - 1];
    const first = pts[0];
    return line + ` L ${last[0]},${PT + cH} L ${first[0]},${PT + cH} Z`;
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W, height: H, display: 'block' }}>
        {/* Grid lines */}
        {gridLines.map((f, i) => {
          const y = PT + cH - f * cH;
          return (
            <g key={i}>
              <line x1={PL} x2={W - PR} y1={y} y2={y} stroke="#E8EAF0" strokeWidth={1} strokeDasharray={f === 0 ? 'none' : '4 3'} />
              <text x={PL - 5} y={y + 4} textAnchor="end" fontSize={9} fill="#A0A8B8">{fmt(maxV * f)}</text>
            </g>
          );
        })}
        {/* X labels */}
        {labels.map((l, i) => (
          <text key={i} x={xs[i]} y={H - 5} textAnchor="middle" fontSize={10} fill="#A0A8B8">{l}</text>
        ))}
        {/* Series */}
        {series.map((s, si) => {
          const pts = s.data.map((v, i) => [xs[i], ys(v)]);
          const linePath = smoothPath(pts);
          const areaPath = smoothArea(pts);
          return (
            <g key={si}>
              <path d={areaPath} fill={colors[si]} fillOpacity={0.06} />
              <path d={linePath} fill="none" stroke={colors[si]} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
              {pts.map((p, i) => (
                <circle key={i} cx={p[0]} cy={p[1]} r={3.5} fill={colors[si]} stroke="#fff" strokeWidth={2} />
              ))}
            </g>
          );
        })}
      </svg>
      <div style={{ display: 'flex', gap: 18, justifyContent: 'center', marginTop: 6 }}>
        {series.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: 'var(--text-2)' }}>
            <div style={{ width: 16, height: 3, borderRadius: 2, background: colors[i] }} />
            {s.name}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Donut Chart (SVG) ──────────────────────────────────────────── */
function DonutChart({ segments, centerLabel, centerSub, size = 130 }) {
  const R = 48, CX = 65, CY = 65, STROKE = 16;
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  let offset = 0;
  const circ = 2 * Math.PI * R;
  const pct = Math.round((segments[0]?.value || 0) / total * 100);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <svg viewBox="0 0 130 130" style={{ width: size, height: size, display: 'block' }}>
        {/* BG ring */}
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--border)" strokeWidth={STROKE} />
        {segments.map((seg, i) => {
          const p = seg.value / total;
          const dash = p * circ;
          const el = (
            <circle key={i} cx={CX} cy={CY} r={R}
              fill="none" stroke={seg.color} strokeWidth={STROKE}
              strokeDasharray={`${dash} ${circ - dash}`}
              strokeDashoffset={-(offset * circ)}
              style={{ transform: 'rotate(-90deg)', transformOrigin: `${CX}px ${CY}px`, transition: 'stroke-dasharray 0.6s ease' }}
            />
          );
          offset += p;
          return el;
        })}
        <text x={CX} y={CY - 4} textAnchor="middle" fontSize={16} fontWeight={800} fill="var(--text)">
          {centerLabel !== undefined ? centerLabel : pct + '%'}
        </text>
        {centerSub && (
          <text x={CX} y={CY + 14} textAnchor="middle" fontSize={9} fill="var(--text-3)">{centerSub}</text>
        )}
      </svg>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        {segments.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.75rem', color: 'var(--text-2)' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
            <span>{s.label}</span>
            <span style={{ fontWeight: 700, color: 'var(--text)' }}>{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Mini Bar Chart (SVG) ───────────────────────────────────────── */
function MiniBarChart({ data, labels, color = '#D32F2F', height = 80 }) {
  const W = 280, H = height, PB = 20, PL = 8, PR = 8;
  const maxV = Math.max(...data, 1);
  const bW = Math.max(4, (W - PL - PR) / data.length - 4);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H, display: 'block' }}>
      {data.map((v, i) => {
        const bH = ((v / maxV) * (H - PB - 4));
        const x = PL + i * ((W - PL - PR) / data.length) + 2;
        const y = H - PB - bH;
        return (
          <g key={i}>
            <rect x={x} y={y} width={bW} height={bH} rx={3}
              fill={color} fillOpacity={0.85} />
            <text x={x + bW / 2} y={H - 4} textAnchor="middle" fontSize={8} fill="#A0A8B8">{labels[i]}</text>
          </g>
        );
      })}
    </svg>
  );
}

/* ── Grouped Bar Chart (budget vs spent) ────────────────────────── */
function BudgetBarChart({ projects }) {
  const W = 360, H = 120, PL = 10, PB = 24, PT = 8, PR = 8;
  const maxV = Math.max(...projects.map(p => p.budget), 1);
  const cW = W - PL - PR;
  const cH = H - PB - PT;
  const gW = cW / projects.length;
  const bW = Math.min(16, gW / 2 - 3);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H, display: 'block' }}>
      {projects.map((p, i) => {
        const x = PL + i * gW + gW / 2;
        const budgetH = (p.budget / maxV) * cH;
        const spentH = (p.spent / maxV) * cH;
        const shortName = p.name.split(' ').slice(0, 2).join(' ');
        return (
          <g key={i}>
            {/* Budget bar (bg) */}
            <rect x={x - bW - 1} y={PT + cH - budgetH} width={bW} height={budgetH} rx={2}
              fill="#E0E4F0" />
            {/* Spent bar */}
            <rect x={x + 1} y={PT + cH - spentH} width={bW} height={spentH} rx={2}
              fill={p.spent > p.budget * 0.9 ? '#D32F2F' : '#1565C0'} fillOpacity={0.85} />
            <text x={x} y={H - 6} textAnchor="middle" fontSize={7.5} fill="#A0A8B8">{shortName}</text>
          </g>
        );
      })}
      {/* Legend */}
      <rect x={PL} y={PT} width={10} height={6} rx={1} fill="#E0E4F0" />
      <text x={PL + 13} y={PT + 6} fontSize={8} fill="#A0A8B8">Budget</text>
      <rect x={PL + 55} y={PT} width={10} height={6} rx={1} fill="#1565C0" fillOpacity={0.85} />
      <text x={PL + 68} y={PT + 6} fontSize={8} fill="#A0A8B8">Consomme</text>
    </svg>
  );
}

/* ── Timeline Activity ──────────────────────────────────────────── */
function TimelineItem({ time, title, location, type, tech, isLast }) {
  const dotColor = type === 'sav' ? '#D32F2F' : type === 'call' ? '#1565C0' : '#2E7D32';
  const bgColor = type === 'sav' ? '#FFF5F5' : type === 'call' ? '#F0F7FF' : '#F1F8F1';
  return (
    <div style={{ display: 'flex', gap: 12, position: 'relative' }}>
      {/* Timeline spine */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: dotColor, border: '2px solid #fff', boxShadow: `0 0 0 2px ${dotColor}30`, marginTop: 4, flexShrink: 0 }} />
        {!isLast && <div style={{ width: 1, flex: 1, background: 'var(--border)', marginTop: 3 }} />}
      </div>
      {/* Content */}
      <div style={{ flex: 1, paddingBottom: isLast ? 0 : 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: bgColor, borderRadius: 8, padding: '8px 10px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.83rem', fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>{title}</div>
            <div style={{ display: 'flex', gap: 8, fontSize: '0.74rem', color: 'var(--text-3)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><MapPin size={10} /> {location}</span>
              {tech && <span>· {tech}</span>}
            </div>
          </div>
          <span style={{ fontSize: '0.75rem', fontWeight: 800, color: dotColor, fontFamily: 'var(--font-head)', flexShrink: 0, marginTop: 1 }}>{time}</span>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   DASHBOARD COMPONENT
   ══════════════════════════════════════════════════════════════════ */
export default function Dashboard() {
  const today = new Date().toISOString().slice(0, 10);
  const firstDay = today.slice(0, 7) + '-01';

  const [dateFrom, setDateFrom] = useState(firstDay);
  const [dateTo, setDateTo] = useState(today);
  const [loading, setLoading] = useState(true);
  const [dash, setDash] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await loadMainDashboardData({ dateFrom, dateTo });
      setDash(payload);
    } catch (_) {
      setDash(null);
    }
    setLoading(false);
  }, [dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const internal = dash?.internal;
  const useInternal = internal?.configured;

  /* ── Derived KPIs ─────────────────────────────────────────────── */
  const expenses = dash?.expenses || [];
  const projects = dash?.projects || [];
  const att = dash?.attendance || { present: 0, absent: 0, total: 0, hoursPerDay: [] };
  const leaves = dash?.leaves || [];
  const products = dash?.products || [];

  const tasks = useInternal ? (internal.tasks || []) : [];
  const meetings = useInternal ? (internal.meetings || []) : [];
  const prospects = useInternal ? (internal.prospects || []) : [];
  const recentFactures = useInternal ? (internal.recentFactures || []) : (dash?.legacyInvoices || []);
  const {
    totalInvoices = 0,
    unpaidInvoices = 0,
    totalExpenses = 0,
    tresorerie = 0,
    expensesCount = 0,
  } = dash?.finance || {};

  const activeProjects = projects.filter(p => p.status !== 'Termine').length;
  const avgProgress = projects.length ? Math.round(projects.reduce((s, p) => s + p.progress, 0) / projects.length) : 0;
  const totalBudget = projects.reduce((s, p) => s + p.budget, 0);
  const totalSpent = projects.reduce((s, p) => s + p.spent, 0);
  const delayedProjects = projects.filter(p => p.delayed).length;
  const finishedProjects = projects.filter(p => p.status === 'Finalisation').length;

  const pendingLeaves = leaves.filter(l => l.status === 'pending').length;
  const approvedLeaves = leaves.filter(l => l.status === 'approved').length;
  const conversionRate = useInternal ? (internal.kpis?.conversionRate ?? 0) : 0;
  const pendingQuotes = useInternal ? (internal.kpis?.pendingQuotes ?? 0) : 0;

  const months = dash?.chart?.labels || [new Date().toLocaleString('fr-FR', { month: 'short' })];
  const chartSeries = dash?.chart?.series?.length ? dash.chart.series : [
    { name: 'Factures', data: [totalInvoices] },
    { name: 'Depenses', data: [totalExpenses] },
    { name: 'Tresorerie', data: [Math.max(tresorerie, 0)] },
  ];

  /* Donut data */
  const financeDonut = [
    { label: 'Tresorerie', value: Math.max(tresorerie, 0), color: '#2E7D32' },
    { label: 'Depenses', value: totalExpenses, color: '#D32F2F' },
    { label: 'Impaye', value: unpaidInvoices, color: '#E65100' },
  ];
  const projectDonut = [
    { label: 'En cours', value: activeProjects - finishedProjects, color: '#1565C0' },
    { label: 'Finalisation', value: finishedProjects, color: '#2E7D32' },
    { label: 'En retard', value: delayedProjects, color: '#D32F2F' },
  ];
  const attendanceDonut = [
    { label: 'Present', value: att.present, color: '#2E7D32' },
    { label: 'Absent', value: att.absent, color: '#E0E4F0' },
  ];
  const leavesDonut = [
    { label: 'Approuve', value: approvedLeaves, color: '#1565C0' },
    { label: 'En attente', value: pendingLeaves, color: '#FF9800' },
  ];

  /* Alerts */
  const internalAlerts = useInternal ? (internal.alerts || []) : [];
  const legacyAlerts = [
    ...(dash?.legacyInvoices || []).filter((i) => i.status === 'overdue').map((i) => ({ type: 'error', msg: `Facture en retard : ${i.ref} — ${fmtMAD(i.amount)} (${i.client})` })),
    ...projects.filter((p) => p.delayed).map((p) => ({ type: 'warning', msg: `Projet en retard : ${p.name}` })),
    ...leaves.filter((l) => l.status === 'pending').map((l) => ({ type: 'info', msg: `Conge en attente : ${l.employee} (${l.type})` })),
    ...(dash?.purchaseAlerts || []),
  ];
  const alerts = [...internalAlerts, ...legacyAlerts];

  const lowStock = products.filter(p => p.qty < p.threshold);

  const dayLabels = ['L', 'M', 'Me', 'J', 'V', 'S', 'D'];

  const sortedMeetings = [...meetings].sort((a, b) => (a.time || '').localeCompare(b.time || ''));

  const activityTimeline = (internal?.activities || []).slice(0, 5).map((act) => ({
    time: act.at ? new Date(act.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—',
    title: act.label,
    location: act.sub || 'Activite recente',
    type: act.kind === 'rdv' ? 'call' : 'other',
    tech: '',
  }));

  const timelineItems = sortedMeetings.length ? sortedMeetings : activityTimeline;

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 14 }}>
        <div style={{ width: 36, height: 36, border: '3px solid var(--border)', borderTopColor: 'var(--red)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <p style={{ color: 'var(--text-3)', fontSize: '0.9rem' }}>Chargement des donnees...</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── HEADER ─────────────────────────────────────────────────── */}
      <div className="flex-between">
        <div>
          <h1 className="page-title" style={{ marginBottom: 4 }}>Tableau de Bord</h1>
          <p className="page-subtitle">
            Centre de pilotage CITYMO — mise a jour en temps reel
            {useInternal && internal.kpis ? (
              <span style={{ marginLeft: 8, color: 'var(--text-3)' }}>
                · {internal.kpis.pendingTasks} taches · {internal.kpis.todayMeetings} RDV aujourd&apos;hui
              </span>
            ) : null}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '7px 12px', fontSize: '0.83rem' }}>
            <Calendar size={13} style={{ color: 'var(--text-3)' }} />
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              style={{ border: 'none', outline: 'none', fontSize: '0.83rem', fontFamily: 'var(--font-body)', color: 'var(--text)', background: 'none' }} />
            <span style={{ color: 'var(--text-3)' }}>→</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              style={{ border: 'none', outline: 'none', fontSize: '0.83rem', fontFamily: 'var(--font-body)', color: 'var(--text)', background: 'none' }} />
          </div>
          <button className="btn btn-primary btn-sm" onClick={load} style={{ gap: 6 }}>
            <RefreshCw size={13} /> Actualiser
          </button>
        </div>
      </div>

      {!dash?.configured && (
        <div className="card" style={{ padding: '12px 16px', borderColor: 'var(--orange, #E65100)', color: '#BF360C', fontSize: '0.85rem' }}>
          Supabase non configure — verifiez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY sur Vercel.
        </div>
      )}

      {/* ── ALERTS (horizontal chips) ──────────────────────────────── */}
      {alerts.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {alerts.map((a, i) => {
            const cfg = {
              error: { bg: '#FFF0F0', border: 'rgba(211,47,47,0.25)', text: '#C62828', icon: '#D32F2F' },
              warning: { bg: '#FFFBF0', border: 'rgba(230,81,0,0.25)', text: '#BF360C', icon: '#E65100' },
              info: { bg: '#F0F6FF', border: 'rgba(21,101,192,0.25)', text: '#0D47A1', icon: '#1565C0' },
            }[a.type];
            return (
              <div key={i} style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '6px 12px', borderRadius: 20,
                background: cfg.bg, border: `1px solid ${cfg.border}`,
                fontSize: '0.8rem', color: cfg.text,
              }}>
                <AlertTriangle size={12} style={{ color: cfg.icon, flexShrink: 0 }} />
                {a.msg}
              </div>
            );
          })}
        </div>
      )}

      {/* ── ROW 1: FINANCE ─────────────────────────────────────────── */}
      <div>
        <div style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.12em', color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 12 }}>
          Finances — MAD
        </div>
        <div className="dash-grid dash-grid--finance" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>

          {/* Finance donut card */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: 20 }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-2)', alignSelf: 'flex-start' }}>
              Repartition financiere
            </div>
            <DonutChart
              segments={financeDonut}
              centerLabel={fmt(tresorerie)}
              centerSub="Tresorerie"
              size={120}
            />
          </div>

          {/* KPI grid */}
          <div className="stat-card" style={{ border: '1.5px solid var(--red)', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'var(--red)' }} />
            <div className="stat-icon green"><DollarSign size={18} /></div>
            <div className="stat-body">
              <div className="stat-value">{fmtMAD(tresorerie)}</div>
              <div className="stat-label">Tresorerie nette</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 2 }}>Paiements – Charges</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon blue"><FileText size={18} /></div>
            <div className="stat-body">
              <div className="stat-value">{fmtMAD(totalInvoices)}</div>
              <div className="stat-label">Total factures</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--red)', marginTop: 2 }}>{fmtMAD(unpaidInvoices)} impaye</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon orange"><TrendingDown size={18} /></div>
            <div className="stat-body">
              <div className="stat-value">{fmtMAD(totalExpenses)}</div>
              <div className="stat-label">Depenses du mois</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 2 }}>{expensesCount || expenses.length} lignes de charge</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── ROW 2: MAIN CURVED LINE CHART ──────────────────────────── */}
      <div className="card">
        <div className="flex-between mb-4">
          <div className="card-title" style={{ marginBottom: 0 }}>
            <BarChart2 size={15} /> Synthese financiere — periode en cours
          </div>
          <span className="text-muted" style={{ fontSize: '0.78rem' }}>Factures / Depenses / Tresorerie (MAD)</span>
        </div>
        <CurvedLineChart series={chartSeries} labels={months} />
      </div>

      {/* ── ROW 3: PROJETS ─────────────────────────────────────────── */}
      <div>
        <div style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.12em', color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 12 }}>
          Projets & Chantiers
        </div>
        <div className="dash-grid dash-grid--projets" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.5fr', gap: 14 }}>

          {/* Project donut */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-2)', alignSelf: 'flex-start' }}>
              Statut projets
            </div>
            <DonutChart
              segments={projectDonut}
              centerLabel={activeProjects}
              centerSub="actifs"
              size={120}
            />
          </div>

          {/* Budget vs consomme */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-2)' }}>Budget vs Consomme</div>
            <BudgetBarChart projects={projects} />
            <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
              <div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-3)' }}>Budget total</div>
                <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1rem' }}>{fmtMAD(totalBudget)}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-3)' }}>Consomme</div>
                <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1rem', color: 'var(--red)' }}>{fmtMAD(totalSpent)}</div>
              </div>
            </div>
          </div>

          {/* Project progress bars */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-2)' }}>Avancement chantiers</div>
            {projects.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 12px', color: 'var(--text-3)', fontSize: '0.84rem' }}>
                Aucun projet sur la periode selectionnee.
              </div>
            ) : projects.map((p, i) => (
              <div key={i}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: '0.82rem' }}>
                  <div>
                    <span style={{ fontWeight: 700 }}>{p.name}</span>
                    {p.delayed && <span className="badge badge-red" style={{ marginLeft: 6, fontSize: '0.65rem' }}>Retard</span>}
                  </div>
                  <span style={{ fontFamily: 'var(--font-head)', fontWeight: 800, color: p.progress > 80 ? '#2E7D32' : p.progress > 50 ? '#1565C0' : '#E65100' }}>
                    {p.progress}%
                  </span>
                </div>
                <div className="progress-bar-wrap">
                  <div className={'progress-bar-fill' + (p.progress > 80 ? ' green' : p.progress > 50 ? '' : ' orange')}
                    style={{ width: p.progress + '%' }} />
                </div>
              </div>
            )))}
          </div>
        </div>
      </div>

      {/* ── ROW 4: RH ──────────────────────────────────────────────── */}
      <div>
        <div style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.12em', color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 12 }}>
          Ressources Humaines & Ouvriers
        </div>
        <div className="dash-grid dash-grid--rh" style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1fr 1fr', gap: 14 }}>

          {/* Attendance donut */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-2)', alignSelf: 'flex-start' }}>Presence</div>
            <DonutChart
              segments={attendanceDonut}
              centerLabel={att.present}
              centerSub={`/ ${att.total}`}
              size={110}
            />
          </div>

          {/* Heures/jour bar chart */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-2)' }}>Heures / jour (semaine)</div>
            <MiniBarChart data={att.hoursPerDay || []} labels={dayLabels} color="#1565C0" height={80} />
            <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>
              Moyenne : <strong style={{ color: 'var(--text)' }}>{Math.round((att.hoursPerDay || []).reduce((s, v) => s + v, 0) / (att.hoursPerDay?.length || 1))} h/j</strong>
            </div>
          </div>

          {/* Leaves donut */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-2)', alignSelf: 'flex-start' }}>Conges</div>
            <DonutChart
              segments={leavesDonut}
              centerLabel={pendingLeaves}
              centerSub="en attente"
              size={110}
            />
          </div>

          {/* HR KPIs stacked */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12, justifyContent: 'center' }}>
            {[
              { label: 'Presents auj.', value: att.present, color: '#2E7D32' },
              { label: 'Absents auj.', value: att.absent, color: '#D32F2F' },
              { label: 'Heures travaillees', value: (att.hoursPerDay?.reduce((s, v) => s + v, 0) || 0) + ' h', color: '#1565C0' },
              { label: 'Conges en attente', value: pendingLeaves, color: '#FF9800' },
            ].map((k, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'var(--bg)', borderRadius: 8 }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>{k.label}</span>
                <span style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.05rem', color: k.color }}>{k.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── ROW 5: ACTIVITY + TASKS + CRM + STOCK ──────────────────── */}
      <div className="dash-grid dash-grid--activity" style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr 1fr', gap: 14 }}>

        {/* Timeline */}
        <div className="card">
          <div className="card-title"><Calendar size={15} /> Activites du jour</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {timelineItems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-3)', fontSize: '0.85rem' }}>Aucune activite prevue aujourd&apos;hui.</div>
            ) : timelineItems.map((m, i) => (
              <TimelineItem key={i} {...m} isLast={i === timelineItems.length - 1} />
            ))}
          </div>
          {activityTimeline.length > 0 && sortedMeetings.length > 0 && (
            <>
              <div style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.1em', color: 'var(--text-3)', textTransform: 'uppercase', margin: '16px 0 10px' }}>Activites recentes</div>
              {activityTimeline.map((m, i) => (
                <TimelineItem key={'act-' + i} {...m} isLast={i === activityTimeline.length - 1} />
              ))}
            </>
          )}
        </div>

        {/* Tasks + Stock */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card" style={{ flex: 1 }}>
            <div className="card-title"><CheckCircle size={15} /> Taches du jour</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {tasks.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-3)', fontSize: '0.85rem' }}>Aucune tache en attente.</div>
              ) : tasks.map((t, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px',
                  background: t.status === 'blocked' ? '#FFF0F0' : 'var(--bg)',
                  borderRadius: 8,
                  border: t.status === 'blocked' ? '1px solid rgba(211,47,47,0.18)' : '1px solid transparent',
                }}>
                  {t.status === 'blocked'
                    ? <AlertCircle size={13} style={{ color: 'var(--red)', flexShrink: 0 }} />
                    : <Clock size={13} style={{ color: 'var(--text-3)', flexShrink: 0 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="dash-task-title" style={{ fontSize: '0.82rem', fontWeight: 600 }}>{t.title}</div>
                    <div className="text-muted" style={{ fontSize: '0.72rem' }}>{t.due}</div>
                  </div>
                  <span className={'badge ' + (t.priority === 'haute' ? 'badge-red' : t.priority === 'normale' ? 'badge-blue' : 'badge-grey')} style={{ fontSize: '0.65rem' }}>{t.priority}</span>
                </div>
              ))}
            </div>
          </div>

          {lowStock.length > 0 && (
            <div className="card">
              <div className="card-title"><Package size={15} /> Stock critique</div>
              {lowStock.map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                  <AlertTriangle size={12} style={{ color: 'var(--red)', flexShrink: 0 }} />
                  <div style={{ flex: 1, fontSize: '0.8rem' }}>
                    <div style={{ fontWeight: 600 }}>{p.name}</div>
                    <div style={{ color: 'var(--text-3)', fontSize: '0.72rem' }}>{p.qty}/{p.threshold} {p.unit}</div>
                  </div>
                  <div className="progress-bar-wrap" style={{ width: 48 }}>
                    <div className="progress-bar-fill" style={{ width: Math.min(p.qty / p.threshold * 100, 100) + '%', background: 'var(--red)' }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* CRM + Invoices */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card">
            <div className="card-title"><ArrowUpRight size={15} /> CRM</div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              {[
                { label: 'Taux conv.', value: conversionRate + '%', color: conversionRate >= 50 ? '#2E7D32' : '#D32F2F' },
                { label: 'Devis', value: pendingQuotes, color: 'var(--text)' },
                { label: 'Prospects', value: useInternal ? (internal.kpis?.prospectsCount ?? prospects.length) : prospects.length, color: 'var(--text)' },
              ].map((k, i) => (
                <div key={i} style={{ flex: 1, background: 'var(--bg)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.1rem', color: k.color }}>{k.value}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-3)' }}>{k.label}</div>
                </div>
              ))}
            </div>
            {(useInternal ? (internal.hotProspects || []) : prospects.filter(p => p.status === 'Chaud')).map((p, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: '1px solid var(--border)', fontSize: '0.82rem' }}>
                <span style={{ fontWeight: 600 }}>{p.name}</span>
                <span style={{ color: 'var(--red)', fontFamily: 'var(--font-head)', fontWeight: 700 }}>{fmtMAD(p.value)}</span>
              </div>
            ))}
            {useInternal && internal.recentDevis?.length > 0 && (
              <>
                <div style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.1em', color: 'var(--text-3)', textTransform: 'uppercase', marginTop: 12, marginBottom: 6 }}>Devis recents</div>
                {internal.recentDevis.slice(0, 3).map((d, i) => (
                  <div key={d.id || i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderTop: '1px solid var(--border)', fontSize: '0.78rem' }}>
                    <span style={{ fontWeight: 600, color: 'var(--red)' }}>{d.ref}</span>
                    <span>{fmtMAD(d.amount)}</span>
                  </div>
                ))}
              </>
            )}
          </div>

          <div className="card">
            <div className="card-title"><FileText size={15} /> Dernieres factures</div>
            {recentFactures.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-3)', fontSize: '0.85rem' }}>Aucune facture recente.</div>
            ) : recentFactures.map((inv, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, color: 'var(--red)', fontSize: '0.85rem' }}>{inv.ref}</div>
                  <div className="text-muted" style={{ fontSize: '0.72rem' }}>{inv.client}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.82rem' }}>{fmtMAD(inv.amount)}</div>
                  <span className={'badge ' + (inv.status === 'paid' ? 'badge-green' : inv.status === 'overdue' ? 'badge-red' : 'badge-orange')} style={{ fontSize: '0.65rem' }}>
                    {inv.status === 'paid' ? 'Payee' : inv.status === 'overdue' ? 'Retard' : 'Impayee'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}

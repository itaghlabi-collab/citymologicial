/**
 * FinanceCharts.jsx — Graphiques SVG cockpit Finance CITYMO
 */

export function Sparkline({ data = [], color = '#C62828', width = 72, height = 28 }) {
  const values = data.length ? data : [0];
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const pad = 2;
  const pts = values.map((v, i) => {
    const x = pad + (i / Math.max(values.length - 1, 1)) * (width - pad * 2);
    const y = height - pad - ((v - min) / range) * (height - pad * 2);
    return [x, y];
  });
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]},${p[1]}`).join(' ');

  return (
    <svg width={width} height={height} style={{ display: 'block' }} aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      {pts.length > 0 && (
        <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={2.5} fill={color} />
      )}
    </svg>
  );
}

export function TreasuryComboChart({ data = [], emptyMessage }) {
  const hasData = data.some((d) => d.entrees > 0 || d.sorties > 0 || d.solde !== 0);
  if (!hasData) {
    return (
      <div className="finance-chart-empty">{emptyMessage || 'Aucune donnée de trésorerie sur cette période.'}</div>
    );
  }

  const W = 720;
  const H = 220;
  const PL = 52;
  const PR = 20;
  const PT = 16;
  const PB = 32;
  const cW = W - PL - PR;
  const cH = H - PT - PB;
  const maxBar = Math.max(...data.map((d) => Math.max(d.entrees, d.sorties)), 1);
  const maxSolde = Math.max(...data.map((d) => Math.abs(d.solde)), 1);
  const gW = cW / data.length;
  const bW = Math.min(14, gW / 2.8);

  const soldePts = data.map((d, i) => {
    const x = PL + i * gW + gW / 2;
    const y = PT + cH / 2 - (d.solde / maxSolde) * (cH / 2 - 8);
    return [x, y];
  });

  let lineD = '';
  soldePts.forEach((p, i) => {
    lineD += `${i === 0 ? 'M' : 'L'} ${p[0]},${p[1]} `;
  });

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="finance-treasury-chart" role="img" aria-label="Évolution trésorerie">
        {[0, 0.5, 1].map((f) => {
          const y = PT + cH - f * cH;
          return (
            <g key={f}>
              <line x1={PL} x2={W - PR} y1={y} y2={y} stroke="#ECEEF2" strokeWidth={1} />
              <text x={PL - 6} y={y + 3} textAnchor="end" fontSize={9} fill="#9AA3B2">
                {Math.round(maxBar * f / 1000)}k
              </text>
            </g>
          );
        })}
        <line x1={PL} x2={W - PR} y1={PT + cH / 2} y2={PT + cH / 2} stroke="#D8DCE6" strokeWidth={1} strokeDasharray="4 3" />

        {data.map((d, i) => {
          const x = PL + i * gW + gW / 2;
          const entH = (d.entrees / maxBar) * (cH / 2 - 6);
          const sorH = (d.sorties / maxBar) * (cH / 2 - 6);
          return (
            <g key={d.label}>
              <rect
                x={x - bW - 1}
                y={PT + cH / 2 - entH}
                width={bW}
                height={entH}
                rx={2}
                fill="#2E7D32"
                fillOpacity={0.85}
              />
              <rect
                x={x + 1}
                y={PT + cH / 2}
                width={bW}
                height={sorH}
                rx={2}
                fill="#C62828"
                fillOpacity={0.85}
              />
              <text x={x} y={H - 10} textAnchor="middle" fontSize={9} fill="#9AA3B2">{d.label}</text>
            </g>
          );
        })}

        <path d={lineD} fill="none" stroke="#1A1A1A" strokeWidth={2.2} strokeLinecap="round" />
        {soldePts.map((p, i) => (
          <circle key={i} cx={p[0]} cy={p[1]} r={3.5} fill="#1A1A1A" stroke="#fff" strokeWidth={1.5} />
        ))}
      </svg>
      <div className="finance-chart-legend">
        <span><i style={{ background: '#2E7D32' }} /> Entrées</span>
        <span><i style={{ background: '#C62828' }} /> Sorties</span>
        <span><i style={{ background: '#1A1A1A' }} /> Solde</span>
      </div>
    </div>
  );
}

export function FinanceDonutChart({ segments = [], emptyMessage }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (!total) {
    return (
      <div className="finance-chart-empty">{emptyMessage || 'Aucune charge catégorisée ce mois.'}</div>
    );
  }

  const R = 54;
  const CX = 70;
  const CY = 70;
  const STROKE = 18;
  const circ = 2 * Math.PI * R;
  let offset = 0;

  return (
    <div className="finance-donut-wrap">
      <svg viewBox="0 0 140 140" className="finance-donut-svg" role="img" aria-label="Répartition charges">
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="#ECEEF2" strokeWidth={STROKE} />
        {segments.map((seg) => {
          const p = seg.value / total;
          const dash = p * circ;
          const el = (
            <circle
              key={seg.label}
              cx={CX}
              cy={CY}
              r={R}
              fill="none"
              stroke={seg.color}
              strokeWidth={STROKE}
              strokeDasharray={`${dash} ${circ - dash}`}
              strokeDashoffset={-(offset * circ)}
              style={{ transform: 'rotate(-90deg)', transformOrigin: `${CX}px ${CY}px` }}
            />
          );
          offset += p;
          return el;
        })}
        <text x={CX} y={CY - 2} textAnchor="middle" fontSize={13} fontWeight={800} fill="var(--text)">
          {total >= 1000 ? `${Math.round(total / 1000)}k` : Math.round(total)}
        </text>
        <text x={CX} y={CY + 12} textAnchor="middle" fontSize={8} fill="var(--text-3)">MAD</text>
      </svg>
      <ul className="finance-donut-legend">
        {segments.map((s) => (
          <li key={s.label}>
            <span className="finance-donut-dot" style={{ background: s.color }} />
            <span className="finance-donut-label">{s.label}</span>
            <span className="finance-donut-val">{s.value.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} MAD</span>
            <span className="finance-donut-pct">{s.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ProjectProgressBar({ pct, over }) {
  const width = Math.min(100, Math.max(0, pct));
  return (
    <div className="finance-progress-track">
      <div
        className={`finance-progress-fill ${over ? 'over' : ''}`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

import { TrendingUp, Plus, BarChart2, Calendar, DollarSign, Megaphone } from 'lucide-react';

const actions = [
  { titre: 'Campagne LinkedIn - Projets Residentiels', type: 'Digital', budget: '150 000', depense: '98 000', debut: '2026-06-01', fin: '2026-06-30', status: 'Active' },
  { titre: 'Participation Salon BatiExpo 2026', type: 'Evenement', budget: '400 000', depense: '210 000', debut: '2026-07-15', fin: '2026-07-18', status: 'Planifie' },
  { titre: 'Brochure commerciale renovation', type: 'Print', budget: '60 000', depense: '60 000', debut: '2026-05-01', fin: '2026-05-20', status: 'Termine' },
  { titre: 'Newsletter clients Q2 2026', type: 'Email', budget: '20 000', depense: '20 000', debut: '2026-06-15', fin: '2026-06-15', status: 'Termine' },
];

const rapports = [
  { kpi: 'Taux de conversion prospects', valeur: '18%', delta: '+3%', up: true },
  { kpi: 'Leads generes ce mois', valeur: '24', delta: '+8', up: true },
  { kpi: 'Cout par lead (MAD)', valeur: '11 200', delta: '-1 400', up: true },
  { kpi: 'ROI campagnes', valeur: '3.2x', delta: '+0.4', up: true },
];

export default function Marketing() {
  return (
    <div className="animate-fade-in">
      <div className="page-header flex-between">
        <div>
          <h1 className="page-title">Marketing</h1>
          <p className="page-subtitle">Campagnes, planning et depenses marketing</p>
        </div>
        <button className="btn btn-primary"><Plus size={15} /> Nouvelle action</button>
      </div>

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
        <div className="stat-card"><div className="stat-icon"><Megaphone size={18} /></div><div className="stat-body"><div className="stat-value">4</div><div className="stat-label">Actions en cours</div></div></div>
        <div className="stat-card"><div className="stat-icon orange"><DollarSign size={18} /></div><div className="stat-body"><div className="stat-value">630K</div><div className="stat-label">Budget total (MAD)</div></div></div>
        <div className="stat-card"><div className="stat-icon green"><TrendingUp size={18} /></div><div className="stat-body"><div className="stat-value">388K</div><div className="stat-label">Depense (MAD)</div></div></div>
        <div className="stat-card"><div className="stat-icon blue"><BarChart2 size={18} /></div><div className="stat-body"><div className="stat-value">3.2x</div><div className="stat-label">ROI moyen</div></div></div>
      </div>

      <div className="grid-2">
        {/* Actions marketing */}
        <div className="card" style={{ gridColumn: 'span 2' }}>
          <div className="flex-between mb-4">
            <div className="card-title" style={{ marginBottom: 0 }}><Megaphone size={16} /> Actions marketing</div>
            <button className="btn btn-primary btn-sm"><Plus size={14} /> Ajouter</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Titre</th><th>Type</th><th>Budget (MAD)</th><th>Depense</th><th>Debut</th><th>Fin</th><th>Avancement</th><th>Statut</th></tr></thead>
              <tbody>
                {actions.map((a, i) => {
                  const pct = Math.round(parseInt(a.depense.replace(/\s/, '')) / parseInt(a.budget.replace(/\s/, '')) * 100);
                  return (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{a.titre}</td>
                      <td><span className="badge badge-blue">{a.type}</span></td>
                      <td style={{ fontFamily: 'var(--font-head)', fontWeight: 700 }}>{a.budget}</td>
                      <td>{a.depense}</td>
                      <td>{a.debut}</td>
                      <td>{a.fin}</td>
                      <td style={{ minWidth: 100 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div className="progress-bar-wrap" style={{ flex: 1 }}>
                            <div className={'progress-bar-fill' + (pct >= 100 ? '' : ' green')} style={{ width: Math.min(pct, 100) + '%' }} />
                          </div>
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-2)' }}>{pct}%</span>
                        </div>
                      </td>
                      <td><span className={'badge ' + (a.status === 'Active' ? 'badge-green' : a.status === 'Planifie' ? 'badge-blue' : 'badge-grey')}>{a.status}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* KPIs */}
        <div className="card">
          <div className="card-title"><BarChart2 size={16} /> Rapports KPI</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {rapports.map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'var(--bg)', borderRadius: 6 }}>
                <span style={{ fontSize: '0.875rem', color: 'var(--text-2)' }}>{r.kpi}</span>
                <div style={{ display: 'flex', align: 'center', gap: 8 }}>
                  <span style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1rem' }}>{r.valeur}</span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: r.up ? '#2E7D32' : 'var(--red)' }}>{r.delta}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Planning mensuel */}
        <div className="card">
          <div className="card-title"><Calendar size={16} /> Planning Juillet 2026</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { date: '15-18 Jul', event: 'Salon BatiExpo 2026', type: 'Evenement' },
              { date: '22 Jul', event: 'Publication etude de cas projet Dupont', type: 'Digital' },
              { date: '28 Jul', event: 'Envoi newsletter Q3 2026', type: 'Email' },
              { date: '30 Jul', event: 'Bilan marketing T2', type: 'Rapport' },
            ].map((p, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '8px 12px', background: 'var(--bg)', borderRadius: 6 }}>
                <div style={{ width: 70, fontSize: '0.78rem', fontWeight: 700, color: 'var(--red)', flexShrink: 0, fontFamily: 'var(--font-head)' }}>{p.date}</div>
                <div style={{ flex: 1, fontSize: '0.875rem' }}>{p.event}</div>
                <span className="badge badge-grey" style={{ fontSize: '0.7rem' }}>{p.type}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

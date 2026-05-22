import { Banknote, CheckCircle, Filter, Search, Users, TrendingUp } from 'lucide-react';

function EmptyState({ icon, title, sub }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-3)' }}>
      <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
        {icon}
      </div>
      <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-2)', marginBottom: 5 }}>{title}</div>
      <div style={{ fontSize: '0.83rem' }}>{sub}</div>
    </div>
  );
}
import { useState } from 'react';
const SEED_PROJECTS = [];

function fmtMAD(n) {
  return Number(n).toLocaleString('fr-MA') + ' MAD';
}

export default function PaiementHebdo({ workers: extWorkers }) {
  const workers = extWorkers && extWorkers.length > 0 ? extWorkers : [];
  const [payroll, setPayroll] = useState([]);
  const [search, setSearch] = useState('');
  const [filterProjet, setFilterProjet] = useState('');
  const [filterDate, setFilterDate] = useState('');

  function valider(id) {
    setPayroll(prev => prev.map(p => p.id === id ? { ...p, statut: 'Paye' } : p));
  }
  function validerTous() {
    setPayroll(prev => prev.map(p => ({ ...p, statut: 'Paye' })));
  }

  const filtered = payroll.filter(p => {
    if (search && !p.ouvrier.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterProjet && p.projet !== filterProjet) return false;
    return true;
  });

  const totalAPayer = filtered.reduce((s, p) => s + p.total, 0);
  const totalPaye = filtered.filter(p => p.statut === 'Paye').reduce((s, p) => s + p.total, 0);
  const totalEnAttente = totalAPayer - totalPaye;
  const nbEnAttente = filtered.filter(p => p.statut === 'En attente').length;

  return (
    <div className="animate-fade-in">
      <div className="page-header flex-between">
        <div>
          <h1 className="page-title">Paiement hebdomadaire</h1>
          <p className="page-subtitle">Calcul automatique : (jours x tarif) + heures supplementaires</p>
        </div>
        {nbEnAttente > 0 && (
          <button className="btn btn-primary" onClick={validerTous}>
            <CheckCircle size={15} /> Valider tous les paiements
          </button>
        )}
      </div>

      {/* KPIs */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))', marginBottom: 16 }}>
        <div className="stat-card">
          <div className="stat-icon blue"><Banknote size={18} /></div>
          <div className="stat-body">
            <div className="stat-value" style={{ fontSize: '1rem' }}>{fmtMAD(totalAPayer)}</div>
            <div className="stat-label">Total a payer</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green"><CheckCircle size={18} /></div>
          <div className="stat-body">
            <div className="stat-value" style={{ fontSize: '1rem' }}>{fmtMAD(totalPaye)}</div>
            <div className="stat-label">Deja paye</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon orange"><TrendingUp size={18} /></div>
          <div className="stat-body">
            <div className="stat-value" style={{ fontSize: '1rem' }}>{fmtMAD(totalEnAttente)}</div>
            <div className="stat-label">En attente</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><Users size={18} /></div>
          <div className="stat-body">
            <div className="stat-value">{filtered.length}</div>
            <div className="stat-label">Employes concernes</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: 12, padding: '14px 20px' }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-3)', fontSize: '0.85rem' }}>
            <Filter size={14} /> Filtres
          </div>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input
              placeholder="Rechercher un employe..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: 28, paddingRight: 12, paddingTop: 7, paddingBottom: 7, border: '1.5px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.85rem', fontFamily: 'var(--font-body)', outline: 'none' }}
            />
          </div>
          <select value={filterProjet} onChange={e => setFilterProjet(e.target.value)} style={{ padding: '7px 12px', border: '1.5px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.85rem', fontFamily: 'var(--font-body)', outline: 'none', background: '#fff' }}>
            <option value="">Tous les projets</option>
            {SEED_PROJECTS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          {(search || filterProjet) && (
            <button onClick={() => { setSearch(''); setFilterProjet(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: '0.82rem', fontWeight: 600 }}>
              Effacer filtres
            </button>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-title" style={{ marginBottom: 16 }}><Banknote size={16} /> Tableau de paiement</div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={<Banknote size={22} style={{ color: 'var(--text-3)' }} />}
            title={payroll.length === 0 ? "Aucun paiement genere" : "Aucun resultat pour ces filtres"}
            sub={payroll.length === 0 ? "Les paiements sont calcules automatiquement a partir des presences et heures supplementaires" : "Modifiez vos criteres de recherche"}
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Employe</th>
                  <th>Projet</th>
                  <th>Jours paies</th>
                  <th>Salaire/jour</th>
                  <th>Heures sup</th>
                  <th>Montant sup</th>
                  <th>Total</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => {
                  const montantSup = Math.round(p.heuresSup * p.tarifSup);
                  const isPaye = p.statut === 'Paye';
                  return (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 600 }}>{p.ouvrier}</td>
                      <td style={{ color: 'var(--text-2)' }}>{p.projet}</td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ fontFamily: 'var(--font-head)', fontWeight: 700 }}>{p.joursPaies}</span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>j</span>
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-2)', fontSize: '0.85rem' }}>{fmtMAD(p.tarifJour)}</td>
                      <td>
                        {p.heuresSup > 0
                          ? <span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, color: '#E65100' }}>{p.heuresSup}h</span>
                          : <span style={{ color: 'var(--text-3)' }}>—</span>
                        }
                      </td>
                      <td style={{ color: '#E65100', fontFamily: 'var(--font-head)', fontWeight: 600, fontSize: '0.88rem' }}>
                        {p.heuresSup > 0 ? fmtMAD(montantSup) : '—'}
                      </td>
                      <td>
                        <span style={{ fontFamily: 'var(--font-head)', fontWeight: 800, color: 'var(--red)', fontSize: '0.98rem' }}>
                          {fmtMAD(p.total)}
                        </span>
                      </td>
                      <td>
                        <span className={'badge ' + (isPaye ? 'badge-green' : 'badge-orange')}>
                          {p.statut}
                        </span>
                      </td>
                      <td>
                        {!isPaye && (
                          <button
                            className="btn btn-sm"
                            style={{ background: '#E8F5E9', color: '#2E7D32', border: 'none', cursor: 'pointer', borderRadius: 6, padding: '5px 12px', fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap' }}
                            onClick={() => valider(p.id)}
                          >
                            <CheckCircle size={12} style={{ marginRight: 4 }} /> Payer
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Summary footer */}
        <div style={{ marginTop: 16, padding: '14px 16px', background: '#F8F9FA', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', gap: 24 }}>
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Nombre d&apos;employes</div>
              <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800 }}>{filtered.length}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>En attente</div>
              <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, color: '#E65100' }}>{nbEnAttente}</div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Total a payer cette semaine</div>
            <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, color: 'var(--red)', fontSize: '1.4rem' }}>{fmtMAD(totalAPayer)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

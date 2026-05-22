import { HardHat, Plus, Clock, DollarSign, CheckCircle, Edit2, Trash2 } from 'lucide-react';
import { useState } from 'react';

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

export default function Ouvriers() {
  const [tab, setTab] = useState('liste');
  const ouvriersData = [];
  const presence = [];

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">Gestion des Ouvriers</h1>
        <p className="page-subtitle">Ouvriers, presence, heures sup et paiements</p>
      </div>

      {/* Stats — dynamic from data */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
        <div className="stat-card">
          <div className="stat-icon orange"><HardHat size={18} /></div>
          <div className="stat-body"><div className="stat-value">{ouvriersData.length}</div><div className="stat-label">Total ouvriers</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green"><CheckCircle size={18} /></div>
          <div className="stat-body"><div className="stat-value">{ouvriersData.filter(o => o.status === 'Present').length}</div><div className="stat-label">Presents auj.</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><Clock size={18} /></div>
          <div className="stat-body"><div className="stat-value">0h</div><div className="stat-label">Heures sup sem.</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon blue"><DollarSign size={18} /></div>
          <div className="stat-body"><div className="stat-value">0 MAD</div><div className="stat-label">Paiement sem.</div></div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'var(--surface)', padding: 4, borderRadius: 'var(--radius)', border: '1px solid var(--border)', width: 'fit-content' }}>
        {[['liste', 'Liste'], ['presence', 'Presence'], ['paiement', 'Paiement']].map(([k, v]) => (
          <button key={k} onClick={() => setTab(k)} style={{ padding: '7px 18px', borderRadius: 6, border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '0.85rem', background: tab === k ? 'var(--red)' : 'transparent', color: tab === k ? '#fff' : 'var(--text-2)', transition: 'all 0.15s' }}>
            {v}
          </button>
        ))}
      </div>

      {tab === 'liste' && (
        <div className="card">
          <div className="flex-between mb-4">
            <div className="card-title" style={{ marginBottom: 0 }}><HardHat size={16} /> Ouvriers</div>
            <button className="btn btn-primary btn-sm"><Plus size={14} /> Ajouter</button>
          </div>
          {ouvriersData.length === 0 ? (
            <EmptyState
              icon={<HardHat size={22} style={{ color: 'var(--text-3)' }} />}
              title="Aucun ouvrier enregistre"
              sub="Ajoutez votre premier ouvrier pour commencer le suivi"
            />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Nom</th><th>Type</th><th>Metier</th><th>Projet</th><th>Heures</th><th>Heures Sup</th><th>Salaire Sem. (MAD)</th><th>Statut</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {ouvriersData.map(o => (
                    <tr key={o.id}>
                      <td style={{ fontWeight: 600 }}>{o.nom}</td>
                      <td><span className={'badge ' + (o.type === 'Interne' ? 'badge-blue' : 'badge-grey')}>{o.type}</span></td>
                      <td>{o.metier}</td>
                      <td className="text-muted">{o.projet}</td>
                      <td>{o.heures}h</td>
                      <td style={{ color: o.sup > 0 ? '#E65100' : 'var(--text-3)', fontWeight: o.sup > 0 ? 700 : 400 }}>{o.sup}h</td>
                      <td style={{ fontFamily: 'var(--font-head)', fontWeight: 700 }}>{o.salaire}</td>
                      <td><span className={'badge ' + (o.status === 'Present' ? 'badge-green' : 'badge-red')}>{o.status}</span></td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-ghost btn-sm" style={{ padding: '4px 8px' }}><Edit2 size={13} /></button>
                          <button className="btn btn-ghost btn-sm" style={{ padding: '4px 8px' }}><Trash2 size={13} style={{ color: 'var(--red)' }} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'presence' && (
        <div className="card">
          <div className="card-title"><CheckCircle size={16} /> Feuille de presence – Semaine en cours</div>
          {presence.length === 0 ? (
            <EmptyState
              icon={<CheckCircle size={22} style={{ color: 'var(--text-3)' }} />}
              title="Aucune presence enregistree"
              sub="Les feuilles de presence apparaitront ici une fois les ouvriers saisis"
            />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Ouvrier</th><th>Lundi</th><th>Mardi</th><th>Mercredi</th><th>Jeudi</th><th>Vendredi</th><th>Total</th></tr>
                </thead>
                <tbody>
                  {presence.map((p, i) => {
                    const days = [p.lun, p.mar, p.mer, p.jeu, p.ven];
                    const total = days.filter(Boolean).length;
                    return (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{p.nom}</td>
                        {days.map((d, j) => (
                          <td key={j}>
                            <div style={{ width: 28, height: 28, borderRadius: '50%', background: d ? '#E8F5E9' : 'var(--red-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {d ? <CheckCircle size={14} style={{ color: '#2E7D32' }} /> : <span style={{ fontSize: 12, color: 'var(--red)', fontWeight: 700 }}>A</span>}
                            </div>
                          </td>
                        ))}
                        <td style={{ fontFamily: 'var(--font-head)', fontWeight: 700, color: total >= 5 ? '#2E7D32' : 'var(--red)' }}>{total}/5j</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'paiement' && (
        <div className="card">
          <div className="flex-between mb-4">
            <div className="card-title" style={{ marginBottom: 0 }}><DollarSign size={16} /> Paiements hebdomadaires</div>
            <button className="btn btn-primary btn-sm" disabled={ouvriersData.length === 0}>Valider les paiements</button>
          </div>
          {ouvriersData.length === 0 ? (
            <EmptyState
              icon={<DollarSign size={22} style={{ color: 'var(--text-3)' }} />}
              title="Aucun paiement genere"
              sub="Les paiements seront calcules automatiquement a partir des presences et heures sup"
            />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Ouvrier</th><th>Heures travaillees</th><th>Heures Sup</th><th>Salaire Base (MAD)</th><th>Total (MAD)</th><th>Statut</th></tr>
                </thead>
                <tbody>
                  {ouvriersData.map(o => (
                    <tr key={o.id}>
                      <td style={{ fontWeight: 600 }}>{o.nom}</td>
                      <td>{o.heures}h</td>
                      <td style={{ color: o.sup > 0 ? '#E65100' : 'var(--text-3)' }}>{o.sup}h</td>
                      <td>{o.salaire}</td>
                      <td style={{ fontFamily: 'var(--font-head)', fontWeight: 800, color: 'var(--red)' }}>—</td>
                      <td><span className="badge badge-orange">En attente</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

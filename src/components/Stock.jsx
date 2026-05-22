import { Package, Plus, Edit2, Trash2, ArrowUp, ArrowDown, Warehouse } from 'lucide-react';
import { useState } from 'react';

const articles = [];
const mouvements = [];

export default function Stock() {
  const [tab, setTab] = useState('articles');

  return (
    <div className="animate-fade-in">
      <div className="page-header flex-between">
        <div>
          <h1 className="page-title">Stock / Inventaire</h1>
          <p className="page-subtitle">Articles, depots et mouvements de stock</p>
        </div>
        <button className="btn btn-primary"><Plus size={15} /> Nouveau mouvement</button>
      </div>

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
        <div className="stat-card"><div className="stat-icon"><Package size={18} /></div><div className="stat-body"><div className="stat-value">1 240</div><div className="stat-label">Refs en stock</div></div></div>
        <div className="stat-card"><div className="stat-icon green"><ArrowDown size={18} /></div><div className="stat-body"><div className="stat-value">580</div><div className="stat-label">Entrees ce mois</div></div></div>
        <div className="stat-card"><div className="stat-icon orange"><ArrowUp size={18} /></div><div className="stat-body"><div className="stat-value">1 340</div><div className="stat-label">Sorties ce mois</div></div></div>
        <div className="stat-card"><div className="stat-icon blue"><Warehouse size={18} /></div><div className="stat-body"><div className="stat-value">3</div><div className="stat-label">Depots</div></div></div>
      </div>

      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '2px solid var(--border)' }}>
        {[['articles', 'Articles'], ['mouvements', 'Mouvements'], ['depots', 'Depots']].map(([k, v]) => (
          <button key={k} onClick={() => setTab(k)} style={{ padding: '10px 20px', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '0.875rem', background: 'none', color: tab === k ? 'var(--red)' : 'var(--text-2)', borderBottom: tab === k ? '2px solid var(--red)' : '2px solid transparent', marginBottom: -2, transition: 'all 0.15s' }}>
            {v}
          </button>
        ))}
      </div>

      {tab === 'articles' && (
        <div className="card">
          <div className="flex-between mb-4">
            <div className="card-title" style={{ marginBottom: 0 }}><Package size={16} /> Articles</div>
            <button className="btn btn-primary btn-sm"><Plus size={14} /> Ajouter article</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Reference</th><th>Designation</th><th>Categorie</th><th>Depot</th><th>Quantite</th><th>Seuil min.</th><th>Valeur stock (MAD)</th><th>Actions</th></tr></thead>
              <tbody>
                {articles.map(a => (
                  <tr key={a.id}>
                    <td style={{ fontFamily: 'var(--font-head)', fontWeight: 700, color: 'var(--red)' }}>{a.ref}</td>
                    <td style={{ fontWeight: 600 }}>{a.nom}</td>
                    <td><span className="badge badge-blue">{a.categorie}</span></td>
                    <td>{a.depot}</td>
                    <td>
                      <span style={{ fontWeight: 700, color: a.qte <= a.seuil ? 'var(--red)' : 'var(--text)' }}>{a.qte.toLocaleString()} {a.unite}</span>
                      {a.qte <= a.seuil && <span className="badge badge-red" style={{ marginLeft: 6, fontSize: '0.68rem' }}>Bas</span>}
                    </td>
                    <td className="text-muted">{a.seuil}</td>
                    <td style={{ fontFamily: 'var(--font-head)', fontWeight: 700 }}>{a.valeur}</td>
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
        </div>
      )}

      {tab === 'mouvements' && (
        <div className="card">
          <div className="flex-between mb-4">
            <div className="card-title" style={{ marginBottom: 0 }}><ArrowUp size={16} /> Mouvements de stock</div>
            <button className="btn btn-primary btn-sm"><Plus size={14} /> Nouveau mouvement</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Article</th><th>Type</th><th>Quantite</th><th>Motif</th><th>Operateur</th></tr></thead>
              <tbody>
                {mouvements.map((m, i) => (
                  <tr key={i}>
                    <td>{m.date}</td>
                    <td style={{ fontWeight: 600 }}>{m.article}</td>
                    <td>
                      <span className={'badge ' + (m.type === 'Entree' ? 'badge-green' : 'badge-red')} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {m.type === 'Entree' ? <ArrowDown size={11} /> : <ArrowUp size={11} />} {m.type}
                      </span>
                    </td>
                    <td style={{ fontWeight: 700 }}>{m.qte}</td>
                    <td>{m.motif}</td>
                    <td className="text-muted">{m.user}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'depots' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
          {['Depot Central', 'Depot Nord', 'Depot Sud'].map((d, i) => (
            <div key={i} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="stat-icon" style={{ width: 40, height: 40, borderRadius: 8 }}><Warehouse size={18} /></div>
                <div>
                  <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '1rem' }}>{d}</div>
                  <div className="text-muted">Alger</div>
                </div>
              </div>
              <hr className="divider" />
              <div className="grid-2" style={{ gap: 8 }}>
                <div><div className="text-muted">Articles</div><div style={{ fontWeight: 700 }}>{[18, 12, 6][i]}</div></div>
                <div><div className="text-muted">Valeur</div><div style={{ fontWeight: 700 }}>{['4.2M', '2.6M', '960K'][i]} MAD</div></div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

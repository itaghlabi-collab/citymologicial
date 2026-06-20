/**
 * Stocks.jsx — Vue globale des niveaux de stock ERP CITYMO
 */
import { useState } from 'react';
import { BarChart2, Package, AlertTriangle, ArrowUpDown, Search, Filter } from 'lucide-react';
import {
  INPUT_STYLE, SELECT_STYLE,
  KpiCard, EmptyState, SectionTitle,
  formatMAD, StockAlert
} from './shared.jsx';
import { ETATS_ARTICLE } from './shared.jsx';

export default function Stocks({ articles, categories, depots }) {
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterDepot, setFilterDepot] = useState('');
  const [filterAlerte, setFilterAlerte] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const arts = articles || [];

  const filtered = arts.filter(x => {
    const cat   = (categories || []).find(c => String(c.id) === String(x.categorie_id));
    const depot = (depots || []).find(d => String(d.id) === String(x.depot_id));
    const q = search.toLowerCase();
    const matchQ = !q || x.code.toLowerCase().includes(q) || x.designation.toLowerCase().includes(q)
      || (cat?.nom || '').toLowerCase().includes(q);
    const matchCat   = !filterCat   || String(x.categorie_id) === String(filterCat);
    const matchDepot = !filterDepot || String(x.depot_id) === String(filterDepot);
    const qte  = Number(x.stock_actuel) || 0;
    const seuil = Number(x.stock_minimum) || 0;
    let matchAlerte = true;
    if (filterAlerte === 'critique')  matchAlerte = seuil > 0 && qte <= seuil * 0.5 && qte > 0;
    if (filterAlerte === 'bas')       matchAlerte = seuil > 0 && qte > seuil * 0.5 && qte <= seuil;
    if (filterAlerte === 'rupture')   matchAlerte = qte === 0;
    if (filterAlerte === 'normal')    matchAlerte = seuil === 0 || qte > seuil;
    return matchQ && matchCat && matchDepot && matchAlerte;
  });

  const valeurTotale  = arts.reduce((s, a) => s + ((Number(a.valeur) || 0) * (Number(a.stock_actuel) || 0)), 0);
  const stockFaible   = arts.filter(a => a.stock_minimum && Number(a.stock_actuel) <= Number(a.stock_minimum) && Number(a.stock_actuel) > 0).length;
  const stockCritique = arts.filter(a => a.stock_minimum && Number(a.stock_actuel) <= Number(a.stock_minimum) * 0.5 && Number(a.stock_actuel) > 0).length;
  const ruptures      = arts.filter(a => Number(a.stock_actuel) === 0).length;

  // Alertes critiques visibles
  const alertes = arts.filter(a => {
    const q = Number(a.stock_actuel) || 0;
    const s = Number(a.stock_minimum) || 0;
    return s > 0 && q <= s;
  });

  function getStatutStock(qte, seuil) {
    const q = Number(qte) || 0;
    const s = Number(seuil) || 0;
    if (q === 0) return { label: 'Rupture', cls: 'badge-red' };
    if (s > 0 && q <= s * 0.5) return { label: 'Critique', cls: 'badge-red' };
    if (s > 0 && q <= s) return { label: 'Bas', cls: 'badge-orange' };
    return { label: 'Normal', cls: 'badge-green' };
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header flex-between finance-page-header">
        <div>
          <h1 className="page-title">STOCKS</h1>
          <p className="page-subtitle finance-sub-hide-mobile">Vue globale des niveaux et états de stock.</p>
        </div>
        <div className="finance-page-actions finance-page-actions--solo">
          <button className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setShowFilters(f => !f)}>
            <Filter size={14} /> Filtres
          </button>
        </div>
      </div>

      <div className="stat-grid finance-kpi-grid finance-kpi-strip">
        <KpiCard icon={<BarChart2 size={17} />}     label="Valeur totale stock"  value={formatMAD(valeurTotale)} color="red"    />
        <KpiCard icon={<AlertTriangle size={17} />} label="Stock faible"         value={stockFaible}             color="orange" />
        <KpiCard icon={<AlertTriangle size={17} />} label="Articles critiques"   value={stockCritique}           color="red"    />
        <KpiCard icon={<Package size={17} />}       label="Ruptures de stock"    value={ruptures}                color="grey"   />
        <KpiCard icon={<ArrowUpDown size={17} />}   label="Total articles"       value={arts.length}             color="blue"   />
      </div>

      {/* Alertes panel */}
      {alertes.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <AlertTriangle size={15} style={{ color: 'var(--red)' }} />
            <span style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--red)' }}>
              Alertes stock ({alertes.length})
            </span>
          </div>
          <div className="inv-alerts-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
            {alertes.slice(0, 6).map(a => {
              const s = getStatutStock(a.stock_actuel, a.stock_minimum);
              const depot = (depots || []).find(d => String(d.id) === String(a.depot_id));
              return (
                <div key={a.id} style={{ background: '#fff', border: '1.5px solid', borderColor: s.cls === 'badge-red' ? 'var(--red)' : '#E65100', borderRadius: 8, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.88rem' }}>{a.code}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-2)' }}>{a.designation}</div>
                    {depot && <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>{depot.nom}</div>}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.2rem', color: s.cls === 'badge-red' ? 'var(--red)' : '#E65100' }}>
                      {a.stock_actuel || 0}
                    </div>
                    <span className={'badge ' + s.cls} style={{ fontSize: '0.68rem' }}>{s.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
          {alertes.length > 6 && (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-3)', marginTop: 8 }}>
              + {alertes.length - 6} autres articles en alerte
            </div>
          )}
        </div>
      )}

      {showFilters && (
        <div className="card finance-toolbar" style={{ marginBottom: 16, padding: '14px 20px' }}>
          <div className="finance-toolbar-inner">
            <div style={{ flex: 1, minWidth: 180, position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Code, désignation..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
            </div>
            <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 160 }}>
              <option value="">Toutes catégories</option>
              {(categories || []).map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
            <select value={filterDepot} onChange={e => setFilterDepot(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 160 }}>
              <option value="">Tous dépôts</option>
              {(depots || []).map(d => <option key={d.id} value={d.id}>{d.nom}</option>)}
            </select>
            <select value={filterAlerte} onChange={e => setFilterAlerte(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 140 }}>
              <option value="">Tous états</option>
              <option value="normal">Normal</option>
              <option value="bas">Stock bas</option>
              <option value="critique">Critique</option>
              <option value="rupture">Rupture</option>
            </select>
            <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFilterCat(''); setFilterDepot(''); setFilterAlerte(''); }}>Réinitialiser</button>
          </div>
        </div>
      )}

      {!showFilters && (
        <div className="card" style={{ marginBottom: 12, padding: '10px 14px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher dans le stock..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        {filtered.length === 0 ? (
          <EmptyState icon={<Package size={24} />} title="Aucun article en stock"
            sub={arts.length > 0 ? "Aucun résultat pour ces filtres" : "Ajoutez des articles dans la rubrique Articles de stock"}
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Article</th>
                  <th>Catégorie</th>
                  <th>Dépôt</th>
                  <th>Quantité</th>
                  <th>Stock min.</th>
                  <th>État</th>
                  <th>Valeur unitaire</th>
                  <th>Valeur totale</th>
                  <th>Statut stock</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(x => {
                  const cat   = (categories || []).find(c => String(c.id) === String(x.categorie_id));
                  const depot = (depots || []).find(d => String(d.id) === String(x.depot_id));
                  const s     = getStatutStock(x.stock_actuel, x.stock_minimum);
                  const valTot = (Number(x.valeur) || 0) * (Number(x.stock_actuel) || 0);
                  return (
                    <tr key={x.id}>
                      <td>
                        <div>
                          <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.82rem', color: 'var(--red)' }}>{x.code}</div>
                          <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>{x.designation}</div>
                        </div>
                      </td>
                      <td data-label="Catégorie">
                        {cat ? <span className="badge badge-blue" style={{ fontSize: '0.7rem' }}>{cat.nom}</span> : '—'}
                      </td>
                      <td data-label="Dépôt" style={{ fontSize: '0.83rem' }}>{depot ? depot.nom : '—'}</td>
                      <td data-label="Quantité">
                        <span style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1rem', color: s.cls === 'badge-red' ? 'var(--red)' : s.cls === 'badge-orange' ? '#E65100' : 'var(--text)' }}>
                          {x.stock_actuel || 0}
                        </span>
                        <span style={{ marginLeft: 4, fontSize: '0.78rem', color: 'var(--text-3)' }}>{x.unite}</span>
                      </td>
                      <td data-label="Min." style={{ color: 'var(--text-3)', fontSize: '0.83rem' }}>{x.stock_minimum || '—'}</td>
                      <td data-label="État">
                        <span className={'badge ' + (x.etat === 'Neuf' ? 'badge-green' : x.etat === 'Utilisé' ? 'badge-blue' : 'badge-orange')} style={{ fontSize: '0.7rem' }}>{x.etat}</span>
                      </td>
                      <td data-label="Valeur u." style={{ fontFamily: 'var(--font-head)', fontWeight: 600 }}>
                        {x.valeur ? formatMAD(x.valeur) : '—'}
                      </td>
                      <td data-label="Valeur tot." style={{ fontFamily: 'var(--font-head)', fontWeight: 700, color: 'var(--red)' }}>
                        {valTot > 0 ? formatMAD(valTot) : '—'}
                      </td>
                      <td data-label="Statut">
                        <span className={'badge ' + s.cls} style={{ fontSize: '0.72rem' }}>{s.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

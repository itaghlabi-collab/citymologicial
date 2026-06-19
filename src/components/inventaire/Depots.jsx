/**
 * Depots.jsx — Emplacements de stock ERP CITYMO
 */
import { useState, useEffect, useMemo } from 'react';
import { MapPin, Search, Filter, Eye, ChevronLeft } from 'lucide-react';
import {
  INPUT_STYLE, SELECT_STYLE, EMPLACEMENTS_STOCK,
  KpiCard, EmptyState, SectionTitle,
} from './shared.jsx';

function inferEmplacementType(nom) {
  const n = (nom || '').toUpperCase();
  if (n.startsWith('DEPOT')) return 'Dépôt';
  if (n.startsWith('CHANTIER')) return 'Chantier';
  if (n.startsWith('ATELIER')) return 'Atelier';
  if (n.startsWith('SAV')) return 'SAV';
  if (n.startsWith('BUREAU')) return 'Bureau';
  return 'Autre';
}

function buildEmplacementsList() {
  return EMPLACEMENTS_STOCK.map((nom, index) => ({
    id: `emplacement-${index}`,
    nom,
    type: inferEmplacementType(nom),
    statut: 'Actif',
  }));
}

function DetailEmplacement({ emplacement, articles, onBack }) {
  const articlesHere = (articles || []).filter(
    (a) => String(a.emplacement || '').trim().toLowerCase() === String(emplacement.nom).trim().toLowerCase(),
  );

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <button type="button" className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={onBack}>
          <ChevronLeft size={15} /> Retour
        </button>
        <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1rem', flex: 1 }}>{emplacement.nom}</h2>
        <span className="badge badge-blue" style={{ fontSize: '0.72rem' }}>{emplacement.type}</span>
      </div>
      <div className="card">
        <SectionTitle icon={<MapPin size={12} />}>Articles à cet emplacement</SectionTitle>
        {articlesHere.length === 0 ? (
          <div style={{ color: 'var(--text-3)', fontSize: '0.85rem', padding: '20px 0' }}>Aucun article affecté à cet emplacement.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Désignation</th>
                  <th>Type</th>
                  <th>État</th>
                </tr>
              </thead>
              <tbody>
                {articlesHere.map((a) => (
                  <tr key={a.id}>
                    <td style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.82rem', color: 'var(--red)' }}>{a.code}</td>
                    <td style={{ fontWeight: 600 }}>{a.designation}</td>
                    <td style={{ fontSize: '0.82rem' }}>{a.type || '—'}</td>
                    <td><span className="badge badge-green" style={{ fontSize: '0.7rem' }}>{a.etat || '—'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Depots({ articles, onDepotsChange }) {
  const emplacements = useMemo(() => buildEmplacementsList(), []);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [detailId, setDetailId] = useState(null);

  useEffect(() => {
    if (onDepotsChange) onDepotsChange(emplacements);
  }, [emplacements, onDepotsChange]);

  const filtered = emplacements.filter((x) => {
    const q = search.toLowerCase();
    return (!q || x.nom.toLowerCase().includes(q))
      && (!filterType || x.type === filterType);
  });

  const types = [...new Set(emplacements.map((e) => e.type))];
  const totalArticles = (articles || []).length;
  const avecEmplacement = (articles || []).filter((a) => (a.emplacement || '').trim()).length;
  const chantiers = emplacements.filter((x) => x.type === 'Chantier').length;
  const depotsCount = emplacements.filter((x) => x.type === 'Dépôt').length;

  function getArticlesCount(nom) {
    return (articles || []).filter(
      (a) => String(a.emplacement || '').trim().toLowerCase() === String(nom).trim().toLowerCase(),
    ).length;
  }

  if (detailId) {
    const emp = emplacements.find((x) => x.id === detailId);
    if (!emp) { setDetailId(null); return null; }
    return (
      <DetailEmplacement
        emplacement={emp}
        articles={articles}
        onBack={() => setDetailId(null)}
      />
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header flex-between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title">EMPLACEMENTS</h1>
          <p className="page-subtitle">Lieux de stockage CITYMO — dépôts, chantiers et ateliers.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setShowFilters((f) => !f)}>
            <Filter size={14} /> Filtres
          </button>
        </div>
      </div>

      <div className="stat-grid finance-kpi-grid" style={{ marginBottom: 20 }}>
        <KpiCard icon={<MapPin size={17} />} label="Total emplacements" value={emplacements.length} color="grey" />
        <KpiCard icon={<MapPin size={17} />} label="Dépôts" value={depotsCount} color="green" />
        <KpiCard icon={<MapPin size={17} />} label="Chantiers" value={chantiers} color="blue" />
        <KpiCard icon={<MapPin size={17} />} label="Articles stockés" value={totalArticles} color="orange" sub={avecEmplacement ? `${avecEmplacement} avec emplacement` : undefined} />
      </div>

      {showFilters ? (
        <div className="card" style={{ marginBottom: 16, padding: '14px 20px' }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 180, position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nom emplacement..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
            </div>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 180 }}>
              <option value="">Tous les types</option>
              {types.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFilterType(''); }}>Réinitialiser</button>
          </div>
        </div>
      ) : (
        <div className="card" style={{ marginBottom: 12, padding: '10px 14px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un emplacement..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        {filtered.length === 0 ? (
          <EmptyState icon={<MapPin size={24} />} title="Aucun emplacement" sub="Aucun résultat pour cette recherche" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Emplacement</th>
                  <th>Type</th>
                  <th>Articles</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((x) => (
                  <tr key={x.id} style={{ cursor: 'pointer' }} onClick={() => setDetailId(x.id)}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 7, background: 'var(--red-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <MapPin size={14} style={{ color: 'var(--red)' }} />
                        </div>
                        <span style={{ fontWeight: 600 }}>{x.nom}</span>
                      </div>
                    </td>
                    <td data-label="Type">
                      <span className="badge badge-blue" style={{ fontSize: '0.72rem' }}>{x.type}</span>
                    </td>
                    <td data-label="Articles"><span style={{ fontWeight: 700 }}>{getArticlesCount(x.nom)}</span></td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button type="button" className="btn btn-secondary btn-sm" title="Voir" onClick={() => setDetailId(x.id)}><Eye size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

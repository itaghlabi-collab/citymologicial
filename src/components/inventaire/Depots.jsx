/**
 * Depots.jsx — Dépôts & Projets ERP CITYMO
 */
import { useState, useCallback } from 'react';
import { Warehouse, Plus, Edit2, Trash2, Eye, Search, Filter, Download, ChevronLeft, History } from 'lucide-react';
import {
  INPUT_STYLE, SELECT_STYLE, TEXTAREA_STYLE, TYPES_DEPOT, BADGE_DEPOT,
  KpiCard, EmptyState, Modal, SectionTitle, FField, FRow,
  genId
} from './shared.jsx';

const EMPTY_FORM = { nom: '', type: 'Dépôt principal', adresse: '', description: '', statut: 'Actif' };

function DepotForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.nom.trim()) { setErrors({ nom: 'Requis' }); return; }
    onSave(form);
  }

  return (
    <form onSubmit={handleSubmit}>
      <SectionTitle icon={<Warehouse size={12} />}>Informations du dépôt</SectionTitle>
      <FRow>
        <FField label="Nom du dépôt" required>
          <input value={form.nom} onChange={e => set('nom', e.target.value)}
            placeholder="Ex: Dépôt Central, Chantier Tour A..."
            style={{ ...INPUT_STYLE, borderColor: errors.nom ? 'var(--red)' : 'var(--border)' }} />
          {errors.nom && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors.nom}</div>}
        </FField>
        <FField label="Type">
          <select value={form.type} onChange={e => set('type', e.target.value)} style={SELECT_STYLE}>
            {TYPES_DEPOT.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </FField>
        <FField label="Statut">
          <select value={form.statut} onChange={e => set('statut', e.target.value)} style={SELECT_STYLE}>
            <option value="Actif">Actif</option>
            <option value="Inactif">Inactif</option>
          </select>
        </FField>
      </FRow>
      <div style={{ marginBottom: 14 }}>
        <FField label="Adresse">
          <input value={form.adresse} onChange={e => set('adresse', e.target.value)}
            placeholder="Adresse physique du dépôt..." style={INPUT_STYLE} />
        </FField>
      </div>
      <div style={{ marginBottom: 20 }}>
        <FField label="Description">
          <textarea value={form.description} onChange={e => set('description', e.target.value)}
            placeholder="Notes, particularités..." style={TEXTAREA_STYLE} />
        </FField>
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Annuler</button>
        <button type="submit" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Plus size={14} /> {initial ? 'Enregistrer' : 'Ajouter dépôt'}
        </button>
      </div>
    </form>
  );
}

function DetailDepot({ depot, articles, onBack, onEdit }) {
  const articlesDepot = (articles || []).filter(a => a.depot_id === depot.id);
  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <button className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={onBack}>
          <ChevronLeft size={15} /> Retour
        </button>
        <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1rem', flex: 1 }}>{depot.nom}</h2>
        <span className={'badge ' + (BADGE_DEPOT[depot.statut] || 'badge-grey')}>{depot.statut}</span>
        <button className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={onEdit}>
          <Edit2 size={13} /> Modifier
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16, alignItems: 'start' }}>
        <div className="card">
          <SectionTitle icon={<Warehouse size={12} />}>Articles en dépôt</SectionTitle>
          {articlesDepot.length === 0 ? (
            <div style={{ color: 'var(--text-3)', fontSize: '0.85rem', padding: '20px 0' }}>Aucun article affecté à ce dépôt.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Code</th><th>Désignation</th><th>Quantité</th><th>Valeur</th></tr></thead>
                <tbody>
                  {articlesDepot.map(a => (
                    <tr key={a.id}>
                      <td style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.82rem', color: 'var(--red)' }}>{a.code}</td>
                      <td style={{ fontWeight: 600 }}>{a.designation}</td>
                      <td>{a.stock_actuel || 0} {a.unite}</td>
                      <td>{a.valeur ? a.valeur + ' MAD' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="card">
          <SectionTitle>Informations</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.84rem' }}>
            {[['Type', depot.type], ['Adresse', depot.adresse], ['Date création', depot.date_creation], ['Articles', String(articlesDepot.length)]].map(([l, v]) => (
              <div key={l}>
                <span style={{ color: 'var(--text-3)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>{l}</span>
                <div style={{ fontWeight: 500 }}>{v || '—'}</div>
              </div>
            ))}
            {depot.description && (
              <div>
                <span style={{ color: 'var(--text-3)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>Description</span>
                <div style={{ color: 'var(--text-2)' }}>{depot.description}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Depots({ articles, onDepotsChange }) {
  const [depots, setDepots] = useState([]);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const today = new Date().toISOString().slice(0, 10);

  function updateDepots(updater) {
    setDepots(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (onDepotsChange) onDepotsChange(next);
      return next;
    });
  }

  const handleSave = useCallback((data) => {
    if (editItem) {
      updateDepots(prev => prev.map(x => x.id === editItem.id ? { ...x, ...data } : x));
    } else {
      updateDepots(prev => [...prev, { ...data, id: genId(), date_creation: today, nb_articles: 0 }]);
    }
    setShowModal(false); setEditItem(null);
  }, [editItem, today]);

  function handleDelete(id) {
    if (window.confirm('Supprimer ce dépôt ?')) { updateDepots(prev => prev.filter(x => x.id !== id)); setDetailId(null); }
  }

  const filtered = depots.filter(x => {
    const q = search.toLowerCase();
    return (!q || x.nom.toLowerCase().includes(q) || (x.adresse || '').toLowerCase().includes(q))
      && (!filterType || x.type === filterType);
  });

  const total    = depots.length;
  const actifs   = depots.filter(x => x.statut === 'Actif').length;
  const projets  = depots.filter(x => x.type === 'Projet' || x.type === 'Chantier').length;

  function getArticlesCount(id) {
    return (articles || []).filter(a => a.depot_id === id).length;
  }

  if (detailId) {
    const depot = depots.find(x => x.id === detailId);
    if (!depot) { setDetailId(null); return null; }
    return <DetailDepot depot={depot} articles={articles} onBack={() => setDetailId(null)} onEdit={() => { setEditItem(depot); setShowModal(true); setDetailId(null); }} />;
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header flex-between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title">DÉPÔTS & PROJETS</h1>
          <p className="page-subtitle">Gestion des lieux de stockage et affectations projets.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setShowFilters(f => !f)}><Filter size={14} /> Filtres</button>
          <button className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Download size={14} /> Export</button>
          <button className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => { setEditItem(null); setShowModal(true); }}>
            <Plus size={15} /> Ajouter lieu de stock
          </button>
        </div>
      </div>

      <div className="stat-grid finance-kpi-grid" style={{ marginBottom: 20 }}>
        <KpiCard icon={<Warehouse size={17} />} label="Total dépôts"     value={total}   color="grey"   />
        <KpiCard icon={<Warehouse size={17} />} label="Dépôts actifs"    value={actifs}  color="green"  />
        <KpiCard icon={<Warehouse size={17} />} label="Projets / chantiers" value={projets} color="blue" />
        <KpiCard icon={<Warehouse size={17} />} label="Articles stockés" value={(articles || []).length} color="orange" />
      </div>

      {showFilters ? (
        <div className="card" style={{ marginBottom: 16, padding: '14px 20px' }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 180, position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nom, adresse..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
            </div>
            <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 180 }}>
              <option value="">Tous les types</option>
              {TYPES_DEPOT.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFilterType(''); }}>Réinitialiser</button>
          </div>
        </div>
      ) : (
        <div className="card" style={{ marginBottom: 12, padding: '10px 14px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un dépôt..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        {filtered.length === 0 ? (
          <EmptyState icon={<Warehouse size={24} />} title="Aucun dépôt" sub="Ajoutez vos lieux de stockage" action="Ajouter lieu de stock" onAction={() => { setEditItem(null); setShowModal(true); }} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Type</th>
                  <th>Adresse</th>
                  <th>Articles</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(x => (
                  <tr key={x.id} style={{ cursor: 'pointer' }} onClick={() => setDetailId(x.id)}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 7, background: 'var(--red-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Warehouse size={14} style={{ color: 'var(--red)' }} />
                        </div>
                        <span style={{ fontWeight: 600 }}>{x.nom}</span>
                      </div>
                    </td>
                    <td data-label="Type">
                      <span className="badge badge-blue" style={{ fontSize: '0.72rem' }}>{x.type}</span>
                    </td>
                    <td data-label="Adresse" style={{ fontSize: '0.83rem', color: 'var(--text-2)' }}>{x.adresse || '—'}</td>
                    <td data-label="Articles"><span style={{ fontWeight: 700 }}>{getArticlesCount(x.id)}</span></td>
                    <td data-label="Statut">
                      <span className={'badge ' + (BADGE_DEPOT[x.statut] || 'badge-grey')} style={{ fontSize: '0.72rem' }}>{x.statut}</span>
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 3 }}>
                        <button className="btn btn-secondary btn-sm" title="Voir" onClick={() => setDetailId(x.id)}><Eye size={13} /></button>
                        <button className="btn btn-ghost btn-sm" title="Modifier" onClick={() => { setEditItem(x); setShowModal(true); }}><Edit2 size={13} /></button>
                        <button className="btn btn-ghost btn-sm" title="Supprimer" onClick={() => handleDelete(x.id)} style={{ color: 'var(--red)' }}><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={showModal} onClose={() => { setShowModal(false); setEditItem(null); }} title={editItem ? 'Modifier le dépôt' : 'Nouveau dépôt / lieu de stock'} width={620}>
        <DepotForm initial={editItem} onSave={handleSave} onCancel={() => { setShowModal(false); setEditItem(null); }} />
      </Modal>
    </div>
  );
}

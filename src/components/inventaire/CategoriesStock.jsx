/**
 * CategoriesStock.jsx — Catégories de stock ERP CITYMO
 */
import { useState, useCallback } from 'react';
import { Tag, Plus, Edit2, Trash2, ToggleLeft, Search, Download, Filter } from 'lucide-react';
import {
  INPUT_STYLE, SELECT_STYLE, TEXTAREA_STYLE,
  KpiCard, EmptyState, Modal, SectionTitle, FField, FRow,
  genId, genCode
} from './shared.jsx';

const EMPTY_FORM = { code: '', nom: '', actif: 'Oui', description: '' };

function CatForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(() =>
    initial ? { ...initial } : { ...EMPTY_FORM, code: genCode('CAT') }
  );
  const [errors, setErrors] = useState({});
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  function handleSubmit(e) {
    e.preventDefault();
    const err = {};
    if (!form.nom.trim()) err.nom = 'Requis';
    if (!form.code.trim()) err.code = 'Requis';
    if (Object.keys(err).length) { setErrors(err); return; }
    onSave(form);
  }

  return (
    <form onSubmit={handleSubmit}>
      <SectionTitle icon={<Tag size={12} />}>Informations catégorie</SectionTitle>
      <FRow>
        <FField label="Code" required>
          <input value={form.code} onChange={e => set('code', e.target.value)}
            placeholder="Ex: CAT-12345"
            style={{ ...INPUT_STYLE, borderColor: errors.code ? 'var(--red)' : 'var(--border)' }} />
          {errors.code && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors.code}</div>}
        </FField>
        <FField label="Nom catégorie" required>
          <input value={form.nom} onChange={e => set('nom', e.target.value)}
            placeholder="Ex: Matériaux de construction..."
            style={{ ...INPUT_STYLE, borderColor: errors.nom ? 'var(--red)' : 'var(--border)' }} />
          {errors.nom && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors.nom}</div>}
        </FField>
        <FField label="Actif">
          <select value={form.actif} onChange={e => set('actif', e.target.value)} style={SELECT_STYLE}>
            <option value="Oui">Oui</option>
            <option value="Non">Non</option>
          </select>
        </FField>
      </FRow>
      <div style={{ marginBottom: 20 }}>
        <FField label="Description">
          <textarea value={form.description} onChange={e => set('description', e.target.value)}
            placeholder="Description de la catégorie..." style={TEXTAREA_STYLE} />
        </FField>
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Annuler</button>
        <button type="submit" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Plus size={14} /> {initial ? 'Enregistrer' : 'Ajouter catégorie'}
        </button>
      </div>
    </form>
  );
}

export default function CategoriesStock({ articles, onCategoriesChange }) {
  const [cats, setCats] = useState([]);
  const [search, setSearch] = useState('');
  const [filterActif, setFilterActif] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);

  function updateCats(updater) {
    setCats(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (onCategoriesChange) onCategoriesChange(next);
      return next;
    });
  }

  const handleSave = useCallback((data) => {
    if (editItem) {
      updateCats(prev => prev.map(x => x.id === editItem.id ? { ...x, ...data } : x));
    } else {
      updateCats(prev => [...prev, { ...data, id: genId(), date_creation: new Date().toISOString().slice(0, 10) }]);
    }
    setShowModal(false); setEditItem(null);
  }, [editItem]);

  function handleDelete(id) {
    if (window.confirm('Supprimer cette catégorie ?')) updateCats(prev => prev.filter(x => x.id !== id));
  }
  function toggleActif(id) {
    updateCats(prev => prev.map(x => x.id === id ? { ...x, actif: x.actif === 'Oui' ? 'Non' : 'Oui' } : x));
  }

  const filtered = cats.filter(x => {
    const q = search.toLowerCase();
    return (!q || x.nom.toLowerCase().includes(q) || x.code.toLowerCase().includes(q))
      && (!filterActif || x.actif === filterActif);
  });

  const total    = cats.length;
  const actives  = cats.filter(x => x.actif === 'Oui').length;
  const inactives = cats.filter(x => x.actif === 'Non').length;
  const articlesLies = (articles || []).length;

  function getArticlesCount(catNom) {
    return (articles || []).filter(a => a.categorie === catNom).length;
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header flex-between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title">CATÉGORIES STOCK</h1>
          <p className="page-subtitle">Gestion des catégories et types d'articles.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setShowFilters(f => !f)}>
            <Filter size={14} /> Filtres
          </button>
          <button className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Download size={14} /> Export
          </button>
          <button className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => { setEditItem(null); setShowModal(true); }}>
            <Plus size={15} /> Ajouter catégorie
          </button>
        </div>
      </div>

      <div className="stat-grid finance-kpi-grid" style={{ marginBottom: 20 }}>
        <KpiCard icon={<Tag size={17} />}    label="Total catégories"  value={total}       color="grey"   />
        <KpiCard icon={<Tag size={17} />}    label="Actives"           value={actives}     color="green"  />
        <KpiCard icon={<Tag size={17} />}    label="Inactives"         value={inactives}   color="orange" />
        <KpiCard icon={<Tag size={17} />}    label="Articles liés"     value={articlesLies} color="blue"  />
      </div>

      {showFilters ? (
        <div className="card" style={{ marginBottom: 16, padding: '14px 20px' }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 180, position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nom, code..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
            </div>
            <select value={filterActif} onChange={e => setFilterActif(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 140 }}>
              <option value="">Tous statuts</option>
              <option value="Oui">Actif</option>
              <option value="Non">Inactif</option>
            </select>
            <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFilterActif(''); }}>Réinitialiser</button>
          </div>
        </div>
      ) : (
        <div className="card" style={{ marginBottom: 12, padding: '10px 14px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher une catégorie..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        {filtered.length === 0 ? (
          <EmptyState icon={<Tag size={24} />} title="Aucune catégorie" sub="Créez vos catégories de stock" action="Ajouter catégorie" onAction={() => { setEditItem(null); setShowModal(true); }} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Code</th>
                  <th>Nom</th>
                  <th>Statut</th>
                  <th>Description</th>
                  <th>Articles liés</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(x => (
                  <tr key={x.id}>
                    <td><span style={{ fontFamily: 'var(--font-head)', fontSize: '0.75rem', color: 'var(--text-3)' }}>#{String(x.id).slice(-4)}</span></td>
                    <td><span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.82rem', color: 'var(--red)' }}>{x.code}</span></td>
                    <td data-label="Nom"><span style={{ fontWeight: 600 }}>{x.nom}</span></td>
                    <td data-label="Statut">
                      <span className={'badge ' + (x.actif === 'Oui' ? 'badge-green' : 'badge-grey')} style={{ fontSize: '0.72rem' }}>
                        {x.actif === 'Oui' ? 'Actif' : 'Inactif'}
                      </span>
                    </td>
                    <td data-label="Description" style={{ fontSize: '0.83rem', color: 'var(--text-2)' }}>
                      {x.description ? (x.description.length > 60 ? x.description.slice(0, 60) + '...' : x.description) : '—'}
                    </td>
                    <td data-label="Articles">
                      <span style={{ fontWeight: 700 }}>{getArticlesCount(x.nom)}</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 3 }}>
                        <button className="btn btn-ghost btn-sm" title="Modifier" onClick={() => { setEditItem(x); setShowModal(true); }}><Edit2 size={13} /></button>
                        <button className="btn btn-ghost btn-sm" title={x.actif === 'Oui' ? 'Désactiver' : 'Activer'} onClick={() => toggleActif(x.id)}><ToggleLeft size={13} /></button>
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

      <Modal open={showModal} onClose={() => { setShowModal(false); setEditItem(null); }} title={editItem ? 'Modifier la catégorie' : 'Nouvelle catégorie'} width={600}>
        <CatForm initial={editItem} onSave={handleSave} onCancel={() => { setShowModal(false); setEditItem(null); }} />
      </Modal>
    </div>
  );
}

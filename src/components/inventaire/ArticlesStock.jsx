/**
 * ArticlesStock.jsx — Articles de stock ERP CITYMO
 */
import { useState, useCallback } from 'react';
import { Package, Plus, Edit2, Trash2, Eye, Search, Filter, Download, ChevronLeft, ArrowUpDown, FileText } from 'lucide-react';
import {
  INPUT_STYLE, SELECT_STYLE, TEXTAREA_STYLE, UNITES, ETATS_ARTICLE,
  KpiCard, EmptyState, Modal, SectionTitle, FField, FRow, UploadField,
  genId, genCode, formatMAD, StockAlert
} from './shared.jsx';

const EMPTY_FORM = {
  code: '', designation: '', type: '', categorie_id: '', unite: 'U',
  valeur: '', stock_minimum: '', etat: 'Neuf', emplacement: '',
  depot_id: '', projet_lie: '', description: '', notes: ''
};

function ArticleForm({ initial, categories, depots, onSave, onCancel }) {
  const [form, setForm] = useState(() =>
    initial ? { ...initial } : { ...EMPTY_FORM, code: genCode('ART') }
  );
  const [errors, setErrors] = useState({});
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  function validate() {
    const e = {};
    if (!form.designation.trim()) e.designation = 'Requis';
    if (!form.code.trim()) e.code = 'Requis';
    return e;
  }

  function handleSubmit(ev) {
    ev.preventDefault();
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    onSave(form);
  }

  return (
    <form onSubmit={handleSubmit}>
      <SectionTitle icon={<Package size={12} />}>Informations article</SectionTitle>
      <FRow>
        <FField label="Code article" required>
          <input value={form.code} onChange={e => set('code', e.target.value)}
            style={{ ...INPUT_STYLE, borderColor: errors.code ? 'var(--red)' : 'var(--border)', fontFamily: 'var(--font-head)', fontWeight: 700 }} />
          {errors.code && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors.code}</div>}
        </FField>
        <FField label="Désignation" required>
          <input value={form.designation} onChange={e => set('designation', e.target.value)}
            placeholder="Nom de l'article..."
            style={{ ...INPUT_STYLE, borderColor: errors.designation ? 'var(--red)' : 'var(--border)' }} />
          {errors.designation && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors.designation}</div>}
        </FField>
        <FField label="Type">
          <input value={form.type} onChange={e => set('type', e.target.value)}
            placeholder="Ex: Consommable, Outillage..." style={INPUT_STYLE} />
        </FField>
        <FField label="Catégorie">
          <select value={form.categorie_id} onChange={e => set('categorie_id', e.target.value)} style={SELECT_STYLE}>
            <option value="">— Sélectionner —</option>
            {(categories || []).filter(c => c.actif === 'Oui').map(c => (
              <option key={c.id} value={c.id}>{c.nom}</option>
            ))}
          </select>
        </FField>
        <FField label="Unité">
          <select value={form.unite} onChange={e => set('unite', e.target.value)} style={SELECT_STYLE}>
            {UNITES.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </FField>
      </FRow>

      <SectionTitle>Valeur & Stock</SectionTitle>
      <FRow>
        <FField label="Valeur unitaire (MAD)">
          <input type="number" step="0.01" value={form.valeur} onChange={e => set('valeur', e.target.value)}
            placeholder="0.00" style={INPUT_STYLE} />
        </FField>
        <FField label="Stock minimum">
          <input type="number" value={form.stock_minimum} onChange={e => set('stock_minimum', e.target.value)}
            placeholder="Seuil alerte..." style={INPUT_STYLE} />
        </FField>
        <FField label="État">
          <select value={form.etat} onChange={e => set('etat', e.target.value)} style={SELECT_STYLE}>
            {ETATS_ARTICLE.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </FField>
      </FRow>

      <SectionTitle>Emplacement & Liaisons</SectionTitle>
      <FRow>
        <FField label="Emplacement">
          <input value={form.emplacement} onChange={e => set('emplacement', e.target.value)}
            placeholder="Ex: Étagère A3, Zone B..." style={INPUT_STYLE} />
        </FField>
        <FField label="Dépôt lié">
          <select value={form.depot_id} onChange={e => set('depot_id', e.target.value)} style={SELECT_STYLE}>
            <option value="">— Sélectionner —</option>
            {(depots || []).filter(d => d.statut === 'Actif').map(d => (
              <option key={d.id} value={d.id}>{d.nom}</option>
            ))}
          </select>
        </FField>
        <FField label="Projet lié">
          <input value={form.projet_lie} onChange={e => set('projet_lie', e.target.value)}
            placeholder="Nom du projet..." style={INPUT_STYLE} />
        </FField>
      </FRow>

      <SectionTitle>Description & Notes</SectionTitle>
      <div style={{ marginBottom: 14 }}>
        <FField label="Description">
          <textarea value={form.description} onChange={e => set('description', e.target.value)}
            placeholder="Description de l'article..." style={TEXTAREA_STYLE} />
        </FField>
      </div>
      <div style={{ marginBottom: 16 }}>
        <FField label="Notes internes">
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
            placeholder="Notes, remarques..." style={{ ...TEXTAREA_STYLE, minHeight: 56 }} />
        </FField>
      </div>

      <SectionTitle>Documents & Médias</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10, marginBottom: 20 }}>
        <UploadField label="Photo article" />
        <UploadField label="Fiche technique" />
        <UploadField label="Documents annexes" />
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Annuler</button>
        <button type="submit" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Plus size={14} /> {initial ? 'Enregistrer' : 'Ajouter article'}
        </button>
      </div>
    </form>
  );
}

function DetailArticle({ article, categories, depots, onBack, onEdit }) {
  const cat = (categories || []).find(c => String(c.id) === String(article.categorie_id));
  const depot = (depots || []).find(d => String(d.id) === String(article.depot_id));

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <button className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={onBack}>
          <ChevronLeft size={15} /> Retour
        </button>
        <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1rem', flex: 1 }}>
          {article.code} — {article.designation}
        </h2>
        <span className={'badge ' + (article.etat === 'Neuf' ? 'badge-green' : article.etat === 'Utilisé' ? 'badge-blue' : 'badge-orange')} style={{ fontSize: '0.72rem' }}>{article.etat}</span>
        <button className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={onEdit}>
          <Edit2 size={13} /> Modifier
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16, alignItems: 'start' }}>
        <div>
          <div className="card" style={{ marginBottom: 14 }}>
            <SectionTitle icon={<Package size={12} />}>Informations générales</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, fontSize: '0.84rem' }}>
              {[
                ['Code', article.code],
                ['Désignation', article.designation],
                ['Type', article.type],
                ['Catégorie', cat ? cat.nom : article.categorie_id],
                ['Unité', article.unite],
                ['État', article.etat],
                ['Emplacement', article.emplacement],
                ['Dépôt', depot ? depot.nom : article.depot_id],
                ['Projet lié', article.projet_lie],
              ].map(([l, v]) => (
                <div key={l}>
                  <span style={{ color: 'var(--text-3)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>{l}</span>
                  <div style={{ fontWeight: 500 }}>{v || '—'}</div>
                </div>
              ))}
            </div>
          </div>
          {article.description && (
            <div className="card">
              <SectionTitle>Description</SectionTitle>
              <p style={{ fontSize: '0.84rem', color: 'var(--text-2)', margin: 0 }}>{article.description}</p>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card">
            <SectionTitle>Stock & Valeur</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <span style={{ color: 'var(--text-3)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>Stock actuel</span>
                <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.4rem', color: 'var(--text)' }}>
                  {article.stock_actuel || 0}
                  <span style={{ fontSize: '0.9rem', fontWeight: 500, marginLeft: 6, color: 'var(--text-3)' }}>{article.unite}</span>
                  <StockAlert qte={article.stock_actuel || 0} seuil={article.stock_minimum} />
                </div>
              </div>
              <div>
                <span style={{ color: 'var(--text-3)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>Stock minimum</span>
                <div style={{ fontWeight: 600 }}>{article.stock_minimum || '—'} {article.stock_minimum ? article.unite : ''}</div>
              </div>
              <div>
                <span style={{ color: 'var(--text-3)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>Valeur unitaire</span>
                <div style={{ fontWeight: 700, color: 'var(--red)' }}>{article.valeur ? formatMAD(article.valeur) : '—'}</div>
              </div>
              <div>
                <span style={{ color: 'var(--text-3)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>Valeur totale stock</span>
                <div style={{ fontWeight: 700, color: 'var(--red)' }}>
                  {(article.valeur && article.stock_actuel) ? formatMAD(Number(article.valeur) * Number(article.stock_actuel)) : '—'}
                </div>
              </div>
            </div>
          </div>
          <div className="card">
            <SectionTitle>Date création</SectionTitle>
            <div style={{ fontSize: '0.84rem' }}>{article.date_creation || '—'}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ArticlesStock({ categories, depots, onArticlesChange }) {
  const [articles, setArticles] = useState([]);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterEtat, setFilterEtat] = useState('');
  const [filterDepot, setFilterDepot] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const today = new Date().toISOString().slice(0, 10);

  function updateArticles(updater) {
    setArticles(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (onArticlesChange) onArticlesChange(next);
      return next;
    });
  }

  const handleSave = useCallback((data) => {
    if (editItem) {
      updateArticles(prev => prev.map(x => x.id === editItem.id ? { ...x, ...data } : x));
      if (detailId === editItem.id) setDetailId(null);
    } else {
      updateArticles(prev => [...prev, { ...data, id: genId(), stock_actuel: 0, date_creation: today }]);
    }
    setShowModal(false); setEditItem(null);
  }, [editItem, today]);

  function handleDelete(id) {
    if (window.confirm("Supprimer cet article ?")) { updateArticles(prev => prev.filter(x => x.id !== id)); setDetailId(null); }
  }

  const filtered = articles.filter(x => {
    const q = search.toLowerCase();
    const cat = (categories || []).find(c => String(c.id) === String(x.categorie_id));
    const depot = (depots || []).find(d => String(d.id) === String(x.depot_id));
    return (!q || x.code.toLowerCase().includes(q) || x.designation.toLowerCase().includes(q) || (cat?.nom || '').toLowerCase().includes(q))
      && (!filterCat || String(x.categorie_id) === String(filterCat))
      && (!filterEtat || x.etat === filterEtat)
      && (!filterDepot || String(x.depot_id) === String(filterDepot));
  });

  const total        = articles.length;
  const stockFaible  = articles.filter(x => x.stock_minimum && x.stock_actuel <= x.stock_minimum).length;
  const articlesNeuf = articles.filter(x => x.etat === 'Neuf').length;
  const articlesUsed = articles.filter(x => x.etat === 'Utilisé').length;
  const valeurTotale = articles.reduce((s, a) => s + ((Number(a.valeur) || 0) * (Number(a.stock_actuel) || 0)), 0);

  if (detailId) {
    const art = articles.find(x => x.id === detailId);
    if (!art) { setDetailId(null); return null; }
    return (
      <DetailArticle
        article={art} categories={categories} depots={depots}
        onBack={() => setDetailId(null)}
        onEdit={() => { setEditItem(art); setShowModal(true); setDetailId(null); }}
      />
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header flex-between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title">ARTICLES DE STOCK</h1>
          <p className="page-subtitle">Gestion des articles, états et niveaux de stock.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setShowFilters(f => !f)}><Filter size={14} /> Filtres</button>
          <button className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Download size={14} /> Export</button>
          <button className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => { setEditItem(null); setShowModal(true); }}>
            <Plus size={15} /> Ajouter article
          </button>
        </div>
      </div>

      <div className="stat-grid finance-kpi-grid" style={{ marginBottom: 20 }}>
        <KpiCard icon={<Package size={17} />}     label="Total articles"    value={total}              color="grey"   />
        <KpiCard icon={<Package size={17} />}     label="Stock faible"      value={stockFaible}        color="orange" />
        <KpiCard icon={<Package size={17} />}     label="Articles neufs"    value={articlesNeuf}       color="green"  />
        <KpiCard icon={<Package size={17} />}     label="Articles utilisés" value={articlesUsed}       color="blue"   />
        <KpiCard icon={<Package size={17} />}     label="Valeur totale"     value={formatMAD(valeurTotale)} color="red" />
      </div>

      {showFilters ? (
        <div className="card" style={{ marginBottom: 16, padding: '14px 20px' }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Code, désignation, catégorie..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
            </div>
            <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 170 }}>
              <option value="">Toutes catégories</option>
              {(categories || []).map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
            <select value={filterEtat} onChange={e => setFilterEtat(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 140 }}>
              <option value="">Tous états</option>
              {ETATS_ARTICLE.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
            <select value={filterDepot} onChange={e => setFilterDepot(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 160 }}>
              <option value="">Tous dépôts</option>
              {(depots || []).map(d => <option key={d.id} value={d.id}>{d.nom}</option>)}
            </select>
            <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFilterCat(''); setFilterEtat(''); setFilterDepot(''); }}>Réinitialiser</button>
          </div>
        </div>
      ) : (
        <div className="card" style={{ marginBottom: 12, padding: '10px 14px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un article..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        {filtered.length === 0 ? (
          <EmptyState icon={<Package size={24} />} title="Aucun article" sub="Ajoutez vos premiers articles de stock" action="Ajouter article" onAction={() => { setEditItem(null); setShowModal(true); }} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Désignation</th>
                  <th>Catégorie</th>
                  <th>Type</th>
                  <th>Unité</th>
                  <th>Valeur MAD</th>
                  <th>Stock actuel</th>
                  <th>Min.</th>
                  <th>État</th>
                  <th>Emplacement</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(x => {
                  const cat = (categories || []).find(c => String(c.id) === String(x.categorie_id));
                  return (
                    <tr key={x.id} style={{ cursor: 'pointer' }} onClick={() => setDetailId(x.id)}>
                      <td>
                        <span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.82rem', color: 'var(--red)' }}>{x.code}</span>
                      </td>
                      <td data-label="Désignation" style={{ fontWeight: 600 }}>{x.designation}</td>
                      <td data-label="Catégorie">
                        {cat ? <span className="badge badge-blue" style={{ fontSize: '0.7rem' }}>{cat.nom}</span> : '—'}
                      </td>
                      <td data-label="Type" style={{ fontSize: '0.82rem', color: 'var(--text-2)' }}>{x.type || '—'}</td>
                      <td data-label="Unité">{x.unite}</td>
                      <td data-label="Valeur" style={{ fontFamily: 'var(--font-head)', fontWeight: 700 }}>{x.valeur ? formatMAD(x.valeur) : '—'}</td>
                      <td data-label="Stock actuel">
                        <span style={{ fontWeight: 700, color: (x.stock_minimum && x.stock_actuel <= x.stock_minimum) ? 'var(--red)' : 'var(--text)' }}>
                          {x.stock_actuel || 0}
                        </span>
                        <StockAlert qte={x.stock_actuel || 0} seuil={x.stock_minimum} />
                      </td>
                      <td data-label="Min." style={{ color: 'var(--text-3)' }}>{x.stock_minimum || '—'}</td>
                      <td data-label="État">
                        <span className={'badge ' + (x.etat === 'Neuf' ? 'badge-green' : x.etat === 'Utilisé' ? 'badge-blue' : 'badge-orange')} style={{ fontSize: '0.7rem' }}>{x.etat}</span>
                      </td>
                      <td data-label="Emplacement" style={{ fontSize: '0.82rem', color: 'var(--text-2)' }}>{x.emplacement || '—'}</td>
                      <td onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 3 }}>
                          <button className="btn btn-secondary btn-sm" title="Voir" onClick={() => setDetailId(x.id)}><Eye size={13} /></button>
                          <button className="btn btn-ghost btn-sm" title="Modifier" onClick={() => { setEditItem(x); setShowModal(true); }}><Edit2 size={13} /></button>
                          <button className="btn btn-ghost btn-sm" title="Supprimer" onClick={() => handleDelete(x.id)} style={{ color: 'var(--red)' }}><Trash2 size={13} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={showModal} onClose={() => { setShowModal(false); setEditItem(null); }} title={editItem ? "Modifier l'article" : "Nouvel article de stock"} width={760}>
        <ArticleForm initial={editItem} categories={categories} depots={depots} onSave={handleSave} onCancel={() => { setShowModal(false); setEditItem(null); }} />
      </Modal>
    </div>
  );
}

/**
 * ArticlesStock.jsx — Articles de stock ERP CITYMO (Supabase)
 */
import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Package, Plus, Edit2, Trash2, Eye, Search, Filter, Download,
  ChevronLeft, Loader2, RefreshCw, Archive, History, CheckCircle2,
} from 'lucide-react';
import { useStockArticles } from '../../hooks/useStockArticles';
import { useStockCategories } from '../../hooks/useStockCategories';
import { listStockWarehouses } from '../../services/inventaire/stockWarehouses';
import { listProjects } from '../../services/projects/projects';
import { generateStockArticleCode } from '../../services/inventaire/stockArticles';
import {
  INPUT_STYLE, SELECT_STYLE, TEXTAREA_STYLE, UNITES,
  TYPES_ARTICLE_STOCK, ETATS_ARTICLE_STOCK, STATUTS_ARTICLE_STOCK, EMPLACEMENTS_STOCK,
  KpiCard, EmptyState, Modal, SectionTitle, FField, FRow,
  formatMAD, StockAlert,
} from './shared.jsx';

const PAGE_SIZE = 15;

const EMPTY_FORM = {
  code: '',
  designation: '',
  type: '',
  categorie_id: '',
  numero_serie: '',
  unite: 'U',
  valeur: '',
  stock_minimum: '',
  etat: 'Neuf',
  statut: 'Actif',
  localisation_id: '',
  emplacement: '',
  description: '',
  notes: '',
  quantite_initiale: '',
  localisation_initiale: '',
  emplacement_initial: '',
};

function localisationLabel(id, warehouses, projects) {
  if (!id) return '—';
  if (String(id).startsWith('depot:')) {
    const w = warehouses.find((d) => String(d.id) === String(id).replace('depot:', ''));
    return w ? `Dépôt : ${w.nom}` : id;
  }
  if (String(id).startsWith('project:')) {
    const p = projects.find((x) => String(x.id) === String(id).replace('project:', ''));
    return p ? `Projet : ${p.nom}` : id;
  }
  return id;
}

function ArticleForm({ initial, categories, warehouses, projects, onSave, onCancel, saving }) {
  const [form, setForm] = useState(() => {
    if (!initial) return { ...EMPTY_FORM };
    return {
      ...EMPTY_FORM,
      ...initial,
      code: initial.code || initial.reference || '',
      localisation_id: initial.localisation_id
        || (initial.default_project_id ? `project:${initial.default_project_id}` : '')
        || (initial.default_warehouse_id ? `depot:${initial.default_warehouse_id}` : '')
        || (initial.depot_id ? `depot:${initial.depot_id}` : '')
        || (initial.projet_lie ? `project:${initial.projet_lie}` : ''),
    };
  });
  const [errors, setErrors] = useState({});
  const [codeLoading, setCodeLoading] = useState(false);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const isEdit = !!initial?.id;

  useEffect(() => {
    if (isEdit || form.code) return;
    setCodeLoading(true);
    generateStockArticleCode()
      .then((code) => setForm((p) => (p.code ? p : { ...p, code })))
      .catch(() => {})
      .finally(() => setCodeLoading(false));
  }, [isEdit, form.code]);

  function validate() {
    const e = {};
    if (!form.designation?.trim()) e.designation = 'Requis';
    if (!form.code?.trim()) e.code = 'Requis';
    return e;
  }

  function handleSubmit(ev) {
    ev.preventDefault();
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    onSave(form);
  }

  const locationOptions = [
    ...(warehouses || []).map((w) => ({ value: `depot:${w.id}`, label: `Dépôt — ${w.nom}` })),
    ...(projects || []).map((p) => ({ value: `project:${p.id}`, label: `Projet — ${p.nom || p.ref}` })),
  ];

  function emplacementOptions(current) {
    const v = (current || '').trim();
    if (v && !EMPLACEMENTS_STOCK.includes(v)) return [v, ...EMPLACEMENTS_STOCK];
    return EMPLACEMENTS_STOCK;
  }

  return (
    <form onSubmit={handleSubmit}>
      <SectionTitle icon={<Package size={12} />}>Informations article</SectionTitle>
      <FRow>
        <FField label="Code article" required>
          <input
            value={form.code}
            onChange={(e) => set('code', e.target.value)}
            readOnly={isEdit}
            placeholder={codeLoading ? 'Génération…' : 'ART-2026-0001'}
            style={{ ...INPUT_STYLE, borderColor: errors.code ? 'var(--red)' : 'var(--border)', fontFamily: 'var(--font-head)', fontWeight: 700 }}
          />
          {errors.code && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors.code}</div>}
        </FField>
        <FField label="Désignation" required>
          <input
            value={form.designation}
            onChange={(e) => set('designation', e.target.value)}
            placeholder="Nom de l'article..."
            style={{ ...INPUT_STYLE, borderColor: errors.designation ? 'var(--red)' : 'var(--border)' }}
          />
          {errors.designation && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors.designation}</div>}
        </FField>
        <FField label="Type">
          <select value={form.type} onChange={(e) => set('type', e.target.value)} style={SELECT_STYLE}>
            <option value="">— Sélectionner —</option>
            {TYPES_ARTICLE_STOCK.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </FField>
        <FField label="Catégorie">
          <select value={form.categorie_id} onChange={(e) => set('categorie_id', e.target.value)} style={SELECT_STYLE}>
            <option value="">— Sélectionner —</option>
            {(categories || []).filter((c) => c.actif === 'Oui' || c.is_active !== false).map((c) => (
              <option key={c.id} value={c.id}>{c.nom || c.name}</option>
            ))}
          </select>
        </FField>
        <FField label="N° de série">
          <input value={form.numero_serie} onChange={(e) => set('numero_serie', e.target.value)} placeholder="Optionnel" style={INPUT_STYLE} />
        </FField>
        <FField label="Unité">
          <select value={form.unite} onChange={(e) => set('unite', e.target.value)} style={SELECT_STYLE}>
            {UNITES.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </FField>
      </FRow>

      <SectionTitle>Valeur & Stock</SectionTitle>
      <FRow>
        <FField label="Valeur unitaire (MAD)">
          <input type="number" step="0.01" min="0" value={form.valeur} onChange={(e) => set('valeur', e.target.value)} placeholder="0.00" style={INPUT_STYLE} />
        </FField>
        <FField label="Stock minimum">
          <input type="number" min="0" value={form.stock_minimum} onChange={(e) => set('stock_minimum', e.target.value)} placeholder="Seuil alerte..." style={INPUT_STYLE} />
        </FField>
        <FField label="État">
          <select value={form.etat} onChange={(e) => set('etat', e.target.value)} style={SELECT_STYLE}>
            {ETATS_ARTICLE_STOCK.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </FField>
        <FField label="Statut">
          <select value={form.statut} onChange={(e) => set('statut', e.target.value)} style={SELECT_STYLE}>
            {STATUTS_ARTICLE_STOCK.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </FField>
      </FRow>

      <SectionTitle>Localisation par défaut</SectionTitle>
      <FRow>
        <FField label="Dépôt ou projet">
          <select value={form.localisation_id} onChange={(e) => set('localisation_id', e.target.value)} style={SELECT_STYLE}>
            <option value="">— Sélectionner —</option>
            {locationOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </FField>
        <FField label="Emplacement">
          <select value={form.emplacement} onChange={(e) => set('emplacement', e.target.value)} style={SELECT_STYLE}>
            <option value="">— Sélectionner —</option>
            {emplacementOptions(form.emplacement).map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
        </FField>
      </FRow>

      {!isEdit && (
        <>
          <SectionTitle>Stock initial (optionnel)</SectionTitle>
          <FRow>
            <FField label="Quantité initiale">
              <input type="number" min="0" step="0.001" value={form.quantite_initiale} onChange={(e) => set('quantite_initiale', e.target.value)} placeholder="0" style={INPUT_STYLE} />
            </FField>
            <FField label="Localisation initiale">
              <select value={form.localisation_initiale} onChange={(e) => set('localisation_initiale', e.target.value)} style={SELECT_STYLE}>
                <option value="">— Même que défaut —</option>
                {locationOptions.map((o) => <option key={`init-${o.value}`} value={o.value}>{o.label}</option>)}
              </select>
            </FField>
            <FField label="Emplacement initial">
              <select value={form.emplacement_initial} onChange={(e) => set('emplacement_initial', e.target.value)} style={SELECT_STYLE}>
                <option value="">— Même que défaut —</option>
                {emplacementOptions(form.emplacement_initial).map((e) => (
                  <option key={`init-${e}`} value={e}>{e}</option>
                ))}
              </select>
            </FField>
          </FRow>
        </>
      )}

      <SectionTitle>Description & Notes</SectionTitle>
      <div style={{ marginBottom: 14 }}>
        <FField label="Description">
          <textarea value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Description de l'article..." style={TEXTAREA_STYLE} />
        </FField>
      </div>
      <div style={{ marginBottom: 16 }}>
        <FField label="Notes internes">
          <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Notes, remarques..." style={{ ...TEXTAREA_STYLE, minHeight: 56 }} />
        </FField>
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>Annuler</button>
        <button type="submit" className="btn btn-primary" disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {saving ? <Loader2 size={14} className="cin-spin" /> : <Plus size={14} />}
          {initial?.id ? 'Enregistrer' : 'Ajouter article'}
        </button>
      </div>
    </form>
  );
}

function DetailArticle({ article, categories, warehouses, projects, movements, onBack, onEdit, onHistory, onArchive }) {
  const cat = (categories || []).find((c) => String(c.id) === String(article.categorie_id));
  const locLabel = localisationLabel(article.localisation_id, warehouses, projects);

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={onBack}>
          <ChevronLeft size={15} /> Retour
        </button>
        <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1rem', flex: 1 }}>
          {article.code} — {article.designation}
        </h2>
        <span className={`badge ${article.etat === 'Neuf' ? 'badge-green' : article.etat === 'Utilisé' ? 'badge-blue' : 'badge-orange'}`} style={{ fontSize: '0.72rem' }}>{article.etat}</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onHistory}><History size={13} /> Historique</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onEdit}><Edit2 size={13} /> Modifier</button>
        {article.statut !== 'Archivé' && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onArchive}><Archive size={13} /> Archiver</button>
        )}
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
                ['Catégorie', cat ? (cat.nom || cat.name) : '—'],
                ['N° série', article.numero_serie],
                ['Unité', article.unite],
                ['État', article.etat],
                ['Statut', article.statut],
                ['Localisation', locLabel],
                ['Emplacement', article.emplacement],
              ].map(([l, v]) => (
                <div key={l}>
                  <span style={{ color: 'var(--text-3)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>{l}</span>
                  <div style={{ fontWeight: 500 }}>{v || '—'}</div>
                </div>
              ))}
            </div>
          </div>
          {article.description && (
            <div className="card" style={{ marginBottom: 14 }}>
              <SectionTitle>Description</SectionTitle>
              <p style={{ fontSize: '0.84rem', color: 'var(--text-2)', margin: 0, whiteSpace: 'pre-wrap' }}>{article.description}</p>
            </div>
          )}
          {movements?.length > 0 && (
            <div className="card">
              <SectionTitle icon={<History size={12} />}>Derniers mouvements</SectionTitle>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Réf.</th>
                      <th>Type</th>
                      <th>Qté</th>
                      <th>Date</th>
                      <th>Motif</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.slice(0, 10).map((m) => (
                      <tr key={m.id}>
                        <td style={{ fontSize: '0.8rem' }}>{m.ref || '—'}</td>
                        <td style={{ fontSize: '0.8rem' }}>{m.type}</td>
                        <td style={{ fontWeight: 700 }}>{m.quantite}</td>
                        <td style={{ fontSize: '0.8rem' }}>{m.date}</td>
                        <td style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>{m.motif || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card">
            <SectionTitle>Stock & Valeur</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <span style={{ color: 'var(--text-3)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>Stock disponible</span>
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

function MobileArticleRow({ item, catName, locLabel, onView, onEdit, onArchive, onHistory, onDelete }) {
  return (
    <div className="inv-stock-mobile-row">
      <div className="inv-stock-mobile-icon" aria-hidden><Package size={18} style={{ color: 'var(--red)' }} /></div>
      <button type="button" className="inv-stock-mobile-name" onClick={onView}>
        <strong>{item.code}</strong>
        <span>{item.designation}</span>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>{catName} · Stock {item.stock_actuel || 0} {item.unite}</span>
      </button>
      <span className={`inv-stock-mobile-status ${item.statut === 'Actif' ? 'is-active' : 'is-inactive'}`}>{item.statut}</span>
      <div className="inv-stock-mobile-actions">
        <button type="button" className="btn btn-ghost btn-sm inv-stock-mobile-btn" title="Voir" onClick={onView}><Eye size={14} /></button>
        <button type="button" className="btn btn-ghost btn-sm inv-stock-mobile-btn" title="Modifier" onClick={onEdit}><Edit2 size={14} /></button>
        <button type="button" className="btn btn-ghost btn-sm inv-stock-mobile-btn" title="Historique" onClick={onHistory}><History size={14} /></button>
        <button type="button" className="btn btn-ghost btn-sm inv-stock-mobile-btn" title="Archiver" onClick={onArchive}><Archive size={14} /></button>
        <button type="button" className="btn btn-ghost btn-sm inv-stock-mobile-btn inv-stock-mobile-btn--danger" title="Supprimer" onClick={onDelete}><Trash2 size={14} /></button>
      </div>
    </div>
  );
}

export default function ArticlesStock({ onArticlesChange }) {
  const {
    records: articles, loading, saving, error, success, configured,
    reload, save, archive, remove, getMovements, importCatalog,
    removeDuplicates, findDuplicates,
  } = useStockArticles();
  const { records: categories } = useStockCategories();

  const [warehouses, setWarehouses] = useState([]);
  const [projects, setProjects] = useState([]);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterEtat, setFilterEtat] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [filterLoc, setFilterLoc] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [historyId, setHistoryId] = useState(null);
  const [historyRows, setHistoryRows] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [detailMovements, setDetailMovements] = useState([]);
  const [page, setPage] = useState(1);

  useEffect(() => {
    Promise.all([
      listStockWarehouses().catch(() => []),
      listProjects().catch(() => []),
    ]).then(([w, p]) => {
      setWarehouses(w || []);
      setProjects(p || []);
    });
  }, []);

  useEffect(() => {
    if (onArticlesChange) onArticlesChange(articles);
  }, [articles, onArticlesChange]);

  useEffect(() => { setPage(1); }, [search, filterCat, filterType, filterEtat, filterStatut, filterLoc]);

  const handleSave = useCallback(async (data) => {
    const res = await save(data, editItem?.id);
    if (res.success) {
      setShowModal(false);
      setEditItem(null);
      if (detailId === editItem?.id) setDetailId(null);
    }
  }, [editItem, save, detailId]);

  async function handleArchive(id) {
    if (!window.confirm('Archiver cet article ?')) return;
    const res = await archive(id);
    if (res.success) { setDetailId(null); setHistoryId(null); }
  }

  async function handleDelete(id) {
    if (!window.confirm('Supprimer définitivement cet article ? (impossible si mouvements ou stock)')) return;
    const res = await remove(id);
    if (res.success) { setDetailId(null); setHistoryId(null); }
  }

  async function openHistory(id) {
    setHistoryId(id);
    setHistoryLoading(true);
    setHistoryRows(await getMovements(id));
    setHistoryLoading(false);
  }

  useEffect(() => {
    if (!detailId) { setDetailMovements([]); return; }
    getMovements(detailId).then(setDetailMovements);
  }, [detailId, getMovements]);

  const filtered = useMemo(() => articles.filter((x) => {
    const q = search.toLowerCase();
    const cat = categories.find((c) => String(c.id) === String(x.categorie_id));
    const catName = (cat?.nom || cat?.name || '').toLowerCase();
    const loc = x.localisation_id || '';
    return (!q || x.code.toLowerCase().includes(q) || x.designation.toLowerCase().includes(q) || catName.includes(q))
      && (!filterCat || String(x.categorie_id) === String(filterCat))
      && (!filterType || x.type === filterType)
      && (!filterEtat || x.etat === filterEtat)
      && (!filterStatut || x.statut === filterStatut)
      && (!filterLoc || loc === filterLoc);
  }), [articles, search, filterCat, filterType, filterEtat, filterStatut, filterLoc, categories]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const total = articles.length;
  const duplicateInfo = useMemo(() => findDuplicates(articles), [articles, findDuplicates]);
  const stockFaible = articles.filter((x) => x.stock_minimum && x.stock_actuel <= x.stock_minimum).length;
  const articlesNeuf = articles.filter((x) => x.etat === 'Neuf').length;
  const articlesUsed = articles.filter((x) => x.etat === 'Utilisé').length;
  const valeurTotale = articles.reduce((s, a) => s + ((Number(a.valeur) || 0) * (Number(a.stock_actuel) || 0)), 0);

  const locationOptions = [
    ...(warehouses || []).map((w) => ({ value: `depot:${w.id}`, label: `Dépôt — ${w.nom}` })),
    ...(projects || []).map((p) => ({ value: `project:${p.id}`, label: `Projet — ${p.nom || p.ref}` })),
  ];

  if (detailId) {
    const art = articles.find((x) => x.id === detailId);
    if (!art) { setDetailId(null); return null; }
    return (
      <DetailArticle
        article={art}
        categories={categories}
        warehouses={warehouses}
        projects={projects}
        movements={detailMovements}
        onBack={() => setDetailId(null)}
        onEdit={() => { setEditItem(art); setShowModal(true); }}
        onHistory={() => openHistory(art.id)}
        onArchive={() => handleArchive(art.id)}
      />
    );
  }

  if (loading && !articles.length) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48, gap: 10, color: 'var(--text-3)' }}>
        <Loader2 size={22} className="cin-spin" /> Chargement des articles de stock…
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {!configured && (
        <div className="card" style={{ marginBottom: 12, padding: 12, color: 'var(--red)', fontSize: '0.85rem' }}>
          Supabase non configuré — exécutez supabase/RUN_STOCK_ARTICLES_LEVELS.sql puis reconnectez-vous.
        </div>
      )}
      {error && (
        <div className="card" style={{ marginBottom: 12, padding: 12, color: 'var(--red)', fontSize: '0.85rem' }}>
          {error}
          <div style={{ marginTop: 8, fontSize: '0.8rem' }}>
            Si l&apos;import échoue : exécutez <code>RUN_STOCK_CATEGORIES.sql</code>, puis <code>RUN_STOCK_ARTICLES_LEVELS.sql</code>, puis <code>SEED_STOCK_ARTICLES_43.sql</code> dans Supabase SQL Editor.
          </div>
        </div>
      )}
      {success && (
        <div className="card" style={{ marginBottom: 12, padding: 12, color: '#2E7D32', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 8 }}>
          <CheckCircle2 size={16} /> {success}
        </div>
      )}
      {duplicateInfo.count > 0 && (
        <div className="card" style={{ marginBottom: 12, padding: 12, background: '#FFF3E0', border: '1px solid #FFB74D', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ color: '#E65100' }}>
            {duplicateInfo.count} article(s) en doublon détecté(s) (même code ou même désignation).
          </span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={saving}
            onClick={removeDuplicates}
          >
            {saving ? <Loader2 size={14} className="cin-spin" /> : null}
            Nettoyer les doublons
          </button>
        </div>
      )}

      <div className="page-header flex-between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title">ARTICLES DE STOCK</h1>
          <p className="page-subtitle">Gestion des articles, états et niveaux de stock.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={reload} disabled={loading}>
            <RefreshCw size={14} /> Actualiser
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowFilters((f) => !f)}>
            <Filter size={14} /> Filtres
          </button>
          <button type="button" className="btn btn-primary" onClick={() => { setEditItem(null); setShowModal(true); }}>
            <Plus size={15} /> Ajouter article
          </button>
        </div>
      </div>

      <div className="stat-grid finance-kpi-grid" style={{ marginBottom: 20 }}>
        <KpiCard icon={<Package size={17} />} label="Total articles" value={total} color="grey" />
        <KpiCard icon={<Package size={17} />} label="Stock faible" value={stockFaible} color="orange" />
        <KpiCard icon={<Package size={17} />} label="Articles neufs" value={articlesNeuf} color="green" />
        <KpiCard icon={<Package size={17} />} label="Articles utilisés" value={articlesUsed} color="blue" />
        <KpiCard icon={<Package size={17} />} label="Valeur totale" value={formatMAD(valeurTotale)} color="red" />
      </div>

      {showFilters ? (
        <div className="card" style={{ marginBottom: 16, padding: '14px 20px' }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Code, désignation, catégorie..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
            </div>
            <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 170 }}>
              <option value="">Toutes catégories</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.nom || c.name}</option>)}
            </select>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 140 }}>
              <option value="">Tous types</option>
              {TYPES_ARTICLE_STOCK.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={filterEtat} onChange={(e) => setFilterEtat(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 140 }}>
              <option value="">Tous états</option>
              {ETATS_ARTICLE_STOCK.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
            <select value={filterStatut} onChange={(e) => setFilterStatut(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 130 }}>
              <option value="">Tous statuts</option>
              {STATUTS_ARTICLE_STOCK.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={filterLoc} onChange={(e) => setFilterLoc(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 180 }}>
              <option value="">Toutes localisations</option>
              {locationOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFilterCat(''); setFilterType(''); setFilterEtat(''); setFilterStatut(''); setFilterLoc(''); }}>
              Réinitialiser
            </button>
          </div>
        </div>
      ) : (
        <div className="card" style={{ marginBottom: 12, padding: '10px 14px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un article..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Package size={24} />}
            title="Aucun article"
            sub={configured
              ? 'Importez le catalogue CITYMO (43 articles) ou ajoutez un article manuellement.'
              : 'Configurez Supabase puis exécutez les scripts SQL.'}
            action="Ajouter article"
            onAction={() => { setEditItem(null); setShowModal(true); }}
          />
          {configured && (
            <div style={{ textAlign: 'center', paddingBottom: 28 }}>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={saving}
                onClick={importCatalog}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
              >
                {saving ? <Loader2 size={14} className="cin-spin" /> : <Download size={14} />}
                Importer le catalogue (43 articles)
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="card inv-stock-desktop-only" style={{ padding: 0 }}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Désignation</th>
                    <th>Type</th>
                    <th>Catégorie</th>
                    <th>Unité</th>
                    <th>Valeur</th>
                    <th>Stock min.</th>
                    <th>État</th>
                    <th>Emplacement</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((x) => {
                    const cat = categories.find((c) => String(c.id) === String(x.categorie_id));
                    return (
                      <tr key={x.id}>
                        <td>
                          <span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.82rem', color: 'var(--red)' }}>{x.code}</span>
                        </td>
                        <td data-label="Désignation" style={{ fontWeight: 600 }}>{x.designation}</td>
                        <td data-label="Type" style={{ fontSize: '0.82rem' }}>{x.type || '—'}</td>
                        <td data-label="Catégorie">
                          {cat ? <span className="badge badge-blue" style={{ fontSize: '0.7rem' }}>{cat.nom || cat.name}</span> : '—'}
                        </td>
                        <td data-label="Unité">{x.unite}</td>
                        <td data-label="Valeur" style={{ fontFamily: 'var(--font-head)', fontWeight: 700 }}>{x.valeur ? formatMAD(x.valeur) : '—'}</td>
                        <td data-label="Stock min." style={{ color: 'var(--text-3)' }}>{x.stock_minimum || '—'}</td>
                        <td data-label="État">
                          <span className={`badge ${x.etat === 'Neuf' ? 'badge-green' : x.etat === 'Utilisé' ? 'badge-blue' : 'badge-orange'}`} style={{ fontSize: '0.7rem' }}>{x.etat}</span>
                        </td>
                        <td data-label="Emplacement" style={{ fontSize: '0.82rem', color: 'var(--text-2)' }}>{x.emplacement || '—'}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                            <button type="button" className="btn btn-secondary btn-sm" title="Voir" onClick={() => setDetailId(x.id)}><Eye size={13} /></button>
                            <button type="button" className="btn btn-ghost btn-sm" title="Modifier" onClick={() => { setEditItem(x); setShowModal(true); }}><Edit2 size={13} /></button>
                            <button type="button" className="btn btn-ghost btn-sm" title="Historique" onClick={() => openHistory(x.id)}><History size={13} /></button>
                            <button type="button" className="btn btn-ghost btn-sm" title="Archiver" onClick={() => handleArchive(x.id)}><Archive size={13} /></button>
                            <button type="button" className="btn btn-ghost btn-sm" title="Supprimer" onClick={() => handleDelete(x.id)} style={{ color: 'var(--red)' }}><Trash2 size={13} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card inv-stock-mobile-only inv-stock-mobile-list">
            {pageItems.map((x) => {
              const cat = categories.find((c) => String(c.id) === String(x.categorie_id));
              return (
                <MobileArticleRow
                  key={x.id}
                  item={x}
                  catName={cat ? (cat.nom || cat.name) : '—'}
                  locLabel={localisationLabel(x.localisation_id, warehouses, projects)}
                  onView={() => setDetailId(x.id)}
                  onEdit={() => { setEditItem(x); setShowModal(true); }}
                  onHistory={() => openHistory(x.id)}
                  onArchive={() => handleArchive(x.id)}
                  onDelete={() => handleDelete(x.id)}
                />
              );
            })}
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 16 }}>
              <button type="button" className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Précédent</button>
              <span style={{ fontSize: '0.84rem', color: 'var(--text-2)' }}>Page {page} / {totalPages} ({filtered.length} articles)</span>
              <button type="button" className="btn btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Suivant</button>
            </div>
          )}
        </>
      )}

      <Modal open={showModal} onClose={() => { if (!saving) { setShowModal(false); setEditItem(null); } }} title={editItem ? "Modifier l'article" : 'Nouvel article de stock'} width={760}>
        <ArticleForm
          initial={editItem}
          categories={categories}
          warehouses={warehouses}
          projects={projects}
          onSave={handleSave}
          onCancel={() => { if (!saving) { setShowModal(false); setEditItem(null); } }}
          saving={saving}
        />
      </Modal>

      <Modal open={!!historyId} onClose={() => setHistoryId(null)} title="Historique des mouvements" width={720}>
        {historyLoading ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)' }}><Loader2 size={20} className="cin-spin" /></div>
        ) : historyRows.length === 0 ? (
          <p style={{ color: 'var(--text-3)', fontSize: '0.85rem' }}>Aucun mouvement enregistré pour cet article.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Réf.</th>
                  <th>Type</th>
                  <th>Quantité</th>
                  <th>Date</th>
                  <th>Motif</th>
                </tr>
              </thead>
              <tbody>
                {historyRows.map((m) => (
                  <tr key={m.id}>
                    <td>{m.ref || '—'}</td>
                    <td>{m.type}</td>
                    <td style={{ fontWeight: 700 }}>{m.quantite}</td>
                    <td>{m.date}</td>
                    <td style={{ fontSize: '0.82rem', color: 'var(--text-2)' }}>{m.motif || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </div>
  );
}

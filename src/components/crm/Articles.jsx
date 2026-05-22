import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Package, Plus, Edit2, Trash2, Eye, Copy, Search, X,
  ChevronUp, ChevronDown, AlertCircle, Loader, Tag, DollarSign, Layers
} from 'lucide-react';
import {
  getArticles, createArticle, updateArticle, deleteArticle,
  duplicateArticle, getCategories
} from '../../services/api';

/* ── Helpers ── */
function fmtMAD(v) {
  const n = Number(v);
  if (isNaN(n)) return '-';
  return n.toLocaleString('fr-MA') + ' MAD';
}

function IS(err) {
  return {
    padding: '9px 12px',
    border: '1.5px solid ' + (err ? 'var(--red)' : 'var(--border)'),
    borderRadius: 6,
    fontSize: '0.875rem',
    background: '#fff',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    fontFamily: 'var(--font-body)',
    color: 'var(--text)',
    transition: 'border-color 0.18s',
  };
}

/* ── Constants ── */
const UNITES = ['unite', 'm2', 'ml', 'm3', 'm', 'forfait', 'heure', 'jour', 'pack'];
const TVA_OPTIONS = ['0', '7', '10', '14', '20'];
const STATUT_VALUES = ['actif', 'inactif', 'archive'];
const STATUT_LABEL = { actif: 'Actif', inactif: 'Inactif', archive: 'Archive' };
const STATUT_BADGE = { actif: 'badge-green', inactif: 'badge-orange', archive: 'badge-grey' };
const PER_PAGE = 15;

const EMPTY_FORM = {
  nom: '', categorie_id: '', description: '',
  prix_ht: '', unite: 'unite', tva: '20',
  remise: '0', statut: 'actif', reference: '',
};

/* ── Spinner ── */
function Spinner({ small }) {
  const size = small ? 16 : 28;
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: small ? 0 : '40px 0' }}>
      <div style={{ width: size, height: size, border: `${small ? 2 : 3}px solid var(--border)`, borderTopColor: 'var(--red)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  );
}

/* ── Toast ── */
function Toast({ msg, type, onClose }) {
  const t = useRef();
  useEffect(() => { t.current = setTimeout(onClose, 3500); return () => clearTimeout(t.current); }, [onClose]);
  if (!msg) return null;
  const bg = type === 'error' ? 'var(--red)' : 'var(--text)';
  return (
    <div style={{ position: 'fixed', bottom: 28, right: 28, background: bg, color: '#fff', borderRadius: 8, padding: '12px 20px', fontSize: '0.875rem', fontWeight: 600, zIndex: 9999, boxShadow: '0 4px 16px rgba(0,0,0,0.18)', maxWidth: 360 }}>
      {msg}
    </div>
  );
}

/* ── Empty State ── */
function EmptyState({ filtered, onAdd }) {
  return (
    <tr>
      <td colSpan={9} style={{ textAlign: 'center', padding: '48px 0' }}>
        <Package size={36} style={{ color: 'var(--border)', marginBottom: 12, display: 'block', margin: '0 auto 12px' }} />
        <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-2)', marginBottom: 6 }}>
          {filtered ? 'Aucun article ne correspond aux filtres.' : 'Aucun article enregistre.'}
        </div>
        {!filtered && (
          <button className="btn btn-primary btn-sm" onClick={onAdd} style={{ marginTop: 12, background: '#E65100', borderColor: '#E65100' }}>
            <Plus size={13} /> Ajouter le premier article
          </button>
        )}
      </td>
    </tr>
  );
}

/* ═══════════════════════════════════════════════
   MODAL ARTICLE (Ajout / Modification)
   ═══════════════════════════════════════════════ */
function ArticleModal({ article, categories, onClose, onSaved }) {
  const isEdit = !!article;
  const [form, setForm] = useState(isEdit ? {
    nom: article.nom || '',
    categorie_id: article.categorie_id || '',
    description: article.description || '',
    prix_ht: article.prix_ht ?? '',
    unite: article.unite || 'unite',
    tva: String(article.tva ?? '20'),
    remise: String(article.remise ?? '0'),
    statut: article.statut || 'actif',
    reference: article.reference || '',
  } : { ...EMPTY_FORM });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState('');

  function setField(k, v) { setForm(p => ({ ...p, [k]: v })); if (errors[k]) setErrors(p => ({ ...p, [k]: '' })); }

  function validate() {
    const e = {};
    if (!form.nom?.trim()) e.nom = 'Le nom est requis';
    if (!form.categorie_id) e.categorie_id = 'La categorie est requise';
    const prix = Number(form.prix_ht);
    if (form.prix_ht === '' || isNaN(prix) || prix < 0) e.prix_ht = 'Prix invalide';
    return e;
  }

  async function handleSubmit(ev) {
    ev.preventDefault();
    setApiError('');
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setSaving(true);
    const payload = {
      ...form,
      prix_ht: Number(form.prix_ht),
      remise: Number(form.remise) || 0,
      tva: Number(form.tva) || 0,
      categorie_id: Number(form.categorie_id),
    };
    try {
      let saved;
      if (isEdit) {
        saved = await updateArticle(article.id, payload);
      } else {
        saved = await createArticle(payload);
      }
      onSaved(saved || { ...payload, id: article?.id || Date.now(), created_at: new Date().toISOString() }, isEdit);
    } catch (err) {
      setApiError(err.message || "Erreur lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 620, boxShadow: '0 8px 40px rgba(0,0,0,0.2)', maxHeight: '92vh', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ padding: '18px 26px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: '#fff', zIndex: 2, borderRadius: '14px 14px 0 0' }}>
          <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.15rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {isEdit ? 'Modifier article' : 'Ajouter un article'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }}><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '22px 26px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {apiError && (
            <div style={{ background: '#FFEBEE', color: 'var(--red)', border: '1px solid rgba(211,47,47,0.25)', borderRadius: 7, padding: '10px 14px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertCircle size={15} /> {apiError}
            </div>
          )}

          {/* Section 1 – Informations principales */}
          <div>
            <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 13 }}>Informations principales</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label>Nom article *</label>
                  <input value={form.nom} onChange={e => setField('nom', e.target.value)} placeholder="Ex : Ciment Portland 50kg" style={IS(errors.nom)} autoFocus />
                  {errors.nom && <span style={{ color: 'var(--red)', fontSize: '0.75rem' }}>{errors.nom}</span>}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>Categorie *</label>
                  <select value={form.categorie_id} onChange={e => setField('categorie_id', e.target.value)} style={IS(errors.categorie_id)}>
                    <option value="">Choisir une categorie...</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
                  </select>
                  {errors.categorie_id && <span style={{ color: 'var(--red)', fontSize: '0.75rem' }}>{errors.categorie_id}</span>}
                </div>
                <div className="form-group">
                  <label>Reference article</label>
                  <input value={form.reference} onChange={e => setField('reference', e.target.value)} placeholder="Auto-generee si vide" style={IS(false)} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label>Prix unitaire HT (MAD) *</label>
                  <input type="number" min="0" step="0.01" value={form.prix_ht} onChange={e => setField('prix_ht', e.target.value)} placeholder="0.00" style={IS(errors.prix_ht)} />
                  {errors.prix_ht && <span style={{ color: 'var(--red)', fontSize: '0.75rem' }}>{errors.prix_ht}</span>}
                </div>
                <div className="form-group">
                  <label>TVA (%)</label>
                  <select value={form.tva} onChange={e => setField('tva', e.target.value)} style={IS(false)}>
                    {TVA_OPTIONS.map(t => <option key={t} value={t}>{t}%</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Remise (%)</label>
                  <input type="number" min="0" max="100" step="1" value={form.remise} onChange={e => setField('remise', e.target.value)} placeholder="0" style={IS(false)} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>Unite</label>
                  <select value={form.unite} onChange={e => setField('unite', e.target.value)} style={IS(false)}>
                    {UNITES.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Statut</label>
                  <select value={form.statut} onChange={e => setField('statut', e.target.value)} style={IS(false)}>
                    {STATUT_VALUES.map(s => <option key={s} value={s}>{STATUT_LABEL[s]}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--border)' }} />

          {/* Section 2 – Description */}
          <div>
            <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 13 }}>Description article</div>
            <div className="form-group">
              <label>Description</label>
              <textarea
                rows={5}
                value={form.description}
                onChange={e => setField('description', e.target.value)}
                placeholder="Specifications techniques, dimensions, normes, conditions d'utilisation, materiaux..."
                style={{ ...IS(false), resize: 'vertical', lineHeight: 1.65, minHeight: 110 }}
              />
              <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 4 }}>
                Utilisee dans les devis, factures et bons de livraison. Soyez precis pour une generation documentaire optimale.
              </div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--border)' }} />

          {/* Section 3 – Actions */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Fermer</button>
            <button type="submit" className="btn btn-primary" disabled={saving} style={{ background: '#E65100', borderColor: '#E65100', minWidth: 120 }}>
              {saving ? <Spinner small /> : <><Plus size={14} /> {isEdit ? 'Enregistrer' : 'Ajouter'}</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   MODAL DETAIL ARTICLE
   ═══════════════════════════════════════════════ */
function ArticleDetail({ article, catName, onClose, onEdit }) {
  const prixTTC = Number(article.prix_ht) * (1 + Number(article.tva) / 100);
  const prixRemise = Number(article.remise) > 0 ? Number(article.prix_ht) * (1 - Number(article.remise) / 100) : null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 500, boxShadow: '0 8px 40px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: '#FFF3E0', color: '#E65100', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Package size={18} />
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.05rem' }}>{article.nom}</div>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-3)' }}>{article.reference || '-'}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}><X size={20} /></button>
        </div>

        <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Badges */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <span className={'badge ' + STATUT_BADGE[article.statut]}>{STATUT_LABEL[article.statut]}</span>
            {catName && <span className="badge badge-blue">{catName}</span>}
            {article.unite && <span className="badge badge-grey">{article.unite}</span>}
            {Number(article.tva) > 0 && <span className="badge badge-orange">TVA {article.tva}%</span>}
            {Number(article.remise) > 0 && <span className="badge badge-red">Remise {article.remise}%</span>}
          </div>

          {/* Prix grid */}
          <div style={{ display: 'grid', gridTemplateColumns: prixRemise !== null ? '1fr 1fr 1fr' : '1fr 1fr', gap: 10 }}>
            <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '11px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Prix HT</div>
              <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.05rem' }}>{fmtMAD(article.prix_ht)}</div>
            </div>
            <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '11px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Prix TTC</div>
              <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.05rem', color: '#E65100' }}>{fmtMAD(prixTTC.toFixed(2))}</div>
            </div>
            {prixRemise !== null && (
              <div style={{ background: '#E8F5E9', borderRadius: 8, padding: '11px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: '0.7rem', color: '#2E7D32', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Apres remise</div>
                <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.05rem', color: '#2E7D32' }}>{fmtMAD(prixRemise.toFixed(2))}</div>
              </div>
            )}
          </div>

          {/* Description */}
          {article.description && (
            <div>
              <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Description</div>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-2)', lineHeight: 1.65, background: 'var(--bg)', borderRadius: 8, padding: '12px 14px', whiteSpace: 'pre-wrap' }}>
                {article.description}
              </div>
            </div>
          )}

          {/* Meta */}
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-3)', fontSize: '0.77rem', paddingTop: 4 }}>
            <span>Cree le {article.created_at ? article.created_at.slice(0, 10) : '-'}</span>
            {article.updated_at && <span>Modifie le {article.updated_at.slice(0, 10)}</span>}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <button className="btn btn-ghost" onClick={onClose}>Fermer</button>
            <button className="btn btn-primary" onClick={() => { onClose(); onEdit(article); }} style={{ background: '#E65100', borderColor: '#E65100' }}>
              <Edit2 size={14} /> Modifier
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   PAGE PRINCIPALE ARTICLES
   ═══════════════════════════════════════════════ */
export default function Articles() {
  const [articles, setArticles] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editingArticle, setEditingArticle] = useState(null);
  const [viewingArticle, setViewingArticle] = useState(null);

  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [sortField, setSortField] = useState('');
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(1);

  const [toast, setToast] = useState({ msg: '', type: 'success' });

  function showToast(msg, type = 'success') { setToast({ msg, type }); }

  /* ── Load data ── */
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [arts, cats] = await Promise.all([getArticles(), getCategories()]);
      setArticles(Array.isArray(arts) ? arts : (arts?.data ?? []));
      setCategories(Array.isArray(cats) ? cats : (cats?.data ?? []));
    } catch (err) {
      setLoadError(err.message || 'Impossible de charger les donnees.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /* ── Helpers ── */
  function catName(id) {
    const c = categories.find(c => String(c.id) === String(id));
    return c?.nom || '-';
  }

  /* ── Sort toggle ── */
  function toggleSort(field) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  }

  function SortIcon({ field }) {
    if (sortField !== field) return <ChevronUp size={11} style={{ marginLeft: 3, opacity: 0.3 }} />;
    return sortDir === 'asc'
      ? <ChevronUp size={12} style={{ marginLeft: 3, color: 'var(--red)' }} />
      : <ChevronDown size={12} style={{ marginLeft: 3, color: 'var(--red)' }} />;
  }

  /* ── Filter + sort ── */
  let filtered = articles.filter(a => {
    const q = search.toLowerCase();
    const matchSearch = !search
      || (a.nom || '').toLowerCase().includes(q)
      || (a.reference || '').toLowerCase().includes(q)
      || catName(a.categorie_id).toLowerCase().includes(q);
    const matchCat = !filterCat || String(a.categorie_id) === String(filterCat);
    const matchSt = !filterStatut || a.statut === filterStatut;
    return matchSearch && matchCat && matchSt;
  });
  if (sortField) {
    filtered = [...filtered].sort((a, b) => {
      let va = a[sortField], vb = b[sortField];
      if (sortField === 'prix_ht' || sortField === 'remise') { va = Number(va); vb = Number(vb); }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePagedPage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePagedPage - 1) * PER_PAGE, safePagedPage * PER_PAGE);
  const hasFilters = !!(search || filterCat || filterStatut);

  /* ── KPI ── */
  const totalActifs = articles.filter(a => a.statut === 'actif').length;
  const usedCats = new Set(articles.map(a => a.categorie_id)).size;
  const prixMoyen = articles.length ? articles.reduce((s, a) => s + Number(a.prix_ht || 0), 0) / articles.length : 0;
  const avecRemise = articles.filter(a => Number(a.remise) > 0).length;

  /* ── CRUD handlers ── */
  function openAdd() { setEditingArticle(null); setShowModal(true); }
  function openEdit(a) { setEditingArticle(a); setShowModal(true); }

  async function handleDuplicate(a) {
    try {
      await duplicateArticle(a.id);
      showToast('Article duplique avec succes !');
      load();
    } catch {
      /* API unavailable — local fallback */
      const copy = { ...a, id: Date.now(), reference: '', nom: a.nom + ' (copie)', created_at: new Date().toISOString() };
      setArticles(prev => [...prev, copy]);
      showToast('Article duplique (local).');
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Supprimer cet article ?')) return;
    try {
      await deleteArticle(id);
      showToast('Article supprime.');
      load();
    } catch {
      setArticles(prev => prev.filter(a => a.id !== id));
      showToast('Article supprime (local).');
    }
  }

  function handleSaved(data, isEdit) {
    if (isEdit) {
      setArticles(prev => prev.map(a => a.id === data.id ? data : a));
    } else {
      setArticles(prev => [...prev, data]);
    }
    setShowModal(false);
    setEditingArticle(null);
    showToast(isEdit ? 'Article modifie avec succes !' : 'Article cree avec succes !');
  }

  /* ── Render ── */
  return (
    <div className="animate-fade-in">
      <Toast msg={toast.msg} type={toast.type} onClose={() => setToast({ msg: '', type: 'success' })} />

      {/* Header */}
      <div className="page-header flex-between" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="page-title">Articles</h1>
          <p className="page-subtitle">Catalogue articles — tarifs, unites et descriptions</p>
        </div>
        <button className="btn btn-primary" onClick={openAdd} style={{ background: '#E65100', borderColor: '#E65100' }}>
          <Plus size={15} /> Ajouter un article
        </button>
      </div>

      {/* Error banner */}
      {loadError && (
        <div style={{ background: '#FFEBEE', color: 'var(--red)', border: '1px solid rgba(211,47,47,0.25)', borderRadius: 8, padding: '10px 16px', fontSize: '0.875rem', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertCircle size={15} /> {loadError}
          <button onClick={load} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--red)', fontWeight: 700, cursor: 'pointer', fontSize: '0.82rem' }}>Reessayer</button>
        </div>
      )}

      {/* KPI */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(165px, 1fr))', marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#FFF3E0', color: '#E65100' }}><Package size={18} /></div>
          <div className="stat-body">
            <div className="stat-value">{loading ? '—' : articles.length}</div>
            <div className="stat-label">Total articles</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green"><Package size={18} /></div>
          <div className="stat-body">
            <div className="stat-value">{loading ? '—' : totalActifs}</div>
            <div className="stat-label">Articles actifs</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon blue"><Layers size={18} /></div>
          <div className="stat-body">
            <div className="stat-value">{loading ? '—' : usedCats}</div>
            <div className="stat-label">Categories utilisees</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon orange"><DollarSign size={18} /></div>
          <div className="stat-body">
            <div className="stat-value">{loading ? '—' : fmtMAD(Math.round(prixMoyen))}</div>
            <div className="stat-label">Prix moyen HT</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon purple"><Tag size={18} /></div>
          <div className="stat-body">
            <div className="stat-value">{loading ? '—' : avecRemise}</div>
            <div className="stat-label">Avec remise</div>
          </div>
        </div>
      </div>

      {/* Filtres */}
      <div className="card" style={{ marginBottom: 16, padding: '13px 18px' }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
            <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Rechercher nom, reference..." style={{ ...IS(false), paddingLeft: 34 }} />
          </div>
          <select value={filterCat} onChange={e => { setFilterCat(e.target.value); setPage(1); }} style={{ ...IS(false), width: 170, flex: '0 0 170px' }}>
            <option value="">Toutes categories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
          <select value={filterStatut} onChange={e => { setFilterStatut(e.target.value); setPage(1); }} style={{ ...IS(false), width: 145, flex: '0 0 145px' }}>
            <option value="">Tous statuts</option>
            {STATUT_VALUES.map(s => <option key={s} value={s}>{STATUT_LABEL[s]}</option>)}
          </select>
          {hasFilters && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFilterCat(''); setFilterStatut(''); setPage(1); }}>
              <X size={13} /> Effacer
            </button>
          )}
          <span style={{ color: 'var(--text-3)', fontSize: '0.8rem', marginLeft: 'auto' }}>
            {loading ? '...' : `${filtered.length} article${filtered.length !== 1 ? 's' : ''}`}
          </span>
        </div>
      </div>

      {/* Tableau */}
      <div className="card">
        {loading ? (
          <Spinner />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Nom article</th>
                  <th>Categorie</th>
                  <th style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }} onClick={() => toggleSort('prix_ht')}>
                    <span style={{ display: 'inline-flex', alignItems: 'center' }}>Prix HT<SortIcon field="prix_ht" /></span>
                  </th>
                  <th>Unite</th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('remise')}>
                    <span style={{ display: 'inline-flex', alignItems: 'center' }}>Remise<SortIcon field="remise" /></span>
                  </th>
                  <th>Cree le</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginated.length === 0
                  ? <EmptyState filtered={hasFilters} onAdd={openAdd} />
                  : paginated.map(a => (
                    <tr key={a.id}>
                      <td style={{ fontFamily: 'var(--font-head)', fontWeight: 700, color: 'var(--red)', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                        {a.reference || ('ART-' + String(a.id).padStart(4, '0'))}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{a.nom}</div>
                        {a.description && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginTop: 2, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {a.description}
                          </div>
                        )}
                      </td>
                      <td>
                        {a.categorie_id
                          ? <span className="badge badge-blue">{catName(a.categorie_id)}</span>
                          : <span style={{ color: 'var(--text-3)', fontSize: '0.8rem' }}>—</span>
                        }
                      </td>
                      <td style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.92rem', whiteSpace: 'nowrap' }}>
                        {fmtMAD(a.prix_ht)}
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-3)', fontFamily: 'var(--font-body)', marginLeft: 3 }}>/{a.unite}</span>
                      </td>
                      <td style={{ color: 'var(--text-2)', fontSize: '0.85rem' }}>{a.unite}</td>
                      <td>
                        {Number(a.remise) > 0
                          ? <span className="badge badge-orange">{a.remise}%</span>
                          : <span style={{ color: 'var(--text-3)', fontSize: '0.8rem' }}>—</span>
                        }
                      </td>
                      <td style={{ color: 'var(--text-3)', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                        {a.created_at ? a.created_at.slice(0, 10) : '—'}
                      </td>
                      <td><span className={'badge ' + STATUT_BADGE[a.statut || 'actif']}>{STATUT_LABEL[a.statut || 'actif']}</span></td>
                      <td>
                        <div style={{ display: 'flex', gap: 3 }}>
                          <button className="btn btn-ghost btn-sm" style={{ padding: '4px 7px' }} title="Voir" onClick={() => setViewingArticle(a)}><Eye size={13} /></button>
                          <button className="btn btn-ghost btn-sm" style={{ padding: '4px 7px' }} title="Modifier" onClick={() => openEdit(a)}><Edit2 size={13} /></button>
                          <button className="btn btn-ghost btn-sm" style={{ padding: '4px 7px' }} title="Dupliquer" onClick={() => handleDuplicate(a)}><Copy size={13} /></button>
                          <button className="btn btn-ghost btn-sm" style={{ padding: '4px 7px' }} title="Supprimer" onClick={() => handleDelete(a.id)}><Trash2 size={13} style={{ color: 'var(--red)' }} /></button>
                        </div>
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <button className="btn btn-ghost btn-sm" disabled={safePagedPage === 1} onClick={() => setPage(p => p - 1)}>Precedent</button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
              <button key={n} onClick={() => setPage(n)} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid ' + (n === safePagedPage ? 'var(--red)' : 'var(--border)'), background: n === safePagedPage ? 'var(--red)' : '#fff', color: n === safePagedPage ? '#fff' : 'var(--text)', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}>{n}</button>
            ))}
            <button className="btn btn-ghost btn-sm" disabled={safePagedPage === totalPages} onClick={() => setPage(p => p + 1)}>Suivant</button>
          </div>
        )}
      </div>

      {/* Modals */}
      {showModal && (
        <ArticleModal
          article={editingArticle}
          categories={categories}
          onClose={() => { setShowModal(false); setEditingArticle(null); }}
          onSaved={handleSaved}
        />
      )}
      {viewingArticle && (
        <ArticleDetail
          article={viewingArticle}
          catName={catName(viewingArticle.categorie_id)}
          onClose={() => setViewingArticle(null)}
          onEdit={(a) => { setViewingArticle(null); openEdit(a); }}
        />
      )}
    </div>
  );
}

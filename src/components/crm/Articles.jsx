import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Package, Plus, Edit2, Trash2, Eye, Copy, Search, X,
  ChevronUp, ChevronDown, AlertCircle, Loader, Tag, DollarSign, Layers, GripVertical,
} from 'lucide-react';
import { listCategories } from '../../services/crm/categories';
import { mergeArticleReorder } from '../../services/crm/articles';
import { useArticles } from '../../hooks/useArticles';
import { formatCategoryDisplayName } from '../../utils/crm/categoryDisplay';

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
      <td colSpan={10} style={{ textAlign: 'center', padding: '48px 0' }}>
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
function ArticleModal({ article, categories, onClose, onSave, saving }) {
  const isEdit = !!article;

  function buildForm(source) {
    if (!source) return { ...EMPTY_FORM };
    return {
      nom: source.nom || '',
      categorie_id: source.categorie_id ? String(source.categorie_id) : '',
      description: source.description || '',
      prix_ht: source.prix_ht ?? '',
      unite: source.unite || 'unite',
      tva: String(source.tva ?? '20'),
      remise: String(source.remise ?? '0'),
      statut: source.statut || 'actif',
      reference: source.reference || '',
    };
  }

  const [form, setForm] = useState(() => buildForm(article));
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');

  useEffect(() => {
    setForm(buildForm(article));
    setErrors({});
    setApiError('');
  }, [article?.id]);

  function setField(k, v) { setForm(p => ({ ...p, [k]: v })); if (errors[k]) setErrors(p => ({ ...p, [k]: '' })); }

  function validate() {
    const e = {};
    if (!form.nom?.trim()) e.nom = 'Le nom est requis';
    const prix = Number(form.prix_ht);
    if (form.prix_ht === '' || isNaN(prix) || prix < 0) e.prix_ht = 'Prix invalide';
    return e;
  }

  async function handleSubmit(ev) {
    ev.preventDefault();
    setApiError('');
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    const payload = {
      ...form,
      prix_ht: Number(form.prix_ht),
      remise: Number(form.remise) || 0,
      tva: Number(form.tva) || 0,
      categorie_id: form.categorie_id || null,
    };
    const result = await onSave(payload);
    if (result && result.success === false) {
      setApiError(result.error || "Erreur lors de l'enregistrement.");
      return;
    }
    onClose();
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
                  <label>Categorie</label>
                  <select value={form.categorie_id} onChange={e => setField('categorie_id', e.target.value)} style={IS(false)}>
                    <option value="">Sans categorie</option>
                    {categories.map(c => <option key={c.id} value={String(c.id)}>{formatCategoryDisplayName(c.nom)}</option>)}
                  </select>
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
            {catName && catName !== '-' && <span className="badge badge-blue">{catName}</span>}
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
  const {
    records: articles,
    loading,
    saving,
    error,
    configured,
    load,
    create,
    update,
    remove,
    duplicate,
    reorder,
    filterArticles,
    computeArticlesStats,
  } = useArticles();

  const [categories, setCategories] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingArticle, setEditingArticle] = useState(null);
  const [viewingArticle, setViewingArticle] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [sortField, setSortField] = useState('');
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(1);
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);

  const [toast, setToast] = useState({ msg: '', type: 'success' });

  function showToast(msg, type = 'success') { setToast({ msg, type }); }

  /* ── Load categories (Supabase) ── */
  const loadCategories = useCallback(() => {
    listCategories()
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    if (showModal) loadCategories();
  }, [showModal, loadCategories]);

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
  let filtered = useMemo(
    () => filterArticles(articles, { search, categorie_id: filterCat, statut: filterStatut, catName }),
    [articles, search, filterCat, filterStatut, filterArticles, categories],
  );
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
  const canReorder = !search && !filterStatut && !sortField && !loading;

  async function handleReorder(fromPageIdx, toPageIdx) {
    if (!canReorder || fromPageIdx == null || toPageIdx == null || fromPageIdx === toPageIdx) return;
    const fromGlobal = (safePagedPage - 1) * PER_PAGE + fromPageIdx;
    const toGlobal = (safePagedPage - 1) * PER_PAGE + toPageIdx;
    const ids = filtered.map((a) => a.id);
    const nextIds = [...ids];
    const [moved] = nextIds.splice(fromGlobal, 1);
    nextIds.splice(toGlobal, 0, moved);
    const finalIds = filterCat
      ? mergeArticleReorder(articles, nextIds)
      : nextIds;
    const result = await reorder(finalIds);
    if (result.success) showToast('Ordre des articles enregistré.');
    else showToast(result.error || 'Erreur réorganisation.', 'error');
  }

  const dragHandlers = {
    onDragStart: (e, pageIdx) => {
      if (!canReorder) return;
      setDragIdx(pageIdx);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(pageIdx));
    },
    onDragOver: (e, pageIdx) => {
      if (!canReorder) return;
      e.preventDefault();
      setOverIdx(pageIdx);
    },
    onDrop: (pageIdx) => {
      if (!canReorder) return;
      if (dragIdx !== null) handleReorder(dragIdx, pageIdx);
      setDragIdx(null);
      setOverIdx(null);
    },
    onDragEnd: () => { setDragIdx(null); setOverIdx(null); },
    isDragging: (pageIdx) => dragIdx === pageIdx,
    isOver: (pageIdx) => overIdx === pageIdx && dragIdx !== pageIdx,
  };

  /* ── KPI ── */
  const stats = useMemo(() => computeArticlesStats(articles), [articles, computeArticlesStats]);
  const { total: totalArticles, actifs: totalActifs, usedCategories: usedCats, prixMoyen, avecRemise } = stats;

  /* ── CRUD handlers ── */
  function openAdd() { setEditingArticle(null); setShowModal(true); }
  function openEdit(a) { setEditingArticle(a); setShowModal(true); }

  async function handleSave(data) {
    const isEdit = !!editingArticle;
    const result = isEdit
      ? await update(editingArticle.id, data)
      : await create(data);
    if (!result.success) return result;
    setShowModal(false);
    setEditingArticle(null);
    showToast(isEdit ? 'Article modifie avec succes !' : 'Article cree avec succes !');
    return result;
  }

  async function handleDuplicate(a) {
    const result = await duplicate(a.id);
    showToast(
      result.success ? 'Article duplique avec succes !' : (result.error || 'Erreur duplication.'),
      result.success ? 'success' : 'error',
    );
  }

  async function handleDelete(id) {
    if (!window.confirm('Supprimer cet article ?')) return;
    setDeletingId(id);
    const result = await remove(id);
    setDeletingId(null);
    showToast(
      result.success ? 'Article supprime.' : (result.error || 'Erreur suppression.'),
      result.success ? 'success' : 'error',
    );
  }

  /* ── Render ── */
  return (
    <div className="animate-fade-in crm-module crm-module--articles">
      <Toast msg={toast.msg} type={toast.type} onClose={() => setToast({ msg: '', type: 'success' })} />

      {/* Header */}
      <div className="page-header flex-between" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="page-title">Articles</h1>
          <p className="page-subtitle">Catalogue articles — tarifs, unites et descriptions</p>
        </div>
        <button className="btn btn-primary" onClick={openAdd} disabled={loading || saving || !configured} style={{ background: '#E65100', borderColor: '#E65100' }}>
          <Plus size={15} /> Ajouter un article
        </button>
      </div>

      {!configured && (
        <div style={{ background: '#FFF3E0', border: '1px solid #FFB74D', borderRadius: 'var(--radius)', padding: '10px 16px', marginBottom: 16, fontSize: '0.85rem', color: '#E65100' }}>
          Supabase non configuré — ajoutez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env
        </div>
      )}

      {/* Error banner */}
      {error && !loading && (
        <div style={{ background: '#FFEBEE', color: 'var(--red)', border: '1px solid rgba(211,47,47,0.25)', borderRadius: 8, padding: '10px 16px', fontSize: '0.875rem', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertCircle size={15} /> {error}
          <button onClick={load} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--red)', fontWeight: 700, cursor: 'pointer', fontSize: '0.82rem' }}>Reessayer</button>
        </div>
      )}

      {/* KPI */}
      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#FFF3E0', color: '#E65100' }}><Package size={18} /></div>
          <div className="stat-body">
            <div className="stat-value">{loading ? '—' : totalArticles}</div>
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
      <div className="card crm-filter-bar" style={{ marginBottom: 16 }}>
        <div className="crm-filter-row">
          <div className="crm-filter-search">
            <Search size={15} className="crm-filter-search-icon" />
            <input
              className="crm-filter-input"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Rechercher nom, reference..."
            />
          </div>
          <select className="crm-filter-select" value={filterCat} onChange={e => { setFilterCat(e.target.value); setPage(1); }}>
            <option value="">Toutes categories</option>
            <option value="__none__">Sans categorie</option>
            {categories.map(c => <option key={c.id} value={String(c.id)}>{formatCategoryDisplayName(c.nom)}</option>)}
          </select>
          <select className="crm-filter-select crm-filter-select--sm" value={filterStatut} onChange={e => { setFilterStatut(e.target.value); setPage(1); }}>
            <option value="">Tous statuts</option>
            {STATUT_VALUES.map(s => <option key={s} value={s}>{STATUT_LABEL[s]}</option>)}
          </select>
          {hasFilters && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFilterCat(''); setFilterStatut(''); setPage(1); }}>
              <X size={13} /> Effacer
            </button>
          )}
          <span className="crm-filter-count">
            {loading ? '...' : `${filtered.length} article${filtered.length !== 1 ? 's' : ''}`}
          </span>
          {canReorder && (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginLeft: 8 }}>
              {filterCat
                ? 'Glissez les lignes pour réordonner dans cette catégorie'
                : 'Glissez les lignes pour réordonner le catalogue'}
            </span>
          )}
        </div>
      </div>

      {/* Tableau */}
      <div className="card">
        {loading ? (
          <Spinner />
        ) : (
          <>
          <div className="crm-table-desktop">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 34 }} title={canReorder ? 'Glisser pour réordonner' : ''} />
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
                    : paginated.map((a, pageIdx) => (
                      <tr
                        key={a.id}
                        draggable={canReorder}
                        onDragStart={(e) => dragHandlers.onDragStart(e, pageIdx)}
                        onDragOver={(e) => dragHandlers.onDragOver(e, pageIdx)}
                        onDrop={() => dragHandlers.onDrop(pageIdx)}
                        onDragEnd={dragHandlers.onDragEnd}
                        style={{
                          ...(dragHandlers.isDragging(pageIdx) ? { opacity: 0.45 } : {}),
                          ...(dragHandlers.isOver(pageIdx) ? { boxShadow: 'inset 0 0 0 2px var(--red)' } : {}),
                        }}
                      >
                        <td style={{ width: 34, padding: '4px 6px', verticalAlign: 'middle' }}>
                          {canReorder ? (
                            <span title="Glisser pour déplacer" style={{ display: 'inline-flex', cursor: 'grab', color: 'var(--text-3)' }}>
                              <GripVertical size={15} />
                            </span>
                          ) : null}
                        </td>
                        <td style={{ fontFamily: 'var(--font-head)', fontWeight: 700, color: 'var(--red)', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                          {a.reference || '—'}
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
                            <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '4px 7px' }} title="Supprimer" disabled={deletingId === a.id || saving} onClick={() => handleDelete(a.id)}>
                              {deletingId === a.id ? <Loader size={13} className="spin" style={{ color: 'var(--red)' }} /> : <Trash2 size={13} style={{ color: 'var(--red)' }} />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>
          </div>

          {paginated.length === 0 ? (
            <div className="crm-mobile-only" style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-3)' }}>
              {hasFilters ? 'Aucun article ne correspond aux filtres.' : 'Aucun article enregistre.'}
            </div>
          ) : (
            <div className="crm-compact-list crm-mobile-only">
              {paginated.map(a => (
                <div key={a.id} className="crm-compact-row">
                  <div className="crm-compact-main">
                    <div className="crm-compact-title">{a.nom}</div>
                    <div className="crm-compact-meta">
                      <strong>{fmtMAD(a.prix_ht)}</strong>
                      {a.categorie_id ? ` · ${catName(a.categorie_id)}` : ''}
                      {' · '}
                      <span className={'badge ' + STATUT_BADGE[a.statut || 'actif']} style={{ fontSize: '0.68rem', padding: '1px 6px', verticalAlign: 'middle' }}>
                        {STATUT_LABEL[a.statut || 'actif']}
                      </span>
                    </div>
                  </div>
                  <div className="crm-compact-actions">
                    <button type="button" className="btn btn-ghost btn-sm crm-icon-btn" title="Voir" onClick={() => setViewingArticle(a)}><Eye size={14} /></button>
                    <button type="button" className="btn btn-ghost btn-sm crm-icon-btn" title="Modifier" onClick={() => openEdit(a)}><Edit2 size={14} /></button>
                    <button type="button" className="btn btn-ghost btn-sm crm-icon-btn" title="Dupliquer" onClick={() => handleDuplicate(a)}><Copy size={14} /></button>
                    <button type="button" className="btn btn-ghost btn-sm crm-icon-btn" title="Supprimer" disabled={deletingId === a.id || saving} onClick={() => handleDelete(a.id)}>
                      {deletingId === a.id ? <Loader size={14} className="spin" style={{ color: 'var(--red)' }} /> : <Trash2 size={14} style={{ color: 'var(--red)' }} />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          </>
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
          onSave={handleSave}
          saving={saving}
        />
      )}
      {viewingArticle && (
        <ArticleDetail
          article={viewingArticle}
          catName={viewingArticle.categorie_id ? catName(viewingArticle.categorie_id) : null}
          onClose={() => setViewingArticle(null)}
          onEdit={(a) => { setViewingArticle(null); openEdit(a); }}
        />
      )}
    </div>
  );
}

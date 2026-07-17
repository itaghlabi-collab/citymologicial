import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Layers, Plus, Edit2, Trash2, Search, X, AlertCircle, Package, Loader2, ChevronLeft
} from 'lucide-react';
import { useCategories } from '../../hooks/useCategories';
import { formatCategoryDisplayName } from '../../utils/crm/categoryDisplay';

/* ── Helpers ── */
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
const STATUT_VALUES = ['actif', 'inactif'];
const STATUT_LABEL = { actif: 'Actif', inactif: 'Inactif' };
const STATUT_BADGE = { actif: 'badge-green', inactif: 'badge-grey' };

const COULEURS_PRESET = [
  '#D32F2F', '#1976D2', '#388E3C', '#F57C00', '#7B1FA2',
  '#0288D1', '#455A64', '#E65100', '#00796B', '#C2185B',
];

const EMPTY_FORM = { nom: '', couleur: '#1976D2', statut: 'actif', description: '' };

/* ── Spinner ── */
function Spinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
      <div style={{ width: 28, height: 28, border: '3px solid var(--border)', borderTopColor: 'var(--red)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
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

/* ═══════════════════════════════════════════════
   MODAL CATEGORIE
   ═══════════════════════════════════════════════ */
function CategorieModal({ categorie, onClose, onSave, saving }) {
  const isEdit = !!categorie;
  const [form, setForm] = useState(isEdit ? {
    nom: categorie.nom || '',
    couleur: categorie.couleur || '#1976D2',
    statut: categorie.statut || 'actif',
    description: categorie.description || '',
  } : { ...EMPTY_FORM });
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');

  function setField(k, v) { setForm(p => ({ ...p, [k]: v })); if (errors[k]) setErrors(p => ({ ...p, [k]: '' })); }

  function validate() {
    const e = {};
    if (!form.nom?.trim()) e.nom = 'Le nom est requis';
    return e;
  }

  async function handleSubmit(ev) {
    ev.preventDefault();
    setApiError('');
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    const result = await onSave({ nom: form.nom.trim() });
    if (result && result.success === false) {
      setApiError(result.error || "Erreur lors de l'enregistrement.");
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 480, boxShadow: '0 8px 40px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>

        {/* Header */}
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.15rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {isEdit ? 'Modifier categorie' : 'Nouvelle categorie'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }}><X size={20} /></button>
        </div>

        <form className="crm-form" onSubmit={handleSubmit} style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <button type="button" className="crm-back-btn crm-back-btn--modal" onClick={onClose} aria-label="Retour aux catégories">
            <ChevronLeft size={16} /> Retour aux catégories
          </button>
          {apiError && (
            <div style={{ background: '#FFEBEE', color: 'var(--red)', border: '1px solid rgba(211,47,47,0.25)', borderRadius: 7, padding: '10px 14px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertCircle size={15} /> {apiError}
            </div>
          )}

          <div className="form-group">
            <label>Nom de la categorie *</label>
            <input value={form.nom} onChange={e => setField('nom', e.target.value)} placeholder="Ex : Materiaux de construction" style={IS(errors.nom)} autoFocus />
            {errors.nom && <span style={{ color: 'var(--red)', fontSize: '0.75rem' }}>{errors.nom}</span>}
          </div>

          <details className="crm-form-collapse">
            <summary>Description</summary>
            <div className="form-group" style={{ marginTop: 10 }}>
              <textarea rows={2} value={form.description} onChange={e => setField('description', e.target.value)} placeholder="Description optionnelle..." style={{ ...IS(false), resize: 'vertical' }} />
            </div>
          </details>

          <div className="form-group">
            <label>Couleur</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {COULEURS_PRESET.map(c => (
                <button
                  key={c} type="button"
                  onClick={() => setField('couleur', c)}
                  style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: form.couleur === c ? '3px solid var(--text)' : '2px solid transparent', cursor: 'pointer', flexShrink: 0, outline: 'none', transition: 'border 0.15s' }}
                />
              ))}
              <input type="color" value={form.couleur} onChange={e => setField('couleur', e.target.value)} style={{ width: 34, height: 34, border: '1.5px solid var(--border)', borderRadius: 6, cursor: 'pointer', padding: 2 }} title="Couleur personnalisee" />
              <div style={{ background: form.couleur, color: '#fff', borderRadius: 6, padding: '4px 10px', fontSize: '0.78rem', fontWeight: 700 }}>{form.couleur}</div>
            </div>
          </div>

          <div className="form-group">
            <label>Statut</label>
            <select value={form.statut} onChange={e => setField('statut', e.target.value)} style={IS(false)}>
              {STATUT_VALUES.map(s => <option key={s} value={s}>{STATUT_LABEL[s]}</option>)}
            </select>
          </div>

          <div className="crm-form-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Annuler</button>
            <button type="submit" className="btn btn-primary" disabled={saving} style={{ minWidth: 110 }}>
              {saving
                ? <span style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                : <><Plus size={14} /> {isEdit ? 'Enregistrer' : 'Creer'}</>
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   PAGE PRINCIPALE CATEGORIES
   ═══════════════════════════════════════════════ */
export default function Categories() {
  const {
    records: categories,
    articles,
    loading,
    saving,
    error,
    configured,
    load,
    create,
    update,
    remove,
    filterCategories,
    computeCategoriesStats,
  } = useCategories();

  const [showModal, setShowModal] = useState(false);
  const [editingCat, setEditingCat] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState('');

  const [toast, setToast] = useState({ msg: '', type: 'success' });

  function showToast(msg, type = 'success') { setToast({ msg, type }); }

  function articleCount(catId) {
    return articles.filter(a => String(a.categorie_id) === String(catId)).length;
  }

  const filtered = useMemo(
    () => filterCategories(categories, { search, statut: filterStatut }),
    [categories, search, filterStatut, filterCategories],
  );

  const stats = useMemo(
    () => computeCategoriesStats(categories, articles.length),
    [categories, articles.length, computeCategoriesStats],
  );

  function openAdd() { setEditingCat(null); setShowModal(true); }
  function openEdit(c) { setEditingCat(c); setShowModal(true); }

  async function handleSave(data) {
    const isEdit = !!editingCat;
    const result = isEdit
      ? await update(editingCat.id, data)
      : await create(data);
    if (!result.success) return result;
    setShowModal(false);
    setEditingCat(null);
    showToast(isEdit ? 'Categorie modifiee !' : 'Categorie creee !');
    return result;
  }

  async function handleDelete(id) {
    const count = articleCount(id);
    if (count > 0) {
      showToast(`Impossible : ${count} article(s) utilisent cette categorie.`, 'error');
      return;
    }
    if (!window.confirm('Supprimer cette categorie ?')) return;
    setDeletingId(id);
    const result = await remove(id);
    setDeletingId(null);
    showToast(
      result.success ? 'Categorie supprimee.' : (result.error || 'Erreur suppression.'),
      result.success ? 'success' : 'error',
    );
  }

  return (
    <div className="animate-fade-in crm-module crm-module--categories">
      <Toast msg={toast.msg} type={toast.type} onClose={() => setToast({ msg: '', type: 'success' })} />

      {/* Header */}
      <div className="page-header flex-between" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="page-title">Categories</h1>
          <p className="page-subtitle">Gestion des categories articles — utilisees dans tout le CRM</p>
        </div>
        <button className="btn btn-primary" onClick={openAdd} disabled={loading || saving || !configured}>
          <Plus size={15} /> Nouvelle categorie
        </button>
      </div>

      {!configured && (
        <div style={{ background: '#FFF3E0', border: '1px solid #FFB74D', borderRadius: 'var(--radius)', padding: '10px 16px', marginBottom: 16, fontSize: '0.85rem', color: '#E65100' }}>
          Supabase non configuré — ajoutez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env
        </div>
      )}

      {error && !loading && (
        <div style={{ background: '#FFEBEE', color: 'var(--red)', border: '1px solid rgba(211,47,47,0.25)', borderRadius: 8, padding: '10px 16px', fontSize: '0.875rem', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertCircle size={15} /> {error}
          <button onClick={load} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--red)', fontWeight: 700, cursor: 'pointer', fontSize: '0.82rem' }}>Reessayer</button>
        </div>
      )}

      {/* KPI */}
      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-icon blue"><Layers size={18} /></div>
          <div className="stat-body">            <div className="stat-value">{loading ? '—' : stats.total}</div><div className="stat-label">Total categories</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green"><Layers size={18} /></div>
          <div className="stat-body"><div className="stat-value">{loading ? '—' : stats.actives}</div><div className="stat-label">Categories actives</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon orange"><Package size={18} /></div>
          <div className="stat-body"><div className="stat-value">{loading ? '—' : stats.totalArticles}</div><div className="stat-label">Articles total</div></div>
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
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher categorie..."
            />
          </div>
          <select className="crm-filter-select crm-filter-select--sm" value={filterStatut} onChange={e => setFilterStatut(e.target.value)}>
            <option value="">Tous statuts</option>
            {STATUT_VALUES.map(s => <option key={s} value={s}>{STATUT_LABEL[s]}</option>)}
          </select>
          {(search || filterStatut) && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFilterStatut(''); }}>
              <X size={13} /> Effacer
            </button>
          )}
          <span className="crm-filter-count">
            {loading ? '...' : `${filtered.length} categorie${filtered.length !== 1 ? 's' : ''}`}
          </span>
        </div>
      </div>

      {/* Tableau */}
      <div className="card">
        {loading ? <Spinner /> : (
          <>
          <div className="crm-table-desktop">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Couleur</th>
                    <th>Nom</th>
                    <th>Description</th>
                    <th>Articles</th>
                    <th>Statut</th>
                    <th>Cree le</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '48px 0' }}>
                        <Layers size={36} style={{ color: 'var(--border)', display: 'block', margin: '0 auto 12px' }} />
                        <div style={{ fontWeight: 700, color: 'var(--text-2)', marginBottom: 6 }}>
                          {search || filterStatut ? 'Aucune categorie ne correspond aux filtres.' : 'Aucune categorie enregistree.'}
                        </div>
                        {!search && !filterStatut && (
                          <button className="btn btn-primary btn-sm" onClick={openAdd} style={{ marginTop: 12 }}>
                            <Plus size={13} /> Creer la premiere categorie
                          </button>
                        )}
                      </td>
                    </tr>
                  ) : filtered.map(c => {
                    const count = articleCount(c.id);
                    return (
                      <tr key={c.id}>
                        <td style={{ width: 48 }}>
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: c.couleur || '#1976D2', flexShrink: 0 }} />
                        </td>
                        <td style={{ fontWeight: 700, fontSize: '0.92rem' }}>{formatCategoryDisplayName(c.nom)}</td>
                        <td style={{ color: 'var(--text-2)', fontSize: '0.85rem', maxWidth: 240 }}>
                          {c.description
                            ? <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', maxWidth: 220 }}>{c.description}</span>
                            : <span style={{ color: 'var(--text-3)' }}>—</span>
                          }
                        </td>
                        <td>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: count > 0 ? '#E3F2FD' : 'var(--bg)', color: count > 0 ? '#1976D2' : 'var(--text-3)', borderRadius: 6, padding: '3px 9px', fontWeight: 700, fontSize: '0.82rem' }}>
                            <Package size={12} /> {count}
                          </span>
                        </td>
                        <td><span className={'badge ' + STATUT_BADGE[c.statut || 'actif']}>{STATUT_LABEL[c.statut || 'actif']}</span></td>
                        <td style={{ color: 'var(--text-3)', fontSize: '0.82rem' }}>
                          {c.created_at ? c.created_at.slice(0, 10) : '—'}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 3 }}>
                            <button className="btn btn-ghost btn-sm" style={{ padding: '4px 7px' }} title="Modifier" onClick={() => openEdit(c)}><Edit2 size={13} /></button>
                            <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '4px 7px' }} title="Supprimer" disabled={deletingId === c.id || saving} onClick={() => handleDelete(c.id)}>
                              {deletingId === c.id ? <Loader2 size={13} className="spin" style={{ color: 'var(--red)' }} /> : <Trash2 size={13} style={{ color: count > 0 ? 'var(--text-3)' : 'var(--red)' }} />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="crm-mobile-only" style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-3)' }}>
              {search || filterStatut ? 'Aucune categorie ne correspond aux filtres.' : 'Aucune categorie enregistree.'}
            </div>
          ) : (
            <div className="crm-compact-list crm-mobile-only">
              {filtered.map(c => {
                const count = articleCount(c.id);
                return (
                  <div key={c.id} className="crm-compact-row">
                    <div className="crm-compact-main">
                      <div className="crm-compact-title">
                        <span className="crm-compact-dot" style={{ background: c.couleur || '#1976D2' }} />
                        {formatCategoryDisplayName(c.nom)}
                      </div>
                      <div className="crm-compact-meta">
                        <Package size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }} />
                        {count} article{count !== 1 ? 's' : ''}
                        {c.description ? ` · ${c.description}` : ''}
                        {' · '}
                        <span className={'badge ' + STATUT_BADGE[c.statut || 'actif']} style={{ fontSize: '0.68rem', padding: '1px 6px' }}>
                          {STATUT_LABEL[c.statut || 'actif']}
                        </span>
                      </div>
                    </div>
                    <div className="crm-compact-actions">
                      <button type="button" className="btn btn-ghost btn-sm crm-icon-btn" title="Modifier" onClick={() => openEdit(c)}><Edit2 size={14} /></button>
                      <button type="button" className="btn btn-ghost btn-sm crm-icon-btn" title="Supprimer" disabled={deletingId === c.id || saving} onClick={() => handleDelete(c.id)}>
                        {deletingId === c.id ? <Loader2 size={14} className="spin" style={{ color: 'var(--red)' }} /> : <Trash2 size={14} style={{ color: count > 0 ? 'var(--text-3)' : 'var(--red)' }} />}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          </>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <CategorieModal
          categorie={editingCat}
          onClose={() => { setShowModal(false); setEditingCat(null); }}
          onSave={handleSave}
          saving={saving}
        />
      )}
    </div>
  );
}

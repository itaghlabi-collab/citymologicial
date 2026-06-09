/**
 * CategoriesStock.jsx — Catégories stock ERP CITYMO (Supabase stock_categories)
 */
import { useState, useCallback } from 'react';
import {
  Tag, Plus, Edit2, Trash2, ToggleLeft, Search, Filter, Download,
  Eye, Loader2, RefreshCw, FileSpreadsheet, FileText,
} from 'lucide-react';
import { useStockCategories } from '../../hooks/useStockCategories';
import {
  INPUT_STYLE, SELECT_STYLE, TEXTAREA_STYLE,
  DEPARTEMENTS, STOCK_TYPES,
  KpiCard, EmptyState, Modal, SectionTitle, FField, FRow, formatMAD,
} from './shared.jsx';

const EMPTY_FORM = {
  code: '',
  name: '',
  nom: '',
  description: '',
  department: 'LOGISTIQUE',
  stock_type: 'OUTILLAGE',
  color: '',
  icon: '',
  actif: 'Oui',
  is_active: true,
};

function DetailRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.83rem', paddingBottom: 8, borderBottom: '1px solid var(--surface-2)', gap: 12 }}>
      <span style={{ color: 'var(--text-3)', fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase', flexShrink: 0 }}>{label}</span>
      <span style={{ fontWeight: 500, textAlign: 'right' }}>{value || '—'}</span>
    </div>
  );
}

function CatForm({ initial, onSave, onCancel, saving }) {
  const [form, setForm] = useState(() => {
    if (!initial) return { ...EMPTY_FORM };
    return {
      ...EMPTY_FORM,
      ...initial,
      name: initial.name || initial.nom || '',
      nom: initial.name || initial.nom || '',
      actif: initial.is_active !== false && initial.actif !== 'Non' ? 'Oui' : 'Non',
    };
  });
  const [errors, setErrors] = useState({});
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  function handleSubmit(e) {
    e.preventDefault();
    const err = {};
    const name = (form.name || form.nom || '').trim();
    const code = (form.code || '').trim();
    if (!name) err.name = 'Requis';
    if (!code) err.code = 'Requis';
    if (Object.keys(err).length) { setErrors(err); return; }
    onSave({
      ...form,
      name,
      nom: name,
      is_active: form.actif === 'Oui',
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <SectionTitle icon={<Tag size={12} />}>Informations catégorie</SectionTitle>
      <FRow>
        <FField label="Code" required>
          <input
            value={form.code}
            onChange={(e) => set('code', e.target.value.toUpperCase())}
            placeholder="Ex: PERFORATEUR"
            disabled={!!initial?.id}
            style={{ ...INPUT_STYLE, borderColor: errors.code ? 'var(--red)' : 'var(--border)' }}
          />
          {errors.code && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors.code}</div>}
        </FField>
        <FField label="Nom" required>
          <input
            value={form.name || form.nom}
            onChange={(e) => { set('name', e.target.value); set('nom', e.target.value); }}
            placeholder="Ex: PERFORATEUR"
            style={{ ...INPUT_STYLE, borderColor: errors.name ? 'var(--red)' : 'var(--border)' }}
          />
          {errors.name && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors.name}</div>}
        </FField>
        <FField label="Département">
          <select value={form.department} onChange={(e) => set('department', e.target.value)} style={SELECT_STYLE}>
            {DEPARTEMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </FField>
        <FField label="Type stock">
          <select value={form.stock_type} onChange={(e) => set('stock_type', e.target.value)} style={SELECT_STYLE}>
            {STOCK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </FField>
        <FField label="Couleur">
          <input value={form.color} onChange={(e) => set('color', e.target.value)} placeholder="#E53935 ou nom couleur" style={INPUT_STYLE} />
        </FField>
        <FField label="Icône">
          <input value={form.icon} onChange={(e) => set('icon', e.target.value)} placeholder="Ex: wrench, hammer..." style={INPUT_STYLE} />
        </FField>
        <FField label="Actif">
          <select value={form.actif} onChange={(e) => set('actif', e.target.value)} style={SELECT_STYLE}>
            <option value="Oui">Oui</option>
            <option value="Non">Non</option>
          </select>
        </FField>
      </FRow>
      <div style={{ marginBottom: 20 }}>
        <FField label="Description">
          <textarea
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="Description de la catégorie..."
            style={TEXTAREA_STYLE}
          />
        </FField>
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>Annuler</button>
        <button type="submit" className="btn btn-primary" disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {saving ? <Loader2 size={14} className="cin-spin" /> : <Plus size={14} />}
          {initial ? 'Enregistrer' : 'Ajouter catégorie'}
        </button>
      </div>
    </form>
  );
}

function DetailCategorie({ item, onBack, onEdit, onToggle }) {
  const active = item.is_active !== false && item.actif !== 'Non';
  return (
    <div className="animate-fade-in">
      <button type="button" className="btn btn-ghost btn-sm" style={{ marginBottom: 14, display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={onBack}>← Retour</button>
      <div className="flex-between" style={{ marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 10,
            background: item.color || 'var(--red-light)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Tag size={22} style={{ color: 'var(--red)' }} />
          </div>
          <div>
            <h1 className="page-title" style={{ marginBottom: 2 }}>{item.name || item.nom}</h1>
            <p className="page-subtitle">
              <span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, color: 'var(--red)' }}>{item.code}</span>
              {' · '}
              <span className={`badge ${active ? 'badge-green' : 'badge-grey'}`} style={{ fontSize: '0.72rem' }}>
                {active ? 'Actif' : 'Inactif'}
              </span>
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={onEdit}>
            <Edit2 size={13} /> Modifier
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onToggle(item)}>
            <ToggleLeft size={13} /> {active ? 'Désactiver' : 'Réactiver'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <div className="card">
          <SectionTitle icon={<Tag size={13} />}>Classification</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <DetailRow label="Référence" value={item.legacy_id ? `#${item.legacy_id}` : String(item.id).slice(0, 8)} />
            <DetailRow label="Code" value={item.code} />
            <DetailRow label="Département" value={item.department} />
            <DetailRow label="Type stock" value={item.stock_type} />
            <DetailRow label="Couleur" value={item.color} />
            <DetailRow label="Icône" value={item.icon} />
          </div>
        </div>
        <div className="card">
          <SectionTitle icon={<Tag size={13} />}>Stock lié</SectionTitle>
          <DetailRow label="Articles liés" value={item.articles_lies || 0} />
          <DetailRow label="Valeur stock" value={item.valeur_stock ? formatMAD(item.valeur_stock) : '—'} />
          <DetailRow label="Créée le" value={item.date_creation || '—'} />
        </div>
        {item.description && (
          <div className="card" style={{ gridColumn: '1 / -1' }}>
            <SectionTitle icon={<Tag size={13} />}>Description</SectionTitle>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-2)', margin: 0, lineHeight: 1.6 }}>{item.description}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function MobileCard({ item, onView, onEdit, onToggle, onDelete }) {
  const active = item.is_active !== false && item.actif !== 'Non';
  return (
    <div className="card inv-stock-cat-card" style={{ padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 8, background: 'var(--red-light)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Tag size={18} style={{ color: 'var(--red)' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{item.name || item.nom}</div>
          <div style={{ fontFamily: 'var(--font-head)', fontSize: '0.75rem', color: 'var(--red)', fontWeight: 700 }}>{item.code}</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 4 }}>
            {item.department} · {item.stock_type}
          </div>
        </div>
        <span className={`badge ${active ? 'badge-green' : 'badge-grey'}`} style={{ fontSize: '0.68rem', flexShrink: 0 }}>
          {active ? 'Actif' : 'Inactif'}
        </span>
      </div>
      {item.description && (
        <div style={{ fontSize: '0.78rem', color: 'var(--text-2)', marginBottom: 10 }}>
          {item.description.length > 80 ? `${item.description.slice(0, 80)}…` : item.description}
        </div>
      )}
      <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginBottom: 10 }}>
        {item.articles_lies || 0} article(s) lié(s)
        {item.valeur_stock > 0 ? ` · ${formatMAD(item.valeur_stock)}` : ''}
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onView(item)}><Eye size={13} /></button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onEdit(item)}><Edit2 size={13} /></button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onToggle(item)}><ToggleLeft size={13} /></button>
        <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => onDelete(item.id)}><Trash2 size={13} /></button>
      </div>
    </div>
  );
}

export default function CategoriesStock() {
  const {
    records: cats, loading, saving, error, configured, reload,
    save, toggleActive, remove, exportCsv, exportExcel, exportPdf,
  } = useStockCategories();

  const [search, setSearch] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterActif, setFilterActif] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [detailId, setDetailId] = useState(null);

  const handleSave = useCallback(async (data) => {
    const res = await save(data, editItem?.id);
    if (res.success) {
      setShowModal(false);
      setEditItem(null);
    }
  }, [editItem, save]);

  async function handleDelete(id) {
    if (!window.confirm('Supprimer cette catégorie ? (impossible si des articles sont liés)')) return;
    const res = await remove(id);
    if (res.success) setDetailId(null);
  }

  async function handleToggle(item) {
    const active = item.is_active !== false && item.actif !== 'Non';
    await toggleActive(item.id, active);
  }

  const filtered = cats.filter((x) => {
    const q = search.toLowerCase();
    const name = (x.name || x.nom || '').toLowerCase();
    const active = x.is_active !== false && x.actif !== 'Non';
    const matchQ = !q
      || name.includes(q)
      || (x.code || '').toLowerCase().includes(q)
      || (x.description || '').toLowerCase().includes(q);
    const matchDept = !filterDept || x.department === filterDept;
    const matchType = !filterType || x.stock_type === filterType;
    const matchActif = !filterActif
      || (filterActif === 'Oui' && active)
      || (filterActif === 'Non' && !active);
    return matchQ && matchDept && matchType && matchActif;
  });

  const total = cats.length;
  const actives = cats.filter((x) => x.is_active !== false && x.actif !== 'Non').length;
  const inactives = total - actives;
  const articlesLies = cats.reduce((s, c) => s + (c.articles_lies || 0), 0);
  const valeurStock = cats.reduce((s, c) => s + (Number(c.valeur_stock) || 0), 0);

  if (detailId) {
    const item = cats.find((x) => x.id === detailId);
    if (!item) { setDetailId(null); return null; }
    return (
      <DetailCategorie
        item={item}
        onBack={() => setDetailId(null)}
        onEdit={() => { setEditItem(item); setShowModal(true); }}
        onToggle={handleToggle}
      />
    );
  }

  if (loading && !cats.length) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48, gap: 10, color: 'var(--text-3)' }}>
        <Loader2 size={22} className="cin-spin" /> Chargement des catégories stock…
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {!configured && (
        <div className="card" style={{ marginBottom: 12, padding: 12, color: 'var(--red)', fontSize: '0.85rem' }}>
          Supabase non configuré — exécutez supabase/RUN_STOCK_CATEGORIES.sql puis reconnectez-vous.
        </div>
      )}
      {error && (
        <div className="card" style={{ marginBottom: 12, padding: 12, color: 'var(--red)', fontSize: '0.85rem' }}>{error}</div>
      )}

      <div className="page-header flex-between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title">CATÉGORIES STOCK</h1>
          <p className="page-subtitle">Gestion des catégories et types d'articles en stock.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', position: 'relative' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={reload} disabled={loading}>
            <RefreshCw size={14} /> Actualiser
          </button>
          <button type="button" className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setShowFilters((f) => !f)}>
            <Filter size={14} /> Filtres
          </button>
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              onClick={() => setShowExport((e) => !e)}
              disabled={!filtered.length}
            >
              <Download size={14} /> Export
            </button>
            {showExport && (
              <div className="card" style={{
                position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 50,
                padding: 8, minWidth: 160, boxShadow: 'var(--shadow-lg)',
              }}>
                <button type="button" className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'flex-start', gap: 8 }} onClick={() => { exportCsv(filtered); setShowExport(false); }}>
                  <FileText size={14} /> CSV
                </button>
                <button type="button" className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'flex-start', gap: 8 }} onClick={() => { exportExcel(filtered); setShowExport(false); }}>
                  <FileSpreadsheet size={14} /> Excel
                </button>
                <button type="button" className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'flex-start', gap: 8 }} onClick={() => { exportPdf(filtered); setShowExport(false); }}>
                  <Download size={14} /> PDF
                </button>
              </div>
            )}
          </div>
          <button type="button" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => { setEditItem(null); setShowModal(true); }}>
            <Plus size={15} /> Ajouter catégorie
          </button>
        </div>
      </div>

      <div className="stat-grid finance-kpi-grid" style={{ marginBottom: 20 }}>
        <KpiCard icon={<Tag size={17} />} label="Total catégories" value={total} color="grey" />
        <KpiCard icon={<Tag size={17} />} label="Catégories actives" value={actives} color="green" />
        <KpiCard icon={<Tag size={17} />} label="Catégories inactives" value={inactives} color="orange" />
        <KpiCard icon={<Tag size={17} />} label="Articles liés" value={articlesLies} color="blue" />
        <KpiCard icon={<Tag size={17} />} label="Valeur stock totale" value={valeurStock > 0 ? formatMAD(valeurStock) : '—'} color="purple" />
      </div>

      {showFilters ? (
        <div className="card" style={{ marginBottom: 16, padding: '14px 20px' }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 180, position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Code, nom, description..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
            </div>
            <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 200 }}>
              <option value="">Tous départements</option>
              {DEPARTEMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 180 }}>
              <option value="">Tous types</option>
              {STOCK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={filterActif} onChange={(e) => setFilterActif(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 140 }}>
              <option value="">Tous statuts</option>
              <option value="Oui">Actif</option>
              <option value="Non">Inactif</option>
            </select>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFilterDept(''); setFilterType(''); setFilterActif(''); }}>
              Réinitialiser
            </button>
          </div>
        </div>
      ) : (
        <div className="card" style={{ marginBottom: 12, padding: '10px 14px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher une catégorie..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Tag size={24} />}
            title="Aucune catégorie"
            sub={configured ? 'Créez vos catégories ou exécutez RUN_STOCK_CATEGORIES.sql pour le seed.' : 'Configurez Supabase puis exécutez le script SQL.'}
            action="Ajouter catégorie"
            onAction={() => { setEditItem(null); setShowModal(true); }}
          />
        </div>
      ) : (
        <>
          <div className="card inv-stock-desktop-only" style={{ padding: 0 }}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>ID / Réf.</th>
                    <th>Code</th>
                    <th>Nom</th>
                    <th>Département</th>
                    <th>Type stock</th>
                    <th>Actif</th>
                    <th>Description</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((x) => {
                    const active = x.is_active !== false && x.actif !== 'Non';
                    return (
                      <tr key={x.id}>
                        <td>
                          <span style={{ fontFamily: 'var(--font-head)', fontSize: '0.75rem', color: 'var(--text-3)' }}>
                            {x.legacy_id ? `#${x.legacy_id}` : String(x.id).slice(0, 8)}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.82rem', color: 'var(--red)' }}>{x.code}</span>
                        </td>
                        <td data-label="Nom"><span style={{ fontWeight: 600 }}>{x.name || x.nom}</span></td>
                        <td data-label="Département" style={{ fontSize: '0.8rem' }}>{x.department || '—'}</td>
                        <td data-label="Type stock" style={{ fontSize: '0.8rem' }}>{x.stock_type || '—'}</td>
                        <td data-label="Actif">
                          <span className={`badge ${active ? 'badge-green' : 'badge-grey'}`} style={{ fontSize: '0.72rem' }}>
                            {active ? 'Actif' : 'Inactif'}
                          </span>
                        </td>
                        <td data-label="Description" style={{ fontSize: '0.83rem', color: 'var(--text-2)', maxWidth: 200 }}>
                          {x.description ? (x.description.length > 50 ? `${x.description.slice(0, 50)}…` : x.description) : '—'}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 3 }}>
                            <button type="button" className="btn btn-secondary btn-sm" title="Voir" onClick={() => setDetailId(x.id)}><Eye size={13} /></button>
                            <button type="button" className="btn btn-ghost btn-sm" title="Modifier" onClick={() => { setEditItem(x); setShowModal(true); }}><Edit2 size={13} /></button>
                            <button type="button" className="btn btn-ghost btn-sm" title={active ? 'Désactiver' : 'Réactiver'} onClick={() => handleToggle(x)}><ToggleLeft size={13} /></button>
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

          <div className="inv-stock-mobile-only">
            {filtered.map((x) => (
              <MobileCard
                key={x.id}
                item={x}
                onView={() => setDetailId(x.id)}
                onEdit={(item) => { setEditItem(item); setShowModal(true); }}
                onToggle={handleToggle}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </>
      )}

      <Modal open={showModal} onClose={() => { setShowModal(false); setEditItem(null); }} title={editItem ? 'Modifier la catégorie' : 'Nouvelle catégorie'} width={720}>
        <CatForm initial={editItem} onSave={handleSave} onCancel={() => { setShowModal(false); setEditItem(null); }} saving={saving} />
      </Modal>
    </div>
  );
}

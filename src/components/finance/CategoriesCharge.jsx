/**
 * CategoriesCharge.jsx — Gestion des catégories de charges ERP CITYMO
 * Backend-ready / database-ready
 */
import { useState, useCallback } from 'react';
import { Tag, Plus, Edit2, Trash2, Archive, ToggleLeft, Search, Filter, Download, Loader2, RefreshCw } from 'lucide-react';
import { useChargeCategories } from '../../hooks/useChargeCategories';
import {
  INPUT_STYLE, SELECT_STYLE, TEXTAREA_STYLE,
  STATUTS_CAT, BADGE_STATUT_CAT,
  KpiCard, EmptyState, Modal, SectionTitle, FField, FRow,
} from './shared.jsx';

const EMPTY_FORM = { nom: '', description: '', statut: 'Active' };

function CatForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  function validate() {
    const e = {};
    if (!form.nom.trim()) e.nom = 'Requis';
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
      <SectionTitle icon={<Tag size={12} />}>Informations catégorie</SectionTitle>
      <FRow>
        <FField label="Nom de la catégorie" required>
          <input
            value={form.nom}
            onChange={e => set('nom', e.target.value)}
            placeholder="Ex: Fournitures bureau, Transport..."
            style={{ ...INPUT_STYLE, borderColor: errors.nom ? 'var(--red)' : 'var(--border)' }}
          />
          {errors.nom && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors.nom}</div>}
        </FField>
        <FField label="Statut">
          <select value={form.statut} onChange={e => set('statut', e.target.value)} style={SELECT_STYLE}>
            {STATUTS_CAT.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </FField>
      </FRow>
      <div style={{ marginBottom: 20 }}>
        <FField label="Description">
          <textarea
            value={form.description}
            onChange={e => set('description', e.target.value)}
            placeholder="Description de la catégorie, contexte comptable..."
            style={TEXTAREA_STYLE}
          />
        </FField>
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Annuler</button>
        <button type="submit" className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={14} /> {initial ? 'Enregistrer' : 'Ajouter'}
        </button>
      </div>
    </form>
  );
}

export default function CategoriesCharge() {
  const { records: cats, loading, error, configured, reload, save, remove } = useChargeCategories();
  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editCat, setEditCat] = useState(null);

  const handleSave = useCallback(async (data) => {
    const res = await save(data, editCat?.id);
    if (res.success) {
      setShowModal(false);
      setEditCat(null);
    }
  }, [editCat, save]);

  async function handleDelete(id) {
    if (window.confirm('Supprimer cette catégorie ?')) await remove(id);
  }

  async function handleToggleStatut(cat, newStatut) {
    await save({ ...cat, statut: newStatut }, cat.id);
  }

  const filtered = cats.filter(c => {
    const q = search.toLowerCase();
    const matchQ = !q || c.nom.toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q);
    const matchS = !filterStatut || c.statut === filterStatut;
    return matchQ && matchS;
  });

  const total    = cats.length;
  const actives  = cats.filter(c => c.statut === 'Active').length;
  const archivees = cats.filter(c => c.statut === 'Archivée').length;
  const avecCharges = cats.filter(c => (c.charges_liees || 0) > 0).length;

  if (loading && !cats.length) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48, gap: 10, color: 'var(--text-3)' }}>
        <Loader2 size={22} className="cin-spin" /> Chargement des catégories…
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {!configured && (
        <div className="card" style={{ marginBottom: 12, padding: 12, color: 'var(--red)', fontSize: '0.85rem' }}>
          Supabase non configuré sur Vercel — ajoutez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY (projet npddbwsskaojcawaxygh).
        </div>
      )}
      {error && (
        <div className="card" style={{ marginBottom: 12, padding: 12, color: 'var(--red)', fontSize: '0.85rem' }}>{error}</div>
      )}
      {/* Header */}
      <div className="page-header flex-between finance-page-header">
        <div>
          <h1 className="page-title">CATÉGORIES DE CHARGE</h1>
          <p className="page-subtitle finance-sub-hide-mobile">Gestion des catégories de dépenses et charges financières.</p>
        </div>
        <div className="finance-page-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => reload()} disabled={loading}>
            <RefreshCw size={14} /> Actualiser
          </button>
          <button className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setShowFilters(f => !f)}>
            <Filter size={14} /> Filtres
          </button>
          <button className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Download size={14} /> Export
          </button>
          <button className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => { setEditCat(null); setShowModal(true); }}>
            <Plus size={15} /> Ajouter catégorie
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="stat-grid finance-kpi-strip" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', marginBottom: 20 }}>
        <KpiCard icon={<Tag size={17} />}         label="Total catégories"    value={total}      color="grey"   />
        <KpiCard icon={<Tag size={17} />}         label="Catégories actives"  value={actives}    color="green"  />
        <KpiCard icon={<Archive size={17} />}     label="Archivées"           value={archivees}  color="orange" />
        <KpiCard icon={<Tag size={17} />}         label="Avec dépenses"       value={avecCharges} color="blue"  />
      </div>

      {/* Filtres */}
      {showFilters && (
        <div className="card finance-toolbar" style={{ marginBottom: 16, padding: '14px 20px' }}>
          <div className="finance-toolbar-inner">
            <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nom, description..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
            </div>
            <select value={filterStatut} onChange={e => setFilterStatut(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 160 }}>
              <option value="">Tous les statuts</option>
              {STATUTS_CAT.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFilterStatut(''); }}>
              Réinitialiser
            </button>
          </div>
        </div>
      )}

      {/* Barre recherche rapide */}
      {!showFilters && (
        <div className="card" style={{ marginBottom: 12, padding: '10px 14px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher une catégorie..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
          </div>
        </div>
      )}

      {/* Tableau */}
      <div className="card" style={{ padding: 0 }}>
        {filtered.length === 0 ? (
          <EmptyState
            icon={<Tag size={24} />}
            title="Aucune catégorie"
            sub={configured && !error
              ? 'Exécutez supabase/RUN_FINANCE_COMPLET.sql dans Supabase SQL Editor, puis cliquez Actualiser.'
              : 'Connectez-vous et vérifiez la configuration Supabase (projet npddbwsskaojcawaxygh).'}
            action="Ajouter catégorie"
            onAction={() => { setEditCat(null); setShowModal(true); }}
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Description</th>
                  <th>Statut</th>
                  <th>Date création</th>
                  <th>Charges liées</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id}>
                    <td data-label="Nom">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--red-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Tag size={14} style={{ color: 'var(--red)' }} />
                        </div>
                        <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{c.nom}</div>
                      </div>
                    </td>
                    <td data-label="Description">
                      <span style={{ fontSize: '0.82rem', color: 'var(--text-2)' }}>
                        {c.description ? (c.description.length > 60 ? c.description.slice(0, 60) + '...' : c.description) : '—'}
                      </span>
                    </td>
                    <td data-label="Statut">
                      <span className={"badge " + (BADGE_STATUT_CAT[c.statut] || 'badge-grey')}>{c.statut}</span>
                    </td>
                    <td data-label="Date création">{c.date_creation || '—'}</td>
                    <td data-label="Charges liées">
                      <span style={{ fontWeight: 700, color: (c.charges_liees || 0) > 0 ? 'var(--text)' : 'var(--text-3)' }}>
                        {c.charges_liees || 0}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-secondary btn-sm" title="Modifier" onClick={() => { setEditCat(c); setShowModal(true); }}>
                          <Edit2 size={13} />
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          title={c.statut === 'Active' ? 'Désactiver' : 'Activer'}
                          onClick={() => handleToggleStatut(c, c.statut === 'Active' ? 'Inactive' : 'Active')}
                        >
                          <ToggleLeft size={13} />
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          title="Archiver"
                          onClick={() => handleToggleStatut(c, 'Archivée')}
                        >
                          <Archive size={13} />
                        </button>
                        <button className="btn btn-ghost btn-sm" title="Supprimer" onClick={() => handleDelete(c.id)} style={{ color: 'var(--red)' }}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      <Modal open={showModal} onClose={() => { setShowModal(false); setEditCat(null); }} title={editCat ? 'Modifier la catégorie' : 'Nouvelle catégorie'} width={520}>
        <CatForm initial={editCat} onSave={handleSave} onCancel={() => { setShowModal(false); setEditCat(null); }} />
      </Modal>
    </div>
  );
}

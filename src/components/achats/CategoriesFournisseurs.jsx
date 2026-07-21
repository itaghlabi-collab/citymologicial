/**
 * CategoriesFournisseurs.jsx — CRUD catalogue catégories fournisseurs
 * N’affecte pas les catégories stock / charges.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Tag, Plus, Edit2, Trash2, ToggleLeft, Search, Loader2, RefreshCw,
} from 'lucide-react';
import {
  listSupplierCategories,
  createSupplierCategory,
  updateSupplierCategory,
  activateSupplierCategory,
  deactivateSupplierCategory,
  removeOrDeactivateSupplierCategory,
  isMissingCategorySchema,
} from '../../services/achats/supplierCategories';
import { isSupabaseConfigured } from '../../lib/supabase';
import {
  INPUT_STYLE, SELECT_STYLE,
  KpiCard, EmptyState, Modal, SectionTitle, FField, FRow,
} from './shared.jsx';

const EMPTY_FORM = { name: '', is_active: true };

function CatForm({ initial, onSave, onCancel, saving }) {
  const [form, setForm] = useState(() => ({
    name: initial?.name || '',
    is_active: initial?.is_active !== false,
  }));
  const [errors, setErrors] = useState({});

  function handleSubmit(ev) {
    ev.preventDefault();
    if (!form.name.trim()) {
      setErrors({ name: 'Requis' });
      return;
    }
    setErrors({});
    onSave(form);
  }

  return (
    <form onSubmit={handleSubmit}>
      <SectionTitle icon={<Tag size={12} />}>Informations catégorie</SectionTitle>
      <FRow>
        <FField label="Nom de la catégorie" required>
          <input
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="Ex: Électricité, Plomberie…"
            style={{ ...INPUT_STYLE, borderColor: errors.name ? 'var(--red)' : 'var(--border)' }}
          />
          {errors.name && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors.name}</div>}
        </FField>
        <FField label="Statut">
          <select
            value={form.is_active ? 'active' : 'inactive'}
            onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.value === 'active' }))}
            style={SELECT_STYLE}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </FField>
      </FRow>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>Annuler</button>
        <button type="submit" className="btn btn-primary" disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {saving ? <Loader2 size={14} className="cin-spin" /> : <Plus size={14} />}
          {initial ? 'Enregistrer' : 'Ajouter'}
        </button>
      </div>
    </form>
  );
}

export default function CategoriesFournisseurs() {
  const configured = isSupabaseConfigured();
  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editCat, setEditCat] = useState(null);

  const reload = useCallback(async () => {
    if (!configured) {
      setCats([]);
      setLoading(false);
      setSchemaMissing(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await listSupplierCategories({ activeOnly: false, withUsage: true });
      setCats(list);
      setSchemaMissing(false);
    } catch (err) {
      if (isMissingCategorySchema(err)) {
        setSchemaMissing(true);
        setCats([]);
      } else {
        setError(err?.message || 'Erreur chargement catégories.');
      }
    } finally {
      setLoading(false);
    }
  }, [configured]);

  useEffect(() => { reload(); }, [reload]);

  async function handleSave(form) {
    setSaving(true);
    setError(null);
    try {
      if (editCat?.id) {
        await updateSupplierCategory(editCat.id, { name: form.name, is_active: form.is_active });
      } else {
        const created = await createSupplierCategory({ name: form.name });
        if (form.is_active === false) {
          await deactivateSupplierCategory(created.id);
        }
      }
      setShowModal(false);
      setEditCat(null);
      await reload();
    } catch (err) {
      setError(err?.message || 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(cat) {
    const used = (cat.usage_count || 0) > 0;
    const msg = used
      ? `« ${cat.name} » est utilisée par ${cat.usage_count} fournisseur(s).\nElle sera désactivée (pas supprimée). Continuer ?`
      : `Supprimer la catégorie « ${cat.name} » ?`;
    if (!window.confirm(msg)) return;
    setSaving(true);
    setError(null);
    try {
      const res = await removeOrDeactivateSupplierCategory(cat.id);
      if (res.action === 'deactivated') {
        window.alert(`Catégorie désactivée (utilisée par ${res.usage} fournisseur(s)).`);
      }
      await reload();
    } catch (err) {
      setError(err?.message || 'Suppression impossible.');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(cat) {
    setSaving(true);
    setError(null);
    try {
      if (cat.is_active) await deactivateSupplierCategory(cat.id);
      else await activateSupplierCategory(cat.id);
      await reload();
    } catch (err) {
      setError(err?.message || 'Changement de statut impossible.');
    } finally {
      setSaving(false);
    }
  }

  const filtered = cats.filter((c) => {
    const q = search.toLowerCase().trim();
    const matchQ = !q || c.name.toLowerCase().includes(q);
    const matchS = !filterStatut
      || (filterStatut === 'active' && c.is_active)
      || (filterStatut === 'inactive' && !c.is_active);
    return matchQ && matchS;
  });

  const total = cats.length;
  const actives = cats.filter((c) => c.is_active).length;
  const inactives = total - actives;
  const used = cats.filter((c) => (c.usage_count || 0) > 0).length;

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
          Supabase non configuré — ajoutez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY.
        </div>
      )}
      {schemaMissing && (
        <div className="card" style={{ marginBottom: 12, padding: 12, color: '#E65100', fontSize: '0.85rem' }}>
          Exécutez <code>supabase/RUN_PURCHASE_SUPPLIER_CATEGORIES.sql</code> puis
          {' '}<code>RUN_PURCHASE_SUPPLIER_CATEGORIES_TRIM.sql</code> dans le SQL Editor Supabase.
        </div>
      )}
      {error && (
        <div className="card" style={{ marginBottom: 12, padding: 12, color: 'var(--red)', fontSize: '0.85rem' }}>{error}</div>
      )}

      <div className="page-header flex-between">
        <div>
          <h1 className="page-title">CATÉGORIES FOURNISSEURS</h1>
          <p className="page-subtitle">Catalogue des catégories de l’annuaire fournisseurs.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => reload()} disabled={loading}>
            <RefreshCw size={14} /> Actualiser
          </button>
          <button
            type="button"
            className="btn btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            onClick={() => { setEditCat(null); setShowModal(true); }}
            disabled={schemaMissing || !configured}
          >
            <Plus size={15} /> Ajouter catégorie
          </button>
        </div>
      </div>

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', marginBottom: 20 }}>
        <KpiCard icon={<Tag size={17} />} label="Total" value={total} color="grey" />
        <KpiCard icon={<Tag size={17} />} label="Actives" value={actives} color="green" />
        <KpiCard icon={<Tag size={17} />} label="Inactives" value={inactives} color="orange" />
        <KpiCard icon={<Tag size={17} />} label="Utilisées" value={used} color="blue" />
      </div>

      <div className="card" style={{ marginBottom: 12, padding: '10px 14px' }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher une catégorie…"
              style={{ ...INPUT_STYLE, paddingLeft: 32 }}
            />
          </div>
          <select value={filterStatut} onChange={(e) => setFilterStatut(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 160 }}>
            <option value="">Tous les statuts</option>
            <option value="active">Actives</option>
            <option value="inactive">Inactives</option>
          </select>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {filtered.length === 0 ? (
          <EmptyState
            icon={<Tag size={24} />}
            title="Aucune catégorie"
            sub={schemaMissing
              ? 'Exécutez les scripts SQL catégories fournisseurs, puis Actualiser.'
              : 'Ajoutez une catégorie pour commencer.'}
            action="Ajouter catégorie"
            onAction={() => { setEditCat(null); setShowModal(true); }}
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Statut</th>
                  <th>Fournisseurs liés</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id}>
                    <td data-label="Nom">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: 8, background: 'var(--red-light)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}>
                          <Tag size={14} style={{ color: 'var(--red)' }} />
                        </div>
                        <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{c.name}</div>
                      </div>
                    </td>
                    <td data-label="Statut">
                      <span className={`badge ${c.is_active ? 'badge-green' : 'badge-grey'}`}>
                        {c.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td data-label="Fournisseurs liés">
                      <span style={{ fontWeight: 700, color: (c.usage_count || 0) > 0 ? 'var(--text)' : 'var(--text-3)' }}>
                        {c.usage_count || 0}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button type="button" className="btn btn-secondary btn-sm" title="Modifier" onClick={() => { setEditCat(c); setShowModal(true); }}>
                          <Edit2 size={13} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          title={c.is_active ? 'Désactiver' : 'Activer'}
                          onClick={() => handleToggle(c)}
                          disabled={saving}
                        >
                          <ToggleLeft size={13} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          title={(c.usage_count || 0) > 0 ? 'Désactiver (utilisée)' : 'Supprimer'}
                          onClick={() => handleDelete(c)}
                          disabled={saving}
                          style={{ color: 'var(--red)' }}
                        >
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

      <Modal
        open={showModal}
        onClose={() => { if (!saving) { setShowModal(false); setEditCat(null); } }}
        title={editCat ? 'Modifier la catégorie' : 'Nouvelle catégorie'}
        width={520}
      >
        <CatForm
          initial={editCat || EMPTY_FORM}
          onSave={handleSave}
          onCancel={() => { setShowModal(false); setEditCat(null); }}
          saving={saving}
        />
      </Modal>
    </div>
  );
}

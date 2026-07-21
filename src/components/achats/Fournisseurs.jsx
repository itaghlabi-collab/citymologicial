/**
 * Fournisseurs.jsx — Liste existante + onglet Annuaire (complémentaire).
 * Ne casse pas BC / DA / réceptions : aliases company_name etc. inchangés.
 */
import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  UserCog, Plus, Eye, Edit2, Search, Filter, Download,
  ToggleLeft, Phone, Mail, MapPin, Loader2, RefreshCw, Archive, Tag, BookUser, List,
} from 'lucide-react';
import { useSuppliers } from '../../hooks/useSuppliers';
import {
  createSupplierCategory,
  isMissingCategorySchema,
  listSupplierCategories,
} from '../../services/achats/supplierCategories';
import {
  findSimilarSuppliers,
  listMyFavoriteSupplierIds,
  toggleFavoriteSupplier,
} from '../../services/achats/supplierAnnuaire';
import FournisseursAnnuaire from './FournisseursAnnuaire.jsx';
import FournisseurFiche from './FournisseurFiche.jsx';
import { StarRatingInput } from './StarRating.jsx';
import {
  INPUT_STYLE, SELECT_STYLE, TEXTAREA_STYLE,
  MODES_PAIEMENT, CATEGORIES_FOURN,
  KpiCard, EmptyState, Modal, SectionTitle, FField, FRow,
} from './shared.jsx';

const EMPTY_FORM = {
  company_name: '',
  trade_name: '',
  ice: '',
  rc: '',
  tax_id: '',
  cnss: '',
  phone: '',
  phone_secondary: '',
  whatsapp: '',
  email: '',
  website: '',
  address: '',
  city: '',
  region: '',
  main_contact: '',
  contact_role: '',
  contact_phone: '',
  contact_email: '',
  supplier_category: '',
  primary_category_id: null,
  secondary_category_ids: [],
  products_services: '',
  brands: '',
  delivery_zone: '',
  avg_delivery_delay: '',
  payment_terms: '',
  preferred_payment_method: 'Virement',
  min_order_amount: '',
  rib: '',
  bank: '',
  delivery_available: false,
  installation_available: false,
  sav_available: false,
  is_recommended: false,
  rating_quality_price: null,
  rating_comment: '',
  status: 'active',
  notes: '',
};

const STATUT_OPTIONS = [
  { value: 'active', label: 'Actif' },
  { value: 'inactive', label: 'Inactif' },
  { value: 'archived', label: 'Archivé' },
];

function badgeStatut(statut) {
  if (statut === 'Actif') return 'badge-green';
  if (statut === 'Archivé') return 'badge-orange';
  return 'badge-grey';
}

function formatCategoriesLabel(item) {
  const primary = item.supplier_category || item.categories?.find((c) => c.is_primary)?.name || '';
  const secondaryNames = (item.secondary_categories || item.categories?.filter((c) => !c.is_primary) || [])
    .map((c) => c.name)
    .filter(Boolean);
  if (!primary && !secondaryNames.length) return '—';
  if (!secondaryNames.length) return primary;
  return `${primary || '—'} (+${secondaryNames.length})`;
}

function CheckField({ label, checked, onChange }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', cursor: 'pointer' }}>
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function FournisseurForm({
  initial, onSave, onCancel, saving, categories, onCategoriesChange, categoriesReady, allSuppliers,
}) {
  const [form, setForm] = useState(() => {
    if (!initial) return EMPTY_FORM;
    return {
      ...EMPTY_FORM,
      ...initial,
      status: initial.status || 'active',
      primary_category_id: initial.primary_category_id || null,
      secondary_category_ids: Array.isArray(initial.secondary_category_ids) ? initial.secondary_category_ids : [],
      delivery_available: !!initial.delivery_available,
      installation_available: !!initial.installation_available,
      sav_available: !!initial.sav_available,
      is_recommended: !!initial.is_recommended,
      rating_quality_price: initial.rating_quality_price ?? null,
      rating_comment: initial.rating_comment || '',
    };
  });
  const [errors, setErrors] = useState({});
  const [newCatName, setNewCatName] = useState('');
  const [creatingCat, setCreatingCat] = useState(false);
  const [catError, setCatError] = useState(null);
  const [dupWarn, setDupWarn] = useState([]);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const useCatalog = categoriesReady && categories.length > 0;
  const catalogOptions = categories.filter((c) => c.is_active !== false);

  function setPrimary(id) {
    const cat = catalogOptions.find((c) => c.id === id);
    setForm((p) => ({
      ...p,
      primary_category_id: id || null,
      supplier_category: cat?.name || '',
      secondary_category_ids: (p.secondary_category_ids || []).filter((sid) => sid !== id),
    }));
  }

  function toggleSecondary(id) {
    setForm((p) => {
      if (id === p.primary_category_id) return p;
      const cur = new Set(p.secondary_category_ids || []);
      if (cur.has(id)) cur.delete(id);
      else cur.add(id);
      return { ...p, secondary_category_ids: [...cur] };
    });
  }

  async function handleQuickCreateCategory() {
    const name = newCatName.trim();
    if (!name) return;
    setCreatingCat(true);
    setCatError(null);
    try {
      const created = await createSupplierCategory({ name });
      await onCategoriesChange?.();
      setNewCatName('');
      setPrimary(created.id);
    } catch (err) {
      setCatError(err?.message || 'Impossible de créer la catégorie.');
    } finally {
      setCreatingCat(false);
    }
  }

  function handleSubmit(ev) {
    ev.preventDefault();
    if (!form.company_name.trim()) {
      setErrors({ company_name: 'Requis' });
      return;
    }
    const similar = findSimilarSuppliers(allSuppliers, form, { excludeId: initial?.id });
    if (similar.length && !window.confirm(
      `Attention : ${similar.length} fournisseur(s) similaire(s) détecté(s) (${similar.map((s) => s.company_name).join(', ')}).\nContinuer l’enregistrement ?`,
    )) {
      setDupWarn(similar);
      return;
    }
    setErrors({});
    setDupWarn([]);
    if (useCatalog) {
      onSave({
        ...form,
        primary_category_id: form.primary_category_id || null,
        secondary_category_ids: form.secondary_category_ids || [],
      });
    } else {
      const { primary_category_id: _p, secondary_category_ids: _s, ...legacy } = form;
      onSave(legacy);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <SectionTitle icon={<UserCog size={12} />}>1. Identité</SectionTitle>
      <FRow>
        <FField label="Raison sociale" required>
          <input
            value={form.company_name}
            onChange={(e) => set('company_name', e.target.value)}
            placeholder="Raison sociale..."
            style={{ ...INPUT_STYLE, borderColor: errors.company_name ? 'var(--red)' : 'var(--border)' }}
          />
          {errors.company_name && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors.company_name}</div>}
        </FField>
        <FField label="Nom commercial"><input value={form.trade_name} onChange={(e) => set('trade_name', e.target.value)} placeholder="Nom commercial..." style={INPUT_STYLE} /></FField>
        <FField label="ICE"><input value={form.ice} onChange={(e) => set('ice', e.target.value)} placeholder="N° ICE" style={INPUT_STYLE} /></FField>
        <FField label="RC"><input value={form.rc} onChange={(e) => set('rc', e.target.value)} placeholder="N° RC" style={INPUT_STYLE} /></FField>
        <FField label="IF"><input value={form.tax_id} onChange={(e) => set('tax_id', e.target.value)} placeholder="Identifiant fiscal" style={INPUT_STYLE} /></FField>
        <FField label="CNSS"><input value={form.cnss} onChange={(e) => set('cnss', e.target.value)} placeholder="N° CNSS" style={INPUT_STYLE} /></FField>
      </FRow>

      <SectionTitle icon={<MapPin size={12} />}>Adresse</SectionTitle>
      <FRow>
        <FField label="Adresse"><input value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Adresse complète..." style={INPUT_STYLE} /></FField>
        <FField label="Ville"><input value={form.city} onChange={(e) => set('city', e.target.value)} placeholder="Ville..." style={INPUT_STYLE} /></FField>
        <FField label="Région"><input value={form.region} onChange={(e) => set('region', e.target.value)} placeholder="Région..." style={INPUT_STYLE} /></FField>
      </FRow>

      <SectionTitle icon={<Phone size={12} />}>2. Contact</SectionTitle>
      <FRow>
        <FField label="Téléphone principal"><input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+212..." style={INPUT_STYLE} /></FField>
        <FField label="Téléphone secondaire"><input value={form.phone_secondary} onChange={(e) => set('phone_secondary', e.target.value)} placeholder="+212..." style={INPUT_STYLE} /></FField>
        <FField label="WhatsApp"><input value={form.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} placeholder="+212..." style={INPUT_STYLE} /></FField>
        <FField label="Email"><input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="contact@societe.ma" style={INPUT_STYLE} /></FField>
        <FField label="Site web"><input value={form.website} onChange={(e) => set('website', e.target.value)} placeholder="https://..." style={INPUT_STYLE} /></FField>
        <FField label="Contact principal"><input value={form.main_contact} onChange={(e) => set('main_contact', e.target.value)} placeholder="Nom contact" style={INPUT_STYLE} /></FField>
        <FField label="Fonction"><input value={form.contact_role} onChange={(e) => set('contact_role', e.target.value)} placeholder="Responsable achats..." style={INPUT_STYLE} /></FField>
        <FField label="Tél. contact"><input value={form.contact_phone} onChange={(e) => set('contact_phone', e.target.value)} placeholder="+212..." style={INPUT_STYLE} /></FField>
        <FField label="Email contact"><input type="email" value={form.contact_email} onChange={(e) => set('contact_email', e.target.value)} placeholder="email@contact.ma" style={INPUT_STYLE} /></FField>
      </FRow>

      <SectionTitle icon={<Tag size={12} />}>3. Catégories</SectionTitle>
      {useCatalog ? (
        <div style={{ marginBottom: 16 }}>
          <FRow>
            <FField label="Catégorie principale">
              <select value={form.primary_category_id || ''} onChange={(e) => setPrimary(e.target.value || null)} style={SELECT_STYLE}>
                <option value="">Sélectionner...</option>
                {catalogOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </FField>
          </FRow>
          <FField label="Catégories secondaires">
            <div className="achats-fourn-cat-grid">
              {catalogOptions.filter((c) => c.id !== form.primary_category_id).map((c) => {
                const checked = (form.secondary_category_ids || []).includes(c.id);
                return (
                  <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={checked} onChange={() => toggleSecondary(c.id)} />
                    <span>{c.name}</span>
                  </label>
                );
              })}
            </div>
          </FField>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <input value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder="Nouvelle catégorie..." style={{ ...INPUT_STYLE, flex: 1, minWidth: 180 }} />
            <button type="button" className="btn btn-secondary btn-sm" disabled={creatingCat || !newCatName.trim()} onClick={handleQuickCreateCategory}>
              {creatingCat ? <Loader2 size={13} className="cin-spin" /> : <Plus size={13} />} Créer catégorie
            </button>
          </div>
          {catError && <div style={{ color: 'var(--red)', fontSize: '0.75rem', marginTop: 6 }}>{catError}</div>}
        </div>
      ) : (
        <FRow>
          <FField label="Catégorie fournisseur">
            <select value={form.supplier_category} onChange={(e) => set('supplier_category', e.target.value)} style={SELECT_STYLE}>
              <option value="">Sélectionner...</option>
              {CATEGORIES_FOURN.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            {!categoriesReady && (
              <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', marginTop: 4 }}>
                Exécutez RUN_PURCHASE_SUPPLIER_CATEGORIES.sql pour le catalogue multi-catégories.
              </div>
            )}
          </FField>
        </FRow>
      )}

      <SectionTitle icon={<Tag size={12} />}>4. Produits / services & marques</SectionTitle>
      <FRow>
        <FField label="Produits / services proposés">
          <textarea value={form.products_services} onChange={(e) => set('products_services', e.target.value)} placeholder="Ex: câbles, tableaux, éclairage LED…" style={TEXTAREA_STYLE} />
        </FField>
        <FField label="Marques distribuées">
          <input value={form.brands} onChange={(e) => set('brands', e.target.value)} placeholder="Séparer par des virgules" style={INPUT_STYLE} />
        </FField>
      </FRow>

      <SectionTitle icon={<UserCog size={12} />}>5. Conditions commerciales</SectionTitle>
      <FRow>
        <FField label="Zone de livraison"><input value={form.delivery_zone} onChange={(e) => set('delivery_zone', e.target.value)} placeholder="Casablanca, Rabat…" style={INPUT_STYLE} /></FField>
        <FField label="Délai moyen livraison"><input value={form.avg_delivery_delay} onChange={(e) => set('avg_delivery_delay', e.target.value)} placeholder="Ex: 48h, 5 jours…" style={INPUT_STYLE} /></FField>
        <FField label="Délai paiement"><input value={form.payment_terms} onChange={(e) => set('payment_terms', e.target.value)} placeholder="Ex: 30 jours…" style={INPUT_STYLE} /></FField>
        <FField label="Mode règlement">
          <select value={form.preferred_payment_method} onChange={(e) => set('preferred_payment_method', e.target.value)} style={SELECT_STYLE}>
            {MODES_PAIEMENT.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </FField>
        <FField label="Montant min. commande"><input type="number" step="0.01" value={form.min_order_amount} onChange={(e) => set('min_order_amount', e.target.value)} placeholder="0" style={INPUT_STYLE} /></FField>
        <FField label="Banque"><input value={form.bank} onChange={(e) => set('bank', e.target.value)} placeholder="Banque..." style={INPUT_STYLE} /></FField>
        <FField label="RIB"><input value={form.rib} onChange={(e) => set('rib', e.target.value)} placeholder="RIB / IBAN..." style={INPUT_STYLE} /></FField>
        <FField label="Statut">
          <select value={form.status} onChange={(e) => set('status', e.target.value)} style={SELECT_STYLE}>
            {STATUT_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </FField>
      </FRow>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 16 }}>
        <CheckField label="Livraison disponible" checked={form.delivery_available} onChange={(v) => set('delivery_available', v)} />
        <CheckField label="Installation disponible" checked={form.installation_available} onChange={(v) => set('installation_available', v)} />
        <CheckField label="SAV disponible" checked={form.sav_available} onChange={(v) => set('sav_available', v)} />
        <CheckField label="Fournisseur recommandé" checked={form.is_recommended} onChange={(v) => set('is_recommended', v)} />
      </div>

      <SectionTitle icon={<Tag size={12} />}>Notation — Rapport qualité / prix</SectionTitle>
      <FRow>
        <FField label="Étoiles (1 à 5)">
          <StarRatingInput
            value={form.rating_quality_price}
            onChange={(v) => set('rating_quality_price', v)}
            disabled={saving}
          />
        </FField>
        <FField label="Commentaire notation">
          <input
            value={form.rating_comment}
            onChange={(e) => set('rating_comment', e.target.value)}
            placeholder="Ex: bon rapport qualité/prix, délais respectés…"
            style={INPUT_STYLE}
          />
        </FField>
      </FRow>

      <SectionTitle icon={<UserCog size={12} />}>6. Notes</SectionTitle>
      <div style={{ marginBottom: 16 }}>
        <FField label="Notes internes"><textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Notes internes..." style={TEXTAREA_STYLE} /></FField>
      </div>

      {dupWarn.length > 0 && (
        <div className="card" style={{ marginBottom: 12, padding: 10, color: 'var(--orange, #c47a00)', fontSize: '0.8rem' }}>
          Doublons potentiels : {dupWarn.map((s) => s.company_name).join(', ')}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>Annuler</button>
        <button type="submit" className="btn btn-primary" disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {saving ? <Loader2 size={14} className="cin-spin" /> : <Plus size={14} />}
          {initial ? 'Enregistrer' : 'Ajouter fournisseur'}
        </button>
      </div>
    </form>
  );
}

export default function Fournisseurs({ onFournisseursChange, onNavigate }) {
  const { records: items, loading, saving, error, configured, reload, save, remove, exportCsv } = useSuppliers();
  const [viewTab, setViewTab] = useState('liste');
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [categories, setCategories] = useState([]);
  const [categoriesReady, setCategoriesReady] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState(() => new Set());

  const loadCategories = useCallback(async () => {
    if (!configured) {
      setCategories([]);
      setCategoriesReady(false);
      return;
    }
    try {
      const list = await listSupplierCategories({ activeOnly: true });
      setCategories(list);
      setCategoriesReady(true);
    } catch (err) {
      if (isMissingCategorySchema(err)) {
        setCategories([]);
        setCategoriesReady(false);
        return;
      }
      console.warn('[CITYMO] loadCategories', err);
      setCategories([]);
      setCategoriesReady(false);
    }
  }, [configured]);

  const loadFavorites = useCallback(async () => {
    if (!configured) return;
    try {
      const ids = await listMyFavoriteSupplierIds();
      setFavoriteIds(new Set(ids));
    } catch (err) {
      console.warn('[CITYMO] loadFavorites', err);
    }
  }, [configured]);

  useEffect(() => { loadCategories(); loadFavorites(); }, [loadCategories, loadFavorites]);

  useEffect(() => {
    if (onFournisseursChange) {
      onFournisseursChange(items.filter((x) => x.status !== 'archived'));
    }
  }, [items, onFournisseursChange]);

  const handleSave = useCallback(async (data) => {
    const res = await save(data, editItem?.id);
    if (res.success) {
      setShowModal(false);
      setEditItem(null);
    }
  }, [editItem, save]);

  async function handleArchive(id) {
    if (window.confirm('Archiver ce fournisseur ?')) {
      await remove(id);
      setDetailId(null);
    }
  }

  async function toggleStatut(item) {
    const next = item.status === 'active' ? 'inactive' : 'active';
    await save({ ...item, status: next }, item.id);
  }

  async function handleToggleFavorite(item) {
    try {
      const next = await toggleFavoriteSupplier(item.id, favoriteIds.has(item.id));
      setFavoriteIds((prev) => {
        const n = new Set(prev);
        if (next) n.add(item.id);
        else n.delete(item.id);
        return n;
      });
    } catch (err) {
      window.alert(err?.message || 'Favori indisponible.');
    }
  }

  async function handleSaveRating(item, { rating_quality_price, rating_comment }) {
    const res = await save({
      ...item,
      rating_quality_price,
      rating_comment,
      primary_category_id: item.primary_category_id ?? null,
      secondary_category_ids: item.secondary_category_ids || [],
    }, item.id);
    if (!res.success) {
      window.alert(res.error || 'Impossible d’enregistrer la note. Vérifiez RUN_PURCHASE_SUPPLIERS_RATING.sql.');
      return false;
    }
    return true;
  }

  function handleCreateBC(item) {
    try {
      sessionStorage.setItem('citymo_bc_prefill_supplier', JSON.stringify({
        id: item.id,
        name: item.company_name,
      }));
    } catch { /* ignore */ }
    onNavigate?.('bons-commande');
  }

  const openEdit = (item) => { setEditItem(item); setShowModal(true); };
  const openView = (item) => { setDetailId(item.id); };

  const filtered = items.filter((x) => {
    const q = search.toLowerCase();
    const matchQ = !q
      || x.company_name?.toLowerCase().includes(q)
      || (x.trade_name || '').toLowerCase().includes(q)
      || (x.main_contact || '').toLowerCase().includes(q)
      || (x.city || '').toLowerCase().includes(q)
      || (x.ice || '').toLowerCase().includes(q)
      || (x.supplier_category || '').toLowerCase().includes(q)
      || (x.brands || '').toLowerCase().includes(q)
      || (x.categories || []).some((c) => (c.name || '').toLowerCase().includes(q));
    const matchCat = !filterCat
      || x.primary_category_id === filterCat
      || (x.category_ids || []).includes(filterCat)
      || x.supplier_category === filterCat;
    const matchStatut = !filterStatut || x.statut === filterStatut;
    return matchQ && matchCat && matchStatut;
  });

  const total = items.length;
  const actifs = items.filter((x) => x.status === 'active').length;
  const inactifs = items.filter((x) => x.status === 'inactive').length;
  const archives = items.filter((x) => x.status === 'archived').length;

  const detailItem = useMemo(() => items.find((x) => x.id === detailId) || null, [items, detailId]);

  const modal = (
    <Modal open={showModal} onClose={() => { setShowModal(false); setEditItem(null); }} title={editItem ? 'Modifier le fournisseur' : 'Nouveau fournisseur'} width={860}>
      <FournisseurForm
        key={editItem?.id || 'new'}
        initial={editItem}
        onSave={handleSave}
        onCancel={() => { setShowModal(false); setEditItem(null); }}
        saving={saving}
        categories={categories}
        categoriesReady={categoriesReady}
        onCategoriesChange={loadCategories}
        allSuppliers={items}
      />
    </Modal>
  );

  if (detailItem) {
    return (
      <>
        <FournisseurFiche
          item={detailItem}
          isFavorite={favoriteIds.has(detailItem.id)}
          onBack={() => setDetailId(null)}
          onEdit={() => openEdit(detailItem)}
          onArchive={handleArchive}
          onToggleFavorite={handleToggleFavorite}
          onCreateBC={handleCreateBC}
          onNavigate={onNavigate}
          onSaveRating={handleSaveRating}
          savingRating={saving}
        />
        {modal}
      </>
    );
  }

  if (loading && !items.length) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48, gap: 10, color: 'var(--text-3)' }}>
        <Loader2 size={22} className="cin-spin" /> Chargement des fournisseurs…
      </div>
    );
  }

  return (
    <div className="animate-fade-in achats-fourn-page">
      {!configured && (
        <div className="card" style={{ marginBottom: 12, padding: 12, color: 'var(--red)', fontSize: '0.85rem' }}>
          Supabase non configuré — exécutez supabase/RUN_PURCHASE_SUPPLIERS.sql puis reconnectez-vous.
        </div>
      )}
      {error && (
        <div className="card" style={{ marginBottom: 12, padding: 12, color: 'var(--red)', fontSize: '0.85rem' }}>{error}</div>
      )}

      <div className="page-header flex-between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title">FOURNISSEURS</h1>
          <p className="page-subtitle">Gestion des fournisseurs et annuaire partenaires achats.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => { reload(); loadCategories(); loadFavorites(); }} disabled={loading}>
            <RefreshCw size={14} /> Actualiser
          </button>
          {viewTab === 'liste' && (
            <button type="button" className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setShowFilters((f) => !f)}>
              <Filter size={14} /> Filtres
            </button>
          )}
          <button type="button" className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => exportCsv(filtered)} disabled={!filtered.length}>
            <Download size={14} /> Export
          </button>
          <button type="button" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => { setEditItem(null); setShowModal(true); }}>
            <Plus size={15} /> Nouveau fournisseur
          </button>
        </div>
      </div>

      <div className="achats-fourn-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={viewTab === 'liste'} className={`achats-fourn-tab ${viewTab === 'liste' ? 'is-active' : ''}`} onClick={() => setViewTab('liste')}>
          <List size={14} /> Liste des fournisseurs
        </button>
        <button type="button" role="tab" aria-selected={viewTab === 'annuaire'} className={`achats-fourn-tab ${viewTab === 'annuaire' ? 'is-active' : ''}`} onClick={() => setViewTab('annuaire')}>
          <BookUser size={14} /> Annuaire fournisseurs
        </button>
      </div>

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', marginBottom: 20 }}>
        <KpiCard icon={<UserCog size={17} />} label="Total" value={total} color="grey" />
        <KpiCard icon={<UserCog size={17} />} label="Actifs" value={actifs} color="green" />
        <KpiCard icon={<ToggleLeft size={17} />} label="Inactifs" value={inactifs} color="orange" />
        <KpiCard icon={<Archive size={17} />} label="Archivés" value={archives} color="purple" />
      </div>

      {viewTab === 'annuaire' ? (
        <FournisseursAnnuaire
          items={items}
          categories={categoriesReady ? categories : CATEGORIES_FOURN}
          favoriteIds={favoriteIds}
          onView={openView}
          onEdit={openEdit}
          onToggleFavorite={handleToggleFavorite}
          onCreateBC={handleCreateBC}
        />
      ) : (
        <>
          {showFilters ? (
            <div className="card" style={{ marginBottom: 16, padding: '14px 20px' }}>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ flex: 1, minWidth: 180, position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Société, contact, ville, ICE, catégorie..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
                </div>
                <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 220 }}>
                  <option value="">Toutes catégories</option>
                  {categoriesReady
                    ? categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)
                    : CATEGORIES_FOURN.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <select value={filterStatut} onChange={(e) => setFilterStatut(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 140 }}>
                  <option value="">Tous statuts</option>
                  <option value="Actif">Actif</option>
                  <option value="Inactif">Inactif</option>
                  <option value="Archivé">Archivé</option>
                </select>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFilterCat(''); setFilterStatut(''); }}>Réinitialiser</button>
              </div>
            </div>
          ) : (
            <div className="card" style={{ marginBottom: 12, padding: '10px 14px' }}>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un fournisseur..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
              </div>
            </div>
          )}

          <div className="card achats-fourn-list-card" style={{ padding: 0 }}>
            {filtered.length === 0 ? (
              <EmptyState
                icon={<UserCog size={24} />}
                title="Aucun fournisseur"
                sub={configured ? 'Ajoutez votre premier fournisseur achats.' : 'Configurez Supabase et exécutez RUN_PURCHASE_SUPPLIERS.sql.'}
                action="Ajouter fournisseur"
                onAction={() => { setEditItem(null); setShowModal(true); }}
              />
            ) : (
              <>
                <div className="table-wrap table-wrap--wide achats-fourn-desktop">
                  <table>
                    <thead>
                      <tr>
                        <th>Fournisseur</th>
                        <th>ICE</th>
                        <th>Téléphone</th>
                        <th>Email</th>
                        <th>Ville</th>
                        <th>Catégorie</th>
                        <th>Statut</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((x) => (
                        <tr key={x.id}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--red-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <UserCog size={15} style={{ color: 'var(--red)' }} />
                              </div>
                              <div>
                                <div style={{ fontWeight: 600, fontSize: '0.87rem' }}>{x.company_name}</div>
                                {x.main_contact && <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>{x.main_contact}</div>}
                              </div>
                            </div>
                          </td>
                          <td data-label="ICE">{x.ice || '—'}</td>
                          <td data-label="Téléphone">{x.phone || '—'}</td>
                          <td data-label="Email" style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.email || '—'}</td>
                          <td data-label="Ville">{x.city || '—'}</td>
                          <td data-label="Catégorie" title={(x.secondary_categories || []).map((c) => c.name).join(', ') || undefined}>
                            {formatCategoriesLabel(x)}
                          </td>
                          <td data-label="Statut">
                            <span className={`badge ${badgeStatut(x.statut)}`} style={{ fontSize: '0.72rem' }}>{x.statut}</span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                              <button type="button" className="btn btn-secondary btn-sm" title="Voir" onClick={() => openView(x)}><Eye size={13} /></button>
                              <button type="button" className="btn btn-ghost btn-sm" title="Modifier" onClick={() => openEdit(x)}><Edit2 size={13} /></button>
                              {x.status !== 'archived' && (
                                <button type="button" className="btn btn-ghost btn-sm" title={x.status === 'active' ? 'Désactiver' : 'Activer'} onClick={() => toggleStatut(x)}><ToggleLeft size={13} /></button>
                              )}
                              {x.status !== 'archived' && (
                                <button type="button" className="btn btn-ghost btn-sm" title="Archiver" onClick={() => handleArchive(x.id)} style={{ color: 'var(--red)' }}><Archive size={13} /></button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="achats-fourn-mobile" aria-label="Liste fournisseurs">
                  {filtered.map((x) => {
                    const initials = (x.company_name || '?')
                      .split(/\s+/)
                      .filter(Boolean)
                      .map((w) => w[0])
                      .slice(0, 2)
                      .join('')
                      .toUpperCase();
                    return (
                      <article key={x.id} className="achats-fourn-card">
                        <header className="achats-fourn-card-head">
                          <div className="achats-fourn-avatar" aria-hidden="true">{initials}</div>
                          <div className="achats-fourn-card-title-wrap">
                            <h3 className="achats-fourn-card-name">{x.company_name}</h3>
                          </div>
                          <span className={`badge ${badgeStatut(x.statut)}`}>{x.statut}</span>
                        </header>
                        <dl className="achats-fourn-card-fields">
                          <div className="achats-fourn-field"><dt>ICE</dt><dd>{x.ice || '—'}</dd></div>
                          <div className="achats-fourn-field"><dt>Téléphone</dt><dd>{x.phone || '—'}</dd></div>
                          <div className="achats-fourn-field achats-fourn-field--email"><dt>E-mail</dt><dd className="achats-fourn-email">{x.email || '—'}</dd></div>
                          <div className="achats-fourn-field-grid">
                            <div className="achats-fourn-field"><dt>Ville</dt><dd className="achats-fourn-ellipsis">{x.city || '—'}</dd></div>
                            <div className="achats-fourn-field"><dt>Catégorie</dt><dd className="achats-fourn-ellipsis">{formatCategoriesLabel(x)}</dd></div>
                          </div>
                        </dl>
                        <footer className="achats-fourn-card-actions">
                          <button type="button" className="btn btn-secondary btn-sm achats-fourn-action" onClick={() => openView(x)}><Eye size={14} /> Voir</button>
                          <button type="button" className="btn btn-ghost btn-sm achats-fourn-action" onClick={() => openEdit(x)}><Edit2 size={14} /> Modifier</button>
                          {x.status !== 'archived' && (
                            <button type="button" className="btn btn-ghost btn-sm achats-fourn-action" onClick={() => toggleStatut(x)}>
                              <ToggleLeft size={14} /> {x.status === 'active' ? 'Désactiver' : 'Activer'}
                            </button>
                          )}
                          {x.status !== 'archived' && (
                            <button type="button" className="btn btn-ghost btn-sm achats-fourn-action achats-fourn-action--danger" onClick={() => handleArchive(x.id)}>
                              <Archive size={14} /> Archiver
                            </button>
                          )}
                        </footer>
                      </article>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </>
      )}

      {modal}
    </div>
  );
}

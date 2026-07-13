/**
 * Fournisseurs.jsx — Gestion fournisseurs ERP CITYMO (Supabase purchase_suppliers)
 */
import { useState, useCallback, useEffect } from 'react';
import {
  UserCog, Plus, Eye, Edit2, Trash2, Search, Filter, Download,
  ToggleLeft, Phone, Mail, MapPin, Loader2, RefreshCw, Archive,
} from 'lucide-react';
import { useSuppliers } from '../../hooks/useSuppliers';
import {
  INPUT_STYLE, SELECT_STYLE, TEXTAREA_STYLE,
  MODES_PAIEMENT, CATEGORIES_FOURN,
  KpiCard, EmptyState, Modal, SectionTitle, FField, FRow,
} from './shared.jsx';

const EMPTY_FORM = {
  company_name: '',
  ice: '',
  rc: '',
  tax_id: '',
  phone: '',
  email: '',
  address: '',
  city: '',
  main_contact: '',
  contact_role: '',
  contact_phone: '',
  contact_email: '',
  supplier_category: '',
  payment_terms: '',
  preferred_payment_method: 'Virement',
  rib: '',
  bank: '',
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

function FournisseurForm({ initial, onSave, onCancel, saving }) {
  const [form, setForm] = useState(initial ? { ...EMPTY_FORM, ...initial, status: initial.status || 'active' } : EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  function handleSubmit(ev) {
    ev.preventDefault();
    if (!form.company_name.trim()) {
      setErrors({ company_name: 'Requis' });
      return;
    }
    setErrors({});
    onSave(form);
  }

  return (
    <form onSubmit={handleSubmit}>
      <SectionTitle icon={<UserCog size={12} />}>Société</SectionTitle>
      <FRow>
        <FField label="Nom société" required>
          <input
            value={form.company_name}
            onChange={(e) => set('company_name', e.target.value)}
            placeholder="Raison sociale..."
            style={{ ...INPUT_STYLE, borderColor: errors.company_name ? 'var(--red)' : 'var(--border)' }}
          />
          {errors.company_name && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors.company_name}</div>}
        </FField>
        <FField label="ICE"><input value={form.ice} onChange={(e) => set('ice', e.target.value)} placeholder="N° ICE" style={INPUT_STYLE} /></FField>
        <FField label="RC"><input value={form.rc} onChange={(e) => set('rc', e.target.value)} placeholder="N° RC" style={INPUT_STYLE} /></FField>
        <FField label="IF"><input value={form.tax_id} onChange={(e) => set('tax_id', e.target.value)} placeholder="Identifiant fiscal" style={INPUT_STYLE} /></FField>
        <FField label="Téléphone"><input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+212..." style={INPUT_STYLE} /></FField>
        <FField label="Email"><input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="contact@societe.ma" style={INPUT_STYLE} /></FField>
      </FRow>

      <SectionTitle icon={<MapPin size={12} />}>Adresse</SectionTitle>
      <FRow>
        <FField label="Adresse"><input value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Adresse complète..." style={INPUT_STYLE} /></FField>
        <FField label="Ville"><input value={form.city} onChange={(e) => set('city', e.target.value)} placeholder="Ville..." style={INPUT_STYLE} /></FField>
      </FRow>

      <SectionTitle icon={<UserCog size={12} />}>Contact principal</SectionTitle>
      <FRow>
        <FField label="Nom contact"><input value={form.main_contact} onChange={(e) => set('main_contact', e.target.value)} placeholder="Contact principal" style={INPUT_STYLE} /></FField>
        <FField label="Fonction"><input value={form.contact_role} onChange={(e) => set('contact_role', e.target.value)} placeholder="Responsable achats..." style={INPUT_STYLE} /></FField>
        <FField label="Tél. contact"><input value={form.contact_phone} onChange={(e) => set('contact_phone', e.target.value)} placeholder="+212..." style={INPUT_STYLE} /></FField>
        <FField label="Email contact"><input type="email" value={form.contact_email} onChange={(e) => set('contact_email', e.target.value)} placeholder="email@contact.ma" style={INPUT_STYLE} /></FField>
      </FRow>

      <SectionTitle icon={<UserCog size={12} />}>Conditions commerciales</SectionTitle>
      <FRow>
        <FField label="Catégorie fournisseur">
          <select value={form.supplier_category} onChange={(e) => set('supplier_category', e.target.value)} style={SELECT_STYLE}>
            <option value="">Sélectionner...</option>
            {CATEGORIES_FOURN.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </FField>
        <FField label="Délai paiement"><input value={form.payment_terms} onChange={(e) => set('payment_terms', e.target.value)} placeholder="Ex: 30 jours, 60 jours..." style={INPUT_STYLE} /></FField>
        <FField label="Mode paiement préféré">
          <select value={form.preferred_payment_method} onChange={(e) => set('preferred_payment_method', e.target.value)} style={SELECT_STYLE}>
            {MODES_PAIEMENT.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </FField>
        <FField label="Banque"><input value={form.bank} onChange={(e) => set('bank', e.target.value)} placeholder="Banque..." style={INPUT_STYLE} /></FField>
        <FField label="RIB"><input value={form.rib} onChange={(e) => set('rib', e.target.value)} placeholder="RIB / IBAN..." style={INPUT_STYLE} /></FField>
        <FField label="Statut">
          <select value={form.status} onChange={(e) => set('status', e.target.value)} style={SELECT_STYLE}>
            {STATUT_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </FField>
      </FRow>

      <div style={{ marginBottom: 20 }}>
        <FField label="Notes"><textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Notes internes..." style={TEXTAREA_STYLE} /></FField>
      </div>

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

function DetailRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.83rem', paddingBottom: 8, borderBottom: '1px solid var(--surface-2)', gap: 12 }}>
      <span style={{ color: 'var(--text-3)', fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase', flexShrink: 0 }}>{label}</span>
      <span style={{ fontWeight: 500, textAlign: 'right' }}>{value || '—'}</span>
    </div>
  );
}

function DetailFournisseur({ item, onBack, onEdit, onArchive }) {
  return (
    <div className="animate-fade-in">
      <button type="button" className="btn btn-ghost btn-sm" style={{ marginBottom: 14, display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={onBack}>← Retour</button>
      <div className="flex-between" style={{ marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 10, background: 'var(--red-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <UserCog size={22} style={{ color: 'var(--red)' }} />
          </div>
          <div>
            <h1 className="page-title" style={{ marginBottom: 2 }}>{item.company_name}</h1>
            <p className="page-subtitle">
              {item.supplier_category || 'Fournisseur'}
              {' · '}
              <span className={`badge ${badgeStatut(item.statut)}`} style={{ fontSize: '0.72rem' }}>{item.statut}</span>
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={onEdit}><Edit2 size={13} /> Modifier</button>
          {item.status !== 'archived' && (
            <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => onArchive(item.id)}>
              <Archive size={13} /> Archiver
            </button>
          )}
        </div>
      </div>

      <div className="achats-detail-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <div className="card">
          <SectionTitle icon={<UserCog size={13} />}>Société</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <DetailRow label="ICE" value={item.ice} />
            <DetailRow label="RC" value={item.rc} />
            <DetailRow label="IF" value={item.tax_id} />
            <DetailRow label="Téléphone" value={item.phone} />
            <DetailRow label="Email" value={item.email} />
          </div>
        </div>
        <div className="card">
          <SectionTitle icon={<MapPin size={13} />}>Adresse</SectionTitle>
          <DetailRow label="Adresse" value={item.address} />
          <DetailRow label="Ville" value={item.city} />
        </div>
        <div className="card">
          <SectionTitle icon={<Phone size={13} />}>Contact</SectionTitle>
          <DetailRow label="Nom" value={item.main_contact} />
          <DetailRow label="Fonction" value={item.contact_role} />
          <DetailRow label="Téléphone" value={item.contact_phone} />
          <DetailRow label="Email" value={item.contact_email} />
        </div>
        <div className="card">
          <SectionTitle icon={<Mail size={13} />}>Finance</SectionTitle>
          <DetailRow label="Délai paiement" value={item.payment_terms} />
          <DetailRow label="Mode paiement" value={item.preferred_payment_method} />
          <DetailRow label="Banque" value={item.bank} />
          <DetailRow label="RIB" value={item.rib} />
        </div>
        {item.notes && (
          <div className="card" style={{ gridColumn: '1 / -1' }}>
            <SectionTitle icon={<UserCog size={13} />}>Notes</SectionTitle>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-2)', margin: 0, lineHeight: 1.6 }}>{item.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Fournisseurs({ onFournisseursChange }) {
  const { records: items, loading, saving, error, configured, reload, save, remove, exportCsv } = useSuppliers();
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [detailId, setDetailId] = useState(null);

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

  const filtered = items.filter((x) => {
    const q = search.toLowerCase();
    const matchQ = !q
      || x.company_name?.toLowerCase().includes(q)
      || (x.main_contact || '').toLowerCase().includes(q)
      || (x.city || '').toLowerCase().includes(q)
      || (x.ice || '').toLowerCase().includes(q);
    const matchCat = !filterCat || x.supplier_category === filterCat;
    const matchStatut = !filterStatut || x.statut === filterStatut;
    return matchQ && matchCat && matchStatut;
  });

  const total = items.length;
  const actifs = items.filter((x) => x.status === 'active').length;
  const inactifs = items.filter((x) => x.status === 'inactive').length;
  const archives = items.filter((x) => x.status === 'archived').length;

  if (detailId) {
    const item = items.find((x) => x.id === detailId);
    if (!item) { setDetailId(null); return null; }
    return (
      <DetailFournisseur
        item={item}
        onBack={() => setDetailId(null)}
        onEdit={() => { setEditItem(item); setShowModal(true); }}
        onArchive={handleArchive}
      />
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
    <div className="animate-fade-in">
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
          <p className="page-subtitle">Gestion des fournisseurs et partenaires achats.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={reload} disabled={loading}>
            <RefreshCw size={14} /> Actualiser
          </button>
          <button type="button" className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setShowFilters((f) => !f)}>
            <Filter size={14} /> Filtres
          </button>
          <button type="button" className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => exportCsv(filtered)} disabled={!filtered.length}>
            <Download size={14} /> Export
          </button>
          <button type="button" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => { setEditItem(null); setShowModal(true); }}>
            <Plus size={15} /> Ajouter fournisseur
          </button>
        </div>
      </div>

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', marginBottom: 20 }}>
        <KpiCard icon={<UserCog size={17} />} label="Total" value={total} color="grey" />
        <KpiCard icon={<UserCog size={17} />} label="Actifs" value={actifs} color="green" />
        <KpiCard icon={<ToggleLeft size={17} />} label="Inactifs" value={inactifs} color="orange" />
        <KpiCard icon={<Archive size={17} />} label="Archivés" value={archives} color="purple" />
      </div>

      {showFilters ? (
        <div className="card" style={{ marginBottom: 16, padding: '14px 20px' }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 180, position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Société, contact, ville, ICE..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
            </div>
            <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 160 }}>
              <option value="">Toutes catégories</option>
              {CATEGORIES_FOURN.map((c) => <option key={c} value={c}>{c}</option>)}
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

      <div className="card" style={{ padding: 0 }}>
        {filtered.length === 0 ? (
          <EmptyState
            icon={<UserCog size={24} />}
            title="Aucun fournisseur"
            sub={configured ? 'Ajoutez votre premier fournisseur achats.' : 'Configurez Supabase et exécutez RUN_PURCHASE_SUPPLIERS.sql.'}
            action="Ajouter fournisseur"
            onAction={() => { setEditItem(null); setShowModal(true); }}
          />
        ) : (
          <div className="table-wrap table-wrap--wide">
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
                    <td data-label="Catégorie">{x.supplier_category || '—'}</td>
                    <td data-label="Statut">
                      <span className={`badge ${badgeStatut(x.statut)}`} style={{ fontSize: '0.72rem' }}>{x.statut}</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                        <button type="button" className="btn btn-secondary btn-sm" title="Voir" onClick={() => setDetailId(x.id)}><Eye size={13} /></button>
                        <button type="button" className="btn btn-ghost btn-sm" title="Modifier" onClick={() => { setEditItem(x); setShowModal(true); }}><Edit2 size={13} /></button>
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
        )}
      </div>

      <Modal open={showModal} onClose={() => { setShowModal(false); setEditItem(null); }} title={editItem ? 'Modifier le fournisseur' : 'Nouveau fournisseur'} width={760}>
        <FournisseurForm initial={editItem} onSave={handleSave} onCancel={() => { setShowModal(false); setEditItem(null); }} saving={saving} />
      </Modal>
    </div>
  );
}

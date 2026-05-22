/**
 * Fournisseurs.jsx — Gestion fournisseurs ERP CITYMO
 */
import { useState, useCallback } from 'react';
import { UserCog, Plus, Eye, Edit2, Trash2, Star, Search, Filter, Download, ToggleLeft, Phone, Mail, MapPin } from 'lucide-react';
import {
  INPUT_STYLE, SELECT_STYLE, TEXTAREA_STYLE,
  MODES_PAIEMENT, CATEGORIES_FOURN,
  KpiCard, EmptyState, Modal, SectionTitle, FField, FRow, UploadField,
  genId
} from './shared.jsx';

const EMPTY_FORM = {
  raison_sociale: '', contact: '', telephone: '', email: '', ice: '', rc: '', if_field: '',
  adresse: '', ville: '', pays: 'Maroc',
  mode_paiement: 'Virement', banque: '', rib: '',
  categorie: '', notes: '', favori: false, statut: 'Actif'
};

function FournisseurForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  function handleSubmit(ev) {
    ev.preventDefault();
    if (!form.raison_sociale.trim()) { setErrors({ raison_sociale: 'Requis' }); return; }
    onSave(form);
  }

  return (
    <form onSubmit={handleSubmit}>
      <SectionTitle icon={<UserCog size={12} />}>Informations</SectionTitle>
      <FRow>
        <FField label="Raison sociale" required>
          <input value={form.raison_sociale} onChange={e => set('raison_sociale', e.target.value)} placeholder="Nom de la société..." style={{ ...INPUT_STYLE, borderColor: errors.raison_sociale ? 'var(--red)' : 'var(--border)' }} />
          {errors.raison_sociale && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors.raison_sociale}</div>}
        </FField>
        <FField label="Nom contact"><input value={form.contact} onChange={e => set('contact', e.target.value)} placeholder="Contact principal..." style={INPUT_STYLE} /></FField>
        <FField label="Téléphone"><input value={form.telephone} onChange={e => set('telephone', e.target.value)} placeholder="+212 6XX XXX XXX" style={INPUT_STYLE} /></FField>
        <FField label="Email"><input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="email@fournisseur.ma" style={INPUT_STYLE} /></FField>
        <FField label="ICE"><input value={form.ice} onChange={e => set('ice', e.target.value)} placeholder="N° ICE..." style={INPUT_STYLE} /></FField>
        <FField label="RC"><input value={form.rc} onChange={e => set('rc', e.target.value)} placeholder="N° RC..." style={INPUT_STYLE} /></FField>
        <FField label="IF"><input value={form.if_field} onChange={e => set('if_field', e.target.value)} placeholder="N° Identifiant fiscal..." style={INPUT_STYLE} /></FField>
      </FRow>

      <SectionTitle icon={<MapPin size={12} />}>Localisation</SectionTitle>
      <FRow>
        <FField label="Adresse"><input value={form.adresse} onChange={e => set('adresse', e.target.value)} placeholder="Adresse complète..." style={INPUT_STYLE} /></FField>
        <FField label="Ville"><input value={form.ville} onChange={e => set('ville', e.target.value)} placeholder="Ville..." style={INPUT_STYLE} /></FField>
        <FField label="Pays"><input value={form.pays} onChange={e => set('pays', e.target.value)} placeholder="Pays..." style={INPUT_STYLE} /></FField>
      </FRow>

      <SectionTitle icon={<UserCog size={12} />}>Finance</SectionTitle>
      <FRow>
        <FField label="Mode paiement préféré">
          <select value={form.mode_paiement} onChange={e => set('mode_paiement', e.target.value)} style={SELECT_STYLE}>
            {MODES_PAIEMENT.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </FField>
        <FField label="Banque"><input value={form.banque} onChange={e => set('banque', e.target.value)} placeholder="Nom de la banque..." style={INPUT_STYLE} /></FField>
        <FField label="RIB"><input value={form.rib} onChange={e => set('rib', e.target.value)} placeholder="RIB / IBAN..." style={INPUT_STYLE} /></FField>
      </FRow>

      <SectionTitle icon={<UserCog size={12} />}>Autres</SectionTitle>
      <FRow>
        <FField label="Catégorie fournisseur">
          <select value={form.categorie} onChange={e => set('categorie', e.target.value)} style={SELECT_STYLE}>
            <option value="">Sélectionner...</option>
            {CATEGORIES_FOURN.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </FField>
        <FField label="Statut">
          <select value={form.statut} onChange={e => set('statut', e.target.value)} style={SELECT_STYLE}>
            <option value="Actif">Actif</option>
            <option value="Inactif">Inactif</option>
          </select>
        </FField>
        <FField label="Fournisseur favori">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, cursor: 'pointer', fontSize: '0.85rem' }}>
            <input type="checkbox" checked={form.favori} onChange={e => set('favori', e.target.checked)} style={{ width: 16, height: 16 }} />
            Marquer comme favori
          </label>
        </FField>
      </FRow>
      <div style={{ marginBottom: 14 }}><FField label="Notes"><textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Notes internes..." style={TEXTAREA_STYLE} /></FField></div>
      <div style={{ marginBottom: 20 }}><UploadField label="Documents (contrats, certifications...)" /></div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Annuler</button>
        <button type="submit" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Plus size={14} /> {initial ? 'Enregistrer' : 'Ajouter fournisseur'}
        </button>
      </div>
    </form>
  );
}

function DetailFournisseur({ item, onBack, onEdit, onDelete }) {
  return (
    <div className="animate-fade-in">
      <button className="btn btn-ghost btn-sm" style={{ marginBottom: 14, display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={onBack}>← Retour</button>
      <div className="flex-between" style={{ marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 10, background: 'var(--red-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <UserCog size={22} style={{ color: 'var(--red)' }} />
          </div>
          <div>
            <h1 className="page-title" style={{ marginBottom: 2 }}>{item.raison_sociale}</h1>
            <p className="page-subtitle">{item.categorie || 'Fournisseur'} {item.favori ? '⭐' : ''}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={onEdit}><Edit2 size={13} /> Modifier</button>
          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => onDelete(item.id)}><Trash2 size={13} /></button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card">
          <SectionTitle icon={<UserCog size={13} />}>Informations</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[['Contact', item.contact], ['Téléphone', item.telephone], ['Email', item.email], ['ICE', item.ice], ['RC', item.rc], ['IF', item.if_field]].map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.83rem', paddingBottom: 8, borderBottom: '1px solid var(--surface-2)' }}>
                <span style={{ color: 'var(--text-3)', fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase' }}>{l}</span>
                <span style={{ fontWeight: 500 }}>{v || '—'}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <SectionTitle icon={<MapPin size={13} />}>Localisation</SectionTitle>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-2)', lineHeight: 1.6 }}>
              {item.adresse && <div>{item.adresse}</div>}
              {item.ville && <div>{item.ville}{item.pays ? ', ' + item.pays : ''}</div>}
              {!item.adresse && !item.ville && <span style={{ color: 'var(--text-3)' }}>—</span>}
            </div>
          </div>
          <div className="card">
            <SectionTitle icon={<UserCog size={13} />}>Finance</SectionTitle>
            {[['Mode paiement', item.mode_paiement], ['Banque', item.banque], ['RIB', item.rib]].map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.83rem', paddingBottom: 8, borderBottom: '1px solid var(--surface-2)' }}>
                <span style={{ color: 'var(--text-3)', fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase' }}>{l}</span>
                <span style={{ fontWeight: 500 }}>{v || '—'}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Fournisseurs({ onFournisseursChange }) {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const today = new Date().toISOString().slice(0, 10);

  // Notifie le parent (Achats.jsx) à chaque changement de la liste
  function updateItems(updater) {
    setItems(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (onFournisseursChange) onFournisseursChange(next);
      return next;
    });
  }

  const handleSave = useCallback((data) => {
    if (editItem) {
      updateItems(prev => prev.map(x => x.id === editItem.id ? { ...x, ...data } : x));
    } else {
      updateItems(prev => [...prev, { ...data, id: genId(), date_creation: today, commandes_liees: 0 }]);
    }
    setShowModal(false); setEditItem(null);
  }, [editItem, today, onFournisseursChange]);

  function handleDelete(id) {
    if (window.confirm('Supprimer ce fournisseur ?')) { updateItems(prev => prev.filter(x => x.id !== id)); setDetailId(null); }
  }
  function toggleStatut(id) {
    updateItems(prev => prev.map(x => x.id === id ? { ...x, statut: x.statut === 'Actif' ? 'Inactif' : 'Actif' } : x));
  }

  const filtered = items.filter(x => {
    const q = search.toLowerCase();
    return (!q || x.raison_sociale?.toLowerCase().includes(q) || (x.contact || '').toLowerCase().includes(q) || (x.ville || '').toLowerCase().includes(q))
      && (!filterCat || x.categorie === filterCat)
      && (!filterStatut || x.statut === filterStatut);
  });

  const total   = items.length;
  const actifs  = items.filter(x => x.statut === 'Actif').length;
  const favoris = items.filter(x => x.favori).length;
  const totalCmds = items.reduce((s, x) => s + (x.commandes_liees || 0), 0);

  if (detailId) {
    const item = items.find(x => x.id === detailId);
    if (!item) { setDetailId(null); return null; }
    return <DetailFournisseur item={item} onBack={() => setDetailId(null)} onEdit={() => { setEditItem(item); setShowModal(true); setDetailId(null); }} onDelete={handleDelete} />;
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header flex-between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title">FOURNISSEURS</h1>
          <p className="page-subtitle">Gestion des fournisseurs et partenaires achats.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setShowFilters(f => !f)}><Filter size={14} /> Filtres</button>
          <button className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Download size={14} /> Export</button>
          <button className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => { setEditItem(null); setShowModal(true); }}><Plus size={15} /> Ajouter fournisseur</button>
        </div>
      </div>

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', marginBottom: 20 }}>
        <KpiCard icon={<UserCog size={17} />} label="Total fournisseurs"  value={total}    color="grey"   />
        <KpiCard icon={<UserCog size={17} />} label="Actifs"              value={actifs}   color="green"  />
        <KpiCard icon={<Star size={17} />}    label="Favoris"             value={favoris}  color="orange" />
        <KpiCard icon={<UserCog size={17} />} label="Commandes liées"     value={totalCmds} color="blue"  />
      </div>

      {showFilters ? (
        <div className="card" style={{ marginBottom: 16, padding: '14px 20px' }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 180, position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Raison sociale, contact, ville..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
            </div>
            <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 160 }}>
              <option value="">Toutes catégories</option>
              {CATEGORIES_FOURN.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={filterStatut} onChange={e => setFilterStatut(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 130 }}>
              <option value="">Tous statuts</option>
              <option value="Actif">Actif</option>
              <option value="Inactif">Inactif</option>
            </select>
            <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFilterCat(''); setFilterStatut(''); }}>Réinitialiser</button>
          </div>
        </div>
      ) : (
        <div className="card" style={{ marginBottom: 12, padding: '10px 14px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un fournisseur..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        {filtered.length === 0 ? (
          <EmptyState icon={<UserCog size={24} />} title="Aucun fournisseur" sub="Ajoutez votre premier fournisseur" action="Ajouter fournisseur" onAction={() => { setEditItem(null); setShowModal(true); }} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Fournisseur</th><th>Téléphone</th><th>Email</th><th>Ville</th><th>Commandes</th><th>Statut</th><th>Actions</th></tr></thead>
              <tbody>
                {filtered.map(x => (
                  <tr key={x.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--red-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <UserCog size={15} style={{ color: 'var(--red)' }} />
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.87rem' }}>{x.raison_sociale}{x.favori && <span style={{ marginLeft: 5, fontSize: '0.7rem', color: '#E65100' }}>★</span>}</div>
                          {x.contact && <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>{x.contact}</div>}
                        </div>
                      </div>
                    </td>
                    <td data-label="Téléphone">{x.telephone || '—'}</td>
                    <td data-label="Email" style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.email || '—'}</td>
                    <td data-label="Ville">{x.ville || '—'}</td>
                    <td data-label="Commandes">{x.commandes_liees || 0}</td>
                    <td data-label="Statut">
                      <span className={"badge " + (x.statut === 'Actif' ? 'badge-green' : 'badge-grey')} style={{ fontSize: '0.72rem' }}>{x.statut}</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 3 }}>
                        <button className="btn btn-secondary btn-sm" title="Voir" onClick={() => setDetailId(x.id)}><Eye size={13} /></button>
                        <button className="btn btn-ghost btn-sm" title="Modifier" onClick={() => { setEditItem(x); setShowModal(true); }}><Edit2 size={13} /></button>
                        <button className="btn btn-ghost btn-sm" title={x.statut === 'Actif' ? 'Désactiver' : 'Activer'} onClick={() => toggleStatut(x.id)}><ToggleLeft size={13} /></button>
                        <button className="btn btn-ghost btn-sm" title="Supprimer" onClick={() => handleDelete(x.id)} style={{ color: 'var(--red)' }}><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={showModal} onClose={() => { setShowModal(false); setEditItem(null); }} title={editItem ? 'Modifier le fournisseur' : 'Nouveau fournisseur'} width={720}>
        <FournisseurForm initial={editItem} onSave={handleSave} onCancel={() => { setShowModal(false); setEditItem(null); }} />
      </Modal>
    </div>
  );
}

/**
 * DocsPartages.jsx — Documents partagés ERP CITYMO
 * Backend-ready / Database-ready
 */

import {
  Share2, Plus, Eye, Download, Trash2, Search, Filter,
  Edit2, X, UserCheck, Clock, Users, Building2
} from 'lucide-react';
import { useState, useCallback } from 'react';
import {
  INPUT_STYLE, SELECT_STYLE, TEXTAREA_STYLE,
  KpiCard, EmptyState, Modal, SectionTitle, FField, FRow,
  TYPE_COLORS, CATEGORIES_DOC, PERMISSIONS, genId
} from './shared.jsx';

const EMPTY_SHARE = {
  document: '', partage_par: '', partage_avec: '', departement: '',
  date_partage: new Date().toISOString().slice(0, 10),
  date_expiration: '', permissions: 'Lecture seule', notes: ''
};

function ShareForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial || EMPTY_SHARE);
  const [errors, setErrors] = useState({});
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  function validate() {
    const e = {};
    if (!form.document.trim()) e.document = 'Requis';
    if (!form.partage_avec.trim()) e.partage_avec = 'Requis';
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
      <SectionTitle icon={<Share2 size={12} />}>Document à partager</SectionTitle>
      <FRow>
        <FField label="Document" required>
          <input value={form.document} onChange={e => set('document', e.target.value)} placeholder="Nom du document..." style={{ ...INPUT_STYLE, borderColor: errors.document ? 'var(--red)' : 'var(--border)' }} />
          {errors.document && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors.document}</div>}
        </FField>
        <FField label="Partagé par">
          <input value={form.partage_par} onChange={e => set('partage_par', e.target.value)} placeholder="Nom utilisateur..." style={INPUT_STYLE} />
        </FField>
      </FRow>
      <FRow>
        <FField label="Partagé avec" required>
          <input value={form.partage_avec} onChange={e => set('partage_avec', e.target.value)} placeholder="Utilisateur, équipe..." style={{ ...INPUT_STYLE, borderColor: errors.partage_avec ? 'var(--red)' : 'var(--border)' }} />
          {errors.partage_avec && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors.partage_avec}</div>}
        </FField>
        <FField label="Département">
          <input value={form.departement} onChange={e => set('departement', e.target.value)} placeholder="Département..." style={INPUT_STYLE} />
        </FField>
      </FRow>
      <FRow>
        <FField label="Date partage">
          <input type="date" value={form.date_partage} onChange={e => set('date_partage', e.target.value)} style={INPUT_STYLE} />
        </FField>
        <FField label="Expiration">
          <input type="date" value={form.date_expiration} onChange={e => set('date_expiration', e.target.value)} style={INPUT_STYLE} />
        </FField>
        <FField label="Permissions">
          <select value={form.permissions} onChange={e => set('permissions', e.target.value)} style={SELECT_STYLE}>
            {PERMISSIONS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </FField>
      </FRow>
      <div style={{ marginBottom: 20 }}>
        <FField label="Notes">
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Notes internes..." style={TEXTAREA_STYLE} />
        </FField>
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Annuler</button>
        <button type="submit" className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={14} /> {initial ? 'Enregistrer' : 'Créer le partage'}
        </button>
      </div>
    </form>
  );
}

export default function DocsPartages() {
  const [shares, setShares] = useState([]);
  const [search, setSearch] = useState('');
  const [filterPerm, setFilterPerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editShare, setEditShare] = useState(null);

  const handleSave = useCallback((data) => {
    if (editShare) {
      setShares(prev => prev.map(s => s.id === editShare.id ? { ...s, ...data } : s));
    } else {
      setShares(prev => [...prev, { ...data, id: genId() }]);
    }
    setShowModal(false);
    setEditShare(null);
  }, [editShare]);

  const handleDelete = useCallback((id) => {
    if (window.confirm('Retirer ce partage ?')) setShares(prev => prev.filter(s => s.id !== id));
  }, []);

  const filtered = shares.filter(s => {
    const q = search.toLowerCase();
    const matchQ = !q || s.document.toLowerCase().includes(q) || (s.partage_avec || '').toLowerCase().includes(q) || (s.partage_par || '').toLowerCase().includes(q);
    const matchP = !filterPerm || s.permissions === filterPerm;
    return matchQ && matchP;
  });

  const total      = shares.length;
  const recents    = shares.filter(s => s.date_partage === new Date().toISOString().slice(0, 10)).length;
  const actifs     = shares.filter(s => !s.date_expiration || s.date_expiration >= new Date().toISOString().slice(0, 10)).length;
  const deptShares = shares.filter(s => s.departement).length;

  return (
    <div className="animate-fade-in">
      <div className="page-header flex-between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title">DOCUMENTS PARTAGÉS</h1>
          <p className="page-subtitle">Documents accessibles et partagés dans l'entreprise.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setShowFilters(f => !f)}><Filter size={14} /> Filtres</button>
          <button className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => { setEditShare(null); setShowModal(true); }}><Plus size={15} /> Nouveau partage</button>
        </div>
      </div>

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', marginBottom: 20 }}>
        <KpiCard icon={<Share2 size={17} />}     label="Partages actifs"       value={actifs}     color="blue"   />
        <KpiCard icon={<Clock size={17} />}       label="Partages récents"      value={recents}    color="orange" />
        <KpiCard icon={<UserCheck size={17} />}   label="Accès actifs"          value={actifs}     color="green"  />
        <KpiCard icon={<Building2 size={17} />}   label="Partagés dept."        value={deptShares} color="grey"   />
      </div>

      {showFilters && (
        <div className="card" style={{ marginBottom: 16, padding: '14px 20px' }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Document, utilisateur..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
            </div>
            <select value={filterPerm} onChange={e => setFilterPerm(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 190 }}>
              <option value="">Toutes permissions</option>
              {PERMISSIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFilterPerm(''); }}>Réinitialiser</button>
          </div>
        </div>
      )}

      {!showFilters && (
        <div className="card" style={{ marginBottom: 12, padding: '10px 14px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un partage..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        {filtered.length === 0 ? (
          <EmptyState icon={<Share2 size={24} />} title="Aucun document partagé" sub="Partagez un document avec vos collaborateurs" action="Nouveau partage" onAction={() => { setEditShare(null); setShowModal(true); }} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Partagé par</th>
                  <th>Partagé avec</th>
                  <th>Département</th>
                  <th>Date partage</th>
                  <th>Expiration</th>
                  <th>Permissions</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => {
                  const expire = s.date_expiration;
                  const expired = expire && expire < new Date().toISOString().slice(0, 10);
                  return (
                    <tr key={s.id}>
                      <td style={{ fontWeight: 600 }}>{s.document}</td>
                      <td data-label="Partagé par">{s.partage_par || '—'}</td>
                      <td data-label="Partagé avec">{s.partage_avec}</td>
                      <td data-label="Département">{s.departement || '—'}</td>
                      <td data-label="Date partage">{s.date_partage || '—'}</td>
                      <td data-label="Expiration">
                        {expire
                          ? <span style={{ color: expired ? 'var(--red)' : 'inherit', fontWeight: expired ? 700 : 400 }}>{expire}{expired ? ' (expiré)' : ''}</span>
                          : <span style={{ color: 'var(--text-3)' }}>Illimité</span>}
                      </td>
                      <td data-label="Permissions"><span className="badge badge-blue" style={{ fontSize: '0.7rem' }}>{s.permissions}</span></td>
                      <td>
                        <div style={{ display: 'flex', gap: 3 }}>
                          <button className="btn btn-ghost btn-sm" title="Voir"><Eye size={13} /></button>
                          <button className="btn btn-ghost btn-sm" title="Télécharger"><Download size={13} /></button>
                          <button className="btn btn-ghost btn-sm" title="Modifier accès" onClick={() => { setEditShare(s); setShowModal(true); }}><Edit2 size={13} /></button>
                          <button className="btn btn-ghost btn-sm" title="Retirer" onClick={() => handleDelete(s.id)} style={{ color: 'var(--red)' }}><Trash2 size={13} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={showModal} onClose={() => { setShowModal(false); setEditShare(null); }} title={editShare ? 'Modifier le partage' : 'Nouveau partage'} width={640}>
        <ShareForm initial={editShare} onSave={handleSave} onCancel={() => { setShowModal(false); setEditShare(null); }} />
      </Modal>
    </div>
  );
}

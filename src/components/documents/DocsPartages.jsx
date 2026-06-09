/**
 * DocsPartages.jsx — Documents partagés ERP CITYMO
 */

import {
  Share2, Plus, Eye, Download, Trash2, Search, Filter,
  Edit2, UserCheck, Clock, Building2, Loader2,
} from 'lucide-react';
import { useState, useCallback } from 'react';
import { useDocumentShares } from '../../hooks/useDocumentShares';
import {
  INPUT_STYLE, SELECT_STYLE,
  KpiCard, EmptyState, Modal,
  PERMISSIONS,
  DepartmentFilterSelect,
  DocumentShareForm,
  EMPTY_DOCUMENT_SHARE,
} from './shared.jsx';

export default function DocsPartages() {
  const { shares, loading, saving, error, configured, createShare, updateShare, removeShare } = useDocumentShares();
  const [search, setSearch] = useState('');
  const [filterPerm, setFilterPerm] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editShare, setEditShare] = useState(null);

  const handleSave = useCallback(async (data) => {
    const result = editShare
      ? await updateShare(editShare.id, data)
      : await createShare({ document: data.document, ...data });
    if (result.success) {
      setShowModal(false);
      setEditShare(null);
    }
  }, [editShare, createShare, updateShare]);

  const handleDelete = useCallback(async (id) => {
    if (!window.confirm('Retirer ce partage ?')) return;
    await removeShare(id);
  }, [removeShare]);

  const filtered = shares.filter(s => {
    const q = search.toLowerCase();
    const matchQ = !q || s.document.toLowerCase().includes(q) || (s.partage_avec || '').toLowerCase().includes(q) || (s.partage_par || '').toLowerCase().includes(q);
    const matchP = !filterPerm || s.permissions === filterPerm;
    const matchD = !filterDept || s.departement === filterDept;
    return matchQ && matchP && matchD;
  });

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

      {error && (
        <div className="card" style={{ marginBottom: 16, padding: '12px 16px', borderColor: 'var(--red)', color: 'var(--red)', fontSize: '0.85rem' }}>
          {error}
          {!configured && (
            <div style={{ marginTop: 6, fontSize: '0.78rem', color: 'var(--text-3)' }}>
              Exécutez <code>supabase/RUN_DOCUMENT_SHARES.sql</code> dans le SQL Editor Supabase.
            </div>
          )}
        </div>
      )}

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
            <DepartmentFilterSelect value={filterDept} onChange={setFilterDept} style={{ ...SELECT_STYLE, maxWidth: 240, flex: '0 1 240px' }} />
            <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFilterPerm(''); setFilterDept(''); }}>Réinitialiser</button>
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
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Loader2 size={20} className="spin" /> Chargement...
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={<Share2 size={24} />} title="Aucun document partagé" sub="Partagez un document depuis Mes documents ou créez un partage ici" action="Nouveau partage" onAction={() => { setEditShare(null); setShowModal(true); }} />
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
                          <button className="btn btn-ghost btn-sm" title="Retirer" onClick={() => handleDelete(s.id)} style={{ color: 'var(--red)' }} disabled={saving}><Trash2 size={13} /></button>
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
        <DocumentShareForm
          key={editShare?.id || 'new'}
          initial={editShare || EMPTY_DOCUMENT_SHARE}
          saving={saving}
          onSave={handleSave}
          onCancel={() => { setShowModal(false); setEditShare(null); }}
        />
      </Modal>
    </div>
  );
}

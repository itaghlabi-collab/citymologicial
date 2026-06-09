/**
 * Corbeille.jsx — Corbeille documents ERP CITYMO
 * Backend-ready / Database-ready
 */

import {
  Trash2, RotateCcw, Download, Search, AlertTriangle, Clock, FileText, Filter
} from 'lucide-react';
import { useState, useCallback } from 'react';
import {
  INPUT_STYLE, SELECT_STYLE,
  KpiCard, EmptyState, SectionTitle,
  TYPE_COLORS, formatBytes, genId,
  DepartmentFilterSelect,
} from './shared.jsx';

export default function Corbeille({ deletedDocs, onRestore, onPermanentDelete, onEmptyTrash }) {
  const [search, setSearch] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState([]);

  // Si utilisé standalone (sans props), gérer localement
  const [localDocs, setLocalDocs] = useState([]);
  const docs = deletedDocs || localDocs;

  function handleRestore(id) {
    if (onRestore) { onRestore(id); return; }
    setLocalDocs(prev => prev.filter(d => d.id !== id));
  }

  function handleDelete(id) {
    if (!window.confirm('Supprimer définitivement ce fichier ? Cette action est irréversible.')) return;
    if (onPermanentDelete) { onPermanentDelete(id); return; }
    setLocalDocs(prev => prev.filter(d => d.id !== id));
  }

  function handleEmpty() {
    if (!window.confirm('Vider définitivement la corbeille ? Cette action est irréversible.')) return;
    if (onEmptyTrash) { onEmptyTrash(); return; }
    setLocalDocs([]);
  }

  function toggleSelect(id) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  const docDepartment = (d) => d.departement || d.department || '';

  const filtered = docs.filter(d => {
    const q = search.toLowerCase();
    const name = (d.nom || d.name || '').toLowerCase();
    const matchQ = !q || name.includes(q) || (d.supprime_par || '').toLowerCase().includes(q);
    const matchD = !filterDept || docDepartment(d) === filterDept;
    return matchQ && matchD;
  });

  const totalSize = docs.reduce((s, d) => s + (d.taille || 0), 0);
  const today = new Date().toISOString().slice(0, 10);
  const recents = docs.filter(d => d.date_suppression === today).length;

  // Calcul expiration auto (30 jours)
  function expirationLabel(dateSupp) {
    if (!dateSupp) return '—';
    const d = new Date(dateSupp);
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header flex-between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title">CORBEILLE</h1>
          <p className="page-subtitle">Documents supprimés et restauration. Suppression définitive après 30 jours.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setShowFilters((f) => !f)}>
            <Filter size={14} /> Filtres
          </button>
          {docs.length > 0 && (
            <button className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--red)' }} onClick={handleEmpty}>
              <Trash2 size={14} /> Vider la corbeille
            </button>
          )}
        </div>
      </div>

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))', marginBottom: 20 }}>
        <KpiCard icon={<Trash2 size={17} />}        label="Fichiers supprimés"  value={docs.length}          color="red"    />
        <KpiCard icon={<FileText size={17} />}       label="Taille totale"       value={formatBytes(totalSize)} color="orange" />
        <KpiCard icon={<Clock size={17} />}          label="Supprimés aujourd'hui" value={recents}           color="grey"   />
        <KpiCard icon={<AlertTriangle size={17} />}  label="Expiration sous 7j"  value={0}                    color="red"    sub="Suppression définitive" />
      </div>

      {docs.length > 0 && (
        <div style={{ background: 'var(--red-light)', border: '1px solid #FFCDD2', borderRadius: 8, padding: '10px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.84rem', color: 'var(--red)' }}>
          <AlertTriangle size={15} />
          Les fichiers dans la corbeille seront supprimés définitivement après 30 jours.
        </div>
      )}

      {showFilters ? (
        <div className="card" style={{ marginBottom: 16, padding: '14px 20px' }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher dans la corbeille..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
            </div>
            <DepartmentFilterSelect value={filterDept} onChange={setFilterDept} style={{ ...SELECT_STYLE, maxWidth: 240, flex: '0 1 240px' }} />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFilterDept(''); }}>Réinitialiser</button>
          </div>
        </div>
      ) : (
        <div className="card" style={{ marginBottom: 12, padding: '10px 14px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher dans la corbeille..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        {filtered.length === 0 ? (
          <EmptyState icon={<Trash2 size={24} />} title="Corbeille vide" sub="Les documents supprimés apparaîtront ici pendant 30 jours" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Département</th>
                  <th>Supprimé par</th>
                  <th>Date suppression</th>
                  <th>Taille</th>
                  <th>Suppression définitive</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(d => (
                  <tr key={d.id} style={{ opacity: 0.85 }}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 7, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)' }}>
                          <FileText size={15} />
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.85rem', textDecoration: 'line-through', color: 'var(--text-3)' }}>{d.nom || d.name}</div>
                          {d.categorie && <div style={{ fontSize: '0.7rem', color: 'var(--text-3)' }}>{d.categorie}</div>}
                        </div>
                      </div>
                    </td>
                    <td data-label="Département">{docDepartment(d) || '—'}</td>
                    <td data-label="Supprimé par">{d.supprime_par || '—'}</td>
                    <td data-label="Date suppression">{d.date_suppression || '—'}</td>
                    <td data-label="Taille">{formatBytes(d.taille)}</td>
                    <td data-label="Expiration définitive" style={{ color: 'var(--red)', fontWeight: 600, fontSize: '0.82rem' }}>
                      {expirationLabel(d.date_suppression)}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 3 }}>
                        <button className="btn btn-secondary btn-sm" title="Restaurer" onClick={() => handleRestore(d.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                          <RotateCcw size={13} /> Restaurer
                        </button>
                        <button className="btn btn-ghost btn-sm" title="Télécharger"><Download size={13} /></button>
                        <button className="btn btn-ghost btn-sm" title="Supprimer définitivement" onClick={() => handleDelete(d.id)} style={{ color: 'var(--red)' }}><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

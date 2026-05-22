import { useState, useEffect, useRef } from 'react';
import { Receipt, Plus, Edit2, Trash2, XCircle, TrendingDown, DollarSign, Megaphone, Briefcase } from 'lucide-react';
import { getDepenses, createDepense, updateDepense, deleteDepense } from '../../services/api';

const TYPES = ['marketing', 'commercial', 'evenement', 'deplacement', 'materiel', 'autre'];
const TYPE_LABEL = { marketing: 'Marketing', commercial: 'Commercial', evenement: 'Evenement', deplacement: 'Deplacement', materiel: 'Materiel', autre: 'Autre' };
const TYPE_BADGE = { marketing: 'badge-blue', commercial: 'badge-green', evenement: 'badge-orange', deplacement: 'badge-grey', materiel: 'badge-red', autre: 'badge-grey' };

const EMPTY = { intitule: '', type: 'marketing', montant: '', date: new Date().toISOString().slice(0, 10), reference: '', commentaire: '' };


function Toast({ msg, onClose }) {
  const t = useRef();
  useEffect(() => { t.current = setTimeout(onClose, 3000); return () => clearTimeout(t.current); }, [onClose]);
  if (!msg) return null;
  return (
    <div style={{ position: 'fixed', bottom: 28, right: 28, background: 'var(--text)', color: '#fff', borderRadius: 8, padding: '12px 20px', fontSize: '0.875rem', fontWeight: 600, zIndex: 9999, boxShadow: '0 4px 16px rgba(0,0,0,0.18)', maxWidth: 340 }}>{msg}</div>
  );
}

function IS(err) {
  return { padding: '9px 12px', border: '1.5px solid ' + (err ? 'var(--red)' : 'var(--border)'), borderRadius: 6, fontSize: '0.875rem', background: '#fff', outline: 'none', width: '100%', boxSizing: 'border-box' };
}

function fmtMontant(v) {
  if (!v && v !== 0) return '-';
  return Number(v).toLocaleString('fr-MA') + ' MAD';
}

export default function Depenses() {
  const [depenses, setDepenses] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const PER_PAGE = 10;

  useEffect(() => {
    getDepenses().then(d => { if (d && d.length) setDepenses(d); }).catch(() => {});
  }, []);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setErrors({});
    setShowModal(true);
  }

  function openEdit(d) {
    setEditing(d);
    setForm({ intitule: d.intitule, type: d.type, montant: String(d.montant || ''), date: d.date || '', reference: d.reference || '', commentaire: d.commentaire || '' });
    setErrors({});
    setShowModal(true);
  }

  function validate() {
    const e = {};
    if (!form.intitule.trim()) e.intitule = true;
    if (!form.montant || isNaN(Number(form.montant)) || Number(form.montant) <= 0) e.montant = true;
    if (!form.date) e.date = true;
    return e;
  }

  async function handleSave() {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setSaving(true);
    const payload = { ...form, montant: Number(form.montant) };
    try {
      if (editing) {
        await updateDepense(editing.id, payload).catch(() => null);
        setDepenses(prev => prev.map(x => x.id === editing.id ? { ...x, ...payload } : x));
        setToast('Depense mise a jour.');
      } else {
        const created = await createDepense(payload).catch(() => null);
        setDepenses(prev => [...prev, { id: created?.id || Date.now(), ...payload, created_at: new Date().toISOString() }]);
        setToast('Depense enregistree.');
      }
    } catch (_) {}
    setSaving(false);
    setShowModal(false);
  }

  async function handleDelete(d) {
    if (!window.confirm('Supprimer cette depense ?')) return;
    try { await deleteDepense(d.id); } catch (_) {}
    setDepenses(prev => prev.filter(x => x.id !== d.id));
    setToast('Depense supprimee.');
  }

  const filtered = depenses.filter(d => {
    if (filterType && d.type !== filterType) return false;
    if (filterDateFrom && d.date < filterDateFrom) return false;
    if (filterDateTo && d.date > filterDateTo) return false;
    if (search && !`${d.intitule} ${d.reference}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const totalAll = depenses.reduce((s, d) => s + (Number(d.montant) || 0), 0);
  const totalMarketing = depenses.filter(d => d.type === 'marketing' || d.type === 'evenement').reduce((s, d) => s + (Number(d.montant) || 0), 0);
  const totalCommercial = depenses.filter(d => d.type === 'commercial' || d.type === 'deplacement').reduce((s, d) => s + (Number(d.montant) || 0), 0);
  const totalFiltered = filtered.reduce((s, d) => s + (Number(d.montant) || 0), 0);

  return (
    <div className="animate-fade-in">
      <div className="page-header flex-between">
        <div>
          <h1 className="page-title">Depenses</h1>
          <p className="page-subtitle">Suivi des depenses commerciales et marketing</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}><Plus size={15} /> Nouvelle depense</button>
      </div>

      {/* Stats dashboard */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
        <div className="stat-card"><div className="stat-icon"><DollarSign size={18} /></div><div className="stat-body"><div className="stat-value">{(totalAll / 1000).toFixed(0)}K</div><div className="stat-label">Total depenses (MAD)</div></div></div>
        <div className="stat-card"><div className="stat-icon blue"><Megaphone size={18} /></div><div className="stat-body"><div className="stat-value">{(totalMarketing / 1000).toFixed(0)}K</div><div className="stat-label">Marketing + Evenements</div></div></div>
        <div className="stat-card"><div className="stat-icon green"><Briefcase size={18} /></div><div className="stat-body"><div className="stat-value">{(totalCommercial / 1000).toFixed(0)}K</div><div className="stat-label">Commercial + Deplacement</div></div></div>
        <div className="stat-card"><div className="stat-icon orange"><Receipt size={18} /></div><div className="stat-body"><div className="stat-value">{depenses.length}</div><div className="stat-label">Nombre de lignes</div></div></div>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input placeholder="Rechercher (intitule, ref...)" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} style={{ ...IS(false), width: 220 }} />
          <select value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1); }} style={{ ...IS(false), width: 160 }}>
            <option value="">Tous les types</option>
            {TYPES.map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </select>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-3)', fontWeight: 600 }}>Du</span>
            <input type="date" value={filterDateFrom} onChange={e => { setFilterDateFrom(e.target.value); setPage(1); }} style={{ ...IS(false), width: 150 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-3)', fontWeight: 600 }}>Au</span>
            <input type="date" value={filterDateTo} onChange={e => { setFilterDateTo(e.target.value); setPage(1); }} style={{ ...IS(false), width: 150 }} />
          </div>
          {(filterType || filterDateFrom || filterDateTo || search) && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setFilterType(''); setFilterDateFrom(''); setFilterDateTo(''); setSearch(''); setPage(1); }}>Reinitialiser</button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div className="flex-between mb-4">
          <div className="card-title" style={{ marginBottom: 0 }}><Receipt size={16} /> Depenses ({filtered.length}) &nbsp;—&nbsp; <span style={{ fontFamily: 'var(--font-head)', color: 'var(--red)' }}>{fmtMontant(totalFiltered)}</span></div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Intitule</th><th>Type</th><th>Montant</th><th>Date</th><th>Reference</th><th>Commentaire</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {paged.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-3)', padding: '24px 0' }}>Aucune depense</td></tr>}
              {paged.map(d => (
                <tr key={d.id}>
                  <td style={{ fontWeight: 600 }}>{d.intitule}</td>
                  <td><span className={'badge ' + TYPE_BADGE[d.type]}>{TYPE_LABEL[d.type]}</span></td>
                  <td style={{ fontFamily: 'var(--font-head)', fontWeight: 800, color: 'var(--red)' }}>{fmtMontant(d.montant)}</td>
                  <td style={{ fontFamily: 'var(--font-head)', fontWeight: 600 }}>{d.date}</td>
                  <td style={{ fontSize: '0.78rem', color: 'var(--text-3)', fontFamily: 'monospace' }}>{d.reference || '-'}</td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-2)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.commentaire || '-'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(d)} title="Modifier"><Edit2 size={13} /></button>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => handleDelete(d)} title="Supprimer"><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 14 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Prec.</button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <button key={p} className={'btn btn-sm ' + (p === page ? 'btn-primary' : 'btn-ghost')} onClick={() => setPage(p)}>{p}</button>
            ))}
            <button className="btn btn-ghost btn-sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Suiv.</button>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
            <div className="flex-between mb-4">
              <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '1.2rem' }}>{editing ? 'Modifier la depense' : 'Nouvelle depense'}</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}><XCircle size={18} /></button>
            </div>
            <div style={{ display: 'grid', gap: 14 }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>Intitule *</label>
                <input style={IS(errors.intitule)} value={form.intitule} onChange={e => setForm(f => ({ ...f, intitule: e.target.value }))} placeholder="Description de la depense" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>Type *</label>
                  <select style={IS(false)} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                    {TYPES.map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>Montant (MAD) *</label>
                  <input type="number" min="0" step="100" style={IS(errors.montant)} value={form.montant} onChange={e => setForm(f => ({ ...f, montant: e.target.value }))} placeholder="0" />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>Date *</label>
                  <input type="date" style={IS(errors.date)} value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>Reference</label>
                  <input style={IS(false)} value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} placeholder="Ex: MKT-2026-001" />
                </div>
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>Commentaire</label>
                <textarea style={{ ...IS(false), resize: 'vertical', minHeight: 70 }} value={form.commentaire} onChange={e => setForm(f => ({ ...f, commentaire: e.target.value }))} placeholder="Details supplementaires..." />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}>Annuler</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Sauvegarde...' : editing ? 'Mettre a jour' : 'Enregistrer'}</button>
            </div>
          </div>
        </div>
      )}

      <Toast msg={toast} onClose={() => setToast('')} />
    </div>
  );
}

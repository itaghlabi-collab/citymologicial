import { useState, useEffect, useRef } from 'react';
import { FileEdit, Plus, Edit2, Trash2, X, Search, Paperclip, Clock, CheckCircle, AlertTriangle } from 'lucide-react';

function EmptyState({ icon, title, sub }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-3)' }}>
      <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
        {icon}
      </div>
      <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-2)', marginBottom: 5 }}>{title}</div>
      <div style={{ fontSize: '0.83rem' }}>{sub}</div>
    </div>
  );
}
import { getDevis, createDevis, updateDevis, deleteDevis, getProspects } from '../../services/api';
import { TYPE_PROJET_VALUES, TYPE_PROJET_LABEL, SOURCE_VALUES, SOURCE_LABEL } from '../../constants/commercial';

const IS = (e) => ({ padding: '9px 12px', border: '1.5px solid ' + (e ? 'var(--red)' : 'var(--border)'), borderRadius: 'var(--radius)', fontSize: '0.9rem', fontFamily: 'var(--font-body)', outline: 'none', width: '100%', background: '#fff' });

function Toast({ t }) {
  if (!t) return null;
  return <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, background: t.type === 'success' ? '#2E7D32' : '#D32F2F', color: '#fff', padding: '12px 20px', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.22)', fontSize: '0.88rem', fontWeight: 600, maxWidth: 340 }}>{t.msg}</div>;
}

const STATUTS = ['en_attente', 'en_cours', 'realise'];
const STATUT_LABEL = { en_attente: 'En attente', en_cours: 'En cours', realise: 'Realise' };
const STATUT_BADGE = { en_attente: 'badge-orange', en_cours: 'badge-blue', realise: 'badge-green' };

const EMPTY_FORM = { prospect_id: '', type_projet: '', source: '', statut: 'en_attente', commentaire: '', assigne_id: '' };

export default function DevisAttente() {
  const [rows, setRows] = useState([]);
  const [prospects, setProspects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [filterStatut, setFilterStatut] = useState('');
  const [search, setSearch] = useState('');
  const toastRef = useRef(null);

  function showToast(type, msg) {
    setToast({ type, msg });
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 3000);
  }

  async function load() {
    setLoading(true);
    try {
      const [d, p] = await Promise.all([getDevis(), getProspects()]);
      if (Array.isArray(d) && d.length > 0) setRows(d);
      if (Array.isArray(p)) setProspects(p);
    } catch (_) {}
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function openAdd() { setEditRow(null); setForm({ ...EMPTY_FORM }); setErrors({}); setModal(true); }
  function openEdit(row) { setEditRow(row); setForm({ prospect_id: row.prospect_id || '', type_projet: row.type_projet || '', source: row.source || '', statut: row.statut || 'en_attente', commentaire: row.commentaire || '', assigne_id: row.assigne_id || '' }); setErrors({}); setModal(true); }
  function setField(k, v) { setForm(p => ({ ...p, [k]: v })); }

  function validate() {
    const e = {};
    if (!form.type_projet) e.type_projet = 'Requis';
    if (!form.source) e.source = 'Requis';
    return e;
  }

  async function handleSubmit(ev) {
    ev.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      if (editRow) {
        await updateDevis(editRow.id, form);
        setRows(prev => prev.map(r => r.id === editRow.id ? { ...r, ...form, updated_at: now } : r));
        showToast('success', 'Devis mis a jour.');
      } else {
        const prospect = prospects.find(p => String(p.id) === String(form.prospect_id));
        const pNom = prospect ? ((prospect.prenom || '') + ' ' + prospect.nom).trim() : '';
        const num = 'DV-' + String(rows.length + 1).padStart(3, '0');
        const created = await createDevis({ ...form, prospect_id: Number(form.prospect_id) });
        setRows(prev => [created || { ...form, id: Date.now(), numero: num, prospect_nom: pNom, created_at: now.slice(0,10), updated_at: now.slice(0,10) }, ...prev]);
        showToast('success', 'Devis cree.');
      }
      setModal(false);
    } catch (_) {
      const now = new Date().toISOString().slice(0, 10);
      if (editRow) {
        setRows(prev => prev.map(r => r.id === editRow.id ? { ...r, ...form, updated_at: now } : r));
      } else {
        const num = 'DV-' + String(rows.length + 1).padStart(3, '0');
        setRows(prev => [{ ...form, id: Date.now(), numero: num, prospect_nom: '', created_at: now, updated_at: now }, ...prev]);
      }
      showToast('success', editRow ? 'Mis a jour (hors ligne).' : 'Cree (hors ligne).');
      setModal(false);
    } finally { setSaving(false); }
  }

  async function handleDelete(row) {
    if (!window.confirm('Supprimer ce devis ?')) return;
    try { await deleteDevis(row.id); } catch (_) {}
    setRows(prev => prev.filter(r => r.id !== row.id));
    showToast('success', 'Devis supprime.');
  }

  // Check stale (48h not updated)
  function isStale(row) {
    if (!row.updated_at) return false;
    const updated = new Date(row.updated_at);
    return (Date.now() - updated.getTime()) > 48 * 60 * 60 * 1000 && row.statut === 'en_attente';
  }

  const filtered = rows.filter(r => {
    const matchS = !filterStatut || r.statut === filterStatut;
    const matchQ = !search || (r.prospect_nom || '').toLowerCase().includes(search.toLowerCase()) || (r.numero || '').toLowerCase().includes(search.toLowerCase());
    return matchS && matchQ;
  });

  const nbEnCours  = rows.filter(r => r.statut === 'en_cours').length;
  const nbAttente  = rows.filter(r => r.statut === 'en_attente').length;
  const nbRealise  = rows.filter(r => r.statut === 'realise').length;
  const nbStale    = rows.filter(isStale).length;

  return (
    <div className="animate-fade-in">
      <Toast t={toast} />

      <div className="page-header flex-between">
        <div>
          <h1 className="page-title">Devis en attente</h1>
          <p className="page-subtitle">Suivi et gestion des devis commerciaux</p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}><Plus size={15} /> Nouveau devis</button>
      </div>

      {/* Stats */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
        <div className="stat-card">
          <div className="stat-icon blue"><FileEdit size={18} /></div>
          <div className="stat-body"><div className="stat-value">{nbEnCours}</div><div className="stat-label">En cours</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon orange"><Clock size={18} /></div>
          <div className="stat-body"><div className="stat-value">{nbAttente}</div><div className="stat-label">En attente</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green"><CheckCircle size={18} /></div>
          <div className="stat-body"><div className="stat-value">{nbRealise}</div><div className="stat-label">Realises</div></div>
        </div>
        {nbStale > 0 && (
          <div className="stat-card" style={{ border: '1.5px solid #FF6F00' }}>
            <div className="stat-icon" style={{ background: '#FFF3E0' }}><AlertTriangle size={18} style={{ color: '#FF6F00' }} /></div>
            <div className="stat-body"><div className="stat-value" style={{ color: '#FF6F00' }}>{nbStale}</div><div className="stat-label">Stagnants +48h</div></div>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: '14px 20px' }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 220px' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input placeholder="Rechercher prospect, numero..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...IS(false), paddingLeft: 30 }} />
          </div>
          <select value={filterStatut} onChange={e => setFilterStatut(e.target.value)} style={{ ...IS(false), minWidth: 160 }}>
            <option value="">Tous les statuts</option>
            {STATUTS.map(s => <option key={s} value={s}>{STATUT_LABEL[s]}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div className="flex-between mb-4">
          <div className="card-title" style={{ marginBottom: 0 }}><FileEdit size={16} /> Devis ({filtered.length})</div>
        </div>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-3)' }}>Chargement...</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<FileEdit size={22} style={{ color: 'var(--text-3)' }} />}
            title={rows.length === 0 ? "Aucun devis enregistre" : "Aucun resultat pour ces filtres"}
            sub={rows.length === 0 ? "Creez votre premier devis en cliquant sur Nouveau devis" : "Modifiez vos criteres de recherche"}
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Numero</th>
                  <th>Prospect</th>
                  <th>Type projet</th>
                  <th>Source</th>
                  <th>Statut</th>
                  <th>Mise a jour</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id} style={isStale(r) ? { background: '#FFF8E1' } : {}}>
                    <td style={{ fontFamily: 'var(--font-head)', fontWeight: 700, color: 'var(--red)' }}>
                      {r.numero || ('DV-' + String(r.id).padStart(3, '0'))}
                      {isStale(r) && <span style={{ marginLeft: 6 }} title="Non mis a jour depuis +48h"><AlertTriangle size={12} style={{ color: '#FF6F00', verticalAlign: 'middle' }} /></span>}
                    </td>
                    <td style={{ fontWeight: 600 }}>{r.prospect_nom || '-'}</td>
                    <td><span className="badge badge-blue">{TYPE_PROJET_LABEL[r.type_projet] || r.type_projet || '-'}</span></td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>{SOURCE_LABEL[r.source] || r.source || '-'}</td>
                    <td><span className={'badge ' + (STATUT_BADGE[r.statut] || 'badge-grey')}>{STATUT_LABEL[r.statut] || r.statut}</span></td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-3)' }}>{r.updated_at ? r.updated_at.slice(0, 10) : '-'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-ghost btn-sm" style={{ padding: '4px 8px' }} onClick={() => openEdit(r)}><Edit2 size={13} /></button>
                        <button className="btn btn-ghost btn-sm" style={{ padding: '4px 8px' }} onClick={() => handleDelete(r)}><Trash2 size={13} style={{ color: 'var(--red)' }} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── MODAL ── */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 32, width: '100%', maxWidth: 500, boxShadow: '0 8px 40px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="flex-between" style={{ marginBottom: 20 }}>
              <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.3rem', textTransform: 'uppercase' }}>
                {editRow ? 'Modifier devis' : 'Nouveau devis'}
              </h2>
              <button onClick={() => setModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
              <div className="form-group">
                <label>Prospect</label>
                <select style={IS(false)} value={form.prospect_id} onChange={e => setField('prospect_id', e.target.value)}>
                  <option value="">Choisir un prospect...</option>
                  {prospects.map(p => <option key={p.id} value={p.id}>{(p.prenom || '') + ' ' + (p.nom || '')}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>Type de projet *</label>
                  <select style={IS(errors.type_projet)} value={form.type_projet} onChange={e => setField('type_projet', e.target.value)}>
                    <option value="">Choisir...</option>
                    {TYPE_PROJET_VALUES.map(v => <option key={v} value={v}>{TYPE_PROJET_LABEL[v]}</option>)}
                  </select>
                  {errors.type_projet && <span style={{ color: 'var(--red)', fontSize: '0.75rem' }}>{errors.type_projet}</span>}
                </div>
                <div className="form-group">
                  <label>Source *</label>
                  <select style={IS(errors.source)} value={form.source} onChange={e => setField('source', e.target.value)}>
                    <option value="">Choisir...</option>
                    {SOURCE_VALUES.map(v => <option key={v} value={v}>{SOURCE_LABEL[v]}</option>)}
                  </select>
                  {errors.source && <span style={{ color: 'var(--red)', fontSize: '0.75rem' }}>{errors.source}</span>}
                </div>
              </div>
              <div className="form-group">
                <label>Statut</label>
                <select style={IS(false)} value={form.statut} onChange={e => setField('statut', e.target.value)}>
                  {STATUTS.map(s => <option key={s} value={s}>{STATUT_LABEL[s]}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Commentaire</label>
                <textarea rows={3} style={{ ...IS(false), resize: 'vertical' }} value={form.commentaire} onChange={e => setField('commentaire', e.target.value)} placeholder="Notes, observations..." />
              </div>
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Paperclip size={13} /> Document (PDF/image)</label>
                <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ fontSize: '0.85rem', color: 'var(--text-2)' }} />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setModal(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? <span style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> : <><Plus size={14} /> {editRow ? 'Enregistrer' : 'Creer'}</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

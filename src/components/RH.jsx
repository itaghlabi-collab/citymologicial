import { Users, Plus, Edit2, Trash2, Search, UserCheck, X } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { getEmployees, createEmployee } from '../services/api';
import { DEPARTMENTS } from '../data/departments';

/* ── Helpers ── */
function fmtMAD(n) {
  const num = typeof n === 'string' ? parseFloat(n.replace(/\s/g, '')) : Number(n);
  if (isNaN(num)) return n + ' MAD';
  return num.toLocaleString('fr-MA') + ' MAD';
}

function Toast({ toast }) {
  if (!toast) return null;
  const bg = toast.type === 'success' ? '#2E7D32' : '#D32F2F';
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, background: bg, color: '#fff', padding: '12px 20px', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.22)', fontSize: '0.88rem', fontWeight: 600, maxWidth: 340, animation: 'fadeUp 0.3s ease' }}>
      {toast.msg}
    </div>
  );
}

const EMPTY_EMP = { prenom: '', nom: '', email: '', poste: '', departement_id: '', telephone: '', dateEmbauche: '', salaire: '' };

export default function RH() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_EMP);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  function showToast(type, msg) {
    setToast({ type, msg });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }

  async function load() {
    setLoading(true);
    const emps = await getEmployees();
    setEmployees(emps);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function validate() {
    const e = {};
    if (!form.prenom.trim()) e.prenom = 'Requis';
    if (!form.nom.trim()) e.nom = 'Requis';
    if (!form.email.trim() || !form.email.includes('@')) e.email = 'Email invalide';
    if (!form.poste.trim()) e.poste = 'Requis';
    if (!form.salaire || isNaN(Number(form.salaire))) e.salaire = 'Montant valide requis';
    return e;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true);
    try {
      await createEmployee({ ...form, salaire: Number(form.salaire), departement_id: form.departement_id ? Number(form.departement_id) : null });
      showToast('success', "Employe cree avec succes !");
      setShowModal(false);
      setForm(EMPTY_EMP);
      setErrors({});
      load();
    } catch (err) {
      showToast('error', err.message || "Erreur lors de la creation.");
    } finally {
      setSaving(false);
    }
  }

  const filtered = employees.filter(e => {
    const full = ((e.prenom || '') + ' ' + (e.nom || '')).toLowerCase();
    const q = search.toLowerCase();
    return full.includes(q) || (e.poste || '').toLowerCase().includes(q);
  });

  const totalActifs = employees.filter(e => e.status === 'Actif' || e.statut === 'Actif').length;
  const totalConge = employees.filter(e => e.status === 'Conge' || e.statut === 'Conge').length;

  return (
    <div className="animate-fade-in">
      <Toast toast={toast} />

      <div className="page-header">
        <h1 className="page-title">Ressources Humaines</h1>
        <p className="page-subtitle">Gestion du personnel, conges et salaires</p>
      </div>

      {/* Stats */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
        <div className="stat-card">
          <div className="stat-icon blue"><Users size={18} /></div>
          <div className="stat-body">
            <div className="stat-value">{loading ? '—' : employees.length}</div>
            <div className="stat-label">Total employes</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green"><UserCheck size={18} /></div>
          <div className="stat-body">
            <div className="stat-value">{loading ? '—' : totalActifs}</div>
            <div className="stat-label">Actifs</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon orange"><Users size={18} /></div>
          <div className="stat-body">
            <div className="stat-value">{loading ? '—' : totalConge}</div>
            <div className="stat-label">En conge</div>
          </div>
        </div>
      </div>

      {/* Employes table */}
      <div className="card mb-4">
        <div className="flex-between mb-4">
          <div className="card-title" style={{ marginBottom: 0 }}>
            <Users size={16} /> Liste des employes
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
              <input
                style={{ paddingLeft: 30, paddingRight: 12, paddingTop: 8, paddingBottom: 8, border: '1.5px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.85rem', outline: 'none', fontFamily: 'var(--font-body)' }}
                placeholder="Rechercher..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>
              <Plus size={14} /> Ajouter
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-3)' }}>
            <div style={{ width: 28, height: 28, border: '3px solid var(--border)', borderTopColor: 'var(--red)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 10px' }} />
            Chargement...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-3)' }}>
            {employees.length === 0 ? 'Aucun employe. Connectez le backend ou ajoutez le premier employe.' : 'Aucun resultat.'}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nom</th><th>Poste</th><th>Departement</th><th>Salaire</th><th>Statut</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e, i) => {
                  const fullName = [e.prenom, e.nom].filter(Boolean).join(' ') || e.nom || e.name || '-';
                  const statut = e.status || e.statut || 'Actif';
                  return (
                    <tr key={e.id || i}>
                      <td><div style={{ fontWeight: 600 }}>{fullName}</div><div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{e.email}</div></td>
                      <td>{e.poste || e.position || '-'}</td>
                      <td>{(() => { const deptId = e.departement_id || e.departement || e.department; const dept = DEPARTMENTS.find(d => d.id === Number(deptId) || d.nom === deptId); return dept ? <span className="badge badge-blue" title={dept.nom}>{dept.code}</span> : <span className="badge badge-blue">{deptId || '—'}</span>; })()}</td>
                      <td style={{ fontFamily: 'var(--font-head)', fontWeight: 700 }}>{fmtMAD(e.salaire || e.salary || 0)}</td>
                      <td><span className={'badge ' + (statut === 'Actif' ? 'badge-green' : 'badge-orange')}>{statut}</span></td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-ghost btn-sm" style={{ padding: '4px 8px' }}><Edit2 size={13} /></button>
                          <button className="btn btn-ghost btn-sm" style={{ padding: '4px 8px' }}><Trash2 size={13} style={{ color: 'var(--red)' }} /></button>
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

      {/* Modal: Nouvel employe */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 32, width: '100%', maxWidth: 540, boxShadow: '0 8px 40px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="flex-between mb-4" style={{ marginBottom: 20 }}>
              <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.3rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Nouvel employe</h2>
              <button onClick={() => { setShowModal(false); setForm(EMPTY_EMP); setErrors({}); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[
                  { key: 'prenom', label: 'Prenom', placeholder: 'Ahmed' },
                  { key: 'nom', label: 'Nom', placeholder: 'Benali' },
                ].map(f => (
                  <div key={f.key} className="form-group">
                    <label>{f.label}</label>
                    <input type="text" placeholder={f.placeholder} value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} style={{ padding: '9px 12px', border: '1.5px solid ' + (errors[f.key] ? 'var(--red)' : 'var(--border)'), borderRadius: 'var(--radius)', fontSize: '0.9rem', fontFamily: 'var(--font-body)', outline: 'none', width: '100%' }} />
                    {errors[f.key] && <div style={{ color: 'var(--red)', fontSize: '0.75rem', marginTop: 2 }}>{errors[f.key]}</div>}
                  </div>
                ))}
              </div>
              <div className="form-group">
                <label>Email</label>
                <input type="email" placeholder="ahmed.benali@citymo.ma" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} style={{ padding: '9px 12px', border: '1.5px solid ' + (errors.email ? 'var(--red)' : 'var(--border)'), borderRadius: 'var(--radius)', fontSize: '0.9rem', fontFamily: 'var(--font-body)', outline: 'none', width: '100%' }} />
                {errors.email && <div style={{ color: 'var(--red)', fontSize: '0.75rem', marginTop: 2 }}>{errors.email}</div>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>Poste</label>
                  <input type="text" placeholder="Chef de chantier" value={form.poste} onChange={e => setForm(p => ({ ...p, poste: e.target.value }))} style={{ padding: '9px 12px', border: '1.5px solid ' + (errors.poste ? 'var(--red)' : 'var(--border)'), borderRadius: 'var(--radius)', fontSize: '0.9rem', fontFamily: 'var(--font-body)', outline: 'none', width: '100%' }} />
                  {errors.poste && <div style={{ color: 'var(--red)', fontSize: '0.75rem', marginTop: 2 }}>{errors.poste}</div>}
                </div>
                <div className="form-group">
                  <label>Departement</label>
                  <select value={form.departement_id} onChange={e => setForm(p => ({ ...p, departement_id: e.target.value }))} style={{ padding: '9px 12px', border: '1.5px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.9rem', fontFamily: 'var(--font-body)', outline: 'none', width: '100%', background: '#fff' }}>
                    <option value="">Choisir un departement...</option>
                    {DEPARTMENTS.map(d => <option key={d.id} value={d.id}>{d.nom}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>Telephone</label>
                  <input type="tel" placeholder="+212 600 000 000" value={form.telephone} onChange={e => setForm(p => ({ ...p, telephone: e.target.value }))} style={{ padding: '9px 12px', border: '1.5px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.9rem', fontFamily: 'var(--font-body)', outline: 'none', width: '100%' }} />
                </div>
                <div className="form-group">
                  <label>Date d&apos;embauche</label>
                  <input type="date" value={form.dateEmbauche} onChange={e => setForm(p => ({ ...p, dateEmbauche: e.target.value }))} style={{ padding: '9px 12px', border: '1.5px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.9rem', fontFamily: 'var(--font-body)', outline: 'none', width: '100%' }} />
                </div>
              </div>
              <div className="form-group">
                <label>Salaire mensuel (MAD)</label>
                <input type="number" placeholder="15000" min="0" value={form.salaire} onChange={e => setForm(p => ({ ...p, salaire: e.target.value }))} style={{ padding: '9px 12px', border: '1.5px solid ' + (errors.salaire ? 'var(--red)' : 'var(--border)'), borderRadius: 'var(--radius)', fontSize: '0.9rem', fontFamily: 'var(--font-body)', outline: 'none', width: '100%' }} />
                {errors.salaire && <div style={{ color: 'var(--red)', fontSize: '0.75rem', marginTop: 2 }}>{errors.salaire}</div>}
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={() => { setShowModal(false); setForm(EMPTY_EMP); setErrors({}); }}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? <span style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> : <><Plus size={14} /> Creer l&apos;employe</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

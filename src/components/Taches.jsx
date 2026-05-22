import { Plus, CheckSquare, Clock, Trash2, Edit2, X, User, Building2 } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { getEmployees } from '../services/api';
import { DEPARTMENTS } from '../data/departments';

function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, background: toast.type === 'success' ? '#2E7D32' : '#D32F2F', color: '#fff', padding: '12px 20px', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.22)', fontSize: '0.88rem', fontWeight: 600, maxWidth: 340, animation: 'fadeUp 0.3s ease' }}>
      {toast.msg}
    </div>
  );
}

const STATUS_LABELS = { todo: 'A faire', inprogress: 'En cours', done: 'Termine' };
const STATUS_BADGES = { todo: 'badge-orange', inprogress: 'badge-blue', done: 'badge-green' };
const PRIORITY_BADGES = { haute: 'badge-red', normale: 'badge-blue', basse: 'badge-grey' };

const EMPTY_FORM = { titre: '', description: '', assigne: '', departement_id: '', dateLimite: '', statut: 'todo', priorite: 'normale' };

const INPUT_S = (err) => ({
  padding: '9px 12px', width: '100%', outline: 'none', fontFamily: 'var(--font-body)', fontSize: '0.9rem',
  border: '1.5px solid ' + (err ? 'var(--red)' : 'var(--border)'), borderRadius: 'var(--radius)', background: '#fff',
});

export default function Taches() {
  const [tasks, setTasks] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [filter, setFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [toast, setToast] = useState(null);
  const toastRef = useRef(null);

  useEffect(() => {
    getEmployees().then(emps => setEmployees(emps));
  }, []);

  function showToast(type, msg) {
    setToast({ type, msg });
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 3000);
  }

  function openCreate() { setForm(EMPTY_FORM); setErrors({}); setEditId(null); setShowModal(true); }
  function openEdit(t) { setForm({ titre: t.titre, description: t.description || '', assigne: t.assigne || '', dateLimite: t.dateLimite || '', statut: t.statut, priorite: t.priorite }); setErrors({}); setEditId(t.id); setShowModal(true); }
  function closeModal() { setShowModal(false); setEditId(null); }
  function setF(k, v) { setForm(p => ({ ...p, [k]: v })); }

  function handleSubmit(e) {
    e.preventDefault();
    const errs = {};
    if (!form.titre.trim()) errs.titre = 'Requis';
    if (!form.dateLimite) errs.dateLimite = 'Requis';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    if (editId) {
      setTasks(ts => ts.map(t => t.id === editId ? { ...t, ...form } : t));
      showToast('success', 'Tache mise a jour !');
    } else {
      setTasks(ts => [...ts, { id: Date.now(), ...form }]);
      showToast('success', 'Tache creee avec succes !');
    }
    closeModal();
  }

  function deleteTask(id) { setTasks(ts => ts.filter(t => t.id !== id)); }
  function cycleStatus(id) {
    const order = ['todo', 'inprogress', 'done'];
    setTasks(ts => ts.map(t => t.id === id ? { ...t, statut: order[(order.indexOf(t.statut) + 1) % 3] } : t));
  }

  const filtered = tasks.filter(t => filter === 'all' || t.statut === filter);

  const counts = { all: tasks.length, todo: tasks.filter(t => t.statut === 'todo').length, inprogress: tasks.filter(t => t.statut === 'inprogress').length, done: tasks.filter(t => t.statut === 'done').length };

  return (
    <div className="animate-fade-in">
      <Toast toast={toast} />
      <div className="page-header flex-between">
        <div>
          <h1 className="page-title">Taches a faire</h1>
          <p className="page-subtitle">Suivi et gestion des taches de l&apos;equipe</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}><Plus size={15} /> Nouvelle tache</button>
      </div>

      {/* Stats */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', marginBottom: 16 }}>
        {[['all','Toutes','badge-grey'], ['todo','A faire','badge-orange'], ['inprogress','En cours','badge-blue'], ['done','Terminees','badge-green']].map(([k, label, badge]) => (
          <div key={k} className={'stat-card' + (filter === k ? '' : '')} style={{ cursor: 'pointer', border: filter === k ? '2px solid var(--red)' : '1px solid var(--border)', transition: 'border 0.15s' }} onClick={() => setFilter(k)}>
            <div className="stat-body">
              <div className="stat-value" style={{ color: filter === k ? 'var(--red)' : 'var(--text)' }}>{counts[k]}</div>
              <div className="stat-label">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Task list */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: 16 }}><CheckSquare size={16} /> {filter === 'all' ? 'Toutes les taches' : STATUS_LABELS[filter]}</div>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-3)' }}>Aucune tache dans cette categorie.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px', background: t.statut === 'done' ? '#F9FBF9' : 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)', opacity: t.statut === 'done' ? 0.75 : 1 }}>
                <input type="checkbox" checked={t.statut === 'done'} onChange={() => cycleStatus(t.id)} style={{ accentColor: 'var(--red)', width: 16, height: 16, cursor: 'pointer', marginTop: 3, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', textDecoration: t.statut === 'done' ? 'line-through' : 'none', color: t.statut === 'done' ? 'var(--text-3)' : 'var(--text)' }}>{t.titre}</div>
                  {t.description && <div style={{ fontSize: '0.8rem', color: 'var(--text-3)', marginTop: 2 }}>{t.description}</div>}
                  <div style={{ display: 'flex', gap: 12, marginTop: 5, fontSize: '0.77rem', color: 'var(--text-3)', flexWrap: 'wrap' }}>
                    {t.assigne && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><User size={11} /> {t.assigne}</span>}
                    {t.departement_id && (() => { const dept = DEPARTMENTS.find(d => d.id === Number(t.departement_id)); return dept ? <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Building2 size={11} /> {dept.code}</span> : null; })()}
                    {t.dateLimite && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Clock size={11} /> {t.dateLimite}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <span className={'badge ' + STATUS_BADGES[t.statut]} style={{ cursor: 'pointer', fontSize: '0.7rem' }} onClick={() => cycleStatus(t.id)} title="Cliquer pour changer">{STATUS_LABELS[t.statut]}</span>
                  <span className={'badge ' + PRIORITY_BADGES[t.priorite]} style={{ fontSize: '0.7rem' }}>{t.priorite}</span>
                  <button className="btn btn-ghost btn-sm" style={{ padding: '4px 6px' }} onClick={() => openEdit(t)}><Edit2 size={13} /></button>
                  <button className="btn btn-ghost btn-sm" style={{ padding: '4px 6px' }} onClick={() => deleteTask(t.id)}><Trash2 size={13} style={{ color: 'var(--red)' }} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 32, width: '100%', maxWidth: 520, boxShadow: '0 8px 40px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="flex-between" style={{ marginBottom: 20 }}>
              <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.2rem', textTransform: 'uppercase' }}>{editId ? 'Modifier la tache' : 'Nouvelle tache'}</h2>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label>Titre</label>
                <input type="text" placeholder="Description de la tache..." value={form.titre} onChange={e => setF('titre', e.target.value)} style={INPUT_S(errors.titre)} />
                {errors.titre && <div style={{ color: 'var(--red)', fontSize: '0.75rem', marginTop: 2 }}>{errors.titre}</div>}
              </div>
              <div className="form-group">
                <label>Description (optionnel)</label>
                <textarea rows={2} placeholder="Details supplementaires..." value={form.description} onChange={e => setF('description', e.target.value)} style={{ ...INPUT_S(false), resize: 'vertical' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>Assigne a</label>
                  <select value={form.assigne} onChange={e => setF('assigne', e.target.value)} style={INPUT_S(false)}>
                    <option value="">Non assigne</option>
                    {employees.map((emp, i) => {
                      const name = [emp.prenom, emp.nom].filter(Boolean).join(' ') || emp.nom || emp.name || '';
                      return <option key={i} value={name}>{name}</option>;
                    })}
                  </select>
                </div>
                <div className="form-group">
                  <label>Departement</label>
                  <select value={form.departement_id} onChange={e => setF('departement_id', e.target.value)} style={INPUT_S(false)}>
                    <option value="">Tous les departements</option>
                    {DEPARTMENTS.map(d => <option key={d.id} value={d.id}>{d.code} — {d.nom}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Date limite</label>
                <input type="date" value={form.dateLimite} onChange={e => setF('dateLimite', e.target.value)} style={INPUT_S(errors.dateLimite)} />
                {errors.dateLimite && <div style={{ color: 'var(--red)', fontSize: '0.75rem', marginTop: 2 }}>{errors.dateLimite}</div>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>Statut</label>
                  <select value={form.statut} onChange={e => setF('statut', e.target.value)} style={INPUT_S(false)}>
                    <option value="todo">A faire</option>
                    <option value="inprogress">En cours</option>
                    <option value="done">Termine</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Priorite</label>
                  <select value={form.priorite} onChange={e => setF('priorite', e.target.value)} style={INPUT_S(false)}>
                    <option value="haute">Haute</option>
                    <option value="normale">Normale</option>
                    <option value="basse">Basse</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
                <button type="button" className="btn btn-secondary" onClick={closeModal}>Annuler</button>
                <button type="submit" className="btn btn-primary"><Plus size={14} /> {editId ? 'Mettre a jour' : 'Creer la tache'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

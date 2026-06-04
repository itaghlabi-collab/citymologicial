import { Plus, CheckSquare, Clock, Trash2, Edit2, X, User, Building2, RefreshCw } from 'lucide-react';
import { useState, useEffect, useRef, useMemo } from 'react';
import { listEmployees } from '../services/rh/employees';
import { employeeFullName } from '../services/rh/leaves';
import { DEPARTMENTS } from '../data/departments';
import { useInternalTasks } from '../hooks/useInternalTasks';

function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, background: toast.type === 'success' ? '#2E7D32' : '#D32F2F', color: '#fff', padding: '12px 20px', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.22)', fontSize: '0.88rem', fontWeight: 600, maxWidth: 340, animation: 'fadeUp 0.3s ease' }}>
      {toast.msg}
    </div>
  );
}

const STATUS_LABELS = { a_faire: 'A faire', en_cours: 'En cours', terminee: 'Terminee' };
const STATUS_BADGES = { a_faire: 'badge-orange', en_cours: 'badge-blue', terminee: 'badge-green' };
const PRIORITY_BADGES = { urgente: 'badge-red', haute: 'badge-red', normale: 'badge-blue', basse: 'badge-grey' };

const EMPTY_FORM = { titre: '', description: '', assigne: '', departement_id: '', dateLimite: '', statut: 'a_faire', priorite: 'normale', module_lie: '', commentaire: '' };

const INPUT_S = (err) => ({
  padding: '9px 12px', width: '100%', outline: 'none', fontFamily: 'var(--font-body)', fontSize: '0.9rem',
  border: '1.5px solid ' + (err ? 'var(--red)' : 'var(--border)'), borderRadius: 'var(--radius)', background: '#fff',
});

const FILTER_S = { padding: '7px 10px', border: '1.5px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.82rem', background: '#fff', fontFamily: 'var(--font-body)' };

export default function Taches() {
  const {
    records: tasks,
    loading,
    saving,
    error,
    configured,
    load,
    create,
    update,
    remove,
    responsables,
    filterInternalTasks,
    computeInternalTaskStats,
  } = useInternalTasks();

  const [employees, setEmployees] = useState([]);
  const [filter, setFilter] = useState('all');
  const [prioriteFilter, setPrioriteFilter] = useState('all');
  const [responsableFilter, setResponsableFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [toast, setToast] = useState(null);
  const toastRef = useRef(null);

  useEffect(() => {
    if (!configured) return;
    listEmployees()
      .then((rows) => setEmployees(Array.isArray(rows) ? rows : []))
      .catch(() => setEmployees([]));
  }, [configured]);

  function showToast(type, msg) {
    setToast({ type, msg });
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 3000);
  }

  function deptCodeFromTask(t) {
    if (!t.module_lie) return '';
    const dept = DEPARTMENTS.find(d => d.code === t.module_lie);
    return dept ? String(dept.id) : '';
  }

  function openCreate() { setForm(EMPTY_FORM); setErrors({}); setEditId(null); setShowModal(true); }
  function openEdit(t) {
    setForm({
      titre: t.titre,
      description: t.description || '',
      assigne: t.assigne || '',
      departement_id: deptCodeFromTask(t),
      dateLimite: t.dateLimite || '',
      statut: t.statut,
      priorite: t.priorite,
      module_lie: t.module_lie || '',
      commentaire: t.commentaire || '',
    });
    setErrors({});
    setEditId(t.id);
    setShowModal(true);
  }
  function closeModal() { setShowModal(false); setEditId(null); }
  function setF(k, v) { setForm(p => ({ ...p, [k]: v })); }

  function payloadFromForm(f) {
    const dept = DEPARTMENTS.find(d => d.id === Number(f.departement_id));
    return {
      ...f,
      module_lie: f.module_lie?.trim() || (dept ? dept.code : '') || null,
    };
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = {};
    if (!form.titre.trim()) errs.titre = 'Requis';
    if (!form.dateLimite) errs.dateLimite = 'Requis';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    if (!configured) { showToast('error', 'Supabase non configure.'); return; }
    const payload = payloadFromForm(form);
    const result = editId ? await update(editId, payload) : await create(payload);
    if (!result.success) { showToast('error', result.error || 'Erreur.'); return; }
    showToast('success', editId ? 'Tache mise a jour !' : 'Tache creee avec succes !');
    closeModal();
  }

  async function deleteTask(id) {
    if (!window.confirm('Supprimer cette tache ?')) return;
    const result = await remove(id);
    showToast(result.success ? 'success' : 'error', result.success ? 'Tache supprimee.' : (result.error || 'Erreur.'));
  }

  async function cycleStatus(id, current) {
    const order = ['a_faire', 'en_cours', 'terminee'];
    const next = order[(order.indexOf(current) + 1) % 3];
    const t = tasks.find(x => x.id === id);
    if (!t) return;
    const result = await update(id, payloadFromForm({ ...t, assigne: t.assigne, departement_id: deptCodeFromTask(t), dateLimite: t.dateLimite, statut: next }));
    if (!result.success) showToast('error', result.error || 'Erreur.');
  }

  async function toggleDone(id, checked) {
    const t = tasks.find(x => x.id === id);
    if (!t) return;
    const result = await update(id, payloadFromForm({
      ...t,
      assigne: t.assigne,
      departement_id: deptCodeFromTask(t),
      dateLimite: t.dateLimite,
      statut: checked ? 'terminee' : 'a_faire',
    }));
    if (!result.success) showToast('error', result.error || 'Erreur.');
  }

  const filtered = useMemo(() => filterInternalTasks(tasks, {
    statut: filter,
    priorite: prioriteFilter,
    responsable: responsableFilter,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  }), [tasks, filter, prioriteFilter, responsableFilter, dateFrom, dateTo, filterInternalTasks]);

  const counts = computeInternalTaskStats(tasks);

  const employeeNames = useMemo(() => {
    const fromRh = employees
      .filter((e) => e.statut !== 'Inactif')
      .map(employeeFullName)
      .filter(Boolean);
    return [...new Set([...fromRh, ...responsables])].sort((a, b) => a.localeCompare(b, 'fr'));
  }, [employees, responsables]);

  if (loading && tasks.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '50vh', gap: 12 }}>
        <div style={{ width: 32, height: 32, border: '3px solid var(--border)', borderTopColor: 'var(--red)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <p style={{ color: 'var(--text-3)', fontSize: '0.88rem' }}>Chargement des taches...</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <Toast toast={toast} />
      <div className="page-header flex-between">
        <div>
          <h1 className="page-title">Taches a faire</h1>
          <p className="page-subtitle">Suivi et gestion des taches de l&apos;equipe</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={load} disabled={loading}><RefreshCw size={14} /></button>
          <button className="btn btn-primary" onClick={openCreate} disabled={!configured || saving}><Plus size={15} /> Nouvelle tache</button>
        </div>
      </div>

      {!configured && (
        <div style={{ background: '#FFF3E0', border: '1px solid #FFB74D', borderRadius: 8, padding: '10px 14px', fontSize: '0.85rem', marginBottom: 16, color: '#E65100' }}>
          Supabase non configure — ajoutez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env
        </div>
      )}
      {error && (
        <div style={{ background: '#FFF0F0', border: '1px solid rgba(211,47,47,0.3)', borderRadius: 8, padding: '10px 14px', fontSize: '0.85rem', marginBottom: 16, color: '#C62828' }}>
          {error}
        </div>
      )}

      {/* Stats */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', marginBottom: 16 }}>
        {[['all','Toutes','badge-grey'], ['a_faire','A faire','badge-orange'], ['en_cours','En cours','badge-blue'], ['terminee','Terminees','badge-green']].map(([k, label]) => (
          <div key={k} className={'stat-card' + (filter === k ? '' : '')} style={{ cursor: 'pointer', border: filter === k ? '2px solid var(--red)' : '1px solid var(--border)', transition: 'border 0.15s' }} onClick={() => setFilter(k)}>
            <div className="stat-body">
              <div className="stat-value" style={{ color: filter === k ? 'var(--red)' : 'var(--text)' }}>{counts[k === 'all' ? 'total' : k] ?? 0}</div>
              <div className="stat-label">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filtres */}
      <div className="card" style={{ padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={prioriteFilter} onChange={e => setPrioriteFilter(e.target.value)} style={FILTER_S}>
          <option value="all">Toutes priorites</option>
          <option value="urgente">Urgente</option>
          <option value="haute">Haute</option>
          <option value="normale">Normale</option>
          <option value="basse">Basse</option>
        </select>
        <select value={responsableFilter} onChange={e => setResponsableFilter(e.target.value)} style={FILTER_S}>
          <option value="all">Tous responsables</option>
          {employeeNames.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={FILTER_S} title="Date debut" />
        <span style={{ color: 'var(--text-3)', fontSize: '0.82rem' }}>→</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={FILTER_S} title="Date fin" />
      </div>

      {/* Task list */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: 16 }}><CheckSquare size={16} /> {filter === 'all' ? 'Toutes les taches' : STATUS_LABELS[filter]}</div>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-3)' }}>Aucune tache dans cette categorie.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px', background: t.statut === 'terminee' ? '#F9FBF9' : 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)', opacity: t.statut === 'terminee' ? 0.75 : 1 }}>
                <input type="checkbox" checked={t.statut === 'terminee'} onChange={e => toggleDone(t.id, e.target.checked)} style={{ accentColor: 'var(--red)', width: 16, height: 16, cursor: 'pointer', marginTop: 3, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', textDecoration: t.statut === 'terminee' ? 'line-through' : 'none', color: t.statut === 'terminee' ? 'var(--text-3)' : 'var(--text)' }}>{t.titre}</div>
                  {t.description && <div style={{ fontSize: '0.8rem', color: 'var(--text-3)', marginTop: 2 }}>{t.description}</div>}
                  <div style={{ display: 'flex', gap: 12, marginTop: 5, fontSize: '0.77rem', color: 'var(--text-3)', flexWrap: 'wrap' }}>
                    {t.assigne && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><User size={11} /> {t.assigne}</span>}
                    {t.module_lie && (() => { const dept = DEPARTMENTS.find(d => d.code === t.module_lie); return dept ? <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Building2 size={11} /> {dept.code}</span> : <span>{t.module_lie}</span>; })()}
                    {t.dateLimite && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Clock size={11} /> {t.dateLimite}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <span className={'badge ' + STATUS_BADGES[t.statut]} style={{ cursor: 'pointer', fontSize: '0.7rem' }} onClick={() => cycleStatus(t.id, t.statut)} title="Cliquer pour changer">{STATUS_LABELS[t.statut]}</span>
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
                    <option value="">Liste des employes</option>
                    {employeeNames.map(name => <option key={name} value={name}>{name}</option>)}
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
                    <option value="a_faire">A faire</option>
                    <option value="en_cours">En cours</option>
                    <option value="terminee">Termine</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Priorite</label>
                  <select value={form.priorite} onChange={e => setF('priorite', e.target.value)} style={INPUT_S(false)}>
                    <option value="urgente">Urgente</option>
                    <option value="haute">Haute</option>
                    <option value="normale">Normale</option>
                    <option value="basse">Basse</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
                <button type="button" className="btn btn-secondary" onClick={closeModal}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={saving}><Plus size={14} /> {editId ? 'Mettre a jour' : 'Creer la tache'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

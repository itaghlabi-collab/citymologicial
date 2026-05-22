import { CalendarOff, Plus, CheckCircle, XCircle, Clock, X, Upload, User } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { getEmployees, getLeaveRequests } from '../services/api';

const CONGE_TYPES = [
  'Conge annuel',
  'Conge maladie',
  'Conge maternite / paternite',
  'Conge sans solde',
  'Conge exceptionnel',
  'RTT',
];

const STATUS_BADGE = {
  'En attente': 'badge-orange',
  'Approuve': 'badge-green',
  'Refuse': 'badge-red',
  'pending': 'badge-orange',
  'approved': 'badge-green',
  'rejected': 'badge-red',
};

const STATUS_LABEL = {
  'En attente': 'En attente',
  'Approuve': 'Approuve',
  'Refuse': 'Refuse',
  'pending': 'En attente',
  'approved': 'Approuve',
  'rejected': 'Refuse',
};

const INPUT_S = (err) => ({
  padding: '9px 12px',
  width: '100%',
  outline: 'none',
  fontFamily: 'var(--font-body)',
  fontSize: '0.9rem',
  border: '1.5px solid ' + (err ? 'var(--red)' : 'var(--border)'),
  borderRadius: 'var(--radius)',
  background: '#fff',
  boxSizing: 'border-box',
});

function Toast({ toast }) {
  if (!toast) return null;
  const bg = toast.type === 'success' ? '#2E7D32' : '#D32F2F';
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, background: bg, color: '#fff', padding: '12px 20px', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.22)', fontSize: '0.88rem', fontWeight: 600, maxWidth: 340, animation: 'fadeUp 0.3s ease' }}>
      {toast.msg}
    </div>
  );
}

/** Count working days between two date strings (excluding Sundays only) */
function countWorkingDays(startStr, endStr) {
  if (!startStr || !endStr) return 0;
  const start = new Date(startStr);
  const end = new Date(endStr);
  if (isNaN(start) || isNaN(end) || end < start) return 0;
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    if (cur.getDay() !== 0) count++; // exclude Sunday (0)
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

/** Return the next working day after a date string */
function nextWorkingDay(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return '';
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

const EMPTY_FORM = {
  employe: '',
  type: 'Conge annuel',
  dateDebut: '',
  dateFin: '',
  raison: '',
  fichier: null,
};

export default function Conges() {
  const [employees, setEmployees] = useState([]);
  const [requests, setRequests] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [toast, setToast] = useState(null);
  const [filter, setFilter] = useState('all');
  const toastRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    getEmployees().then(emps => setEmployees(emps));
    getLeaveRequests().then(reqs => setRequests(reqs));
  }, []);

  function showToast(type, msg) {
    setToast({ type, msg });
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 3000);
  }

  function setF(k, v) { setForm(p => ({ ...p, [k]: v })); }

  function openModal() {
    setForm(EMPTY_FORM);
    setErrors({});
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
  }

  function validate() {
    const e = {};
    if (!form.employe) e.employe = 'Requis';
    if (!form.dateDebut) e.dateDebut = 'Requis';
    if (!form.dateFin) e.dateFin = 'Requis';
    if (form.dateFin && form.dateDebut && form.dateFin < form.dateDebut) e.dateFin = 'Date fin avant debut';
    return e;
  }

  function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    const jours = countWorkingDays(form.dateDebut, form.dateFin);
    const retour = nextWorkingDay(form.dateFin);
    const newReq = {
      id: Date.now(),
      employe: form.employe,
      employee: form.employe,
      type: form.type,
      dateDebut: form.dateDebut,
      dateFin: form.dateFin,
      dateRetour: retour,
      jours,
      raison: form.raison,
      fichier: form.fichier ? form.fichier.name : null,
      statut: 'En attente',
      status: 'pending',
    };
    setRequests(prev => [newReq, ...prev]);
    showToast('success', 'Demande de conge soumise avec succes !');
    closeModal();
  }

  function approuve(id) {
    setRequests(prev => prev.map(r => r.id === id ? { ...r, statut: 'Approuve', status: 'approved' } : r));
    showToast('success', 'Demande approuvee.');
  }

  function refuse(id) {
    setRequests(prev => prev.map(r => r.id === id ? { ...r, statut: 'Refuse', status: 'rejected' } : r));
    showToast('error', 'Demande refusee.');
  }

  const jours = countWorkingDays(form.dateDebut, form.dateFin);
  const dateRetour = nextWorkingDay(form.dateFin);

  const allRequests = requests.map(r => ({
    ...r,
    _statut: r.statut || r.status || 'En attente',
  }));

  const filtered = filter === 'all'
    ? allRequests
    : allRequests.filter(r => {
        if (filter === 'pending') return r._statut === 'En attente' || r._statut === 'pending';
        if (filter === 'approved') return r._statut === 'Approuve' || r._statut === 'approved';
        if (filter === 'rejected') return r._statut === 'Refuse' || r._statut === 'rejected';
        return true;
      });

  const counts = {
    all: allRequests.length,
    pending: allRequests.filter(r => r._statut === 'En attente' || r._statut === 'pending').length,
    approved: allRequests.filter(r => r._statut === 'Approuve' || r._statut === 'approved').length,
    rejected: allRequests.filter(r => r._statut === 'Refuse' || r._statut === 'rejected').length,
  };

  return (
    <div className="animate-fade-in">
      <Toast toast={toast} />

      <div className="page-header flex-between">
        <div>
          <h1 className="page-title">Demandes de conge</h1>
          <p className="page-subtitle">Gestion des absences et conges du personnel</p>
        </div>
        <button className="btn btn-primary" onClick={openModal}>
          <Plus size={15} /> Nouvelle demande
        </button>
      </div>

      {/* Stats */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', marginBottom: 16 }}>
        {[
          { key: 'all', label: 'Toutes', icon: CalendarOff, color: 'blue' },
          { key: 'pending', label: 'En attente', icon: Clock, color: 'orange' },
          { key: 'approved', label: 'Approuvees', icon: CheckCircle, color: 'green' },
          { key: 'rejected', label: 'Refusees', icon: XCircle, color: 'red' },
        ].map(({ key, label, icon: Icon, color }) => (
          <div
            key={key}
            className="stat-card"
            style={{ cursor: 'pointer', border: filter === key ? '2px solid var(--red)' : '1px solid var(--border)', transition: 'border 0.15s' }}
            onClick={() => setFilter(key)}
          >
            <div className={"stat-icon " + color}><Icon size={18} /></div>
            <div className="stat-body">
              <div className="stat-value" style={{ color: filter === key ? 'var(--red)' : 'var(--text)' }}>{counts[key]}</div>
              <div className="stat-label">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: 16 }}>
          <CalendarOff size={16} /> {filter === 'all' ? 'Toutes les demandes' : filter === 'pending' ? 'En attente' : filter === 'approved' ? 'Approuvees' : 'Refusees'}
        </div>

        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-3)' }}>
            {allRequests.length === 0 ? 'Aucune demande de conge. Soumettez la premiere.' : 'Aucune demande dans cette categorie.'}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Employe</th>
                  <th>Type</th>
                  <th>Du</th>
                  <th>Au</th>
                  <th>Retour</th>
                  <th>Jours</th>
                  <th>Raison</th>
                  <th>Justificatif</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const statLabel = STATUS_LABEL[r._statut] || r._statut;
                  const statBadge = STATUS_BADGE[r._statut] || 'badge-grey';
                  const isPending = r._statut === 'En attente' || r._statut === 'pending';
                  return (
                    <tr key={r.id || i}>
                      <td style={{ fontWeight: 600 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--red-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <User size={13} style={{ color: 'var(--red)' }} />
                          </div>
                          {r.employe || r.employee || '-'}
                        </div>
                      </td>
                      <td><span className="badge badge-blue" style={{ fontSize: '0.72rem' }}>{r.type || '-'}</span></td>
                      <td style={{ whiteSpace: 'nowrap' }}>{r.dateDebut || r.du || '-'}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{r.dateFin || r.au || '-'}</td>
                      <td style={{ whiteSpace: 'nowrap', color: 'var(--text-2)' }}>{r.dateRetour || '-'}</td>
                      <td>
                        <span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, color: 'var(--red)' }}>
                          {r.jours != null ? r.jours : '-'}
                        </span>
                      </td>
                      <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-2)', fontSize: '0.82rem' }}>
                        {r.raison || <span style={{ color: 'var(--text-3)' }}>—</span>}
                      </td>
                      <td>
                        {r.fichier
                          ? <span style={{ fontSize: '0.75rem', color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 3 }}><Upload size={11} /> {r.fichier}</span>
                          : <span style={{ color: 'var(--text-3)', fontSize: '0.75rem' }}>—</span>
                        }
                      </td>
                      <td><span className={"badge " + statBadge}>{statLabel}</span></td>
                      <td>
                        {isPending && (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button
                              className="btn btn-sm"
                              style={{ background: '#E8F5E9', color: '#2E7D32', border: 'none', cursor: 'pointer', borderRadius: 6, padding: '4px 10px', fontSize: '0.78rem', fontWeight: 600 }}
                              onClick={() => approuve(r.id)}
                            >
                              Approuver
                            </button>
                            <button
                              className="btn btn-sm"
                              style={{ background: '#FFEBEE', color: 'var(--red)', border: 'none', cursor: 'pointer', borderRadius: 6, padding: '4px 10px', fontSize: '0.78rem', fontWeight: 600 }}
                              onClick={() => refuse(r.id)}
                            >
                              Refuser
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 32, width: '100%', maxWidth: 540, boxShadow: '0 8px 40px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="flex-between" style={{ marginBottom: 20 }}>
              <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.2rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                Nouvelle demande de conge
              </h2>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Employe */}
              <div className="form-group">
                <label>Employe</label>
                <select value={form.employe} onChange={e => setF('employe', e.target.value)} style={INPUT_S(errors.employe)}>
                  <option value="">Selectionner un employe...</option>
                  {employees.length > 0
                    ? employees.map((emp, i) => {
                        const name = [emp.prenom, emp.nom].filter(Boolean).join(' ') || emp.nom || emp.name || '';
                        return <option key={i} value={name}>{name}</option>;
                      })
                    : null
                  }
                </select>
                {errors.employe && <div style={{ color: 'var(--red)', fontSize: '0.75rem', marginTop: 2 }}>{errors.employe}</div>}
              </div>

              {/* Type de conge */}
              <div className="form-group">
                <label>Type de conge</label>
                <select value={form.type} onChange={e => setF('type', e.target.value)} style={INPUT_S(false)}>
                  {CONGE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              {/* Dates */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>Date de debut</label>
                  <input
                    type="date"
                    value={form.dateDebut}
                    onChange={e => setF('dateDebut', e.target.value)}
                    style={INPUT_S(errors.dateDebut)}
                  />
                  {errors.dateDebut && <div style={{ color: 'var(--red)', fontSize: '0.75rem', marginTop: 2 }}>{errors.dateDebut}</div>}
                </div>
                <div className="form-group">
                  <label>Date de fin</label>
                  <input
                    type="date"
                    value={form.dateFin}
                    min={form.dateDebut || undefined}
                    onChange={e => setF('dateFin', e.target.value)}
                    style={INPUT_S(errors.dateFin)}
                  />
                  {errors.dateFin && <div style={{ color: 'var(--red)', fontSize: '0.75rem', marginTop: 2 }}>{errors.dateFin}</div>}
                </div>
              </div>

              {/* Auto-calculated info */}
              {form.dateDebut && form.dateFin && jours > 0 && (
                <div style={{ background: '#F3F4F6', borderRadius: 8, padding: '10px 14px', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginBottom: 2 }}>Jours demandes (hors dimanches)</div>
                    <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.2rem', color: 'var(--red)' }}>{jours} jour{jours > 1 ? 's' : ''}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginBottom: 2 }}>Date de retour au travail</div>
                    <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '1rem', color: 'var(--text)' }}>{dateRetour}</div>
                  </div>
                </div>
              )}

              {/* Raison */}
              <div className="form-group">
                <label>Raison (optionnel)</label>
                <textarea
                  rows={2}
                  placeholder="Motif de la demande..."
                  value={form.raison}
                  onChange={e => setF('raison', e.target.value)}
                  style={{ ...INPUT_S(false), resize: 'vertical' }}
                />
              </div>

              {/* Justificatif */}
              <div className="form-group">
                <label>Justificatif (PDF ou image, optionnel)</label>
                <div
                  onClick={() => fileRef.current && fileRef.current.click()}
                  style={{ border: '1.5px dashed var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-2)', fontSize: '0.875rem', background: '#FAFAFA', transition: 'border-color 0.15s' }}
                >
                  <Upload size={16} style={{ color: 'var(--red)', flexShrink: 0 }} />
                  {form.fichier
                    ? <span style={{ color: 'var(--text)', fontWeight: 600 }}>{form.fichier.name}</span>
                    : <span>Cliquer pour joindre un fichier...</span>
                  }
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  style={{ display: 'none' }}
                  onChange={e => setF('fichier', e.target.files[0] || null)}
                />
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
                <button type="button" className="btn btn-secondary" onClick={closeModal}>Annuler</button>
                <button type="submit" className="btn btn-primary">
                  <Plus size={14} /> Soumettre la demande
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

import { Plus, ChevronLeft, ChevronRight, Calendar, Clock, MapPin, X, User } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { getEmployees } from '../services/api';

function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, background: toast.type === 'success' ? '#2E7D32' : '#D32F2F', color: '#fff', padding: '12px 20px', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.22)', fontSize: '0.88rem', fontWeight: 600, maxWidth: 340, animation: 'fadeUp 0.3s ease' }}>
      {toast.msg}
    </div>
  );
}

const MONTH_NAMES = ['Janvier','Fevrier','Mars','Avril','Mai','Juin','Juillet','Aout','Septembre','Octobre','Novembre','Decembre'];
const DAY_NAMES = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];

const TYPE_COLORS = {
  meeting: { bg: '#EBF3FF', border: '#1565C0', text: '#0D47A1' },
  call: { bg: '#F0FFF4', border: '#2E7D32', text: '#1B5E20' },
  visit: { bg: '#FFF8E1', border: '#F57F17', text: '#E65100' },
  sign: { bg: '#FFF0F0', border: '#D32F2F', text: '#B71C1C' },
};

const EMPTY_FORM = { titre: '', date: '', heure: '09:00', employe: '', description: '', type: 'meeting' };
const INPUT_S = (err) => ({ padding: '9px 12px', width: '100%', outline: 'none', fontFamily: 'var(--font-body)', fontSize: '0.9rem', border: '1.5px solid ' + (err ? 'var(--red)' : 'var(--border)'), borderRadius: 'var(--radius)', background: '#fff' });

function getDaysInMonth(year, month) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = (firstDay.getDay() + 6) % 7; // Monday-based
  const days = [];
  for (let i = 0; i < startDow; i++) days.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) days.push(d);
  return days;
}

export default function RendezVous() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState(today.getDate());
  const [view, setView] = useState('month'); // 'month' | 'list'
  const [filter, setFilter] = useState('all');
  const [employees, setEmployees] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [toast, setToast] = useState(null);
  const toastRef = useRef(null);

  useEffect(() => { getEmployees().then(e => setEmployees(e)); }, []);

  function showToast(type, msg) {
    setToast({ type, msg });
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 3000);
  }

  function prevMonth() { if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1); }
  function nextMonth() { if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1); }
  function setF(k, v) { setForm(p => ({ ...p, [k]: v })); }

  function openCreate(day) {
    const d = day ? `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` : '';
    setForm({ ...EMPTY_FORM, date: d });
    setErrors({});
    setShowModal(true);
  }

  function handleSubmit(e) {
    e.preventDefault();
    const errs = {};
    if (!form.titre.trim()) errs.titre = 'Requis';
    if (!form.date) errs.date = 'Requis';
    if (!form.heure) errs.heure = 'Requis';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setAppointments(a => [...a, { id: Date.now(), ...form }]);
    showToast('success', 'Rendez-vous ajoute !');
    setShowModal(false);
  }

  function deleteAppt(id) { setAppointments(a => a.filter(x => x.id !== id)); }

  const days = getDaysInMonth(year, month);
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const selectedStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`;

  function apptForDay(d) {
    const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    return appointments.filter(a => a.date === ds);
  }

  const displayAppts = view === 'month'
    ? appointments.filter(a => a.date === selectedStr).sort((a, b) => a.heure.localeCompare(b.heure))
    : appointments.filter(a => filter === 'all' || a.employe !== '').sort((a, b) => a.date.localeCompare(b.date) || a.heure.localeCompare(b.heure));

  return (
    <div className="animate-fade-in">
      <Toast toast={toast} />
      <div className="page-header flex-between">
        <div>
          <h1 className="page-title">Rendez-vous</h1>
          <p className="page-subtitle">Calendrier et gestion des rendez-vous</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ display: 'flex', border: '1.5px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
            {[['month','Calendrier'],['list','Liste']].map(([k, v]) => (
              <button key={k} onClick={() => setView(k)} style={{ padding: '7px 14px', border: 'none', cursor: 'pointer', background: view === k ? 'var(--red)' : '#fff', color: view === k ? '#fff' : 'var(--text-2)', fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '0.83rem', transition: 'all 0.15s' }}>{v}</button>
            ))}
          </div>
          <button className="btn btn-primary" onClick={() => openCreate(null)}><Plus size={15} /> Nouveau RDV</button>
        </div>
      </div>

      {view === 'month' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, alignItems: 'start' }}>
          {/* Calendar grid */}
          <div className="card" style={{ padding: 20 }}>
            {/* Month navigation */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <button onClick={prevMonth} style={{ background: 'none', border: '1.5px solid var(--border)', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><ChevronLeft size={16} /></button>
              <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{MONTH_NAMES[month]} {year}</div>
              <button onClick={nextMonth} style={{ background: 'none', border: '1.5px solid var(--border)', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><ChevronRight size={16} /></button>
            </div>
            {/* Day names */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
              {DAY_NAMES.map(d => (
                <div key={d} style={{ textAlign: 'center', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', padding: '4px 0', textTransform: 'uppercase' }}>{d}</div>
              ))}
            </div>
            {/* Day cells */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
              {days.map((d, i) => {
                if (!d) return <div key={i} />;
                const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                const isToday = ds === todayStr;
                const isSelected = ds === selectedStr;
                const dayAppts = apptForDay(d);
                return (
                  <div key={i} onClick={() => setSelectedDay(d)} style={{ minHeight: 52, padding: '4px 5px', borderRadius: 7, cursor: 'pointer', background: isSelected ? '#FFEBEE' : isToday ? '#FFF5F5' : 'transparent', border: isSelected ? '2px solid var(--red)' : isToday ? '1.5px solid rgba(211,47,47,0.3)' : '1.5px solid transparent', transition: 'all 0.12s' }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--bg)'; }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = isToday ? '#FFF5F5' : 'transparent'; }}
                  >
                    <div style={{ fontWeight: isToday || isSelected ? 800 : 500, fontSize: '0.85rem', color: isSelected ? 'var(--red)' : isToday ? 'var(--red)' : 'var(--text)', textAlign: 'center', marginBottom: 3 }}>{d}</div>
                    {dayAppts.slice(0, 2).map((a, j) => {
                      const c = TYPE_COLORS[a.type] || TYPE_COLORS.meeting;
                      return <div key={j} style={{ fontSize: '0.62rem', background: c.bg, color: c.text, borderRadius: 3, padding: '1px 4px', marginBottom: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.titre}</div>;
                    })}
                    {dayAppts.length > 2 && <div style={{ fontSize: '0.6rem', color: 'var(--text-3)', textAlign: 'center' }}>+{dayAppts.length - 2}</div>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Day panel */}
          <div className="card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1rem' }}>{selectedDay} {MONTH_NAMES[month]}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{displayAppts.length} rendez-vous</div>
              </div>
              <button style={{ background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 7, padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem', fontWeight: 600 }} onClick={() => openCreate(selectedDay)}><Plus size={13} /> Ajouter</button>
            </div>
            {displayAppts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-3)', fontSize: '0.85rem' }}>Aucun rendez-vous ce jour.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {displayAppts.map(a => {
                  const c = TYPE_COLORS[a.type] || TYPE_COLORS.meeting;
                  return (
                    <div key={a.id} style={{ padding: '10px 12px', borderRadius: 8, background: c.bg, borderLeft: `3px solid ${c.border}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: c.text }}>{a.titre}</div>
                        <button onClick={() => deleteAppt(a.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: '0 2px' }}><X size={13} /></button>
                      </div>
                      <div style={{ display: 'flex', gap: 10, marginTop: 4, fontSize: '0.75rem', color: c.text, opacity: 0.85 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Clock size={10} /> {a.heure}</span>
                        {a.employe && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><User size={10} /> {a.employe}</span>}
                      </div>
                      {a.description && <div style={{ fontSize: '0.75rem', color: c.text, opacity: 0.7, marginTop: 3 }}>{a.description}</div>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {view === 'list' && (
        <div className="card">
          <div className="flex-between mb-4">
            <div className="card-title" style={{ marginBottom: 0 }}><Calendar size={16} /> Tous les rendez-vous</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {[['all','Tous'],['mine','Mes RDV']].map(([k, v]) => (
                <button key={k} onClick={() => setFilter(k)} style={{ padding: '5px 14px', border: '1.5px solid ' + (filter === k ? 'var(--red)' : 'var(--border)'), borderRadius: 20, cursor: 'pointer', background: filter === k ? 'var(--red)' : '#fff', color: filter === k ? '#fff' : 'var(--text-2)', fontSize: '0.8rem', fontWeight: 600, transition: 'all 0.15s' }}>{v}</button>
              ))}
            </div>
          </div>
          {displayAppts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-3)' }}>Aucun rendez-vous.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Titre</th><th>Date</th><th>Heure</th><th>Employe</th><th>Type</th><th>Actions</th></tr></thead>
                <tbody>
                  {displayAppts.map(a => {
                    const c = TYPE_COLORS[a.type] || TYPE_COLORS.meeting;
                    return (
                      <tr key={a.id}>
                        <td style={{ fontWeight: 600 }}>{a.titre}</td>
                        <td>{a.date}</td>
                        <td style={{ fontFamily: 'var(--font-head)', fontWeight: 700, color: 'var(--red)' }}>{a.heure}</td>
                        <td>{a.employe || '—'}</td>
                        <td><span style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}`, padding: '2px 8px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700 }}>{a.type}</span></td>
                        <td><button className="btn btn-ghost btn-sm" style={{ padding: '4px 6px' }} onClick={() => deleteAppt(a.id)}><X size={13} style={{ color: 'var(--red)' }} /></button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 32, width: '100%', maxWidth: 500, boxShadow: '0 8px 40px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="flex-between" style={{ marginBottom: 20 }}>
              <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.2rem', textTransform: 'uppercase' }}>Nouveau rendez-vous</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label>Titre</label>
                <input type="text" placeholder="Objet du rendez-vous..." value={form.titre} onChange={e => setF('titre', e.target.value)} style={INPUT_S(errors.titre)} />
                {errors.titre && <div style={{ color: 'var(--red)', fontSize: '0.75rem', marginTop: 2 }}>{errors.titre}</div>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>Date</label>
                  <input type="date" value={form.date} onChange={e => setF('date', e.target.value)} style={INPUT_S(errors.date)} />
                  {errors.date && <div style={{ color: 'var(--red)', fontSize: '0.75rem', marginTop: 2 }}>{errors.date}</div>}
                </div>
                <div className="form-group">
                  <label>Heure</label>
                  <input type="time" value={form.heure} onChange={e => setF('heure', e.target.value)} style={INPUT_S(errors.heure)} />
                  {errors.heure && <div style={{ color: 'var(--red)', fontSize: '0.75rem', marginTop: 2 }}>{errors.heure}</div>}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>Employe</label>
                  <select value={form.employe} onChange={e => setF('employe', e.target.value)} style={INPUT_S(false)}>
                    <option value="">Choisir...</option>
                    {employees.map((emp, i) => {
                      const name = [emp.prenom, emp.nom].filter(Boolean).join(' ') || emp.nom || emp.name || '';
                      return <option key={i} value={name}>{name}</option>;
                    })}
                  </select>
                </div>
                <div className="form-group">
                  <label>Type</label>
                  <select value={form.type} onChange={e => setF('type', e.target.value)} style={INPUT_S(false)}>
                    <option value="meeting">Reunion</option>
                    <option value="call">Appel</option>
                    <option value="visit">Visite</option>
                    <option value="sign">Signature</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Description (optionnel)</label>
                <textarea rows={2} placeholder="Details..." value={form.description} onChange={e => setF('description', e.target.value)} style={{ ...INPUT_S(false), resize: 'vertical' }} />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary"><Plus size={14} /> Ajouter le RDV</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

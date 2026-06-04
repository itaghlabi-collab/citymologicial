import { Plus, ChevronLeft, ChevronRight, Calendar, Clock, MapPin, X, User, Edit2, RefreshCw, Check } from 'lucide-react';
import { useState, useEffect, useRef, useMemo } from 'react';
import { listEmployees } from '../services/rh/employees';
import { employeeFullName } from '../services/rh/leaves';
import { useInternalAppointments } from '../hooks/useInternalAppointments';
import { RDV_TYPE_LABELS, RDV_STATUT_LABELS } from '../services/internal/internalAppointments';

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
  appel: { bg: '#F0FFF4', border: '#2E7D32', text: '#1B5E20' },
  visite_client: { bg: '#FFF8E1', border: '#F57F17', text: '#E65100' },
  reunion_interne: { bg: '#EBF3FF', border: '#1565C0', text: '#0D47A1' },
  chantier: { bg: '#FFF3E0', border: '#EF6C00', text: '#E65100' },
  commercial: { bg: '#FFF0F0', border: '#D32F2F', text: '#B71C1C' },
  autre: { bg: '#F5F5F5', border: '#9E9E9E', text: '#616161' },
};

const STATUT_LABELS = RDV_STATUT_LABELS;

const EMPTY_FORM = { titre: '', date: '', heure: '09:00', heure_fin: '', employe: '', client_prospect: '', lieu: '', description: '', type: 'reunion_interne', statut: 'planifie' };
const INPUT_S = (err) => ({ padding: '9px 12px', width: '100%', outline: 'none', fontFamily: 'var(--font-body)', fontSize: '0.9rem', border: '1.5px solid ' + (err ? 'var(--red)' : 'var(--border)'), borderRadius: 'var(--radius)', background: '#fff' });
const FILTER_S = { padding: '7px 10px', border: '1.5px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.82rem', background: '#fff', fontFamily: 'var(--font-body)' };

function getDaysInMonth(year, month) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = (firstDay.getDay() + 6) % 7;
  const days = [];
  for (let i = 0; i < startDow; i++) days.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) days.push(d);
  return days;
}

export default function RendezVous() {
  const {
    records: appointments,
    loading,
    saving,
    error,
    configured,
    load,
    create,
    update,
    remove,
    setStatut,
    responsables,
    filterInternalAppointments,
  } = useInternalAppointments();

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState(today.getDate());
  const [view, setView] = useState('month');
  const [filter, setFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');
  const [statutFilter, setStatutFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [responsableFilter, setResponsableFilter] = useState('all');
  const [employees, setEmployees] = useState([]);
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

  function prevMonth() { if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1); }
  function nextMonth() { if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1); }
  function setF(k, v) { setForm(p => ({ ...p, [k]: v })); }

  function openCreate(day) {
    const d = day ? `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` : '';
    setForm({ ...EMPTY_FORM, date: d });
    setErrors({});
    setEditId(null);
    setShowModal(true);
  }

  function openEdit(a) {
    setForm({
      titre: a.titre,
      date: a.date,
      heure: a.heure || '09:00',
      heure_fin: a.heure_fin || '',
      employe: a.employe || '',
      client_prospect: a.client_prospect || '',
      lieu: a.lieu || '',
      description: a.description || '',
      type: a.type || 'reunion_interne',
      statut: a.statut || 'planifie',
    });
    setErrors({});
    setEditId(a.id);
    setShowModal(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = {};
    if (!form.titre.trim()) errs.titre = 'Requis';
    if (!form.date) errs.date = 'Requis';
    if (!form.heure) errs.heure = 'Requis';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    if (!configured) { showToast('error', 'Supabase non configure.'); return; }
    const result = editId ? await update(editId, form) : await create(form);
    if (!result.success) { showToast('error', result.error || 'Erreur.'); return; }
    showToast('success', editId ? 'Rendez-vous mis a jour !' : 'Rendez-vous ajoute !');
    setShowModal(false);
    setEditId(null);
  }

  async function deleteAppt(id) {
    if (!window.confirm('Supprimer ce rendez-vous ?')) return;
    const result = await remove(id);
    showToast(result.success ? 'success' : 'error', result.success ? 'Rendez-vous supprime.' : (result.error || 'Erreur.'));
  }

  async function markStatut(id, statut) {
    const result = await setStatut(id, statut);
    showToast(result.success ? 'success' : 'error', result.success ? `Statut : ${STATUT_LABELS[statut]}` : (result.error || 'Erreur.'));
  }

  const days = getDaysInMonth(year, month);
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const selectedStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`;

  function apptForDay(d) {
    const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    return appointments.filter(a => a.date === ds && a.statut !== 'annule');
  }

  const displayAppts = useMemo(() => {
    if (view === 'month') {
      return appointments
        .filter(a => a.date === selectedStr && a.statut !== 'annule')
        .sort((a, b) => a.heure.localeCompare(b.heure));
    }
    return filterInternalAppointments(appointments, {
      date: dateFilter || undefined,
      responsable: filter === 'mine' ? undefined : responsableFilter,
      statut: statutFilter,
      type: typeFilter,
      mine: filter === 'mine',
    }).sort((a, b) => a.date.localeCompare(b.date) || a.heure.localeCompare(b.heure));
  }, [view, appointments, selectedStr, filter, dateFilter, statutFilter, typeFilter, responsableFilter, filterInternalAppointments]);

  const employeeNames = useMemo(() => {
    const fromRh = employees
      .filter((e) => e.statut !== 'Inactif')
      .map(employeeFullName)
      .filter(Boolean);
    return [...new Set([...fromRh, ...responsables])].sort((a, b) => a.localeCompare(b, 'fr'));
  }, [employees, responsables]);

  function typeColor(type) {
    return TYPE_COLORS[type] || TYPE_COLORS.autre;
  }

  if (loading && appointments.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '50vh', gap: 12 }}>
        <div style={{ width: 32, height: 32, border: '3px solid var(--border)', borderTopColor: 'var(--red)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <p style={{ color: 'var(--text-3)', fontSize: '0.88rem' }}>Chargement des rendez-vous...</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <Toast toast={toast} />
      <div className="page-header flex-between">
        <div>
          <h1 className="page-title">Rendez-vous</h1>
          <p className="page-subtitle">Calendrier et gestion des rendez-vous</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={load} disabled={loading}><RefreshCw size={14} /></button>
          <div style={{ display: 'flex', border: '1.5px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
            {[['month','Calendrier'],['list','Liste']].map(([k, v]) => (
              <button key={k} onClick={() => setView(k)} style={{ padding: '7px 14px', border: 'none', cursor: 'pointer', background: view === k ? 'var(--red)' : '#fff', color: view === k ? '#fff' : 'var(--text-2)', fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '0.83rem', transition: 'all 0.15s' }}>{v}</button>
            ))}
          </div>
          <button className="btn btn-primary" onClick={() => openCreate(null)} disabled={!configured || saving}><Plus size={15} /> Nouveau RDV</button>
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

      {view === 'month' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, alignItems: 'start' }}>
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <button onClick={prevMonth} style={{ background: 'none', border: '1.5px solid var(--border)', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><ChevronLeft size={16} /></button>
              <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{MONTH_NAMES[month]} {year}</div>
              <button onClick={nextMonth} style={{ background: 'none', border: '1.5px solid var(--border)', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><ChevronRight size={16} /></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
              {DAY_NAMES.map(d => (
                <div key={d} style={{ textAlign: 'center', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', padding: '4px 0', textTransform: 'uppercase' }}>{d}</div>
              ))}
            </div>
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
                      const c = typeColor(a.type);
                      return <div key={j} style={{ fontSize: '0.62rem', background: c.bg, color: c.text, borderRadius: 3, padding: '1px 4px', marginBottom: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.titre}</div>;
                    })}
                    {dayAppts.length > 2 && <div style={{ fontSize: '0.6rem', color: 'var(--text-3)', textAlign: 'center' }}>+{dayAppts.length - 2}</div>}
                  </div>
                );
              })}
            </div>
          </div>

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
                  const c = typeColor(a.type);
                  return (
                    <div key={a.id} style={{ padding: '10px 12px', borderRadius: 8, background: c.bg, borderLeft: `3px solid ${c.border}`, opacity: a.statut === 'termine' ? 0.7 : 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: c.text }}>{a.titre}</div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={() => openEdit(a)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: '0 2px' }}><Edit2 size={13} /></button>
                          <button onClick={() => deleteAppt(a.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: '0 2px' }}><X size={13} /></button>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 10, marginTop: 4, fontSize: '0.75rem', color: c.text, opacity: 0.85, flexWrap: 'wrap' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Clock size={10} /> {a.heure}{a.heure_fin ? ` - ${a.heure_fin}` : ''}</span>
                        {a.employe && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><User size={10} /> {a.employe}</span>}
                        {a.lieu && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><MapPin size={10} /> {a.lieu}</span>}
                      </div>
                      {a.description && <div style={{ fontSize: '0.75rem', color: c.text, opacity: 0.7, marginTop: 3 }}>{a.description}</div>}
                      {a.statut === 'planifie' && (
                        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                          <button onClick={() => markStatut(a.id, 'termine')} style={{ fontSize: '0.7rem', padding: '3px 8px', borderRadius: 6, border: '1px solid #2E7D32', background: '#F0FFF4', color: '#1B5E20', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}><Check size={10} /> Termine</button>
                          <button onClick={() => markStatut(a.id, 'annule')} style={{ fontSize: '0.7rem', padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)', background: '#fff', color: 'var(--text-3)', cursor: 'pointer' }}>Annuler</button>
                        </div>
                      )}
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
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[['all','Tous'],['mine','Mes RDV']].map(([k, v]) => (
                <button key={k} onClick={() => setFilter(k)} style={{ padding: '5px 14px', border: '1.5px solid ' + (filter === k ? 'var(--red)' : 'var(--border)'), borderRadius: 20, cursor: 'pointer', background: filter === k ? 'var(--red)' : '#fff', color: filter === k ? '#fff' : 'var(--text-2)', fontSize: '0.8rem', fontWeight: 600, transition: 'all 0.15s' }}>{v}</button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
            <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} style={FILTER_S} />
            <select value={responsableFilter} onChange={e => setResponsableFilter(e.target.value)} style={FILTER_S}>
              <option value="all">Tous responsables</option>
              {employeeNames.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <select value={statutFilter} onChange={e => setStatutFilter(e.target.value)} style={FILTER_S}>
              <option value="all">Tous statuts</option>
              <option value="planifie">Planifie</option>
              <option value="termine">Termine</option>
              <option value="annule">Annule</option>
              <option value="reporte">Reporte</option>
            </select>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={FILTER_S}>
              <option value="all">Tous types</option>
              {Object.entries(RDV_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          {displayAppts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-3)' }}>Aucun rendez-vous.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Titre</th><th>Date</th><th>Heure</th><th>Employe</th><th>Type</th><th>Statut</th><th>Actions</th></tr></thead>
                <tbody>
                  {displayAppts.map(a => {
                    const c = typeColor(a.type);
                    return (
                      <tr key={a.id} style={{ opacity: a.statut === 'annule' ? 0.55 : 1 }}>
                        <td style={{ fontWeight: 600 }}>{a.titre}</td>
                        <td>{a.date}</td>
                        <td style={{ fontFamily: 'var(--font-head)', fontWeight: 700, color: 'var(--red)' }}>{a.heure}</td>
                        <td>{a.employe || '—'}</td>
                        <td><span style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}`, padding: '2px 8px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700 }}>{RDV_TYPE_LABELS[a.type] || a.type}</span></td>
                        <td><span className={'badge ' + (a.statut === 'termine' ? 'badge-green' : a.statut === 'annule' ? 'badge-grey' : 'badge-blue')} style={{ fontSize: '0.68rem' }}>{STATUT_LABELS[a.statut] || a.statut}</span></td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn btn-ghost btn-sm" style={{ padding: '4px 6px' }} onClick={() => openEdit(a)}><Edit2 size={13} /></button>
                            {a.statut === 'planifie' && <button className="btn btn-ghost btn-sm" style={{ padding: '4px 6px' }} onClick={() => markStatut(a.id, 'termine')} title="Marquer termine"><Check size={13} style={{ color: '#2E7D32' }} /></button>}
                            <button className="btn btn-ghost btn-sm" style={{ padding: '4px 6px' }} onClick={() => deleteAppt(a.id)}><X size={13} style={{ color: 'var(--red)' }} /></button>
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
      )}

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 32, width: '100%', maxWidth: 500, boxShadow: '0 8px 40px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="flex-between" style={{ marginBottom: 20 }}>
              <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.2rem', textTransform: 'uppercase' }}>{editId ? 'Modifier rendez-vous' : 'Nouveau rendez-vous'}</h2>
              <button onClick={() => { setShowModal(false); setEditId(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}><X size={20} /></button>
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
                  <label>Heure fin (optionnel)</label>
                  <input type="time" value={form.heure_fin} onChange={e => setF('heure_fin', e.target.value)} style={INPUT_S(false)} />
                </div>
                <div className="form-group">
                  <label>Lieu (optionnel)</label>
                  <input type="text" placeholder="Adresse ou salle..." value={form.lieu} onChange={e => setF('lieu', e.target.value)} style={INPUT_S(false)} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>Employe</label>
                  <select value={form.employe} onChange={e => setF('employe', e.target.value)} style={INPUT_S(false)}>
                    <option value="">Liste des employes</option>
                    {employeeNames.map(name => <option key={name} value={name}>{name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Type</label>
                  <select value={form.type} onChange={e => setF('type', e.target.value)} style={INPUT_S(false)}>
                    {Object.entries(RDV_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Client / prospect (optionnel)</label>
                <input type="text" placeholder="Nom client ou prospect..." value={form.client_prospect} onChange={e => setF('client_prospect', e.target.value)} style={INPUT_S(false)} />
              </div>
              <div className="form-group">
                <label>Description (optionnel)</label>
                <textarea rows={2} placeholder="Details..." value={form.description} onChange={e => setF('description', e.target.value)} style={{ ...INPUT_S(false), resize: 'vertical' }} />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
                <button type="button" className="btn btn-secondary" onClick={() => { setShowModal(false); setEditId(null); }}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={saving}><Plus size={14} /> {editId ? 'Mettre a jour' : 'Ajouter le RDV'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * AgendaDirection.jsx — Agenda de Direction ERP CITYMO
 * Calendrier DG indépendant du module Rendez-vous
 */
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  Calendar, ChevronLeft, ChevronRight, Plus, RefreshCw, Download,
  MapPin, Clock, Edit2, Trash2, X, Bell, Lock, Eye, Printer,
  FileSpreadsheet, FileText,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useExecutiveCalendar } from '../hooks/useExecutiveCalendar';
import {
  canAccessExecutiveCalendar,
  isExecutiveCalendarReadOnly,
} from '../services/auth/executiveCalendarAccess';
import {
  EXEC_EVENT_TYPES, EXEC_EVENT_TYPE_LABELS, EXEC_STATUSES, EXEC_STATUS_LABELS,
  EXEC_PRIORITIES, EXEC_PRIORITY_LABELS, EXEC_TYPE_COLORS,
  MONTH_NAMES, getDaysInMonth, toDateKey, startOfWeekMonday, addDays,
  eventsForDay, parseLocalDateTime, fmtTimeFromDate, fmtDisplayDateTime,
} from '../services/internal/executiveCalendar';

const DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const HOURS = Array.from({ length: 14 }, (_, i) => i + 7);

const EMPTY_FORM = {
  title: '',
  event_type: 'rdv_client',
  date_debut: '',
  heure_debut: '09:00',
  date_fin: '',
  heure_fin: '10:00',
  location: '',
  description: '',
  priority: 'normale',
  status: 'prevu',
};

const INPUT_S = (err) => ({
  padding: '9px 12px', width: '100%', outline: 'none', boxSizing: 'border-box',
  fontFamily: 'var(--font-body)', fontSize: '0.9rem',
  border: `1.5px solid ${err ? 'var(--red)' : 'var(--border)'}`,
  borderRadius: 'var(--radius)', background: '#fff',
});

function KpiCard({ icon, label, value, color }) {
  const colors = { red: 'var(--red)', blue: '#1565C0', green: '#2E7D32', orange: '#E65100', grey: 'var(--text-3)', purple: '#6A1B9A' };
  const bg = { red: 'var(--red-light)', blue: '#E3F2FD', green: '#E8F5E9', orange: '#FFF3E0', grey: 'var(--surface-2)', purple: '#F3E5F5' };
  const c = color || 'grey';
  return (
    <div className="stat-card exec-agenda-kpi">
      <div className="stat-icon" style={{ background: bg[c], color: colors[c] }}>{icon}</div>
      <div className="stat-body">
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
      </div>
    </div>
  );
}

function EventChip({ ev, onClick, draggable, onDragStart, compact }) {
  const c = EXEC_TYPE_COLORS[ev.event_type] || EXEC_TYPE_COLORS.autre;
  return (
    <div
      className="exec-agenda-event-chip"
      draggable={draggable}
      onDragStart={onDragStart}
      onClick={(e) => { e.stopPropagation(); onClick?.(e); }}
      style={{
        background: c.bg,
        borderLeft: `3px solid ${c.border}`,
        color: c.text,
        fontSize: compact ? '0.62rem' : '0.72rem',
        padding: compact ? '2px 4px' : '4px 6px',
        borderRadius: 4,
        marginBottom: 2,
        cursor: draggable ? 'grab' : 'pointer',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        opacity: ev.status === 'realise' ? 0.65 : 1,
      }}
      title={`${ev.title} — ${fmtDisplayDateTime(ev.start_datetime)}`}
    >
      {!compact && <span style={{ fontWeight: 700, marginRight: 4 }}>{ev.heure_debut}</span>}
      {ev.title}
    </div>
  );
}

export default function AgendaDirection() {
  const { user } = useAuth();
  const {
    records, notifications, loading, saving, error, configured, canAccess, canWrite,
    reload, save, reschedule, remove, dismissNotification, kpis,
    exportCsv, exportExcel, exportPdf, printAgenda,
  } = useExecutiveCalendar();

  const today = new Date();
  const [view, setView] = useState('month');
  const [cursor, setCursor] = useState(new Date(today));
  const [selectedDay, setSelectedDay] = useState(today.getDate());
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [showExport, setShowExport] = useState(false);
  const [toast, setToast] = useState(null);
  const [dragEventId, setDragEventId] = useState(null);
  const toastRef = useRef(null);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const todayStr = toDateKey(today);
  const selectedStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`;
  const readOnly = isExecutiveCalendarReadOnly(user);

  useEffect(() => {
    function onAlert(e) {
      setToast({ type: 'info', msg: e.detail?.message || 'Rappel agenda DG' });
      clearTimeout(toastRef.current);
      toastRef.current = setTimeout(() => setToast(null), 8000);
    }
    window.addEventListener('citymo:executive-alert', onAlert);
    return () => window.removeEventListener('citymo:executive-alert', onAlert);
  }, []);

  const kpi = useMemo(() => kpis(cursor), [kpis, cursor, records]);

  const periodEvents = useMemo(() => {
    if (view === 'day') return eventsForDay(records, toDateKey(cursor));
    if (view === 'week') {
      const ws = startOfWeekMonday(cursor);
      const we = addDays(ws, 7);
      we.setMilliseconds(-1);
      return records.filter((ev) => {
        if (ev.status === 'annule') return false;
        const s = new Date(ev.start_datetime);
        return s >= ws && s <= we;
      });
    }
    const ms = new Date(year, month, 1);
    const me = new Date(year, month + 1, 0, 23, 59, 59, 999);
    return records.filter((ev) => {
      if (ev.status === 'annule') return false;
      const s = new Date(ev.start_datetime);
      return s >= ms && s <= me;
    });
  }, [records, view, cursor, year, month]);

  const periodLabel = useMemo(() => {
    if (view === 'day') return fmtDisplayDateTime(cursor.toISOString()).split(' ')[0];
    if (view === 'week') {
      const ws = startOfWeekMonday(cursor);
      const we = addDays(ws, 6);
      return `${ws.getDate()}/${ws.getMonth() + 1} — ${we.getDate()}/${we.getMonth() + 1}/${we.getFullYear()}`;
    }
    return `${MONTH_NAMES[month]} ${year}`;
  }, [view, cursor, month, year]);

  function showToastMsg(type, msg) {
    setToast({ type, msg });
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 3500);
  }

  function openCreate(dayKey) {
    const dk = dayKey || selectedStr;
    setForm({ ...EMPTY_FORM, date_debut: dk, date_fin: dk });
    setErrors({});
    setEditId(null);
    setShowModal(true);
  }

  function openEdit(ev) {
    setForm({
      title: ev.title,
      event_type: ev.event_type,
      date_debut: ev.date,
      heure_debut: ev.heure_debut,
      date_fin: ev.date_fin,
      heure_fin: ev.heure_fin,
      location: ev.location,
      description: ev.description,
      priority: ev.priority,
      status: ev.status,
    });
    setErrors({});
    setEditId(ev.id);
    setShowModal(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = {};
    if (!form.title.trim()) errs.title = 'Requis';
    if (!form.date_debut) errs.date_debut = 'Requis';
    if (!form.heure_debut) errs.heure_debut = 'Requis';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    const payload = { ...form, date_fin: form.date_fin || form.date_debut };
    const res = await save(payload, editId);
    if (res.success) {
      showToastMsg('success', editId ? 'Événement mis à jour' : 'Événement ajouté');
      setShowModal(false);
    } else {
      showToastMsg('error', res.error || 'Erreur');
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Supprimer cet événement ?')) return;
    const res = await remove(id);
    showToastMsg(res.success ? 'success' : 'error', res.success ? 'Supprimé' : (res.error || 'Erreur'));
  }

  const handleDropOnDay = useCallback(async (dateKey, hour) => {
    if (!dragEventId || !canWrite) return;
    const ev = records.find((x) => x.id === dragEventId);
    if (!ev) return;
    const time = hour != null ? `${String(hour).padStart(2, '0')}:00` : ev.heure_debut;
    const newStart = parseLocalDateTime(dateKey, time);
    const res = await reschedule(ev.id, newStart.toISOString(), ev);
    setDragEventId(null);
    showToastMsg(res.success ? 'success' : 'error', res.success ? 'Événement déplacé' : (res.error || 'Erreur'));
  }, [dragEventId, canWrite, records, reschedule]);

  function prevPeriod() {
    if (view === 'day') setCursor((d) => addDays(d, -1));
    else if (view === 'week') setCursor((d) => addDays(d, -7));
    else if (month === 0) { setCursor(new Date(year - 1, 11, 1)); } else setCursor(new Date(year, month - 1, 1));
  }

  function nextPeriod() {
    if (view === 'day') setCursor((d) => addDays(d, 1));
    else if (view === 'week') setCursor((d) => addDays(d, 7));
    else if (month === 11) { setCursor(new Date(year + 1, 0, 1)); } else setCursor(new Date(year, month + 1, 1));
  }

  function goToday() {
    setCursor(new Date());
    setSelectedDay(today.getDate());
  }

  if (!canAccessExecutiveCalendar(user)) {
    return (
      <div className="card animate-fade-in" style={{ padding: 32, textAlign: 'center' }}>
        <Lock size={32} style={{ color: 'var(--text-3)', marginBottom: 12 }} />
        <h2 className="page-title" style={{ fontSize: '1.1rem' }}>Accès restreint</h2>
        <p style={{ color: 'var(--text-3)', fontSize: '0.88rem' }}>
          L&apos;Agenda de Direction est réservé à l&apos;administration, l&apos;assistante de direction et au Directeur Général.
        </p>
      </div>
    );
  }

  if (loading && !records.length) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48, gap: 10, color: 'var(--text-3)' }}>
        <RefreshCw size={22} className="cin-spin" /> Chargement de l&apos;agenda…
      </div>
    );
  }

  const days = getDaysInMonth(year, month);
  const weekStart = startOfWeekMonday(cursor);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div className="animate-fade-in exec-agenda-root">
      {toast && (
        <div className={`exec-agenda-toast exec-agenda-toast--${toast.type}`}>{toast.msg}</div>
      )}

      <div className="page-header flex-between exec-agenda-header" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title">AGENDA DE DIRECTION</h1>
          <p className="page-subtitle">
            Calendrier du Directeur Général
            {readOnly && <span className="badge badge-grey" style={{ marginLeft: 8, fontSize: '0.68rem' }}><Eye size={10} /> Lecture seule</span>}
          </p>
        </div>
        <div className="exec-agenda-header-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={reload} disabled={loading}><RefreshCw size={14} /></button>
          <div className="exec-agenda-view-toggle">
            {[['day', 'Jour'], ['week', 'Semaine'], ['month', 'Mois']].map(([k, v]) => (
              <button key={k} type="button" className={view === k ? 'active' : ''} onClick={() => setView(k)}>{v}</button>
            ))}
          </div>
          <div style={{ position: 'relative' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowExport((e) => !e)} disabled={!periodEvents.length}>
              <Download size={14} /> Export
            </button>
            {showExport && (
              <div className="card exec-agenda-export-menu">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { exportCsv(periodEvents); setShowExport(false); }}><FileText size={14} /> CSV</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { exportExcel(periodEvents); setShowExport(false); }}><FileSpreadsheet size={14} /> Excel</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { exportPdf(periodEvents, periodLabel); setShowExport(false); }}><Download size={14} /> PDF</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { printAgenda(periodEvents, periodLabel); setShowExport(false); }}><Printer size={14} /> Imprimer</button>
              </div>
            )}
          </div>
          {canWrite && (
            <button type="button" className="btn btn-primary" onClick={() => openCreate(null)} disabled={!configured || saving}>
              <Plus size={15} /> Nouvel événement
            </button>
          )}
        </div>
      </div>

      {!configured && (
        <div className="card" style={{ marginBottom: 12, padding: 12, color: 'var(--red)', fontSize: '0.85rem' }}>
          Supabase non configuré — exécutez supabase/RUN_EXECUTIVE_CALENDAR.sql
        </div>
      )}
      {error && (
        <div className="card" style={{ marginBottom: 12, padding: 12, color: 'var(--red)', fontSize: '0.85rem' }}>{error}</div>
      )}

      {(notifications.length > 0) && (
        <div className="card exec-agenda-notifications">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontWeight: 700, fontSize: '0.82rem' }}>
            <Bell size={15} style={{ color: 'var(--red)' }} /> Rappels agenda
          </div>
          {notifications.slice(0, 5).map((n) => (
            <div key={n.id} className="exec-agenda-notif-row">
              <span>{n.notification_type === '24h' ? '24 h' : '1 h'} — {n.executive_calendar?.title || 'Événement'}</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => dismissNotification(n.id)}><X size={12} /></button>
            </div>
          ))}
        </div>
      )}

      <div className="stat-grid exec-agenda-kpi-grid" style={{ marginBottom: 16 }}>
        <KpiCard icon={<Calendar size={16} />} label="Aujourd'hui" value={kpi.today} color="red" />
        <KpiCard icon={<Calendar size={16} />} label="Cette semaine" value={kpi.week} color="blue" />
        <KpiCard icon={<Calendar size={16} />} label="Ce mois" value={kpi.month} color="green" />
        <KpiCard icon={<Calendar size={16} />} label="RDV clients" value={kpi.rdvClients} color="orange" />
        <KpiCard icon={<MapPin size={16} />} label="Visites chantier" value={kpi.visitesChantier} color="purple" />
        <KpiCard icon={<Clock size={16} />} label="Déplacements" value={kpi.deplacements} color="grey" />
      </div>

      <div className="card exec-agenda-nav-bar">
        <button type="button" className="btn btn-ghost btn-sm" onClick={prevPeriod}><ChevronLeft size={16} /></button>
        <button type="button" className="btn btn-ghost btn-sm exec-agenda-today-btn" onClick={goToday}>Aujourd&apos;hui</button>
        <div className="exec-agenda-period-label">{periodLabel}</div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={nextPeriod}><ChevronRight size={16} /></button>
      </div>

      {/* ── VUE MOIS ── */}
      {view === 'month' && (
        <div className="exec-agenda-month-layout">
          <div className="card exec-agenda-calendar-card">
            <div className="exec-agenda-weekdays">
              {DAY_NAMES.map((d) => <div key={d}>{d}</div>)}
            </div>
            <div className="exec-agenda-month-grid">
              {days.map((d, i) => {
                if (!d) return <div key={`e-${i}`} className="exec-agenda-day-cell exec-agenda-day-cell--empty" />;
                const dk = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                const isToday = dk === todayStr;
                const isSelected = dk === selectedStr;
                const dayEv = eventsForDay(records, dk);
                return (
                  <div
                    key={dk}
                    className={`exec-agenda-day-cell${isSelected ? ' is-selected' : ''}${isToday ? ' is-today' : ''}`}
                    onClick={() => setSelectedDay(d)}
                    onDragOver={(e) => { if (canWrite) e.preventDefault(); }}
                    onDrop={() => handleDropOnDay(dk)}
                  >
                    <div className="exec-agenda-day-num">{d}</div>
                    {dayEv.slice(0, 3).map((ev) => (
                      <EventChip
                        key={ev.id}
                        ev={ev}
                        compact
                        draggable={canWrite}
                        onDragStart={() => setDragEventId(ev.id)}
                        onClick={(e) => { e.stopPropagation(); openEdit(ev); }}
                      />
                    ))}
                    {dayEv.length > 3 && <div className="exec-agenda-more">+{dayEv.length - 3}</div>}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="card exec-agenda-side-panel">
            <div className="exec-agenda-side-head">
              <div>
                <div style={{ fontWeight: 800 }}>{selectedDay} {MONTH_NAMES[month]}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{eventsForDay(records, selectedStr).length} événement(s)</div>
              </div>
              {canWrite && (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => openCreate(selectedStr)}><Plus size={13} /></button>
              )}
            </div>
            <div className="exec-agenda-side-list">
              {eventsForDay(records, selectedStr).length === 0 ? (
                <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-3)', fontSize: '0.85rem' }}>Aucun événement</div>
              ) : eventsForDay(records, selectedStr).map((ev) => {
                const c = EXEC_TYPE_COLORS[ev.event_type] || EXEC_TYPE_COLORS.autre;
                return (
                  <div key={ev.id} className="exec-agenda-side-item" style={{ borderLeftColor: c.border, background: c.bg }}>
                    <div className="exec-agenda-side-item-head">
                      <strong style={{ color: c.text }}>{ev.title}</strong>
                      {canWrite && (
                        <div style={{ display: 'flex', gap: 2 }}>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => openEdit(ev)}><Edit2 size={12} /></button>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleDelete(ev.id)}><Trash2 size={12} /></button>
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: c.text, opacity: 0.9 }}>
                      <Clock size={10} /> {ev.heure_debut} — {ev.heure_fin}
                      {ev.location && <> · <MapPin size={10} /> {ev.location}</>}
                    </div>
                    <span className="badge badge-grey" style={{ fontSize: '0.62rem', marginTop: 4 }}>{EXEC_STATUS_LABELS[ev.status]}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── VUE SEMAINE ── */}
      {view === 'week' && (
        <div className="exec-agenda-week-cards">
          {weekDays.map((wd) => {
            const dk = toDateKey(wd);
            const dayEv = eventsForDay(records, dk);
            const isToday = dk === todayStr;
            return (
              <div key={dk} className={`card exec-agenda-week-day-card${isToday ? ' is-today' : ''}`}
                onDragOver={(e) => { if (canWrite) e.preventDefault(); }}
                onDrop={() => handleDropOnDay(dk)}
              >
                <div className="exec-agenda-week-day-head">
                  <div>{DAY_NAMES[(wd.getDay() + 6) % 7]}</div>
                  <strong>{wd.getDate()}/{wd.getMonth() + 1}</strong>
                </div>
                <div className="exec-agenda-week-day-body">
                  {dayEv.length === 0 ? (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', textAlign: 'center', padding: 8 }}>—</div>
                  ) : dayEv.map((ev) => (
                    <EventChip
                      key={ev.id}
                      ev={ev}
                      draggable={canWrite}
                      onDragStart={() => setDragEventId(ev.id)}
                      onClick={() => openEdit(ev)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── VUE JOUR ── */}
      {view === 'day' && (
        <div className="card exec-agenda-day-wrap">
          <div className="exec-agenda-day-timeline">
            {HOURS.map((h) => {
              const dk = toDateKey(cursor);
              const slotEv = eventsForDay(records, dk).filter((ev) => parseInt(ev.heure_debut.split(':')[0], 10) === h);
              return (
                <div key={h} className="exec-agenda-day-row">
                  <div className="exec-agenda-day-hour">{h}:00</div>
                  <div
                    className="exec-agenda-day-slot"
                    onDragOver={(e) => { if (canWrite) e.preventDefault(); }}
                    onDrop={() => handleDropOnDay(dk, h)}
                  >
                    {slotEv.map((ev) => (
                      <div key={ev.id} className="exec-agenda-day-event">
                        <EventChip
                          ev={ev}
                          draggable={canWrite}
                          onDragStart={() => setDragEventId(ev.id)}
                          onClick={() => openEdit(ev)}
                        />
                        {canWrite && (
                          <div className="exec-agenda-day-actions">
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => openEdit(ev)}><Edit2 size={12} /></button>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleDelete(ev.id)}><Trash2 size={12} /></button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── MODAL ── */}
      {showModal && (
        <div className="exec-agenda-modal-backdrop" onClick={(e) => e.target === e.currentTarget && setShowModal(false)}>
          <div className="exec-agenda-modal card">
            <div className="exec-agenda-modal-head">
              <strong>{editId ? 'Modifier l\'événement' : 'Nouvel événement'}</strong>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleSubmit} className="exec-agenda-form">
              <div className="exec-agenda-form-grid">
                <div style={{ gridColumn: '1 / -1' }}>
                  <label>Titre *</label>
                  <input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} style={INPUT_S(errors.title)} placeholder="Titre de l'événement" />
                  {errors.title && <span className="exec-agenda-err">{errors.title}</span>}
                </div>
                <div>
                  <label>Type d&apos;événement</label>
                  <select value={form.event_type} onChange={(e) => setForm((p) => ({ ...p, event_type: e.target.value }))} style={INPUT_S()}>
                    {EXEC_EVENT_TYPES.map((t) => <option key={t} value={t}>{EXEC_EVENT_TYPE_LABELS[t]}</option>)}
                  </select>
                </div>
                <div>
                  <label>Priorité</label>
                  <select value={form.priority} onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))} style={INPUT_S()}>
                    {EXEC_PRIORITIES.map((p) => <option key={p} value={p}>{EXEC_PRIORITY_LABELS[p]}</option>)}
                  </select>
                </div>
                <div>
                  <label>Date début *</label>
                  <input type="date" value={form.date_debut} onChange={(e) => setForm((p) => ({ ...p, date_debut: e.target.value }))} style={INPUT_S(errors.date_debut)} />
                </div>
                <div>
                  <label>Heure début *</label>
                  <input type="time" value={form.heure_debut} onChange={(e) => setForm((p) => ({ ...p, heure_debut: e.target.value }))} style={INPUT_S(errors.heure_debut)} />
                </div>
                <div>
                  <label>Date fin</label>
                  <input type="date" value={form.date_fin} onChange={(e) => setForm((p) => ({ ...p, date_fin: e.target.value }))} style={INPUT_S()} />
                </div>
                <div>
                  <label>Heure fin</label>
                  <input type="time" value={form.heure_fin} onChange={(e) => setForm((p) => ({ ...p, heure_fin: e.target.value }))} style={INPUT_S()} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label>Lieu</label>
                  <input value={form.location} onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))} style={INPUT_S()} placeholder="Adresse, salle, chantier…" />
                </div>
                <div>
                  <label>Statut</label>
                  <select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))} style={INPUT_S()}>
                    {EXEC_STATUSES.map((s) => <option key={s} value={s}>{EXEC_STATUS_LABELS[s]}</option>)}
                  </select>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label>Description</label>
                  <textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} style={{ ...INPUT_S(), minHeight: 72, resize: 'vertical' }} />
                </div>
              </div>
              <div className="exec-agenda-form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{editId ? 'Enregistrer' : 'Ajouter'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

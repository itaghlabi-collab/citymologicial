/**
 * executiveCalendar.js — Agenda de Direction (Supabase executive_calendar)
 */
import { getSupabase } from '../../lib/supabase';
import { requireSupabaseUserId } from '../supabase/requireUser';

const TABLE = 'executive_calendar';
const NOTIF_TABLE = 'executive_calendar_notifications';

export const EXEC_EVENT_TYPES = [
  'rdv_client', 'reunion_interne', 'reunion_chantier', 'deplacement', 'visite_chantier',
  'reunion_fournisseur', 'reunion_partenaire', 'appel_important', 'personnel', 'bloque', 'autre',
];

export const EXEC_EVENT_TYPE_LABELS = {
  rdv_client: 'Rendez-vous client',
  reunion_interne: 'Réunion interne',
  reunion_chantier: 'Réunion chantier',
  deplacement: 'Déplacement',
  visite_chantier: 'Visite chantier',
  reunion_fournisseur: 'Réunion fournisseur',
  reunion_partenaire: 'Réunion partenaire',
  appel_important: 'Appel important',
  personnel: 'Personnel',
  bloque: 'Bloqué',
  autre: 'Autre',
};

export const EXEC_STATUSES = ['prevu', 'confirme', 'reporte', 'annule', 'realise'];

export const EXEC_STATUS_LABELS = {
  prevu: 'Prévu',
  confirme: 'Confirmé',
  reporte: 'Reporté',
  annule: 'Annulé',
  realise: 'Réalisé',
};

export const EXEC_PRIORITIES = ['haute', 'normale', 'faible'];

export const EXEC_PRIORITY_LABELS = {
  haute: 'Haute',
  normale: 'Normale',
  faible: 'Faible',
};

export const EXEC_TYPE_COLORS = {
  rdv_client: { bg: '#FFF8E1', border: '#F57F17', text: '#E65100' },
  reunion_interne: { bg: '#EBF3FF', border: '#1565C0', text: '#0D47A1' },
  reunion_chantier: { bg: '#FFF3E0', border: '#EF6C00', text: '#E65100' },
  deplacement: { bg: '#E8F5E9', border: '#2E7D32', text: '#1B5E20' },
  visite_chantier: { bg: '#FFF0F0', border: '#D32F2F', text: '#B71C1C' },
  reunion_fournisseur: { bg: '#F3E5F5', border: '#6A1B9A', text: '#4A148C' },
  reunion_partenaire: { bg: '#E0F7FA', border: '#00838F', text: '#006064' },
  appel_important: { bg: '#FFEBEE', border: '#C62828', text: '#B71C1C' },
  personnel: { bg: '#FCE4EC', border: '#AD1457', text: '#880E4F' },
  bloque: { bg: '#ECEFF1', border: '#546E7A', text: '#37474F' },
  autre: { bg: '#F5F5F5', border: '#9E9E9E', text: '#616161' },
};

const MONTH_NAMES = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

export function pad2(n) { return String(n).padStart(2, '0'); }

export function toDateKey(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function parseLocalDateTime(dateStr, timeStr) {
  const [y, m, d] = (dateStr || '').split('-').map(Number);
  const [hh, mm] = (timeStr || '09:00').split(':').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0);
}

export function fmtTimeFromDate(d) {
  if (!d || Number.isNaN(d.getTime())) return '09:00';
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function fmtDisplayDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${fmtTimeFromDate(d)}`;
}

export function startOfWeekMonday(d) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function getDaysInMonth(year, month) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = (firstDay.getDay() + 6) % 7;
  const days = [];
  for (let i = 0; i < startDow; i++) days.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) days.push(d);
  return days;
}

export function eventDurationMs(ev) {
  const s = new Date(ev.start_datetime);
  const e = new Date(ev.end_datetime);
  const diff = e - s;
  return diff > 0 ? diff : 60 * 60 * 1000;
}

export function normalizeExecutiveEvent(row) {
  if (!row) return null;
  const start = new Date(row.start_datetime);
  const end = new Date(row.end_datetime);
  return {
    id: row.id,
    title: row.title || '',
    description: row.description || '',
    start_datetime: row.start_datetime,
    end_datetime: row.end_datetime,
    date: toDateKey(start),
    heure_debut: fmtTimeFromDate(start),
    heure_fin: fmtTimeFromDate(end),
    date_fin: toDateKey(end),
    location: row.location || '',
    event_type: row.event_type || 'autre',
    status: row.status || 'prevu',
    priority: row.priority || 'normale',
    prospect_id: row.prospect_id || null,
    client_id: row.client_id || null,
    project_id: row.project_id || null,
    chantier_id: row.chantier_id || null,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function toExecutiveEventRow(form) {
  const start = parseLocalDateTime(form.date_debut || form.date, form.heure_debut || form.heure);
  let end = parseLocalDateTime(form.date_fin || form.date_debut || form.date, form.heure_fin || form.heure_fin);
  if (end <= start) {
    end = new Date(start.getTime() + 60 * 60 * 1000);
  }
  return {
    title: (form.title || form.titre || '').trim(),
    description: (form.description || '').trim() || null,
    start_datetime: start.toISOString(),
    end_datetime: end.toISOString(),
    location: (form.location || form.lieu || '').trim() || null,
    event_type: form.event_type || 'autre',
    status: form.status || 'prevu',
    priority: form.priority || 'normale',
    prospect_id: form.prospect_id || null,
    client_id: form.client_id || null,
    project_id: form.project_id || null,
    chantier_id: form.chantier_id || null,
  };
}

export async function listExecutiveEvents() {
  await requireSupabaseUserId();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .order('start_datetime', { ascending: true });
  if (error) throw error;
  return (data || []).map(normalizeExecutiveEvent).filter(Boolean);
}

export async function createExecutiveEvent(form) {
  const uid = await requireSupabaseUserId();
  const row = toExecutiveEventRow(form);
  if (!row.title) {
    const err = new Error('Titre requis.');
    err.code = 'VALIDATION';
    throw err;
  }
  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([{ ...row, created_by: uid }])
    .select('*')
    .single();
  if (error) throw error;
  const ev = normalizeExecutiveEvent(data);
  await syncEventNotifications(ev);
  return ev;
}

export async function updateExecutiveEvent(id, form) {
  await requireSupabaseUserId();
  const row = toExecutiveEventRow(form);
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(row)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  const ev = normalizeExecutiveEvent(data);
  await syncEventNotifications(ev);
  return ev;
}

export async function rescheduleExecutiveEvent(id, newStartIso, durationMs) {
  await requireSupabaseUserId();
  const start = new Date(newStartIso);
  const end = new Date(start.getTime() + (durationMs || 3600000));
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update({
      start_datetime: start.toISOString(),
      end_datetime: end.toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  const ev = normalizeExecutiveEvent(data);
  await syncEventNotifications(ev);
  return ev;
}

export async function deleteExecutiveEvent(id) {
  await requireSupabaseUserId();
  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) throw error;
}

export function filterEventsForRange(events, rangeStart, rangeEnd) {
  const rs = rangeStart.getTime();
  const re = rangeEnd.getTime();
  return (events || []).filter((ev) => {
    if (ev.status === 'annule') return false;
    const s = new Date(ev.start_datetime).getTime();
    const e = new Date(ev.end_datetime).getTime();
    return s <= re && e >= rs;
  });
}

export function eventsForDay(events, dateKey) {
  return (events || []).filter((ev) => {
    if (ev.status === 'annule') return false;
    const s = new Date(ev.start_datetime);
    const e = new Date(ev.end_datetime);
    const dayStart = parseLocalDateTime(dateKey, '00:00');
    const dayEnd = parseLocalDateTime(dateKey, '23:59');
    dayEnd.setSeconds(59, 999);
    return s <= dayEnd && e >= dayStart;
  }).sort((a, b) => a.start_datetime.localeCompare(b.start_datetime));
}

export function computeExecutiveKpis(events, refDate = new Date()) {
  const todayKey = toDateKey(refDate);
  const weekStart = startOfWeekMonday(refDate);
  const weekEnd = addDays(weekStart, 7);
  weekEnd.setMilliseconds(-1);
  const monthStart = new Date(refDate.getFullYear(), refDate.getMonth(), 1);
  const monthEnd = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0, 23, 59, 59, 999);

  const active = (events || []).filter((e) => e.status !== 'annule');

  const today = active.filter((e) => eventsForDay([e], todayKey).length > 0);
  const week = filterEventsForRange(active, weekStart, weekEnd);
  const month = filterEventsForRange(active, monthStart, monthEnd);

  return {
    today: today.length,
    week: week.length,
    month: month.length,
    rdvClients: month.filter((e) => e.event_type === 'rdv_client').length,
    visitesChantier: month.filter((e) => e.event_type === 'visite_chantier').length,
    deplacements: month.filter((e) => e.event_type === 'deplacement').length,
  };
}

async function syncEventNotifications(ev) {
  if (!ev?.id || !ev.start_datetime) return;
  const uid = await requireSupabaseUserId();
  const start = new Date(ev.start_datetime);
  const rows = [
    { event_id: ev.id, user_id: uid, notification_type: '24h', notify_at: new Date(start.getTime() - 24 * 3600000).toISOString() },
    { event_id: ev.id, user_id: uid, notification_type: '1h', notify_at: new Date(start.getTime() - 3600000).toISOString() },
  ];
  await getSupabase()
    .from(NOTIF_TABLE)
    .upsert(rows, { onConflict: 'event_id,user_id,notification_type' });
}

export async function fetchPendingExecutiveNotifications() {
  const uid = await requireSupabaseUserId();
  const now = new Date().toISOString();
  const { data, error } = await getSupabase()
    .from(NOTIF_TABLE)
    .select('*, executive_calendar(title, start_datetime, location, event_type)')
    .eq('user_id', uid)
    .is('read_at', null)
    .lte('notify_at', now)
    .order('notify_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function markExecutiveNotificationRead(id) {
  await requireSupabaseUserId();
  const { error } = await getSupabase()
    .from(NOTIF_TABLE)
    .update({ read_at: new Date().toISOString(), sent_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export function computeClientSideAlerts(events) {
  const now = Date.now();
  const alerts = [];
  (events || []).forEach((ev) => {
    if (ev.status === 'annule' || ev.status === 'realise') return;
    const start = new Date(ev.start_datetime).getTime();
    const diff = start - now;
    if (diff <= 0) return;
    const h24 = 24 * 3600000;
    const h1 = 3600000;
    if (diff <= h24 && diff > h24 - 15 * 60000) {
      alerts.push({ id: `${ev.id}-24h`, event: ev, type: '24h', label: 'Dans 24 h' });
    }
    if (diff <= h1 && diff > h1 - 15 * 60000) {
      alerts.push({ id: `${ev.id}-1h`, event: ev, type: '1h', label: 'Dans 1 h' });
    }
  });
  return alerts;
}

function csvEscape(v) {
  const s = String(v ?? '');
  return s.includes(';') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}

export function exportExecutiveCalendarCsv(events) {
  const headers = ['Titre', 'Type', 'Début', 'Fin', 'Lieu', 'Statut', 'Priorité', 'Description'];
  const rows = (events || []).map((e) => [
    e.title,
    EXEC_EVENT_TYPE_LABELS[e.event_type] || e.event_type,
    fmtDisplayDateTime(e.start_datetime),
    fmtDisplayDateTime(e.end_datetime),
    e.location,
    EXEC_STATUS_LABELS[e.status] || e.status,
    EXEC_PRIORITY_LABELS[e.priority] || e.priority,
    e.description,
  ]);
  const csv = '\uFEFF' + [headers, ...rows].map((r) => r.map(csvEscape).join(';')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `agenda-direction-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportExecutiveCalendarExcel(events) {
  exportExecutiveCalendarCsv(events);
}

export function exportExecutiveCalendarPdf(events, periodLabel) {
  import('jspdf').then(({ jsPDF }) => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
    doc.setFontSize(14);
    doc.text('CITYMO — Agenda de Direction', 14, 14);
    doc.setFontSize(9);
    doc.text(`${periodLabel || 'Export'} — ${new Date().toLocaleDateString('fr-FR')}`, 14, 20);
    let y = 28;
    doc.setFont(undefined, 'bold');
    doc.text('Date début | Titre | Type | Lieu | Statut', 14, y);
    doc.setFont(undefined, 'normal');
    y += 6;
    (events || []).forEach((e) => {
      if (y > 190) { doc.addPage(); y = 14; }
      const line = [
        fmtDisplayDateTime(e.start_datetime),
        (e.title || '').slice(0, 32),
        (EXEC_EVENT_TYPE_LABELS[e.event_type] || '').slice(0, 18),
        (e.location || '').slice(0, 18),
        EXEC_STATUS_LABELS[e.status] || e.status,
      ].join(' | ');
      doc.text(line, 14, y);
      y += 5;
    });
    doc.save(`agenda-direction-${new Date().toISOString().slice(0, 10)}.pdf`);
  });
}

export function printExecutiveCalendar(events, periodLabel) {
  const w = window.open('', '_blank');
  if (!w) return;
  const rows = (events || []).map((e) => `
    <tr>
      <td>${fmtDisplayDateTime(e.start_datetime)}</td>
      <td>${fmtDisplayDateTime(e.end_datetime)}</td>
      <td><strong>${e.title}</strong></td>
      <td>${EXEC_EVENT_TYPE_LABELS[e.event_type] || e.event_type}</td>
      <td>${e.location || '—'}</td>
      <td>${EXEC_STATUS_LABELS[e.status] || e.status}</td>
      <td>${EXEC_PRIORITY_LABELS[e.priority] || e.priority}</td>
    </tr>`).join('');
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Agenda de Direction</title>
    <style>
      body{font-family:Arial,sans-serif;padding:24px;color:#222}
      h1{font-size:18px;margin:0 0 4px} .sub{color:#666;font-size:12px;margin-bottom:16px}
      table{width:100%;border-collapse:collapse;font-size:11px}
      th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}
      th{background:#f5f5f5}
    </style></head><body>
    <h1>CITYMO — Agenda de Direction</h1>
    <div class="sub">${periodLabel || ''} — Impression ${new Date().toLocaleDateString('fr-FR')}</div>
    <table><thead><tr><th>Début</th><th>Fin</th><th>Titre</th><th>Type</th><th>Lieu</th><th>Statut</th><th>Priorité</th></tr></thead><tbody>${rows}</tbody></table>
    </body></html>`);
  w.document.close();
  w.focus();
  w.print();
}

export { MONTH_NAMES };

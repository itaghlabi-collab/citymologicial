/**
 * internalDashboard.js — Agrégation données tableau de bord organisation interne
 */
import { isSupabaseConfigured } from '../../lib/supabase';
import { listInternalTasks, toDashboardTask, computeInternalTaskStats } from './internalTasks';
import { listInternalAppointments, toDashboardMeeting } from './internalAppointments';
import { listProspects, prospectDisplayName } from '../commercial/prospects';
import { listCrmDevis } from '../crm/crmDevis';
import { listCrmFactures } from '../crm/crmFactures';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function recentActivities(tasks, appts, limit = 8) {
  const items = [
    ...(tasks || []).map((t) => ({
      at: t.updated_at || t.created_at,
      kind: 'task',
      label: `Tache : ${t.titre}`,
      sub: t.assigne || '',
      statut: t.statut,
    })),
    ...(appts || []).map((a) => ({
      at: a.updated_at || a.created_at,
      kind: 'rdv',
      label: `RDV : ${a.titre}`,
      sub: `${a.date} ${a.heure}`,
      statut: a.statut,
    })),
  ];
  return items
    .filter((i) => i.at)
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, limit);
}

function mapProspectForDashboard(p) {
  const name = prospectDisplayName(p) || p.nom || 'Prospect';
  return {
    id: p.id,
    name,
    value: Number(p.budget || 0),
    status: p.statut === 'en_cours' ? 'Chaud' : p.statut,
    created_at: p.created_at,
  };
}

function mapDevisForDashboard(d) {
  return {
    id: d.id,
    ref: d.reference,
    client: d.client_nom || '',
    amount: Number(d.total_ttc || 0),
    status: d.statut,
    date: d.date_emission || d.created_at,
  };
}

function mapFactureForDashboard(f) {
  const statusMap = {
    payee: 'paid',
    impayee: 'unpaid',
    en_retard: 'overdue',
    partiellement_payee: 'unpaid',
    envoyee: 'unpaid',
    brouillon: 'pending',
  };
  return {
    id: f.id,
    ref: f.numero,
    client: f.client_nom || '',
    amount: Number(f.total_ttc || 0),
    status: statusMap[f.statut] || 'pending',
    date: f.date_emission || f.created_at,
  };
}

export async function loadInternalDashboardData() {
  if (!isSupabaseConfigured()) {
    return {
      configured: false,
      tasks: [],
      taskStats: { total: 0, a_faire: 0, en_cours: 0, terminee: 0, overdue: 0 },
      todayTasks: [],
      pendingTasks: [],
      meetings: [],
      todayMeetings: [],
      prospects: [],
      hotProspects: [],
      recentDevis: [],
      recentFactures: [],
      activities: [],
      alerts: [],
      kpis: { overdueMeetings: 0, todayMeetings: 0 },
    };
  }

  const today = todayStr();
  const results = await Promise.allSettled([
    listInternalTasks(),
    listInternalAppointments(),
    listProspects(),
    listCrmDevis(),
    listCrmFactures(),
  ]);

  const val = (i) => (results[i].status === 'fulfilled' ? results[i].value : []);
  const tasks = val(0);
  const appts = val(1);
  const prospectsRaw = val(2);
  const devisRaw = val(3);
  const facturesRaw = val(4);

  const taskStats = computeInternalTaskStats(tasks);
  const pendingTasks = tasks.filter((t) => t.statut === 'a_faire' || t.statut === 'en_cours');
  const todayTasks = tasks
    .filter((t) => t.dateLimite === today && t.statut !== 'terminee')
    .map(toDashboardTask);
  const dashboardTasks = pendingTasks.slice(0, 8).map(toDashboardTask);

  const todayMeetings = appts
    .filter((a) => a.date === today && a.statut === 'planifie')
    .map((a) => toDashboardMeeting(a, today))
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));

  const overdueMeetings = appts
    .filter((a) => a.date && a.date < today && a.statut === 'planifie')
    .sort((a, b) => b.date.localeCompare(a.date) || (a.time || '').localeCompare(b.time || ''))
    .slice(0, 8)
    .map((a) => toDashboardMeeting(a, today));

  const dashboardMeetings = [...overdueMeetings, ...todayMeetings];

  const prospects = prospectsRaw
    .slice()
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 10)
    .map(mapProspectForDashboard);

  const hotProspects = prospects.filter((p) => p.status === 'Chaud' || p.value > 0).slice(0, 5);

  const recentDevis = devisRaw
    .slice()
    .sort((a, b) => new Date(b.created_at || b.date_emission) - new Date(a.created_at || a.date_emission))
    .slice(0, 5)
    .map(mapDevisForDashboard);

  const recentFactures = facturesRaw
    .slice()
    .sort((a, b) => new Date(b.created_at || b.date_emission) - new Date(a.created_at || a.date_emission))
    .slice(0, 5)
    .map(mapFactureForDashboard);

  const activities = recentActivities(tasks, appts);

  const alerts = [
    ...tasks
      .filter((t) => t.statut !== 'terminee' && t.dateLimite && t.dateLimite < today)
      .map((t) => ({ type: 'error', msg: `Tache en retard : ${t.titre} (${t.dateLimite})` })),
    ...tasks
      .filter((t) => t.statut !== 'terminee' && (t.priorite === 'haute' || t.priorite === 'urgente'))
      .slice(0, 3)
      .map((t) => ({ type: 'warning', msg: `Tache prioritaire : ${t.titre}` })),
    ...appts
      .filter((a) => a.date === today && a.statut === 'planifie')
      .map((a) => ({ type: 'info', msg: `RDV aujourd'hui : ${a.heure} — ${a.titre}` })),
    ...recentFactures
      .filter((f) => f.status === 'overdue')
      .map((f) => ({ type: 'error', msg: `Facture en retard : ${f.ref} — ${f.client}` })),
  ];

  const pendingQuotes = devisRaw.filter((d) =>
    ['brouillon', 'envoye', 'en_attente'].includes(d.statut),
  ).length;
  const conversionRate = devisRaw.length
    ? Math.round(devisRaw.filter((d) => d.statut === 'valide').length / devisRaw.length * 100)
    : 0;

  return {
    configured: true,
    tasks: dashboardTasks,
    taskStats,
    todayTasks,
    pendingTasks,
    meetings: dashboardMeetings,
    todayMeetings,
    prospects,
    hotProspects,
    recentDevis,
    recentFactures,
    activities,
    alerts,
    kpis: {
      pendingTasks: pendingTasks.length,
      todayMeetings: todayMeetings.length,
      overdueMeetings: overdueMeetings.length,
      prospectsCount: prospectsRaw.length,
      pendingQuotes,
      conversionRate,
      overdueTasks: taskStats.overdue,
    },
  };
}

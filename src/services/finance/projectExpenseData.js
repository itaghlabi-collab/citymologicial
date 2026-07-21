/**
 * projectExpenseData.js — Agrégations dashboard / liste projets
 */
import { getSupabase } from '../../lib/supabase';
import { expenseMatchesProject } from './projectExpenseMerge';
import { isCountedProjectExpense } from './projectExpenseRules';

const PAID_OP = ['Payé'];

export function buildProjectExpenseDashboard(expenses, projects, orders = [], acquisitionOrders = []) {
  const now = new Date();
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const active = (expenses || []).filter(isCountedProjectExpense);
  const totalDepenses = active.reduce((s, e) => s + e.montant, 0);
  const depensesMois = active
    .filter((e) => e.date_depense?.startsWith(monthPrefix))
    .reduce((s, e) => s + e.montant, 0);

  // Même source de noms que l'onglet Projets (projects.nom via buildProjectSummaries).
  const summaries = buildProjectSummaries(projects, expenses, orders, acquisitionOrders);
  const withSpend = summaries.filter((p) => Number(p.total_depenses) > 0);
  const top = withSpend[0] || null;

  const totalBudget = (projects || []).reduce((s, p) => s + (Number(p.budget_approuve) || 0), 0);
  const budgetConsomme = totalDepenses;
  const budgetRestant = Math.max(0, totalBudget - budgetConsomme);

  const byFournisseur = {};
  const byCategorie = {};
  active.forEach((e) => {
    const f = e.fournisseur || 'Non renseigné';
    byFournisseur[f] = (byFournisseur[f] || 0) + e.montant;
    const c = e.categorie || e.element_depense || 'Autre';
    byCategorie[c] = (byCategorie[c] || 0) + e.montant;
  });

  const projectChart = withSpend
    .slice(0, 12)
    .map((p) => ({ label: p.nom, value: p.total_depenses }));

  const fournisseurChart = Object.entries(byFournisseur)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  const categorieChart = Object.entries(byCategorie)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  return {
    projectCount: (projects || []).length,
    totalDepenses,
    depensesMois,
    topProject: top?.nom || null,
    topProjectAmount: top ? Number(top.total_depenses) || 0 : 0,
    budgetConsomme,
    budgetRestant,
    totalBudget,
    projectChart,
    fournisseurChart,
    categorieChart,
  };
}

export function buildProjectSummaries(projects, expenses, orders = [], acquisitionOrders = []) {
  const expByProject = {};
  const active = (expenses || []).filter(isCountedProjectExpense);
  (projects || []).forEach((p) => {
    const key = String(p.id);
    active.forEach((e) => {
      if (!expenseMatchesProject(e, p)) return;
      if (!expByProject[key]) {
        expByProject[key] = { total: 0, count: 0, fournisseurs: new Set() };
      }
      expByProject[key].total += e.montant;
      expByProject[key].count++;
      if (e.fournisseur) expByProject[key].fournisseurs.add(e.fournisseur);
    });
  });

  const commandeByProject = {};
  (acquisitionOrders || []).forEach((o) => {
    if (!o.project_id) return;
    commandeByProject[o.project_id] = (commandeByProject[o.project_id] || 0) + (Number(o.montant_ttc) || 0);
  });

  const payeByProject = {};
  (orders || []).forEach((o) => {
    if (!o.project_id || !PAID_OP.includes(o.statut)) return;
    payeByProject[o.project_id] = (payeByProject[o.project_id] || 0) + (Number(o.montant_ttc ?? o.montant) || 0);
  });

  return (projects || []).map((p) => {
    const exp = expByProject[String(p.id)] || { total: 0, count: 0, fournisseurs: new Set() };
    const budget = Number(p.budget_approuve) || 0;
    return {
      ...p,
      chef_projet: p.responsable || p.chef_projet || '—',
      total_depenses: exp.total,
      montant_commande: commandeByProject[p.id] || 0,
      montant_paye: payeByProject[p.id] || 0,
      reste_budget: budget > 0 ? budget - exp.total : null,
      nb_depenses: exp.count,
      nb_fournisseurs: exp.fournisseurs.size,
      needs_manual: false,
    };
  }).sort((a, b) => b.total_depenses - a.total_depenses);
}

export async function fetchErpContextForProjects() {
  const sb = getSupabase();
  // payment_orders : colonne = montant (pas montant_ttc) — select invalide → 400 PostgREST
  const [ordersRes, oaRes] = await Promise.all([
    sb.from('payment_orders').select('id, project_id, montant, statut').not('project_id', 'is', null),
    sb.from('purchase_acquisition_orders').select('id, project_id, montant_ttc, statut').not('project_id', 'is', null),
  ]);
  if (ordersRes.error) console.warn('[CITYMO] fetchErpContext payment_orders', ordersRes.error);
  if (oaRes.error) console.warn('[CITYMO] fetchErpContext purchase_acquisition_orders', oaRes.error);
  return {
    orders: (ordersRes.data || []).map((o) => ({
      ...o,
      montant_ttc: o.montant_ttc ?? o.montant,
    })),
    acquisitionOrders: oaRes.data || [],
  };
}

export function getProjectDetailData(project, expenses, orders, acquisitionOrders) {
  const projectExpenses = (expenses || []).filter((e) => expenseMatchesProject(e, project));
  const projectOrders = (orders || []).filter((o) => o.project_id === project.id);
  const projectOa = (acquisitionOrders || []).filter((o) => o.project_id === project.id);

  const fournisseurs = [...new Set(projectExpenses.map((e) => e.fournisseur).filter(Boolean))];
  const total = projectExpenses.filter(isCountedProjectExpense).reduce((s, e) => s + e.montant, 0);
  const budget = Number(project.budget_approuve) || 0;

  const byCategorie = {};
  projectExpenses.forEach((e) => {
    const c = e.categorie || 'Autre';
    byCategorie[c] = (byCategorie[c] || 0) + e.montant;
  });

  return {
    expenses: projectExpenses,
    orders: projectOrders,
    acquisitionOrders: projectOa,
    fournisseurs,
    total,
    budget,
    reste: budget > 0 ? budget - total : null,
    categorieChart: Object.entries(byCategorie).map(([label, value]) => ({ label, value })),
  };
}

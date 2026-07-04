/**
 * projectExpenseSync.js — Alimentation automatique depuis modules ERP existants
 * N'altère pas les workflows Achats / Finance / Projets
 */
import { getSupabase } from '../../lib/supabase';
import {
  upsertProjectExpenseFromSource,
  upsertPurchaseProjectExpense,
  dedupePurchaseProjectExpenses,
} from './projectExpenses';
import { listProjects } from '../projects/projects';

const PAID_STATUTS = ['Payé', 'Validé', 'Comptabilisée', 'Exécuté'];
const SKIP_STATUTS = ['Annulé', 'Refusé', 'Refusée', 'Brouillon'];

function isActiveStatut(statut) {
  return statut && !SKIP_STATUTS.includes(statut);
}

function isPaidStatut(statut) {
  return PAID_STATUTS.includes(statut);
}

export async function syncProjectExpensesFromErp() {
  const projects = await listProjects();
  const projectById = Object.fromEntries(projects.map((p) => [p.id, p]));
  const projectByName = {};
  projects.forEach((p) => {
    projectByName[normalizeName(p.nom)] = p;
  });

  const stats = { created: 0, updated: 0, skipped: 0, errors: 0, deduped: 0 };

  const resolveProject = (row) => {
    if (row.project_id && projectById[row.project_id]) return projectById[row.project_id];
    const name = row.project_name || row.projet_lie || '';
    if (name) return projectByName[normalizeName(name)] || null;
    return null;
  };

  try {
    const dedupe = await dedupePurchaseProjectExpenses();
    stats.deduped = dedupe.deleted;
  } catch {
    stats.errors++;
  }

  await syncCharges(stats, resolveProject);
  await syncPaymentOrders(stats, resolveProject);
  await syncAcquisitionOrders(stats, resolveProject);
  await syncPurchaseRequests(stats, resolveProject);

  return stats;
}

function normalizeName(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function syncCharges(stats, resolveProject) {
  const { data, error } = await getSupabase().from('finance_charges').select('*');
  if (error) throw error;

  for (const c of (data || []).filter((row) => row.project_id || String(row.projet_lie || '').trim())) {
    if (!isActiveStatut(c.statut)) { stats.skipped++; continue; }
    const project = c.project_id ? { id: c.project_id } : resolveProject(c);
    if (!project?.id) { stats.skipped++; continue; }
    try {
      const result = await upsertProjectExpenseFromSource({
        project_id: project.id,
        date_depense: c.date_charge,
        categorie: c.categorie,
        element_depense: c.libelle || c.categorie || 'Charge',
        description: c.commentaire,
        fournisseur: c.fournisseur,
        montant: c.montant,
        observation: c.ref_charge ? `Réf. ${c.ref_charge}` : null,
        origine: 'charge_manuelle',
        source_type: 'finance_charge',
        source_id: c.id,
        statut: isPaidStatut(c.statut) ? 'valide' : 'en_attente',
        mode_paiement: c.mode_paiement,
      });
      stats[result.action]++;
    } catch {
      stats.errors++;
    }
  }
}

async function syncPaymentOrders(stats, resolveProject) {
  const { data, error } = await getSupabase()
    .from('payment_orders')
    .select('*')
    .not('project_id', 'is', null);
  if (error) throw error;

  for (const o of data || []) {
    if (!isActiveStatut(o.statut)) { stats.skipped++; continue; }
    if (o.purchase_request_id) {
      stats.skipped++;
      continue;
    }
    try {
      const montant = Number(o.montant_ttc ?? o.montant) || 0;
      const result = await upsertProjectExpenseFromSource({
        project_id: o.project_id,
        date_depense: o.date_paiement || o.date_ordre,
        categorie: 'Ordre de paiement',
        element_depense: o.motif || o.ref_ordre || 'Ordre de paiement',
        description: o.commentaire || o.observation,
        fournisseur: o.fournisseur_lie || o.beneficiaire,
        montant,
        origine: 'ordre_paiement',
        source_type: 'payment_order',
        source_id: o.id,
        statut: isPaidStatut(o.statut) ? 'valide' : 'en_attente',
        payment_order_id: o.id,
        mode_paiement: o.mode_paiement,
      });
      stats[result.action]++;
    } catch {
      stats.errors++;
    }
  }
}

async function syncAcquisitionOrders(stats, resolveProject) {
  const { data, error } = await getSupabase()
    .from('purchase_acquisition_orders')
    .select('*')
    .not('project_id', 'is', null);
  if (error) throw error;

  for (const o of data || []) {
    if (!isActiveStatut(o.statut)) { stats.skipped++; continue; }
    if (!o.purchase_request_id) { stats.skipped++; continue; }
    try {
      const { data: request } = await getSupabase()
        .from('purchase_requests')
        .select('ref_demande, titre, statut')
        .eq('id', o.purchase_request_id)
        .maybeSingle();
      const result = await upsertPurchaseProjectExpense({
        project_id: o.project_id,
        purchase_request_id: o.purchase_request_id,
        purchase_acquisition_order_id: o.id,
        payment_order_id: o.payment_order_id,
        date_depense: String(o.created_at || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
        categorie: 'Bon de commande',
        element_depense: null,
        purchase_ref: request?.ref_demande || o.ref_oa,
        purchase_titre: request?.titre || o.objet,
        description: o.conditions_paiement,
        fournisseur: o.supplier_name,
        montant: Number(o.montant_ttc) || 0,
        purchase_statut: request?.statut,
        op_statut: o.payment_order_id ? 'Préparé' : null,
        mode_paiement: o.mode_paiement,
      });
      stats[result.action]++;
    } catch {
      stats.errors++;
    }
  }
}

async function syncPurchaseRequests(stats, resolveProject) {
  const { data, error } = await getSupabase()
    .from('purchase_requests')
    .select('*, purchase_request_quotes ( id, montant_ttc, supplier_name, statut )')
    .not('project_id', 'is', null);
  if (error) throw error;

  for (const r of data || []) {
    if (!isActiveStatut(r.statut)) { stats.skipped++; continue; }
    const quotes = r.purchase_request_quotes || [];
    const selected = quotes.find((q) => q.id === r.selected_quote_id) || quotes[0];
    const montant = Number(selected?.montant_ttc) || 0;
    if (!montant) { stats.skipped++; continue; }
    try {
      const result = await upsertPurchaseProjectExpense({
        project_id: r.project_id,
        purchase_request_id: r.id,
        purchase_acquisition_order_id: r.acquisition_order_id,
        payment_order_id: r.payment_order_id,
        date_depense: r.date_debut || String(r.created_at || '').slice(0, 10),
        categorie: "Demande d'achat",
        purchase_ref: r.ref_demande,
        purchase_titre: r.titre,
        description: r.description,
        fournisseur: selected?.supplier_name,
        montant,
        purchase_statut: r.statut,
        mode_paiement: null,
      });
      stats[result.action]++;
    } catch {
      stats.errors++;
    }
  }
}

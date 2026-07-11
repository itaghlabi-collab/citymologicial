/**
 * projectExpenseMerge.js — Fusion dépenses générales (finance_charges) + project_expenses
 */
import { getSupabase } from '../../lib/supabase';
import { ORIGINE_LABELS } from './projectExpenses';
import {
  isChargeEligibleForBackfill,
  isChargePaidForProject,
  isCountedProjectExpense,
} from './projectExpenseRules';

const SKIP_CHARGE_STATUTS = ['Annulé', 'Refusé', 'Refusée', 'Brouillon'];

function normalizeName(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildProjectIndexes(projects) {
  const projectById = Object.fromEntries((projects || []).map((p) => [String(p.id), p]));
  const projectByName = {};
  const projectByRef = {};
  (projects || []).forEach((p) => {
    projectByName[normalizeName(p.nom)] = p;
    if (p.ref) projectByRef[p.ref] = p;
  });
  return { projectById, projectByName, projectByRef };
}

export function resolveChargeProject(charge, indexes) {
  const { projectById, projectByName, projectByRef } = indexes;
  const label = String(charge.projet_lie || charge.project_name || '').trim();
  const refPart = label.split(' — ')[0]?.trim();
  // Référence explicite (ex. PRJ-202607-0001) prioritaire — évite les doublons de nom.
  if (refPart && projectByRef[refPart]) return projectByRef[refPart];
  if (charge.project_id) {
    const id = String(charge.project_id);
    return projectById[id] || { id };
  }
  if (!label) return null;
  const nomPart = label.split(' — ')[1]?.trim() || label;
  return projectByName[normalizeName(nomPart)] || projectByName[normalizeName(label)] || null;
}

/** Une ligne project_expenses (ou fusionnée) correspond-elle à ce projet ? */
export function expenseMatchesProject(expense, project) {
  if (!expense || !project) return false;
  if (expense.project_id && String(expense.project_id) === String(project.id)) return true;
  const label = String(expense.project_name_raw || expense.project_nom || '').trim();
  if (!label) return false;
  const refPart = label.split(' — ')[0]?.trim();
  if (project.ref && refPart === project.ref) return true;
  if (project.nom) {
    const nomNorm = normalizeName(project.nom);
    if (nomNorm && normalizeName(label).includes(nomNorm)) return true;
  }
  return false;
}

/** Une charge correspond-elle à ce projet (id, ref ou nom) ? */
export function chargeMatchesProject(charge, project) {
  if (!charge || !project) return false;
  if (charge.project_id && String(charge.project_id) === String(project.id)) return true;
  const label = String(charge.projet_lie || '').trim();
  if (!label) return false;
  const refPart = label.split(' — ')[0]?.trim();
  if (project.ref && refPart === project.ref) return true;
  if (project.nom) {
    const nomNorm = normalizeName(project.nom);
    if (nomNorm && normalizeName(label).includes(nomNorm)) return true;
  }
  return false;
}

function chargeExpenseStatut(statut) {
  if (SKIP_CHARGE_STATUTS.includes(statut)) return 'annule';
  if (isChargePaidForProject({ statut }) || isChargeEligibleForBackfill({ statut })) {
    return 'payee';
  }
  return 'en_attente';
}

export function chargeToProjectExpenseRow(charge, projectId, projects) {
  const project = (projects || []).find((p) => String(p.id) === String(projectId));
  const ref = charge.ref_charge || charge.ref || '';
  return {
    id: `charge:${charge.id}`,
    project_id: String(projectId),
    project_name_raw: charge.projet_lie || project?.nom || '',
    project_match_status: 'matched',
    project_nom: project?.nom || '',
    date_depense: charge.date_charge || charge.date || '',
    categorie: charge.categorie || '',
    element_depense: charge.libelle || charge.categorie || 'Charge',
    description: charge.commentaire || '',
    fournisseur: charge.fournisseur || '',
    montant: Number(charge.montant) || 0,
    observation: ref ? `Réf. ${ref}` : '',
    origine: 'charge_manuelle',
    origine_label: ORIGINE_LABELS.charge_manuelle,
    source_type: 'finance_charge',
    source_id: String(charge.id),
    statut: chargeExpenseStatut(charge.statut),
    statut_label: chargeExpenseStatut(charge.statut) === 'payee' ? 'Payée' : 'En attente',
    mode_paiement: charge.mode_paiement || '',
    _fromCharge: true,
  };
}

/** Ajoute les dépenses générales payées non encore comptabilisées dans project_expenses. */
export function mergeChargesIntoProjectExpenses(expenses, charges, projects) {
  const indexes = buildProjectIndexes(projects);

  // Ne bloque pas la fusion si une ligne DB existe en en_attente (ancienne sync « Validé »).
  const merged = (expenses || []).filter((e) => {
    if (e.source_type === 'finance_charge' && e.source_id) {
      return isCountedProjectExpense(e);
    }
    return isCountedProjectExpense(e);
  });

  const countedChargeIds = new Set(
    merged
      .filter((e) => e.source_type === 'finance_charge' && e.source_id)
      .map((e) => String(e.source_id)),
  );

  for (const charge of charges || []) {
    if (!isChargePaidForProject(charge) && !isChargeEligibleForBackfill(charge)) continue;
    if (SKIP_CHARGE_STATUTS.includes(charge.statut)) continue;
    if (countedChargeIds.has(String(charge.id))) continue;

    const project = resolveChargeProject(charge, indexes);
    if (!project?.id) continue;

    merged.push(chargeToProjectExpenseRow(charge, project.id, projects));
    countedChargeIds.add(String(charge.id));
  }

  return merged.sort((a, b) => String(b.date_depense).localeCompare(String(a.date_depense)));
}

async function fetchLinkedChargesViaApi() {
  try {
    const { resolveApiBaseUrl, ENV } = await import('../../config/env');
    const sb = getSupabase();
    const { data: { session } } = await sb.auth.getSession();
    if (!session?.access_token) return [];

    const res = await fetch(`${resolveApiBaseUrl()}/finance/charges-for-projects`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: ENV.SUPABASE_ANON_KEY,
      },
    });
    if (!res.ok) return [];
    const json = await res.json();
    return json.charges || [];
  } catch {
    return [];
  }
}

export async function fetchLinkedChargesForProjects() {
  const { data, error } = await getSupabase()
    .from('finance_charges')
    .select('id, project_id, projet_lie, date_charge, libelle, categorie, fournisseur, montant, mode_paiement, statut, ref_charge, commentaire')
    .or('project_id.not.is.null,projet_lie.not.is.null')
    .order('date_charge', { ascending: false });

  if (!error && Array.isArray(data) && data.length) {
    return data.filter(
      (c) => (c.project_id || String(c.projet_lie || '').trim())
        && (isChargePaidForProject(c) || isChargeEligibleForBackfill(c)),
    );
  }

  const viaApi = await fetchLinkedChargesViaApi();
  if (viaApi.length) return viaApi;

  if (error) console.warn('[CITYMO] linked charges', error.message);
  return data || [];
}

export async function syncChargesToProjectsViaApi() {
  try {
    const { resolveApiBaseUrl, ENV } = await import('../../config/env');
    const sb = getSupabase();
    const { data: { session } } = await sb.auth.getSession();
    if (!session?.access_token) return null;

    const res = await fetch(`${resolveApiBaseUrl()}/finance/sync-charges-to-projects`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: ENV.SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

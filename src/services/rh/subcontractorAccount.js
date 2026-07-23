/**
 * subcontractorAccount.js — Compte sous-traitant (agrégation + KPI)
 * Réutilise formules existantes ; avance globales quand tables présentes.
 */
import {
  listSubcontractors,
  getSubcontractor,
  listPayments,
  listAssignments,
  listDocuments,
  listProjectBalances,
  listAllSubcontractorPayments,
  subcontractorFullName,
} from './subcontractors';
import { paymentStatusFromDb } from './subcontractorConstants';
import { listSituations } from './subcontractorSituations';
import { listGlobalAdvances, listAdvanceImputations, summarizeAdvances } from './subcontractorAdvances';
import { listAccountEvents } from './subcontractorAccountEvents';
import { round2 } from './subcontractorAdvanceMath';

function isPaid(p) {
  return (p.status || 'paid') === 'paid';
}

function safeList(promise, fallback = []) {
  return promise.catch(() => fallback);
}

export function buildAccountKpis({
  payments = [],
  balances = [],
  assignments = [],
  situations = [],
  advances = [],
} = {}) {
  const all = payments || [];
  const paid = all.filter(isPaid);
  const travauxRealises = round2(
    situations.length
      ? situations.reduce((s, x) => s + (Number(x.grossAmount) || 0), 0)
      : all.reduce((s, p) => s + (Number(p.grossAmount) || 0), 0),
  );
  const retenues = round2(
    situations.length
      ? situations.reduce((s, x) => s + (Number(x.retenues) || 0), 0)
      : all.reduce((s, p) => s + (Number(p.retenues) || 0), 0),
  );
  const montantsPayes = round2(paid.reduce((s, p) => s + (Number(p.amount) || 0), 0));
  const advSummary = summarizeAdvances(advances);
  const avancesImputeesPaiements = round2(all.reduce((s, p) => s + (Number(p.avances) || 0), 0));
  const avancesConsommees = advances.length
    ? advSummary.avancesConsommees
    : avancesImputeesPaiements;
  const avancesVersees = advances.length
    ? advSummary.avancesVersees
    : avancesImputeesPaiements;
  const reliquatAvance = advances.length ? advSummary.reliquatAvance : 0;

  const resteFromSituations = round2(
    situations
      .filter((s) => !['closed', 'cancelled'].includes(s.status))
      .reduce((s, x) => s + Math.max(0, Number(x.remaining) || 0), 0),
  );
  const resteAPayer = situations.length
    ? resteFromSituations
    : round2(balances.reduce((s, b) => s + Math.max(0, Number(b.remainingAmount) || 0), 0));

  const projectIds = new Set();
  payments.forEach((p) => { if (p.projectId) projectIds.add(String(p.projectId)); });
  assignments.forEach((a) => { if (a.projectId) projectIds.add(String(a.projectId)); });
  situations.forEach((s) => { if (s.projectId) projectIds.add(String(s.projectId)); });
  balances.forEach((b) => { if (b.projectId) projectIds.add(String(b.projectId)); });

  const situationsOuvertes = situations.filter((s) =>
    ['draft', 'in_progress', 'partially_paid'].includes(s.status)).length;
  const situationsSoldees = situations.filter((s) => s.status === 'settled').length;
  const situationsCloturees = situations.filter((s) => s.status === 'closed').length;

  return {
    avancesVersees,
    avancesConsommees,
    reliquatAvance,
    avancesGlobalesDisponibles: advances.length > 0 || reliquatAvance > 0 || avancesVersees > 0,
    travauxRealises,
    montantsPayes,
    retenues,
    resteAPayer,
    nombreProjets: projectIds.size,
    situationsOuvertes: situations.length ? situationsOuvertes : 0,
    situationsSoldees: situations.length ? situationsSoldees : 0,
    situationsCloturees,
    totalSituations: situations.length,
    derniereOperation: payments[0]?.paymentDate || situations[0]?.situationDate || null,
  };
}

/** Fallback étape 1 : agrégation par projet si pas encore de table situations. */
export function buildProjectSituations({ payments = [], balances = [], assignments = [] } = {}) {
  const map = new Map();
  const ensure = (projectId, name) => {
    const key = String(projectId || '') || `__none_${name || 'sans'}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        projectId: projectId ? String(projectId) : '',
        projectName: name || 'Sans projet',
        totalTravaux: 0,
        totalAvances: 0,
        totalRetenues: 0,
        totalPaye: 0,
        remainingFromBalance: null,
        paymentCount: 0,
        assignmentStatus: null,
        lastDate: null,
      });
    }
    return map.get(key);
  };
  assignments.forEach((a) => {
    const row = ensure(a.projectId, a.projectName || a.projectRef);
    if (a.status) row.assignmentStatus = a.status;
    if (a.projectName) row.projectName = a.projectName;
  });
  balances.forEach((b) => {
    const row = ensure(b.projectId, b.projectName);
    row.remainingFromBalance = Number(b.remainingAmount) || 0;
    if (b.projectName) row.projectName = b.projectName;
  });
  (payments || []).forEach((p) => {
    const row = ensure(p.projectId, p.projectName);
    if (p.projectName) row.projectName = p.projectName;
    row.totalTravaux = round2(row.totalTravaux + (Number(p.grossAmount) || 0));
    row.totalAvances = round2(row.totalAvances + (Number(p.avances) || 0));
    row.totalRetenues = round2(row.totalRetenues + (Number(p.retenues) || 0));
    if (isPaid(p)) row.totalPaye = round2(row.totalPaye + (Number(p.amount) || 0));
    row.paymentCount += 1;
    const d = p.paymentDate || p.created_at;
    if (d && (!row.lastDate || String(d) > String(row.lastDate))) row.lastDate = d;
  });
  return [...map.values()].map((row) => {
    const soldeRestant = row.remainingFromBalance != null
      ? round2(row.remainingFromBalance)
      : round2(Math.max(0, row.totalTravaux - row.totalAvances - row.totalRetenues - row.totalPaye));
    let statutCompte = 'ouverte';
    if (row.paymentCount > 0 && soldeRestant <= 0.009) statutCompte = 'soldee';
    if (row.assignmentStatus === 'annulée') statutCompte = 'annulee';
    return {
      ...row,
      soldeRestant,
      statutCompte,
      statutLabel: statutCompte === 'soldee' ? 'Soldée' : statutCompte === 'annulee' ? 'Annulée' : 'Ouverte',
    };
  }).sort((a, b) => String(b.lastDate || '').localeCompare(String(a.lastDate || '')));
}

export function buildAccountHistory(payments = [], events = [], imputations = []) {
  const fromPayments = (payments || []).map((p) => ({
    id: `pay-${p.id}`,
    date: p.paymentDate || p.created_at || null,
    type: 'paiement',
    typeLabel: 'Paiement / situation',
    projectId: p.projectId || '',
    projectLabel: p.projectName || (p.projectId ? 'Projet' : 'Non affecté'),
    situationLabel: p.reference || '',
    montant: Number(p.amount) || 0,
    montantBrut: Number(p.grossAmount) || 0,
    avances: Number(p.avances) || 0,
    retenues: Number(p.retenues) || 0,
    reference: p.reference || '',
    observation: p.description || p.notes || '',
    statut: paymentStatusFromDb(p.status),
    payment: p,
    isHistorical: !!p.isHistorical,
  }));
  const fromEvents = (events || []).map((e) => ({
    id: `evt-${e.id}`,
    date: e.date,
    type: e.type,
    typeLabel: e.typeLabel,
    projectId: e.projectId || '',
    projectLabel: e.projectLabel || '',
    situationLabel: e.reference || '',
    montant: e.amount,
    montantBrut: 0,
    avances: e.type === 'advance_imputed' ? e.amount : 0,
    retenues: e.type === 'retention' ? e.amount : 0,
    reference: e.reference || '',
    observation: e.observation || '',
    statut: '',
    userLabel: e.userLabel || '',
    payment: null,
  }));
  const fromImp = (imputations || []).map((i) => ({
    id: `imp-${i.id}`,
    date: i.imputationDate || i.created_at,
    type: 'advance_imputed',
    typeLabel: 'Imputation d’avance',
    projectId: i.projectId || '',
    projectLabel: i.projectName || '',
    situationLabel: i.situationId || '',
    montant: i.amount,
    montantBrut: 0,
    avances: i.amount,
    retenues: 0,
    reference: '',
    observation: `Reliquat après : ${Number(i.reliquatAfter || 0).toLocaleString('fr-MA')} MAD`,
    statut: '',
    payment: null,
  }));
  return [...fromPayments, ...fromEvents, ...fromImp]
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

export async function listSubcontractorAccounts() {
  const [subs, payments] = await Promise.all([
    listSubcontractors(),
    listAllSubcontractorPayments(null),
  ]);
  const bySub = new Map();
  (payments || []).forEach((p) => {
    const id = p.subcontractorId;
    if (!id) return;
    if (!bySub.has(id)) bySub.set(id, []);
    bySub.get(id).push(p);
  });

  const accounts = await Promise.all((subs || []).map(async (sub) => {
    const subPayments = bySub.get(sub.id) || [];
    const hasActivity = subPayments.length > 0
      || (sub.activeProjectsCount || 0) > 0
      || (sub.activeAssignments || []).length > 0
      || (Number(sub.remaining) || 0) > 0
      || (Number(sub.totalPaid) || 0) > 0;
    if (!hasActivity && sub.statut !== 'actif') return null;

    const [situations, advances] = await Promise.all([
      safeList(listSituations(sub.id)),
      safeList(listGlobalAdvances(sub.id)),
    ]);
    const kpis = buildAccountKpis({
      payments: subPayments,
      balances: [],
      assignments: sub.activeAssignments || [],
      situations,
      advances,
    });
    kpis.resteAPayer = round2(Number(sub.remaining) || kpis.resteAPayer);
    if (!kpis.nombreProjets && (sub.activeProjectsCount || 0) > 0) {
      kpis.nombreProjets = sub.activeProjectsCount;
    }
    return {
      id: sub.id,
      fullName: sub.fullName || subcontractorFullName(sub),
      fonction: sub.fonction || '',
      telephone: sub.telephone || '',
      statut: sub.statut || 'actif',
      activeProjectsCount: sub.activeProjectsCount || kpis.nombreProjets,
      currentProject: sub.currentProject || '',
      paymentsCount: subPayments.length,
      kpis,
      lastPayment: subPayments[0] || null,
    };
  }));

  return accounts.filter(Boolean)
    .sort((a, b) => String(a.fullName || '').localeCompare(String(b.fullName || ''), 'fr'));
}

export async function getSubcontractorAccount(subcontractorId) {
  if (!subcontractorId) throw new Error('Sous-traitant requis.');

  const [sub, paymentsRaw, assignments, documents, balances, situations, advances, imputations, events] = await Promise.all([
    getSubcontractor(subcontractorId),
    listPayments(subcontractorId),
    listAssignments(subcontractorId),
    safeList(listDocuments(subcontractorId)),
    safeList(listProjectBalances(subcontractorId)),
    safeList(listSituations(subcontractorId)),
    safeList(listGlobalAdvances(subcontractorId)),
    safeList(listAdvanceImputations(subcontractorId)),
    safeList(listAccountEvents(subcontractorId)),
  ]);

  const projectNameById = new Map();
  (assignments || []).forEach((a) => {
    if (a.projectId) projectNameById.set(String(a.projectId), a.projectName || a.projectRef || '');
  });
  (balances || []).forEach((b) => {
    if (b.projectId && b.projectName) projectNameById.set(String(b.projectId), b.projectName);
  });

  const payments = (paymentsRaw || []).map((p) => ({
    ...p,
    projectName: p.projectName || projectNameById.get(String(p.projectId)) || '',
    subcontractorName: sub.fullName,
  }));

  const kpis = buildAccountKpis({
    payments, balances, assignments, situations, advances,
  });
  const legacySituations = situations.length
    ? []
    : buildProjectSituations({ payments, balances, assignments });
  const history = buildAccountHistory(payments, events, imputations);

  return {
    subcontractor: sub,
    kpis,
    situations,
    legacySituations,
    history,
    payments,
    assignments,
    documents: documents || [],
    balances,
    advances,
    imputations,
    events,
  };
}

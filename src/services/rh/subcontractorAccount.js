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
import { listGlobalAdvances, listAdvanceImputations } from './subcontractorAdvances';
import { listAccountEvents } from './subcontractorAccountEvents';
import { buildSubcontractorLedger } from './subcontractorLedger';
import { listEvaluations, summarizePerformance } from './subcontractorEvaluations';
import { round2, totalAdvancesPaid, totalAdvancesConsumed } from './subcontractorAdvanceMath';

function isPaid(p) {
  return (p.status || 'paid') === 'paid';
}

/** Avance imputée effective : ne peut pas dépasser le brut de la ligne. */
export function effectivePaymentAdvance(p) {
  const gross = Math.max(0, Number(p?.grossAmount) || 0);
  const av = Math.max(0, Number(p?.avances) || 0);
  return round2(Math.min(av, gross));
}

function safeList(promise, fallback = []) {
  return promise.catch(() => fallback);
}

/**
 * KPI compte sous-traitant — calcul centralisé.
 *
 * Avance versée  = somme des versements réels (subcontractor_global_advances), 1× par advance.id
 * Avance consommée = somme des imputations réelles (table imputations si présente,
 *                    sinon min(avances, brut) par situation/paiement — jamais la somme
 *                    brute des colonnes « Avances » par projet qui peut doubler un versement)
 * Reliquat = max(0, versées − consommées)
 */
export function buildAccountKpis({
  payments = [],
  balances = [],
  assignments = [],
  situations = [],
  advances = [],
  imputations = [],
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

  const activeAdvances = (advances || []).filter((a) => (a.status || 'unused') !== 'cancelled');
  const hasGlobalAdvances = activeAdvances.length > 0;

  // Imputations analytiques plafonnées au brut (évite 5 000 affiché sur 2 250)
  const avancesImputeesEffectives = round2(
    situations.length
      ? situations.reduce((s, x) => {
        const g = Math.max(0, Number(x.grossAmount) || 0);
        const a = Math.max(0, Number(x.avancesImputees) || 0);
        return s + Math.min(a, g);
      }, 0)
      : all.reduce((s, p) => s + effectivePaymentAdvance(p), 0),
  );

  // Somme des lignes d’imputation (1× par imputation.id) — source de vérité préférée
  const imputationsSum = round2(
    (imputations || []).reduce((s, i) => s + Math.max(0, Number(i.amount) || 0), 0),
  );
  const hasImputationRows = (imputations || []).length > 0;

  let avancesVersees;
  let avancesConsommees;
  let reliquatAvance;
  let kpiSource;

  if (hasGlobalAdvances) {
    avancesVersees = totalAdvancesPaid(activeAdvances);
    // Consommées = imputations réelles ; fallback analytique plafonnée.
    // Ne PAS prendre max(..., consumed_amount ledger) : le ledger peut être gonflé
    // si des paiements ont stocké avances > brut sans imputation correcte.
    const fromImputations = hasImputationRows ? imputationsSum : avancesImputeesEffectives;
    avancesConsommees = round2(Math.min(avancesVersees, fromImputations));
    reliquatAvance = round2(Math.max(0, avancesVersees - avancesConsommees));
    kpiSource = hasImputationRows ? 'imputations' : 'analytical_capped';
  } else {
    // Pas de versement réel enregistré : ne pas inventer des « avances versées »
    // à partir des colonnes paiement (sinon double comptage multi-projets).
    avancesVersees = 0;
    avancesConsommees = avancesImputeesEffectives;
    reliquatAvance = 0;
    kpiSource = 'legacy_no_advance_ledger';
  }

  // Brut à payer = travaux non couverts par les avances CONSOMMÉES (pas versées)
  const montantBrutAPayer = round2(Math.max(0, travauxRealises - avancesConsommees));
  const resteNetAPayer = round2(Math.max(0, montantBrutAPayer - montantsPayes - retenues));

  const projectIds = new Set();
  payments.forEach((p) => { if (p.projectId) projectIds.add(String(p.projectId)); });
  assignments.forEach((a) => { if (a.projectId) projectIds.add(String(a.projectId)); });
  situations.forEach((s) => { if (s.projectId) projectIds.add(String(s.projectId)); });
  balances.forEach((b) => { if (b.projectId) projectIds.add(String(b.projectId)); });

  const situationsOuvertes = situations.filter((s) =>
    ['draft', 'in_progress', 'partially_paid'].includes(s.status)).length;
  const situationsSoldees = situations.filter((s) => s.status === 'settled').length;
  const situationsCloturees = situations.filter((s) => s.status === 'closed').length;
  const situationsValidees = situations.filter((s) =>
    ['settled', 'closed', 'partially_paid'].includes(s.status)).length;
  const situationsEnAttente = situations.filter((s) =>
    ['draft', 'in_progress'].includes(s.status)).length;
  const montantValide = round2(
    situations
      .filter((s) => ['settled', 'closed', 'partially_paid'].includes(s.status))
      .reduce((s, x) => s + (Number(x.grossAmount) || 0), 0),
  );
  const montantEnAttente = round2(
    situations
      .filter((s) => ['draft', 'in_progress'].includes(s.status))
      .reduce((s, x) => s + (Number(x.grossAmount) || 0), 0),
  );

  // Diagnostic (ex. double comptage historique)
  const rawPaymentAvancesUncapped = round2(
    all.reduce((s, p) => s + Math.max(0, Number(p.avances) || 0), 0),
  );
  const ledgerConsumed = hasGlobalAdvances ? totalAdvancesConsumed(activeAdvances) : 0;

  return {
    avancesVersees,
    avancesConsommees,
    reliquatAvance,
    avancesGlobalesDisponibles: hasGlobalAdvances || avancesConsommees > 0,
    travauxRealises,
    montantBrutAPayer,
    montantsPayes,
    retenues,
    resteNetAPayer,
    resteAPayer: resteNetAPayer,
    nombreProjets: projectIds.size,
    situationsOuvertes: situations.length ? situationsOuvertes : 0,
    situationsSoldees: situations.length ? situationsSoldees : 0,
    situationsCloturees,
    situationsValidees,
    situationsEnAttente,
    montantValide: situations.length ? montantValide : travauxRealises,
    montantEnAttente: situations.length ? montantEnAttente : 0,
    totalSituations: situations.length,
    derniereOperation: payments[0]?.paymentDate || situations[0]?.situationDate || null,
    _debug: {
      kpiSource,
      hasGlobalAdvances,
      hasImputationRows,
      imputationsSum,
      avancesImputeesEffectives,
      rawPaymentAvancesUncapped,
      ledgerConsumed,
      advancesCount: activeAdvances.length,
    },
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
        paymentIds: [],
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
    const gross = Number(p.grossAmount) || 0;
    const avEff = effectivePaymentAdvance(p);
    row.totalTravaux = round2(row.totalTravaux + gross);
    row.totalAvances = round2(row.totalAvances + avEff);
    row.totalRetenues = round2(row.totalRetenues + (Number(p.retenues) || 0));
    if (isPaid(p)) row.totalPaye = round2(row.totalPaye + (Number(p.amount) || 0));
    row.paymentCount += 1;
    if (p.id) row.paymentIds.push(p.id);
    const d = p.paymentDate || p.created_at;
    if (d && (!row.lastDate || String(d) > String(row.lastDate))) row.lastDate = d;
  });
  return [...map.values()].map((row) => {
    const soldeRestant = row.remainingFromBalance != null
      ? round2(row.remainingFromBalance)
      : round2(Math.max(0, row.totalTravaux - row.totalAvances - row.totalRetenues - row.totalPaye));
    const isSansProjet = !row.projectId;
    let statutCompte = 'ouverte';
    let statutLabel = 'Ouverte';
    if (isSansProjet) {
      // Ne pas traiter « Sans projet » comme un projet soldé automatique
      statutCompte = 'a_regulariser';
      statutLabel = 'À régulariser';
    } else if (row.assignmentStatus === 'annulée') {
      statutCompte = 'annulee';
      statutLabel = 'Annulée';
    } else if (row.paymentCount > 0 && soldeRestant <= 0.009 && row.totalPaye > 0.009) {
      statutCompte = 'soldee';
      statutLabel = 'Soldée';
    } else if (row.paymentCount > 0 && soldeRestant <= 0.009 && row.totalAvances + 0.009 >= row.totalTravaux) {
      statutCompte = 'couverte_avance';
      statutLabel = 'Couverte par avance';
    }
    return {
      ...row,
      soldeRestant,
      statutCompte,
      statutLabel,
      canAssignProject: isSansProjet && (row.paymentIds || []).length > 0,
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

  // Also pass imputations when available for list KPIs
  const [situations, advances, imputations] = await Promise.all([
    safeList(listSituations(sub.id)),
    safeList(listGlobalAdvances(sub.id)),
    safeList(listAdvanceImputations(sub.id)),
  ]);
  const kpis = buildAccountKpis({
    payments: subPayments,
    balances: [],
    assignments: sub.activeAssignments || [],
    situations,
    advances,
    imputations,
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

  const [sub, paymentsRaw, assignments, documents, balances, situations, advances, imputations, events, evaluations] = await Promise.all([
    getSubcontractor(subcontractorId),
    listPayments(subcontractorId),
    listAssignments(subcontractorId),
    safeList(listDocuments(subcontractorId)),
    safeList(listProjectBalances(subcontractorId)),
    safeList(listSituations(subcontractorId)),
    safeList(listGlobalAdvances(subcontractorId)),
    safeList(listAdvanceImputations(subcontractorId)),
    safeList(listAccountEvents(subcontractorId)),
    safeList(listEvaluations(subcontractorId)),
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
    payments, balances, assignments, situations, advances, imputations,
  });
  const legacySituations = situations.length
    ? []
    : buildProjectSituations({ payments, balances, assignments });
  const history = buildAccountHistory(payments, events, imputations);
  const ledger = buildSubcontractorLedger({
    advances, payments, situations, imputations, events,
  });
  const performance = summarizePerformance({ evaluations, assignments, kpis });

  return {
    subcontractor: sub,
    kpis,
    situations,
    legacySituations,
    history,
    ledger,
    payments,
    assignments,
    documents: documents || [],
    balances,
    advances,
    imputations,
    events,
    evaluations,
    performance,
  };
}

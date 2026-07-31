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
import {
  buildDualFinancialViews,
  getOpeningBalance,
  isAlreadyAccounted,
  accountingStatusOf,
  accountingStatusLabel,
} from './subcontractorHistorical';

function isPaid(p) {
  return (p.status || 'paid') === 'paid';
}

/** Avance imputée effective : ne peut pas dépasser le brut de la ligne. */
export function effectivePaymentAdvance(p) {
  const gross = Math.max(0, Number(p?.grossAmount) || 0);
  const av = Math.max(0, Number(p?.avances) || 0);
  return round2(Math.min(av, gross));
}

/**
 * Montant réglé (affichage) = avance imputée plafonnée + paiements complémentaires.
 * Ne crée pas d’écriture bancaire : purement dérivé pour l’UI.
 */
export function amountSettledDisplay({
  grossAmount = 0,
  avancesImputees = 0,
  amountPaid = 0,
} = {}) {
  const gross = Math.max(0, Number(grossAmount) || 0);
  const av = Math.min(Math.max(0, Number(avancesImputees) || 0), gross);
  const paid = Math.max(0, Number(amountPaid) || 0);
  return round2(av + paid);
}

function isActiveSituation(s) {
  return (s?.status || '') !== 'cancelled';
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
  opening = null,
} = {}) {
  const all = payments || [];
  const paid = all.filter(isPaid);
  const activeSituations = (situations || []).filter(isActiveSituation);
  const cancelledSitIds = new Set(
    (situations || []).filter((s) => !isActiveSituation(s)).map((s) => s.id).filter(Boolean),
  );
  const activeImputations = (imputations || []).filter(
    (i) => !i.situationId || !cancelledSitIds.has(i.situationId),
  );

  const travauxRealises = round2(
    activeSituations.length
      ? activeSituations.reduce((s, x) => s + (Number(x.grossAmount) || 0), 0)
      : situations.length
        ? 0
        : all.reduce((s, p) => s + (Number(p.grossAmount) || 0), 0),
  );
  const retenues = round2(
    activeSituations.length
      ? activeSituations.reduce((s, x) => s + (Number(x.retenues) || 0), 0)
      : situations.length
        ? 0
        : all.reduce((s, p) => s + (Number(p.retenues) || 0), 0),
  );
  /** Paiements complémentaires uniquement (pas l’avance consommée). */
  const montantsPayes = round2(paid.reduce((s, p) => s + (Number(p.amount) || 0), 0));

  const activeAdvances = (advances || []).filter((a) => (a.status || 'unused') !== 'cancelled');
  const hasGlobalAdvances = activeAdvances.length > 0;

  // Imputations analytiques plafonnées au brut (évite 5 000 affiché sur 2 250)
  const avancesImputeesEffectives = round2(
    activeSituations.length
      ? activeSituations.reduce((s, x) => {
        const g = Math.max(0, Number(x.grossAmount) || 0);
        const a = Math.max(0, Number(x.avancesImputees) || 0);
        return s + Math.min(a, g);
      }, 0)
      : situations.length
        ? 0
        : all.reduce((s, p) => s + effectivePaymentAdvance(p), 0),
  );

  // Somme des lignes d’imputation actives (1× par imputation.id) — source de vérité préférée
  const imputationsSum = round2(
    activeImputations.reduce((s, i) => s + Math.max(0, Number(i.amount) || 0), 0),
  );
  const hasImputationRows = activeImputations.length > 0;

  let avancesVersees;
  let avancesConsommees;
  let reliquatAvance;
  let kpiSource;

  if (hasGlobalAdvances) {
    avancesVersees = totalAdvancesPaid(activeAdvances);
    const fromImputations = hasImputationRows ? imputationsSum : avancesImputeesEffectives;
    avancesConsommees = round2(Math.min(avancesVersees, fromImputations));
    reliquatAvance = round2(Math.max(0, avancesVersees - avancesConsommees));
    kpiSource = hasImputationRows ? 'imputations' : 'analytical_capped';
  } else {
    avancesVersees = 0;
    avancesConsommees = avancesImputeesEffectives;
    reliquatAvance = 0;
    kpiSource = 'legacy_no_advance_ledger';
  }

  // Si solde d’ouverture sans avance liée : ajouter les travaux / retenues d’ouverture
  // (les avances d’ouverture sont déjà dans global_advances si linked).
  const openingTravaux = opening && !opening.linkedAdvanceId
    ? round2(Number(opening.travauxAnterieurs) || 0)
    : (opening ? round2(Number(opening.travauxAnterieurs) || 0) : 0);
  // Travaux d’ouverture : toujours additionnés s’il n’y a pas déjà de situations historiques
  // couvrant le même montant — on ajoute opening.travaux uniquement si fourni.
  const travauxWithOpening = opening
    ? round2(travauxRealises + (Number(opening.travauxAnterieurs) || 0))
    : travauxRealises;
  const retenuesWithOpening = opening
    ? round2(retenues + (Number(opening.retenuesAnterieures) || 0))
    : retenues;
  const paiementsWithOpening = opening
    ? round2(montantsPayes + (Number(opening.paiementsAnterieurs) || 0))
    : montantsPayes;

  const montantBrutAPayer = round2(Math.max(0, travauxWithOpening - avancesConsommees));
  const resteNetAPayer = round2(Math.max(0, montantBrutAPayer - paiementsWithOpening - retenuesWithOpening));
  const totalDejaPaye = round2(avancesConsommees + paiementsWithOpening);

  const projectIds = new Set();
  payments.forEach((p) => { if (p.projectId) projectIds.add(String(p.projectId)); });
  (assignments || [])
    .filter((a) => (a.status || 'active') !== 'annulée')
    .forEach((a) => { if (a.projectId) projectIds.add(String(a.projectId)); });
  activeSituations.forEach((s) => { if (s.projectId) projectIds.add(String(s.projectId)); });
  balances.forEach((b) => { if (b.projectId) projectIds.add(String(b.projectId)); });

  const situationsOuvertes = activeSituations.filter((s) =>
    ['draft', 'in_progress', 'partially_paid'].includes(s.status)).length;
  const situationsSoldees = activeSituations.filter((s) => s.status === 'settled').length;
  const situationsCloturees = activeSituations.filter((s) => s.status === 'closed').length;
  const situationsValidees = activeSituations.filter((s) =>
    ['settled', 'closed', 'partially_paid'].includes(s.status)).length;
  const situationsEnAttente = activeSituations.filter((s) =>
    ['draft', 'in_progress'].includes(s.status)).length;
  const montantValide = round2(
    activeSituations
      .filter((s) => ['settled', 'closed', 'partially_paid'].includes(s.status))
      .reduce((s, x) => s + (Number(x.grossAmount) || 0), 0),
  );
  const montantEnAttente = round2(
    activeSituations
      .filter((s) => ['draft', 'in_progress'].includes(s.status))
      .reduce((s, x) => s + (Number(x.grossAmount) || 0), 0),
  );

  const rawPaymentAvancesUncapped = round2(
    all.reduce((s, p) => s + Math.max(0, Number(p.avances) || 0), 0),
  );
  const ledgerConsumed = hasGlobalAdvances ? totalAdvancesConsumed(activeAdvances) : 0;

  const dual = buildDualFinancialViews({
    payments: paid,
    situations: activeSituations,
    advances: activeAdvances,
    imputations: activeImputations,
    opening,
  });

  // Décaissements ERP : uniquement already_accounted=false
  const erpAdvancesVersees = round2(
    activeAdvances.filter((a) => !isAlreadyAccounted(a)).reduce((s, a) => s + (Number(a.amount) || 0), 0),
  );
  const erpPaiements = round2(
    paid.filter((p) => !isAlreadyAccounted(p)).reduce((s, p) => s + (Number(p.amount) || 0), 0),
  );

  return {
    avancesVersees,
    avancesConsommees,
    reliquatAvance,
    avancesGlobalesDisponibles: hasGlobalAdvances || avancesConsommees > 0,
    travauxRealises: travauxWithOpening,
    montantBrutAPayer,
    montantsPayes: paiementsWithOpening,
    totalDejaPaye,
    montantRegle: totalDejaPaye,
    retenues: retenuesWithOpening,
    resteNetAPayer,
    resteAPayer: resteNetAPayer,
    nombreProjets: projectIds.size,
    situationsOuvertes: activeSituations.length ? situationsOuvertes : 0,
    situationsSoldees: activeSituations.length ? situationsSoldees : 0,
    situationsCloturees,
    situationsValidees,
    situationsEnAttente,
    montantValide: activeSituations.length ? montantValide : (situations.length ? 0 : travauxWithOpening),
    montantEnAttente: activeSituations.length ? montantEnAttente : 0,
    totalSituations: activeSituations.length,
    derniereOperation: payments[0]?.paymentDate || activeSituations[0]?.situationDate || null,
    // Dual lecture financière
    dual,
    historique: dual.historique,
    erp: {
      ...dual.erp,
      avancesVersees: erpAdvancesVersees,
      paiements: erpPaiements,
      decaissements: round2(erpAdvancesVersees + erpPaiements),
      montantAComptabiliser: round2(erpAdvancesVersees + erpPaiements),
    },
    opening,
    _debug: {
      kpiSource,
      hasGlobalAdvances,
      hasImputationRows,
      imputationsSum,
      avancesImputeesEffectives,
      rawPaymentAvancesUncapped,
      ledgerConsumed,
      advancesCount: activeAdvances.length,
      openingTravaux,
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
        totalPayeComplementaire: 0,
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
    if (isPaid(p)) row.totalPayeComplementaire = round2(row.totalPayeComplementaire + (Number(p.amount) || 0));
    row.paymentCount += 1;
    if (p.id) row.paymentIds.push(p.id);
    const d = p.paymentDate || p.created_at;
    if (d && (!row.lastDate || String(d) > String(row.lastDate))) row.lastDate = d;
  });
  return [...map.values()].map((row) => {
    const totalPayeComplementaire = Number(row.totalPayeComplementaire) || 0;
    const totalPaye = round2(row.totalAvances + totalPayeComplementaire);
    const soldeRestant = row.remainingFromBalance != null
      ? round2(row.remainingFromBalance)
      : round2(Math.max(0, row.totalTravaux - row.totalAvances - row.totalRetenues - totalPayeComplementaire));
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
    } else if (row.paymentCount > 0 && soldeRestant <= 0.009 && totalPaye > 0.009) {
      statutCompte = 'soldee';
      statutLabel = 'Soldée';
    } else if (row.totalTravaux > 0.009 && soldeRestant <= 0.009) {
      statutCompte = 'soldee';
      statutLabel = 'Soldée';
    }
    return {
      ...row,
      totalPayeComplementaire,
      totalPaye,
      soldeRestant,
      statutCompte,
      statutLabel,
      canAssignProject: isSansProjet && (row.paymentIds || []).length > 0,
    };
  }).filter((row) => row.assignmentStatus !== 'annulée' || row.totalTravaux > 0.009)
    .sort((a, b) => String(b.lastDate || '').localeCompare(String(a.lastDate || '')));
}

export function buildAccountHistory(payments = [], events = [], imputations = [], advances = []) {
  const fromPayments = (payments || []).map((p) => {
    const status = accountingStatusOf(p, { paid: (p.status || 'paid') === 'paid' });
    return {
      id: `pay-${p.id}`,
      date: p.paymentDate || p.created_at || null,
      dateReelle: p.paymentDate || null,
      dateSaisie: p.enteredAt || p.created_at || null,
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
      isHistorical: isAlreadyAccounted(p),
      alreadyAccounted: isAlreadyAccounted(p),
      accountingStatus: status,
      accountingStatusLabel: accountingStatusLabel(status),
      impactGlobal: Number(p.amount) || Number(p.grossAmount) || 0,
      impactErp: isAlreadyAccounted(p) ? 0 : (Number(p.amount) || 0),
      userLabel: '',
      operationKind: isAlreadyAccounted(p) ? 'Ancienne opération' : 'Nouvelle opération',
    };
  });
  const fromAdvances = (advances || []).map((a) => {
    const status = accountingStatusOf(a);
    return {
      id: `adv-${a.id}`,
      date: a.advanceDate || a.created_at || null,
      dateReelle: a.advanceDate || null,
      dateSaisie: a.enteredAt || a.created_at || null,
      type: 'advance_paid',
      typeLabel: 'Avance versée',
      projectId: '',
      projectLabel: '—',
      situationLabel: a.reference || '',
      montant: Number(a.amount) || 0,
      montantBrut: Number(a.amount) || 0,
      avances: Number(a.amount) || 0,
      retenues: 0,
      reference: a.reference || '',
      observation: a.observation || '',
      statut: a.statusLabel || '',
      payment: null,
      advance: a,
      isHistorical: isAlreadyAccounted(a),
      alreadyAccounted: isAlreadyAccounted(a),
      accountingStatus: status,
      accountingStatusLabel: accountingStatusLabel(status),
      impactGlobal: Number(a.amount) || 0,
      impactErp: isAlreadyAccounted(a) ? 0 : (Number(a.amount) || 0),
      userLabel: '',
      operationKind: isAlreadyAccounted(a) ? 'Ancienne opération' : 'Nouvelle opération',
    };
  });
  const fromEvents = (events || []).map((e) => ({
    id: `evt-${e.id}`,
    date: e.date,
    dateReelle: e.date,
    dateSaisie: e.date,
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
    isHistorical: e.type === 'historical',
    alreadyAccounted: e.type === 'historical',
    accountingStatus: e.type === 'historical' ? 'already_accounted' : 'erp_accounted',
    accountingStatusLabel: e.type === 'historical' ? 'Déjà comptabilisée' : 'Comptabilisée dans l’ERP',
    impactGlobal: e.amount || 0,
    impactErp: e.type === 'historical' ? 0 : (e.amount || 0),
    operationKind: e.type === 'historical' ? 'Ancienne opération' : 'Nouvelle opération',
  }));
  const fromImp = (imputations || []).map((i) => ({
    id: `imp-${i.id}`,
    date: i.imputationDate || i.created_at,
    dateReelle: i.imputationDate || null,
    dateSaisie: i.created_at || null,
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
    isHistorical: false,
    alreadyAccounted: false,
    accountingStatus: 'erp_accounted',
    accountingStatusLabel: 'Comptabilisée dans l’ERP',
    impactGlobal: i.amount || 0,
    impactErp: 0,
    operationKind: 'Nouvelle opération',
    userLabel: '',
  }));
  return [...fromPayments, ...fromAdvances, ...fromEvents, ...fromImp]
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

  const [sub, paymentsRaw, assignments, documents, balances, situations, advances, imputations, events, evaluations, opening] = await Promise.all([
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
    safeList(getOpeningBalance(subcontractorId), null),
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
    payments, balances, assignments, situations, advances, imputations, opening,
  });
  const legacySituations = situations.length
    ? []
    : buildProjectSituations({ payments, balances, assignments });
  const history = buildAccountHistory(payments, events, imputations, advances);
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
    opening,
  };
}

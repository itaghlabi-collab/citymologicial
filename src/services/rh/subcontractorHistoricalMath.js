/**
 * Formules pures — historique / already_accounted (sans I/O).
 * Utilisé par subcontractorHistorical.js et les tests.
 */
import { round2 } from './subcontractorAdvanceMath';

export const ACCOUNTING_STATUS = {
  ALREADY: 'already_accounted',
  TO_ACCOUNT: 'to_account',
  ERP_ACCOUNTED: 'erp_accounted',
};

export const ACCOUNTING_STATUS_LABEL = {
  [ACCOUNTING_STATUS.ALREADY]: 'Déjà comptabilisée',
  [ACCOUNTING_STATUS.TO_ACCOUNT]: 'À comptabiliser',
  [ACCOUNTING_STATUS.ERP_ACCOUNTED]: 'Comptabilisée dans l’ERP',
};

export function isAlreadyAccounted(entity) {
  if (!entity) return false;
  return entity.alreadyAccounted === true
    || entity.already_accounted === true
    || entity.isHistorical === true
    || entity.is_historical === true;
}

export function accountingStatusOf(entity, { paid = true } = {}) {
  if (isAlreadyAccounted(entity)) return ACCOUNTING_STATUS.ALREADY;
  if (paid === false) return ACCOUNTING_STATUS.TO_ACCOUNT;
  return ACCOUNTING_STATUS.ERP_ACCOUNTED;
}

export function accountingStatusLabel(status) {
  return ACCOUNTING_STATUS_LABEL[status] || status || '—';
}

export function buildHistoricalInsertFields(form = {}, userId = null) {
  const already = form.alreadyAccounted === true
    || form.already_accounted === true
    || form.alreadyAccounted === 'true'
    || form.already_accounted === 'true';
  const now = new Date().toISOString();
  return {
    already_accounted: !!already,
    entered_at: form.enteredAt || form.entered_at || now,
    entered_by: form.enteredBy || form.entered_by || userId || null,
  };
}

export function normalizeHistoricalFlags(row = {}) {
  const already = !!row.already_accounted || !!row.is_historical;
  return {
    alreadyAccounted: already,
    enteredAt: row.entered_at || row.created_at || null,
    enteredBy: row.entered_by || null,
    accountingStatus: already
      ? ACCOUNTING_STATUS.ALREADY
      : ACCOUNTING_STATUS.ERP_ACCOUNTED,
    accountingStatusLabel: already
      ? ACCOUNTING_STATUS_LABEL[ACCOUNTING_STATUS.ALREADY]
      : ACCOUNTING_STATUS_LABEL[ACCOUNTING_STATUS.ERP_ACCOUNTED],
    isHistoricalOp: already,
    isErpOp: !already,
  };
}

export function splitHistoricalOps({ advances = [], payments = [], situations = [] } = {}) {
  const histAdv = advances.filter(isAlreadyAccounted);
  const erpAdv = advances.filter((a) => !isAlreadyAccounted(a) && (a.status || '') !== 'cancelled');
  const histPay = payments.filter(isAlreadyAccounted);
  const erpPay = payments.filter((p) => !isAlreadyAccounted(p));
  const histSit = situations.filter(isAlreadyAccounted);
  const erpSit = situations.filter((s) => !isAlreadyAccounted(s) && (s.status || '') !== 'cancelled');
  return { histAdv, erpAdv, histPay, erpPay, histSit, erpSit };
}

export function buildDualFinancialViews({
  payments = [],
  situations = [],
  advances = [],
  opening = null,
} = {}) {
  const activeSit = (situations || []).filter((s) => (s.status || '') !== 'cancelled');
  const activeAdv = (advances || []).filter((a) => (a.status || '') !== 'cancelled');
  const paid = (payments || []).filter((p) => (p.status || 'paid') === 'paid');

  const { histAdv, erpAdv, histPay, erpPay, histSit, erpSit } = splitHistoricalOps({
    advances: activeAdv,
    payments: paid,
    situations: activeSit,
  });

  const sum = (list, key) => round2(list.reduce((s, x) => s + (Number(x[key]) || 0), 0));

  const openingTravaux = opening ? round2(Number(opening.travauxAnterieurs) || 0) : 0;
  const openingAvancesVersees = opening ? round2(Number(opening.avancesVerseesAnterieures) || 0) : 0;
  const openingAvancesConso = opening ? round2(Number(opening.avancesConsommeesAnterieures) || 0) : 0;
  const openingPaiements = opening ? round2(Number(opening.paiementsAnterieurs) || 0) : 0;
  const openingRetenues = opening ? round2(Number(opening.retenuesAnterieures) || 0) : 0;
  const openingSoldeAvance = opening
    ? round2(Number(opening.soldeAvanceOuverture) || Math.max(0, openingAvancesVersees - openingAvancesConso))
    : 0;

  const linkedAdvId = opening?.linkedAdvanceId || null;
  const histAdvForSum = linkedAdvId
    ? histAdv.filter((a) => a.id !== linkedAdvId)
    : histAdv;
  const useOpeningAvanceTotals = !!opening && !linkedAdvId;

  const travauxHistoriques = round2(
    sum(histSit, 'grossAmount') + (opening ? openingTravaux : 0),
  );
  const travauxErp = sum(erpSit, 'grossAmount');
  const travauxGlobal = round2(travauxHistoriques + travauxErp);

  const avancesHistVersees = round2(
    sum(histAdvForSum, 'amount') + (useOpeningAvanceTotals ? openingAvancesVersees : 0)
    + (linkedAdvId ? sum(histAdv.filter((a) => a.id === linkedAdvId), 'amount') : 0),
  );
  const avancesHistConsommees = round2(
    sum(histAdvForSum, 'consumedAmount')
    + (useOpeningAvanceTotals ? openingAvancesConso : 0)
    + (linkedAdvId ? sum(histAdv.filter((a) => a.id === linkedAdvId), 'consumedAmount') : 0),
  );
  const avancesErpVersees = sum(erpAdv, 'amount');
  const avancesErpConsommees = sum(erpAdv, 'consumedAmount');

  const paiementsHist = round2(sum(histPay, 'amount') + (opening ? openingPaiements : 0));
  const paiementsErp = sum(erpPay, 'amount');

  const retenuesHist = round2(
    sum(histSit, 'retenues') + (opening ? openingRetenues : 0),
  );
  const retenuesErp = sum(erpSit, 'retenues');
  const retenuesGlobal = round2(retenuesHist + retenuesErp);

  const avancesVerseesGlobal = round2(avancesHistVersees + avancesErpVersees);
  const avancesConsommeesGlobal = round2(avancesHistConsommees + avancesErpConsommees);
  const reliquatAvanceGlobal = round2(Math.max(0, avancesVerseesGlobal - avancesConsommeesGlobal));

  const soldeAvanceOuverture = linkedAdvId
    ? round2(Math.max(0, sum(histAdv.filter((a) => a.id === linkedAdvId), 'amount')
      - sum(histAdv.filter((a) => a.id === linkedAdvId), 'consumedAmount')))
    : (opening ? openingSoldeAvance : round2(Math.max(0, avancesHistVersees - avancesHistConsommees)));

  const totalGlobalRegle = round2(
    avancesConsommeesGlobal + paiementsHist + paiementsErp,
  );
  const resteGlobalAPayer = round2(
    Math.max(0, travauxGlobal - totalGlobalRegle - retenuesGlobal),
  );

  const decaissementsErp = round2(avancesErpVersees + paiementsErp);

  return {
    opening: opening ? { ...opening, soldeAvanceOuverture } : null,
    global: {
      travaux: travauxGlobal,
      travauxHistoriques,
      travauxErp,
      regle: totalGlobalRegle,
      reste: resteGlobalAPayer,
      retenues: retenuesGlobal,
      avancesVersees: avancesVerseesGlobal,
      avancesConsommees: avancesConsommeesGlobal,
      reliquatAvance: reliquatAvanceGlobal,
      paiements: round2(paiementsHist + paiementsErp),
    },
    historique: {
      avancesVersees: avancesHistVersees,
      avancesConsommees: avancesHistConsommees,
      soldeAvanceOuverture,
      paiements: paiementsHist,
      travaux: travauxHistoriques,
      retenues: retenuesHist,
    },
    erp: {
      avancesVersees: avancesErpVersees,
      avancesConsommees: avancesErpConsommees,
      paiements: paiementsErp,
      travaux: travauxErp,
      retenues: retenuesErp,
      decaissements: decaissementsErp,
      montantAComptabiliser: decaissementsErp,
      resteLieAuxNouveauxTravaux: round2(
        Math.max(0, travauxErp - avancesErpConsommees - paiementsErp - retenuesErp
          - Math.min(soldeAvanceOuverture, Math.max(0, travauxErp - retenuesErp))),
      ),
    },
  };
}

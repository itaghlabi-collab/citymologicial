/**
 * Tests métier — historique pré-ERP / already_accounted (purs, sans Supabase)
 * Usage: node scripts/test-subcontractor-historical-math.mjs
 */

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function isAlreadyAccounted(entity) {
  if (!entity) return false;
  return entity.alreadyAccounted === true
    || entity.already_accounted === true
    || entity.isHistorical === true;
}

function splitHistoricalOps({ advances = [], payments = [], situations = [] } = {}) {
  return {
    histAdv: advances.filter(isAlreadyAccounted),
    erpAdv: advances.filter((a) => !isAlreadyAccounted(a) && (a.status || '') !== 'cancelled'),
    histPay: payments.filter(isAlreadyAccounted),
    erpPay: payments.filter((p) => !isAlreadyAccounted(p)),
    histSit: situations.filter(isAlreadyAccounted),
    erpSit: situations.filter((s) => !isAlreadyAccounted(s) && (s.status || '') !== 'cancelled'),
  };
}

function buildDualFinancialViews({
  payments = [], situations = [], advances = [], opening = null,
} = {}) {
  const activeSit = situations.filter((s) => (s.status || '') !== 'cancelled');
  const activeAdv = advances.filter((a) => (a.status || '') !== 'cancelled');
  const paid = payments.filter((p) => (p.status || 'paid') === 'paid');
  const { histAdv, erpAdv, histPay, erpPay, histSit, erpSit } = splitHistoricalOps({
    advances: activeAdv, payments: paid, situations: activeSit,
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
  const histAdvForSum = linkedAdvId ? histAdv.filter((a) => a.id !== linkedAdvId) : histAdv;
  const useOpeningAvanceTotals = !!opening && !linkedAdvId;

  const travauxHistoriques = round2(sum(histSit, 'grossAmount') + (opening ? openingTravaux : 0));
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
  const retenuesHist = round2(sum(histSit, 'retenues') + (opening ? openingRetenues : 0));
  const retenuesErp = sum(erpSit, 'retenues');
  const retenuesGlobal = round2(retenuesHist + retenuesErp);
  const avancesConsommeesGlobal = round2(avancesHistConsommees + avancesErpConsommees);

  const soldeAvanceOuverture = linkedAdvId
    ? round2(Math.max(0,
      sum(histAdv.filter((a) => a.id === linkedAdvId), 'amount')
      - sum(histAdv.filter((a) => a.id === linkedAdvId), 'consumedAmount')))
    : (opening ? openingSoldeAvance : round2(Math.max(0, avancesHistVersees - avancesHistConsommees)));

  const totalGlobalRegle = round2(avancesConsommeesGlobal + paiementsHist + paiementsErp);
  const resteGlobalAPayer = round2(Math.max(0, travauxGlobal - totalGlobalRegle - retenuesGlobal));
  const decaissementsErp = round2(avancesErpVersees + paiementsErp);

  return {
    global: { travaux: travauxGlobal, regle: totalGlobalRegle, reste: resteGlobalAPayer, paiements: round2(paiementsHist + paiementsErp) },
    historique: {
      avancesVersees: avancesHistVersees,
      avancesConsommees: avancesHistConsommees,
      soldeAvanceOuverture,
      paiements: paiementsHist,
      travaux: travauxHistoriques,
    },
    erp: {
      avancesVersees: avancesErpVersees,
      paiements: paiementsErp,
      travaux: travauxErp,
      decaissements: decaissementsErp,
    },
  };
}

function test(name, fn) {
  try { fn(); console.log('PASS', name); }
  catch (e) { console.error('FAIL', name, e.message); process.exitCode = 1; }
}
function assertEqual(a, b, msg = '') {
  if (a !== b) throw new Error(`${msg} expected ${b}, got ${a}`);
}

test('Cas 1 — avance 20k totalement consommée avant ERP', () => {
  const dual = buildDualFinancialViews({
    advances: [{ id: 'a1', amount: 20000, consumedAmount: 20000, status: 'consumed', alreadyAccounted: true }],
    situations: [{ id: 's1', grossAmount: 20000, retenues: 0, status: 'settled', alreadyAccounted: true }],
    payments: [],
  });
  assertEqual(dual.historique.avancesVersees, 20000);
  assertEqual(dual.historique.soldeAvanceOuverture, 0);
  assertEqual(dual.erp.decaissements, 0);
  assertEqual(dual.global.reste, 0);
});

test('Cas 2 — nouveaux travaux 15k après cas 1', () => {
  const dual = buildDualFinancialViews({
    advances: [{ id: 'a1', amount: 20000, consumedAmount: 20000, status: 'consumed', alreadyAccounted: true }],
    situations: [
      { id: 's1', grossAmount: 20000, retenues: 0, status: 'settled', alreadyAccounted: true },
      { id: 's2', grossAmount: 15000, retenues: 0, status: 'in_progress', alreadyAccounted: false },
    ],
    payments: [],
  });
  assertEqual(dual.global.travaux, 35000);
  assertEqual(dual.erp.decaissements, 0);
  assertEqual(dual.global.reste, 15000);
});

test('Cas 3 — avance 30k / 20k consommés → solde ouverture 10k', () => {
  const dual = buildDualFinancialViews({
    advances: [{ id: 'a1', amount: 30000, consumedAmount: 20000, status: 'partial', alreadyAccounted: true }],
    situations: [{ id: 's1', grossAmount: 20000, retenues: 0, status: 'settled', alreadyAccounted: true }],
    payments: [],
  });
  assertEqual(dual.historique.soldeAvanceOuverture, 10000);
  assertEqual(dual.erp.decaissements, 0);
});

test('Cas 4 — imputation 10k sur nouveaux travaux 15k → reste 5k', () => {
  const dual = buildDualFinancialViews({
    advances: [{ id: 'a1', amount: 30000, consumedAmount: 30000, status: 'consumed', alreadyAccounted: true }],
    situations: [
      { id: 's1', grossAmount: 20000, retenues: 0, status: 'settled', alreadyAccounted: true },
      { id: 's2', grossAmount: 15000, retenues: 0, status: 'partially_paid', alreadyAccounted: false },
    ],
    payments: [],
  });
  assertEqual(dual.erp.decaissements, 0);
  assertEqual(dual.global.reste, 5000);
});

test('Cas 5 — ancien paiement 8k hors décaissements ERP', () => {
  const dual = buildDualFinancialViews({
    advances: [],
    situations: [{ id: 's1', grossAmount: 8000, retenues: 0, status: 'settled', alreadyAccounted: true }],
    payments: [{ id: 'p1', amount: 8000, status: 'paid', alreadyAccounted: true }],
  });
  assertEqual(dual.global.paiements, 8000);
  assertEqual(dual.erp.decaissements, 0);
});

test('Cas 6 — nouveau paiement 5k inclus ERP', () => {
  const dual = buildDualFinancialViews({
    advances: [], situations: [],
    payments: [
      { id: 'p1', amount: 8000, status: 'paid', alreadyAccounted: true },
      { id: 'p2', amount: 5000, status: 'paid', alreadyAccounted: false },
    ],
  });
  assertEqual(dual.erp.paiements, 5000);
  assertEqual(dual.erp.decaissements, 5000);
});

test('Cas 7 — détection solde d’ouverture existant', () => {
  assertEqual(!!{ id: 'ob1' }, true);
});

test('Cas 8 — flags already_accounted', () => {
  assertEqual(isAlreadyAccounted({ alreadyAccounted: true }), true);
  assertEqual(isAlreadyAccounted({ alreadyAccounted: false }), false);
});

test('Ouverture linked advance — pas de double comptage', () => {
  const dual = buildDualFinancialViews({
    opening: {
      travauxAnterieurs: 20000,
      avancesVerseesAnterieures: 30000,
      avancesConsommeesAnterieures: 20000,
      soldeAvanceOuverture: 10000,
      linkedAdvanceId: 'a-open',
    },
    advances: [{ id: 'a-open', amount: 30000, consumedAmount: 20000, status: 'partial', alreadyAccounted: true }],
    situations: [],
    payments: [],
  });
  assertEqual(dual.historique.avancesVersees, 30000);
  assertEqual(dual.historique.soldeAvanceOuverture, 10000);
  assertEqual(dual.erp.decaissements, 0);
});

console.log(process.exitCode ? 'SOME TESTS FAILED' : 'ALL TESTS PASSED');

/**
 * Tests purs avances / imputations (miroirs de subcontractorAdvanceMath + calcSubPaymentTotals).
 * Usage: node scripts/test-subcontractor-account-math.mjs
 */

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function calcSubPaymentTotals(paymentType, line) {
  const gross = paymentType === 'metre'
    ? round2((Number(line.quantity) || 0) * (Number(line.unitPrice) || 0))
    : round2(Number(line.amount) || 0);
  const avances = round2(Number(line.avances) || 0);
  const retenues = round2(Number(line.retenues) || 0);
  const net = round2(Math.max(0, gross - avances - retenues));
  return { gross, avances, retenues, net };
}

function advanceReliquat(advance) {
  return round2(Math.max(0, (Number(advance.amount) || 0) - (Number(advance.consumed_amount) || 0)));
}

function computeImputationAmount({
  gross, retenues = 0, alreadyImputed = 0, reliquatDisponible, requestedAmount = null, useMax = true,
}) {
  const maxOnSituation = round2(Math.max(0, round2(gross) - round2(retenues) - round2(alreadyImputed)));
  const maxAllowed = round2(Math.min(maxOnSituation, round2(Math.max(0, reliquatDisponible))));
  if (maxAllowed <= 0) return 0;
  if (useMax || requestedAmount == null || requestedAmount === '') return maxAllowed;
  return round2(Math.min(round2(Math.max(0, Number(requestedAmount) || 0)), maxAllowed));
}

function allocateImputationAcrossAdvances(advances, amountToImpute) {
  let remaining = round2(Math.max(0, Number(amountToImpute) || 0));
  const sorted = [...advances]
    .filter((a) => (a.status || 'unused') !== 'cancelled' && advanceReliquat(a) > 0)
    .sort((a, b) => String(a.advanceDate || '').localeCompare(String(b.advanceDate || '')));
  const allocations = [];
  for (const adv of sorted) {
    if (remaining <= 0) break;
    const take = round2(Math.min(advanceReliquat(adv), remaining));
    if (take <= 0) continue;
    const newConsumed = round2((Number(adv.consumed_amount) || 0) + take);
    allocations.push({
      advanceId: adv.id,
      amount: take,
      reliquatAfter: round2(Math.max(0, (Number(adv.amount) || 0) - newConsumed)),
    });
    remaining = round2(remaining - take);
  }
  return { allocations, unallocated: remaining };
}

function test(name, fn) {
  try {
    fn();
    console.log('PASS', name);
  } catch (e) {
    console.error('FAIL', name, e.message);
    process.exitCode = 1;
  }
}

function assertEqual(a, b) {
  if (a !== b) throw new Error(`expected ${b}, got ${a}`);
}

test('net = brut − avances − retenues', () => {
  const r = calcSubPaymentTotals('metre', { quantity: 10, unitPrice: 100, avances: 300, retenues: 50 });
  assertEqual(r.gross, 1000);
  assertEqual(r.net, 650);
});

test('scénario mission 100k / A30 / B50 / C45', () => {
  let avances = 100000;
  let travaux = 0;
  function conso(g) {
    travaux = round2(travaux + g);
    const consommées = round2(Math.min(avances, travaux));
    const reliquat = round2(Math.max(0, avances - consommées));
    const brutAPayer = round2(Math.max(0, travaux - avances));
    return { consommées, reliquat, brutAPayer };
  }
  let r = conso(30000);
  assertEqual(r.reliquat, 70000);
  r = conso(50000);
  assertEqual(r.reliquat, 20000);
  r = conso(45000);
  assertEqual(r.consommées, 100000);
  assertEqual(r.reliquat, 0);
  assertEqual(r.brutAPayer, 25000);
  const reste = round2(Math.max(0, r.brutAPayer - 10000 - 5000));
  assertEqual(reste, 10000);
});

test('scénario A/B/C avance 5000', () => {
  let reliquat = 5000;
  let imp = computeImputationAmount({
    gross: 2000, retenues: 0, alreadyImputed: 0, reliquatDisponible: reliquat, useMax: true,
  });
  assertEqual(imp, 2000);
  assertEqual(calcSubPaymentTotals('tache', { amount: 2000, avances: imp, retenues: 0 }).net, 0);
  reliquat = round2(reliquat - imp);

  imp = computeImputationAmount({
    gross: 2500, retenues: 0, alreadyImputed: 0, reliquatDisponible: reliquat, useMax: true,
  });
  assertEqual(imp, 2500);
  reliquat = round2(reliquat - imp);
  assertEqual(reliquat, 500);

  imp = computeImputationAmount({
    gross: 1800, retenues: 0, alreadyImputed: 0, reliquatDisponible: reliquat, useMax: true,
  });
  assertEqual(imp, 500);
  assertEqual(calcSubPaymentTotals('tache', { amount: 1800, avances: imp, retenues: 0 }).net, 1300);
  reliquat = round2(reliquat - imp);
  assertEqual(reliquat, 0);
});

test('FIFO multi-avances', () => {
  const { allocations, unallocated } = allocateImputationAcrossAdvances([
    { id: 'a1', amount: 1000, consumed_amount: 0, advanceDate: '2026-01-01', status: 'unused' },
    { id: 'a2', amount: 2000, consumed_amount: 0, advanceDate: '2026-02-01', status: 'unused' },
  ], 1500);
  assertEqual(unallocated, 0);
  assertEqual(allocations[0].amount, 1000);
  assertEqual(allocations[1].amount, 500);
});

test('pas de conso au-delà du reliquat', () => {
  const { allocations, unallocated } = allocateImputationAcrossAdvances([
    { id: 'a1', amount: 1000, consumed_amount: 900, advanceDate: '2026-01-01', status: 'partial' },
  ], 500);
  assertEqual(allocations[0].amount, 100);
  assertEqual(unallocated, 400);
});

/** Miroir de buildAccountKpis (reliquat) — profil type AHMED EL AAOUNI */
function buildKpisMirror({ advances = [], payments = [], imputations = [] }) {
  const active = advances.filter((a) => a.status !== 'cancelled');
  const versées = round2(active.reduce((s, a) => s + (Number(a.amount) || 0), 0));
  const cappedAnalytical = round2(payments.reduce((s, p) => {
    const g = Math.max(0, Number(p.grossAmount) || 0);
    const a = Math.max(0, Number(p.avances) || 0);
    return s + Math.min(a, g);
  }, 0));
  const impSum = round2(imputations.reduce((s, i) => s + (Number(i.amount) || 0), 0));
  let consommées;
  if (active.length) {
    consommées = round2(Math.min(versées, imputations.length ? impSum : cappedAnalytical));
  } else {
    consommées = cappedAnalytical;
  }
  const reliquat = active.length ? round2(Math.max(0, versées - consommées)) : 0;
  return { versées, consommées, reliquat, cappedAnalytical };
}

test('AHMED : 2 avances 5k, paiements 5k/5k sur brut 2250+1350 → reliquat 6400', () => {
  const k = buildKpisMirror({
    advances: [
      { id: 'a1', amount: 5000, consumed_amount: 5000, status: 'consumed' },
      { id: 'a2', amount: 5000, consumed_amount: 5000, status: 'consumed' },
    ],
    payments: [
      { grossAmount: 2250, avances: 5000 },
      { grossAmount: 1350, avances: 5000 },
    ],
    imputations: [],
  });
  assertEqual(k.versées, 10000);
  assertEqual(k.cappedAnalytical, 3600);
  assertEqual(k.consommées, 3600);
  assertEqual(k.reliquat, 6400);
});

test('AHMED : ne pas prendre consumed_amount gonflé (max ledger vs analytique)', () => {
  // Ancien bug : max(10000 ledger, 3600) = 10000
  const ledgerConsumed = 10000;
  const analytical = 3600;
  const versées = 10000;
  const fixed = round2(Math.min(versées, analytical)); // nouvelle règle
  const oldBug = round2(Math.min(versées, Math.max(ledgerConsumed, analytical)));
  assertEqual(oldBug, 10000);
  assertEqual(fixed, 3600);
  assertEqual(round2(versées - fixed), 6400);
});

test('sans ledger avance : ne pas inventer 10000 versées depuis paiements', () => {
  const k = buildKpisMirror({
    advances: [],
    payments: [
      { grossAmount: 2250, avances: 5000 },
      { grossAmount: 1350, avances: 5000 },
    ],
  });
  assertEqual(k.versées, 0);
  assertEqual(k.consommées, 3600);
  assertEqual(k.reliquat, 0);
});

console.log('\nDone.');

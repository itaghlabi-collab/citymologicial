/**
 * Tests fictifs — départ caisse 17/09/2026. Aucune écriture en production.
 * node src/services/finance/cashRestartLedger.test.js
 */
import {
  CASH_RESTART_DATE,
  findCashRestartTransaction,
  isCountedAfterRestart,
  splitCashAfterRestart,
  computeRestartMonthTotals,
  computeRestartGlobalTotals,
  isMonthEntirelyBeforeRestart,
} from './cashRestartLedger.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function close(a, b, msg) {
  assert(Math.abs(Number(a) - Number(b)) < 0.001, msg || `${a} !== ${b}`);
}

const restart = {
  id: 'restart-17',
  date: CASH_RESTART_DATE,
  description: 'REGULARISATION CAISSE',
  contrepartie: 'DIVERS',
  sens: 'sortie',
  montant: 12253.78,
  created_at: '2026-09-17T10:00:00.000Z',
  statut: 'Validé',
};

const beforeSameDay = {
  id: 'before-17',
  date: CASH_RESTART_DATE,
  description: 'Charge matin',
  sens: 'sortie',
  montant: 10,
  created_at: '2026-09-17T08:00:00.000Z',
  statut: 'Validé',
};

const afterSameDay = {
  id: 'after-17',
  date: CASH_RESTART_DATE,
  description: 'Alimentation après régularisation',
  sens: 'entree',
  montant: 50,
  created_at: '2026-09-17T12:00:00.000Z',
  statut: 'Validé',
};

const alim = {
  id: 'alim-1000',
  date: '2026-09-18',
  description: 'Alimentation caisse',
  sens: 'entree',
  montant: 1000,
  created_at: '2026-09-18T09:00:00.000Z',
  statut: 'Validé',
};

const sortie = {
  id: 'out-200',
  date: '2026-09-20',
  description: 'Charge',
  sens: 'sortie',
  montant: 200,
  created_at: '2026-09-20T09:00:00.000Z',
  statut: 'Validé',
};

const august = {
  id: 'aug',
  date: '2026-08-31',
  description: 'Ancienne charge',
  sens: 'sortie',
  montant: 420,
  created_at: '2026-08-31T09:00:00.000Z',
  statut: 'Validé',
};

const found = findCashRestartTransaction([august, beforeSameDay, restart, afterSameDay, alim, sortie]);
assert(found.restart?.id === 'restart-17', 'écriture 17/09 identifiée');
assert(found.ambiguous === false, 'une seule régularisation');
assert(!isCountedAfterRestart(restart, found.restart), 'la régularisation est hors calcul');
assert(!isCountedAfterRestart(beforeSameDay, found.restart), 'même jour avant = historique');
assert(isCountedAfterRestart(afterSameDay, found.restart), 'même jour après = comptabilisé');
assert(isCountedAfterRestart(alim, found.restart), '18/09 comptabilisé');
assert(!isCountedAfterRestart(august, found.restart), 'août = historique');

const { counted, history } = splitCashAfterRestart(
  [august, beforeSameDay, restart, afterSameDay, alim, sortie],
  found.restart,
);
assert(history.some((t) => t.id === 'restart-17'), 'régularisation conservée en historique');
assert(history.some((t) => t.id === 'aug'), 'août en historique');
assert(!counted.some((t) => t.id === 'restart-17'), 'régularisation absente des calculs');

const emptySept = computeRestartMonthTotals([], 2026, 9);
close(emptySept.soldeInitial, 0, 'sans nouvelle op, reliquat 0');
close(emptySept.totalEntrees, 0, 'sans nouvelle op, entrées 0');
close(emptySept.totalSorties, 0, 'sans nouvelle op, sorties 0');
close(emptySept.soldeMois, 0, 'sans nouvelle op, solde 0');

const scenarioCounted = [alim, sortie];
const sept = computeRestartMonthTotals(scenarioCounted, 2026, 9);
close(sept.soldeInitial, 0, 'sept reliquat 0');
close(sept.totalEntrees, 1000, 'alimentation 1000');
close(sept.totalSorties, 200, 'sortie 200');
close(sept.soldeMois, 800, 'solde 800');

const oct = computeRestartMonthTotals(scenarioCounted, 2026, 10);
close(oct.soldeInitial, 800, 'reliquat octobre = 800');
close(oct.totalEntrees, 0, 'octobre sans entrée');
close(oct.totalSorties, 0, 'octobre sans sortie');
close(oct.soldeMois, 800, 'solde octobre 800, pas de reset mensuel');

const glob = computeRestartGlobalTotals(scenarioCounted);
close(glob.soldeInitial, 0, 'vue globale reliquat 0');
close(glob.totalEntrees, 1000, 'vue globale entrées');
close(glob.totalSorties, 200, 'vue globale sorties');
close(glob.soldeMois, 800, 'vue globale solde 800');

const restart2 = { ...restart, id: 'restart-17-b', created_at: '2026-09-17T11:00:00.000Z' };
const amb = findCashRestartTransaction([restart2, restart]);
assert(amb.ambiguous === true, 'plusieurs régularisations = ambigu');
assert(amb.restart?.id === 'restart-17', 'limite = la plus ancienne');

assert(isMonthEntirelyBeforeRestart(2026, 8), 'août hors calcul');
assert(!isMonthEntirelyBeforeRestart(2026, 9), 'septembre contient le départ');

const augTotals = computeRestartMonthTotals(scenarioCounted, 2026, 8);
close(augTotals.soldeInitial, 0, 'août cartes à zéro');
close(augTotals.soldeMois, 0, 'août solde zéro');

console.log('cashRestartLedger.test.js OK');

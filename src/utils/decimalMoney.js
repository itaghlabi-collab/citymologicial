/**
 * decimalMoney.js — Calculs monétaires en décimal (évite les erreurs float JS)
 */
import Big from 'big.js';

function toBig(v) {
  if (v === null || v === undefined || v === '') return new Big(0);
  if (typeof v === 'number') return new Big(Number.isFinite(v) ? v : 0);
  const s = String(v).trim().replace(',', '.');
  if (!s) return new Big(0);
  try {
    return new Big(s);
  } catch {
    return new Big(0);
  }
}

export function moneyLineHt({ qty, unitPriceHt, remisePct }) {
  const q = toBig(qty);
  const pu = toBig(unitPriceHt);
  const remise = toBig(remisePct);
  const base = q.times(pu);
  const factor = new Big(1).minus(remise.div(100));
  return base.times(factor);
}

export function moneyVatFromHt(ht, tvaPct) {
  return toBig(ht).times(toBig(tvaPct).div(100));
}

export function moneyRound2(big) {
  return toBig(big).round(2, Big.roundHalfUp);
}

export function moneyToNumber2(big) {
  return Number(moneyRound2(big).toString());
}


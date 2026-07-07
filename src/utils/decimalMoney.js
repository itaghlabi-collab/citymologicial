/**
 * decimalMoney.js — Calculs monétaires en décimal (évite les erreurs float JS)
 *
 * Règle commerciale CITYMO :
 * 1. PU HT net = PU HT × (1 - remise%)
 * 2. PU TTC = arrondi(PU HT net × (1 + TVA%), 2 décimales)  → ex: 7,33333 → 8,80
 * 3. Total ligne TTC = Qté × PU TTC (arrondi 2 déc.)
 * 4. Total ligne HT  = Qté × PU HT net (arrondi 2 déc.)
 * 5. TVA document    = Σ TTC - Σ HT
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

export function moneyRound2(big) {
  return toBig(big).round(2, Big.roundHalfUp);
}

export function moneyToNumber2(big) {
  return Number(moneyRound2(big).toString());
}

/** PU HT après remise */
export function moneyUnitHtNet(unitPriceHt, remisePct = 0) {
  const pu = toBig(unitPriceHt);
  const remise = toBig(remisePct);
  return pu.times(new Big(1).minus(remise.div(100)));
}

/** PU TTC arrondi à 2 déc. (règle commerciale) */
export function moneyUnitTtc(unitPriceHt, tvaPct, remisePct = 0) {
  const unitHtNet = moneyUnitHtNet(unitPriceHt, remisePct);
  const tva = toBig(tvaPct);
  return moneyRound2(unitHtNet.times(new Big(1).plus(tva.div(100))));
}

/** Total ligne HT arrondi */
export function moneyLineHt({ qty, unitPriceHt, remisePct }) {
  const q = toBig(qty);
  const unitHtNet = moneyUnitHtNet(unitPriceHt, remisePct);
  return moneyRound2(q.times(unitHtNet));
}

/** Total ligne TTC = Qté × PU TTC arrondi */
export function moneyLineTtc({ qty, unitPriceHt, tvaPct, remisePct }) {
  const q = toBig(qty);
  const unitTtc = moneyUnitTtc(unitPriceHt, tvaPct, remisePct);
  return moneyRound2(q.times(unitTtc));
}

/** @deprecated — utiliser moneyLineHt */
export function moneyVatFromHt(ht, tvaPct) {
  return toBig(ht).times(toBig(tvaPct).div(100));
}

/** Totaux document : HT, TVA, TTC (règle commerciale) */
export function moneyComputeDocumentTotals(lines, mapLine) {
  let sumHt = new Big(0);
  let sumTtc = new Big(0);

  for (const line of lines || []) {
    const p = mapLine(line);
    if (!p) continue;
    const { qty, unitPriceHt, tvaPct, remisePct } = p;
    sumHt = sumHt.plus(moneyLineHt({ qty, unitPriceHt, remisePct }));
    sumTtc = sumTtc.plus(moneyLineTtc({ qty, unitPriceHt, tvaPct, remisePct }));
  }

  const subtotal_ht = moneyToNumber2(sumHt);
  const total_ttc = moneyToNumber2(sumTtc);
  const total_vat = moneyToNumber2(moneyRound2(sumTtc.minus(sumHt)));

  return { subtotal_ht, total_ht: subtotal_ht, total_vat, total_ttc };
}

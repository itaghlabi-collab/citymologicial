/**
 * decimalMoney.js — Calculs monétaires en décimal (évite les erreurs float JS)
 *
 * Règle CITYMO : conserver la précision saisie, sans arrondi intermédiaire.
 * - PU HT net = PU HT × (1 - remise%)
 * - Total ligne HT  = Qté × PU HT net
 * - PU TTC          = PU HT net × (1 + TVA%)
 * - Total ligne TTC = Qté × PU TTC
 * - TVA document    = Σ TTC - Σ HT
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

/** Arrondi à 2 déc. — uniquement si besoin explicite (ex. paiements arrondis) */
export function moneyRound2(big) {
  return toBig(big).round(2, Big.roundHalfUp);
}

/** Convertit Big → Number en conservant la précision décimale (via chaîne) */
export function moneyToNumber(big) {
  return Number(toBig(big).toString());
}

/** @deprecated — préférer moneyToNumber pour conserver la précision */
export function moneyToNumber2(big) {
  return moneyToNumber(big);
}

/** Affiche un montant MAD en conservant les décimales exactes (ex: 8,88888 MAD) */
export function moneyFormatMAD(value) {
  const str = toBig(value).toString();
  const neg = str.startsWith('-');
  const abs = neg ? str.slice(1) : str;
  const [intPart, decPart] = abs.split('.');
  const intFmt = Number(intPart || 0).toLocaleString('fr-FR');
  const body = decPart ? `${intFmt},${decPart}` : intFmt;
  return `${neg ? '-' : ''}${body} MAD`;
}

/** PU HT après remise */
export function moneyUnitHtNet(unitPriceHt, remisePct = 0) {
  const pu = toBig(unitPriceHt);
  const remise = toBig(remisePct);
  return pu.times(new Big(1).minus(remise.div(100)));
}

/** PU TTC (sans arrondi) */
export function moneyUnitTtc(unitPriceHt, tvaPct, remisePct = 0) {
  const unitHtNet = moneyUnitHtNet(unitPriceHt, remisePct);
  const tva = toBig(tvaPct);
  return unitHtNet.times(new Big(1).plus(tva.div(100)));
}

/** Total ligne HT = Qté × PU HT net */
export function moneyLineHt({ qty, unitPriceHt, remisePct }) {
  const q = toBig(qty);
  const unitHtNet = moneyUnitHtNet(unitPriceHt, remisePct);
  return q.times(unitHtNet);
}

/** Total ligne TTC = Qté × PU TTC */
export function moneyLineTtc({ qty, unitPriceHt, tvaPct, remisePct }) {
  const q = toBig(qty);
  const unitTtc = moneyUnitTtc(unitPriceHt, tvaPct, remisePct);
  return q.times(unitTtc);
}

/** @deprecated */
export function moneyVatFromHt(ht, tvaPct) {
  return toBig(ht).times(toBig(tvaPct).div(100));
}

/** Totaux document : HT, TVA, TTC (précision exacte) */
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

  const subtotal_ht = moneyToNumber(sumHt);
  const total_ttc = moneyToNumber(sumTtc);
  const total_vat = moneyToNumber(sumTtc.minus(sumHt));

  return { subtotal_ht, total_ht: subtotal_ht, total_vat, total_ttc };
}

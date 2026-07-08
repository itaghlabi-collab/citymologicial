/**
 * decimalMoney.js — Calculs monétaires en décimal (évite les erreurs float JS)
 *
 * Règle CITYMO / MAD (centimes) :
 * 1. Total ligne HT = arrondi_2(Qté × PU HT net)
 * 2. Sous-total HT  = somme des totaux lignes HT
 * 3. Par taux TVA   : Total TTC = arrondi_2(HT × (1 + taux%))
 *                     TVA       = TTC − HT
 * 4. Totaux doc     = sommes des HT / TVA / TTC
 *
 * Exemple BC TTC 5 600 :
 *   4 × 750    → 3 000,00
 *   8 × 208,33 → 1 666,64
 *   HT         = 4 666,64
 *   TTC 20 %   = arrondi(4 666,64 × 1,2) = 5 600,00
 *   TVA        = 5 600,00 − 4 666,64 = 933,36
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

/** Arrondi monétaire MAD (2 décimales, half-up) */
export function moneyRound2(big) {
  return toBig(big).round(2, Big.roundHalfUp);
}

/** Convertit Big → Number via string (pas de float drift) */
export function moneyToNumber(big) {
  return Number(toBig(big).toString());
}

/** @deprecated */
export function moneyToNumber2(big) {
  return Number(moneyRound2(big).toString());
}

/** Affiche un montant MAD arrondi à 2 décimales */
export function moneyFormatMAD(value) {
  const str = moneyRound2(value).toFixed(2);
  const neg = str.startsWith('-');
  const abs = neg ? str.slice(1) : str;
  const [intPart, decPart] = abs.split('.');
  const intFmt = Number(intPart || 0).toLocaleString('fr-FR');
  return `${neg ? '-' : ''}${intFmt},${decPart} MAD`;
}

/** Affiche un PU en conservant la précision saisie */
export function moneyFormatUnitPrice(value) {
  const str = toBig(value).toString();
  const neg = str.startsWith('-');
  const abs = neg ? str.slice(1) : str;
  const [intPart, decPart] = abs.split('.');
  const intFmt = Number(intPart || 0).toLocaleString('fr-FR');
  const body = decPart ? `${intFmt},${decPart}` : intFmt;
  return `${neg ? '-' : ''}${body} MAD`;
}

/** PU HT après remise (précision exacte) */
export function moneyUnitHtNet(unitPriceHt, remisePct = 0) {
  const pu = toBig(unitPriceHt);
  const remise = toBig(remisePct);
  return pu.times(new Big(1).minus(remise.div(100)));
}

/** PU TTC (précision exacte) */
export function moneyUnitTtc(unitPriceHt, tvaPct, remisePct = 0) {
  const unitHtNet = moneyUnitHtNet(unitPriceHt, remisePct);
  const tva = toBig(tvaPct);
  return unitHtNet.times(new Big(1).plus(tva.div(100)));
}

/** Total ligne HT = arrondi_2(Qté × PU HT net) */
export function moneyLineHt({ qty, unitPriceHt, remisePct }) {
  const q = toBig(qty);
  const unitHtNet = moneyUnitHtNet(unitPriceHt, remisePct);
  return moneyRound2(q.times(unitHtNet));
}

/** Total ligne TTC = arrondi_2(HT ligne × (1 + TVA%)) */
export function moneyLineTtc({ qty, unitPriceHt, tvaPct, remisePct }) {
  const ht = moneyLineHt({ qty, unitPriceHt, remisePct });
  return moneyRound2(ht.times(new Big(1).plus(toBig(tvaPct).div(100))));
}

/** @deprecated */
export function moneyVatFromHt(ht, tvaPct) {
  const h = moneyRound2(ht);
  const ttc = moneyRound2(h.times(new Big(1).plus(toBig(tvaPct).div(100))));
  return moneyRound2(ttc.minus(h));
}

/**
 * Totaux document MAD :
 * HT par ligne → TTC = arrondi_2(HT × (1+taux)) par taux → TVA = TTC − HT
 */
export function moneyComputeDocumentTotals(lines, mapLine) {
  const htByRate = new Map();

  for (const line of lines || []) {
    const p = mapLine(line);
    if (!p) continue;
    const { qty, unitPriceHt, tvaPct, remisePct } = p;
    const ht = moneyLineHt({ qty, unitPriceHt, remisePct });
    const rateKey = toBig(tvaPct).toString();
    const prev = htByRate.get(rateKey) || new Big(0);
    htByRate.set(rateKey, prev.plus(ht));
  }

  let sumHt = new Big(0);
  let sumVat = new Big(0);
  let sumTtc = new Big(0);

  for (const [rateKey, htRaw] of htByRate.entries()) {
    const ht = moneyRound2(htRaw);
    const ttc = moneyRound2(ht.times(new Big(1).plus(toBig(rateKey).div(100))));
    const vat = moneyRound2(ttc.minus(ht));
    sumHt = sumHt.plus(ht);
    sumVat = sumVat.plus(vat);
    sumTtc = sumTtc.plus(ttc);
  }

  const subtotal_ht = moneyToNumber(moneyRound2(sumHt));
  const total_vat = moneyToNumber(moneyRound2(sumVat));
  const total_ttc = moneyToNumber(moneyRound2(sumTtc));

  return { subtotal_ht, total_ht: subtotal_ht, total_vat, total_ttc };
}

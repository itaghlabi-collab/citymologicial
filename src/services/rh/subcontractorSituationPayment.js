/**
 * Enregistrement d’une situation + paiement + imputation avance.
 * Réutilise createPayment (formule net existante) — aucune formule parallèle.
 */
import { createPayment, subcontractorFullName, getSubcontractor } from './subcontractors';
import { createSituation, patchSituationTotals, deriveAndSetSituationStatus, getSituation } from './subcontractorSituations';
import { imputeAdvanceOnSituation, listGlobalAdvances, summarizeAdvances } from './subcontractorAdvances';
import { computeSituationPaymentResult, computeImputationAmount, totalAdvanceReliquat } from './subcontractorAdvanceMath';
import { logSubcontractorAccountEvent } from './subcontractorAccountEvents';
import { paymentStatusToDb } from './subcontractorConstants';

/**
 * @param {object} input
 * @param {'auto'|'manual'|'none'} input.advanceMode
 */
export async function createSituationAndPayment(input) {
  const {
    subcontractorId,
    projectId,
    assignmentId,
    reference,
    designation,
    paymentType = 'metre',
    quantity,
    unit,
    unitPrice,
    amount,
    retenues = 0,
    otherDeductions = 0,
    paymentMethod = 'virement',
    paymentDate,
    statusUi = 'Payé',
    description = '',
    notes = '',
    advanceMode = 'auto',
    advanceManualAmount = null,
  } = input;

  const totalsPreview = computeSituationPaymentResult({
    paymentType,
    quantity,
    unitPrice,
    amount,
    avances: 0,
    retenues: Number(retenues) || 0,
  });
  const totalRetenues = Math.round(((Number(retenues) || 0) + (Number(otherDeductions) || 0)) * 100) / 100;

  // 1) Situation
  const situation = await createSituation(subcontractorId, {
    projectId,
    assignmentId,
    reference: reference || `SIT-${Date.now().toString(36).toUpperCase()}`,
    designation,
    paymentType,
    quantity,
    unit,
    unitPrice,
    grossAmount: totalsPreview.gross,
    retenues: totalRetenues,
    avancesImputees: 0,
    amountPaid: 0,
    status: 'in_progress',
    situationDate: paymentDate || new Date().toISOString().slice(0, 10),
    notes,
  });

  // 2) Imputation avance (analytique, avant paiement) — mode none = 0
  let imputed = 0;
  let reliquatAfter = 0;
  if (advanceMode !== 'none') {
    const advances = await listGlobalAdvances(subcontractorId);
    const reliquat = totalAdvanceReliquat(advances);
    const want = computeImputationAmount({
      gross: situation.grossAmount,
      retenues: totalRetenues,
      alreadyImputed: 0,
      reliquatDisponible: reliquat,
      requestedAmount: advanceMode === 'manual' ? advanceManualAmount : null,
      useMax: advanceMode === 'auto',
    });
    if (want > 0) {
      const res = await imputeAdvanceOnSituation({
        subcontractorId,
        situationId: situation.id,
        requestedAmount: want,
        useMax: false,
        observation: `Imputation sur situation ${situation.reference}`,
      });
      imputed = res.imputed;
      reliquatAfter = res.reliquatAfter;
    } else {
      reliquatAfter = reliquat;
    }
  } else {
    const advances = await listGlobalAdvances(subcontractorId);
    reliquatAfter = summarizeAdvances(advances).reliquatAvance;
  }

  // 3) Paiement via pipeline existant (net = brut − avances − retenues)
  const status = paymentStatusToDb(statusUi) || 'paid';
  const payment = await createPayment(subcontractorId, {
    projectId,
    assignmentId,
    situationId: situation.id,
    paymentDate: paymentDate || new Date().toISOString().slice(0, 10),
    paymentType,
    designation,
    quantity,
    unit,
    unitPrice,
    amount: totalsPreview.gross,
    grossAmount: totalsPreview.gross,
    avances: imputed,
    retenues: totalRetenues,
    paymentMethod,
    reference: reference || situation.reference,
    description: description || designation,
    status,
    notes,
  });

  // 4) Totaux situation
  const paidNet = status === 'paid' ? (Number(payment.amount) || 0) : 0;
  await patchSituationTotals(situation.id, {
    avancesImputees: imputed,
    retenues: totalRetenues,
    amountPaid: paidNet,
  });
  const finalSit = await deriveAndSetSituationStatus(situation.id);

  await logSubcontractorAccountEvent({
    subcontractorId,
    eventType: 'payment',
    projectId,
    situationId: situation.id,
    paymentId: payment.id,
    amount: payment.amount,
    reference: payment.reference,
    observation: designation,
  });

  if (totalRetenues > 0) {
    await logSubcontractorAccountEvent({
      subcontractorId,
      eventType: 'retention',
      projectId,
      situationId: situation.id,
      paymentId: payment.id,
      amount: totalRetenues,
      reference: payment.reference,
    });
  }

  return {
    situation: finalSit || await getSituation(situation.id),
    payment,
    imputed,
    reliquatAfter,
    netPaid: Number(payment.amount) || 0,
  };
}

export async function previewSituationCalculation(input) {
  const advances = input.subcontractorId
    ? await listGlobalAdvances(input.subcontractorId).catch(() => [])
    : [];
  const summary = summarizeAdvances(advances);
  const retenues = Math.round(((Number(input.retenues) || 0) + (Number(input.otherDeductions) || 0)) * 100) / 100;
  const base = computeSituationPaymentResult({
    paymentType: input.paymentType || 'metre',
    quantity: input.quantity,
    unitPrice: input.unitPrice,
    amount: input.amount,
    avances: 0,
    retenues,
  });
  let avances = 0;
  if (input.advanceMode === 'auto') {
    avances = computeImputationAmount({
      gross: base.gross,
      retenues,
      alreadyImputed: 0,
      reliquatDisponible: summary.reliquatAvance,
      useMax: true,
    });
  } else if (input.advanceMode === 'manual') {
    avances = computeImputationAmount({
      gross: base.gross,
      retenues,
      alreadyImputed: 0,
      reliquatDisponible: summary.reliquatAvance,
      requestedAmount: input.advanceManualAmount,
      useMax: false,
    });
  }
  const result = computeSituationPaymentResult({
    paymentType: input.paymentType || 'metre',
    quantity: input.quantity,
    unitPrice: input.unitPrice,
    amount: input.amount,
    avances,
    retenues,
  });
  return {
    ...result,
    ...summary,
    reliquatApres: Math.round((summary.reliquatAvance - avances) * 100) / 100,
    soldeSituationApres: result.net,
  };
}

export { getSubcontractor, subcontractorFullName };

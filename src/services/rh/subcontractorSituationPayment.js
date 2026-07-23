/**
 * Enregistrement d’une situation + paiement + imputation avance.
 * Réutilise createPayment (formule net existante) — aucune formule parallèle.
 * Multi-projets : plusieurs lignes partagent le même groupId / référence.
 */
import { createPayment, subcontractorFullName, getSubcontractor } from './subcontractors';
import { createSituation, patchSituationTotals, deriveAndSetSituationStatus } from './subcontractorSituations';
import { imputeAdvanceOnSituation, listGlobalAdvances, summarizeAdvances } from './subcontractorAdvances';
import { computeSituationPaymentResult, computeImputationAmount, totalAdvanceReliquat, round2 } from './subcontractorAdvanceMath';
import { logSubcontractorAccountEvent } from './subcontractorAccountEvents';
import { paymentStatusToDb } from './subcontractorConstants';

function newGroupId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `grp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * @param {object} input
 * @param {'auto'|'manual'|'none'} input.advanceMode
 * @param {string} [input.groupId] — même situation multi-projets
 * @param {number} [input.advanceBudget] — plafond d’imputation restant (multi-lignes)
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
    groupId = null,
    advanceBudget = null,
  } = input;

  const totalsPreview = computeSituationPaymentResult({
    paymentType,
    quantity,
    unitPrice,
    amount,
    avances: 0,
    retenues: Number(retenues) || 0,
  });
  const totalRetenues = round2((Number(retenues) || 0) + (Number(otherDeductions) || 0));

  let situation = null;
  try {
    situation = await createSituation(subcontractorId, {
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
      groupId: groupId || null,
    });
  } catch (err) {
    // Table situations absente → paiement seul (rétrocompat)
    console.warn('[CITYMO] situation skip', err?.message || err);
  }

  let imputed = 0;
  let reliquatAfter = 0;
  const advances = await listGlobalAdvances(subcontractorId).catch(() => []);
  const reliquatLedger = totalAdvanceReliquat(advances);
  const reliquatCap = advanceBudget != null
    ? Math.min(reliquatLedger, Math.max(0, Number(advanceBudget) || 0))
    : reliquatLedger;

  if (advanceMode !== 'none' && situation?.id) {
    const want = computeImputationAmount({
      gross: situation.grossAmount,
      retenues: totalRetenues,
      alreadyImputed: 0,
      reliquatDisponible: reliquatCap,
      requestedAmount: advanceMode === 'manual' ? advanceManualAmount : null,
      useMax: advanceMode === 'auto' || (advanceMode === 'manual' && advanceManualAmount == null),
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
      reliquatAfter = reliquatLedger;
    }
  } else if (advanceMode !== 'none' && !situation) {
    imputed = computeImputationAmount({
      gross: totalsPreview.gross,
      retenues: totalRetenues,
      alreadyImputed: 0,
      reliquatDisponible: reliquatCap,
      requestedAmount: advanceMode === 'manual' ? advanceManualAmount : null,
      useMax: advanceMode !== 'manual' || advanceManualAmount == null,
    });
    reliquatAfter = round2(Math.max(0, reliquatLedger - imputed));
  } else {
    reliquatAfter = summarizeAdvances(advances).reliquatAvance;
  }

  const status = paymentStatusToDb(statusUi) || 'paid';
  const payment = await createPayment(subcontractorId, {
    projectId,
    assignmentId,
    situationId: situation?.id || undefined,
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
    reference: reference || situation?.reference,
    description: description || designation,
    status,
    notes,
  });

  if (situation?.id) {
    const paidNet = status === 'paid' ? (Number(payment.amount) || 0) : 0;
    await patchSituationTotals(situation.id, {
      avancesImputees: imputed,
      retenues: totalRetenues,
      amountPaid: paidNet,
    });
    situation = await deriveAndSetSituationStatus(situation.id);
  }

  await logSubcontractorAccountEvent({
    subcontractorId,
    eventType: 'payment',
    projectId,
    situationId: situation?.id || null,
    paymentId: payment.id,
    amount: payment.amount,
    reference: payment.reference,
    observation: designation,
  }).catch(() => {});

  return {
    situation,
    payment,
    imputed,
    reliquatAfter,
    netPaid: Number(payment.amount) || 0,
    groupId: groupId || situation?.groupId || null,
  };
}

/**
 * Une même « situation » multi-projets : N lignes (projets), 1 groupId, avance FIFO.
 */
export async function createMultiProjectSituation(input) {
  const lines = (input.lines || []).filter((l) => l && l.projectId);
  if (!input.subcontractorId || !lines.length) {
    const err = new Error('Sous-traitant et au moins une ligne projet requis.');
    err.code = 'VALIDATION';
    throw err;
  }

  const groupId = input.groupId || newGroupId();
  const baseRef = (input.reference || '').trim() || `SIT-${Date.now().toString(36).toUpperCase()}`;
  const results = [];
  let manualLeft = input.advanceMode === 'manual'
    ? Math.max(0, Number(input.advanceManualAmount) || 0)
    : null;

  const advances0 = await listGlobalAdvances(input.subcontractorId).catch(() => []);
  let budget = totalAdvanceReliquat(advances0);
  if (input.advanceMode === 'none') budget = 0;
  if (input.advanceMode === 'manual') budget = Math.min(budget, manualLeft ?? 0);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const lineManual = input.advanceMode === 'manual'
      ? Math.min(manualLeft ?? 0, budget)
      : null;
    const res = await createSituationAndPayment({
      subcontractorId: input.subcontractorId,
      projectId: line.projectId,
      assignmentId: line.assignmentId || '',
      reference: lines.length > 1 ? `${baseRef}-${i + 1}` : baseRef,
      designation: line.designation,
      paymentType: line.paymentType || input.paymentType || 'metre',
      quantity: line.quantity,
      unit: line.unit,
      unitPrice: line.unitPrice,
      amount: line.amount,
      retenues: line.retenues ?? input.retenues ?? 0,
      otherDeductions: line.otherDeductions ?? 0,
      paymentMethod: input.paymentMethod || 'virement',
      paymentDate: input.paymentDate,
      statusUi: input.statusUi || 'Payé',
      description: input.description || '',
      notes: input.notes || '',
      advanceMode: input.advanceMode === 'none' ? 'none' : (input.advanceMode === 'manual' ? 'manual' : 'auto'),
      advanceManualAmount: lineManual,
      groupId,
      advanceBudget: budget,
    });
    results.push(res);
    budget = round2(Math.max(0, budget - (res.imputed || 0)));
    if (manualLeft != null) manualLeft = round2(Math.max(0, manualLeft - (res.imputed || 0)));
  }

  const netPaid = round2(results.reduce((s, r) => s + (Number(r.netPaid) || 0), 0));
  const imputed = round2(results.reduce((s, r) => s + (Number(r.imputed) || 0), 0));
  return {
    groupId,
    reference: baseRef,
    results,
    netPaid,
    imputed,
    reliquatAfter: results[results.length - 1]?.reliquatAfter ?? 0,
  };
}

export async function previewSituationCalculation(input) {
  const advances = input.subcontractorId
    ? await listGlobalAdvances(input.subcontractorId).catch(() => [])
    : [];
  const summary = summarizeAdvances(advances);
  const lines = Array.isArray(input.lines) && input.lines.length
    ? input.lines
    : [input];

  let gross = 0;
  let retenues = 0;
  let avances = 0;
  let reliquatLeft = summary.reliquatAvance;
  if (input.advanceMode === 'none') reliquatLeft = 0;
  if (input.advanceMode === 'manual') {
    reliquatLeft = Math.min(reliquatLeft, Math.max(0, Number(input.advanceManualAmount) || 0));
  }

  const linePreviews = lines.map((line) => {
    // retenues déjà réparties par l’appelant (souvent 1ʳᵉ ligne seulement)
    const ret = round2((Number(line.retenues) || 0) + (Number(line.otherDeductions) || 0));
    const base = computeSituationPaymentResult({
      paymentType: line.paymentType || input.paymentType || 'metre',
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      amount: line.amount,
      avances: 0,
      retenues: ret,
    });
    let av = 0;
    if (input.advanceMode !== 'none') {
      av = computeImputationAmount({
        gross: base.gross,
        retenues: ret,
        alreadyImputed: 0,
        reliquatDisponible: reliquatLeft,
        useMax: true,
      });
      reliquatLeft = round2(Math.max(0, reliquatLeft - av));
    }
    const result = computeSituationPaymentResult({
      paymentType: line.paymentType || input.paymentType || 'metre',
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      amount: line.amount,
      avances: av,
      retenues: ret,
    });
    gross = round2(gross + result.gross);
    retenues = round2(retenues + result.retenues);
    avances = round2(avances + result.avances);
    return result;
  });

  const net = round2(Math.max(0, gross - avances - retenues));
  return {
    gross,
    avances,
    retenues,
    net,
    linePreviews,
    ...summary,
    reliquatApres: round2(Math.max(0, summary.reliquatAvance - avances)),
    soldeSituationApres: net,
    lineCount: lines.length,
  };
}

export { getSubcontractor, subcontractorFullName };

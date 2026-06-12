import { PAYMENT_TYPES } from '../../services/rh/subcontractorConstants';

export const EMPTY_SUB_PAYMENT = {
  projectId: '',
  paymentDate: new Date().toISOString().slice(0, 10),
  paymentType: 'metre',
  paymentMethod: 'virement',
  reference: '',
  description: '',
  statusUi: 'En attente',
  selected: {},
};

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function calcSubPaymentAmount(type, line) {
  if (type === 'metre') {
    return round2((Number(line.quantity) || 0) * (Number(line.unitPrice) || 0));
  }
  return round2(Number(line.amount) || 0);
}

/** Montant brut, avances, retenues, net pour une ligne sous-traitant */
export function calcSubPaymentTotals(paymentType, line) {
  const gross = calcSubPaymentAmount(paymentType, line);
  const avances = round2(Number(line.avances) || 0);
  const retenues = round2(Number(line.retenues) || 0);
  const net = round2(Math.max(0, gross - avances - retenues));
  return { gross, avances, retenues, net };
}

export function paymentTypeLabel(type) {
  return PAYMENT_TYPES.find((t) => t.id === type)?.label || type || '—';
}

export function validateSubcontractorPaymentForm(form, paymentSelectedLines) {
  const err = {};
  if (!form.projectId) err.projectId = 'Projet requis';
  if (!form.paymentDate) err.paymentDate = 'Date requise';
  if (!paymentSelectedLines.length) err.selected = 'Sélectionnez au moins un sous-traitant';
  paymentSelectedLines.forEach((l) => {
    const key = l.lineKey || l.assignmentId;
    const totals = calcSubPaymentTotals(form.paymentType, l);
    if (form.paymentType === 'metre') {
      if (!l.designation?.trim()) err[`d_${key}`] = 'Désignation requise';
      if (!l.quantity || Number(l.quantity) <= 0) err[`q_${key}`] = 'Quantité requise';
      if (!l.unitPrice || Number(l.unitPrice) <= 0) err[`p_${key}`] = 'Prix unitaire requis';
    } else if (form.paymentType === 'tache') {
      if (!l.designation?.trim()) err[`d_${key}`] = 'Tâche requise';
      if (!l.amount || Number(l.amount) <= 0) err[`a_${key}`] = 'Montant requis';
    } else {
      if (!l.designation?.trim()) err[`d_${key}`] = 'Description requise';
      if (!l.amount || Number(l.amount) <= 0) err[`a_${key}`] = 'Montant requis';
    }
    if (totals.gross <= 0) err[`g_${key}`] = 'Montant brut requis';
  });
  return err;
}

export function buildSubcontractorPaymentPayload(form, paymentSelectedLines, paymentStatusToDb) {
  const shared = {
    paymentDate: form.paymentDate,
    paymentType: form.paymentType,
    paymentMethod: form.paymentMethod,
    reference: form.reference,
    description: form.description,
    status: paymentStatusToDb(form.statusUi),
  };
  const lines = paymentSelectedLines.map((l) => {
    const totals = calcSubPaymentTotals(form.paymentType, l);
    return {
      subcontractorId: l.subcontractorId,
      assignmentId: l.assignmentId || null,
      designation: l.designation,
      lineDescription: l.lineDescription,
      quantity: l.quantity,
      unit: l.unit,
      unitPrice: l.unitPrice,
      amount: l.amount,
      grossAmount: totals.gross,
      avances: totals.avances,
      retenues: totals.retenues,
      netAmount: totals.net,
    };
  });
  return { shared, lines };
}

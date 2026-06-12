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

export function calcSubPaymentAmount(type, line) {
  if (type === 'metre') {
    return Math.round((Number(line.quantity) || 0) * (Number(line.unitPrice) || 0) * 100) / 100;
  }
  return Math.round((Number(line.amount) || 0) * 100) / 100;
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
    if (form.paymentType === 'metre') {
      if (!l.designation?.trim()) err[`d_${l.assignmentId}`] = 'Désignation requise';
      if (!l.quantity || Number(l.quantity) <= 0) err[`q_${l.assignmentId}`] = 'Quantité requise';
      if (!l.unitPrice || Number(l.unitPrice) <= 0) err[`p_${l.assignmentId}`] = 'Prix unitaire requis';
    } else if (form.paymentType === 'tache') {
      if (!l.designation?.trim()) err[`d_${l.assignmentId}`] = 'Tâche requise';
      if (!l.amount || Number(l.amount) <= 0) err[`a_${l.assignmentId}`] = 'Montant requis';
    } else {
      if (!l.designation?.trim()) err[`d_${l.assignmentId}`] = 'Description requise';
      if (!l.amount || Number(l.amount) <= 0) err[`a_${l.assignmentId}`] = 'Montant requis';
    }
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
  const lines = paymentSelectedLines.map((l) => ({
    subcontractorId: l.subcontractorId,
    assignmentId: l.assignmentId,
    designation: l.designation,
    quantity: l.quantity,
    unit: l.unit,
    unitPrice: l.unitPrice,
    amount: calcSubPaymentAmount(form.paymentType, l),
  }));
  return { shared, lines };
}

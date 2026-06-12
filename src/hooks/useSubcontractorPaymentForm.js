/**
 * useSubcontractorPaymentForm.js — formulaire paiement sous-traitant (partagé)
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { listProjects } from '../services/projects/projects';
import { listAssignmentsByProject } from '../services/rh/subcontractors';
import {
  EMPTY_SUB_PAYMENT,
  calcSubPaymentAmount,
} from '../utils/rh/subcontractorPaymentFormUtils';

export function useSubcontractorPaymentForm({ active = false, initialProjectId = '' } = {}) {
  const [form, setForm] = useState({ ...EMPTY_SUB_PAYMENT, projectId: initialProjectId || '' });
  const [formErr, setFormErr] = useState({});
  const [projects, setProjects] = useState([]);
  const [projectAssignments, setProjectAssignments] = useState([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);

  const setF = useCallback((k, v) => setForm((p) => ({ ...p, [k]: v })), []);

  useEffect(() => {
    if (!active) return;
    listProjects().then(setProjects).catch(() => setProjects([]));
  }, [active]);

  useEffect(() => {
    if (!active || !form.projectId) {
      if (!active) setProjectAssignments([]);
      return;
    }
    setAssignmentsLoading(true);
    listAssignmentsByProject(form.projectId)
      .then(setProjectAssignments)
      .catch(() => setProjectAssignments([]))
      .finally(() => setAssignmentsLoading(false));
  }, [active, form.projectId]);

  const paymentSelectedLines = useMemo(
    () => Object.entries(form.selected || {})
      .filter(([, v]) => v.checked)
      .map(([assignmentId, v]) => ({ assignmentId, ...v })),
    [form.selected],
  );

  const paymentBatchTotal = useMemo(
    () => paymentSelectedLines.reduce((s, l) => s + calcSubPaymentAmount(form.paymentType, l), 0),
    [paymentSelectedLines, form.paymentType],
  );

  function resetForm(payload = {}) {
    setForm({ ...EMPTY_SUB_PAYMENT, ...payload });
    setFormErr({});
  }

  function handlePaymentProjectChange(projectId) {
    setForm((p) => ({ ...p, projectId, selected: {} }));
  }

  function toggleSubPayment(assignment) {
    setForm((p) => {
      const sel = { ...(p.selected || {}) };
      if (sel[assignment.id]?.checked) {
        delete sel[assignment.id];
      } else {
        sel[assignment.id] = {
          checked: true,
          subcontractorId: assignment.subcontractorId,
          designation: '',
          quantity: '',
          unit: 'm²',
          unitPrice: '',
          amount: '',
        };
      }
      return { ...p, selected: sel };
    });
  }

  function setSubPaymentField(assignmentId, field, value) {
    setForm((p) => ({
      ...p,
      selected: {
        ...p.selected,
        [assignmentId]: { ...p.selected[assignmentId], [field]: value },
      },
    }));
  }

  return {
    form,
    setForm,
    setF,
    formErr,
    setFormErr,
    projects,
    projectAssignments,
    assignmentsLoading,
    paymentSelectedLines,
    paymentBatchTotal,
    resetForm,
    handlePaymentProjectChange,
    toggleSubPayment,
    setSubPaymentField,
  };
}

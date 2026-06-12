/**
 * useSubcontractorPaymentForm.js — formulaire paiement sous-traitant (partagé)
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { listProjects } from '../services/projects/projects';
import { listAssignmentsByProject, getProjectAdjustmentTotals } from '../services/rh/subcontractors';
import {
  EMPTY_SUB_PAYMENT,
  calcSubPaymentTotals,
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

  // Charger avances / retenues enregistrées pour chaque sous-traitant coché
  useEffect(() => {
    if (!active || !form.projectId) return;
    const pending = Object.entries(form.selected || {})
      .filter(([, v]) => v.checked && !v.adjustmentsLoaded);
    if (!pending.length) return;

    let cancelled = false;
    (async () => {
      const patch = {};
      await Promise.all(pending.map(async ([assignmentId, sel]) => {
        const totals = await getProjectAdjustmentTotals(sel.subcontractorId, form.projectId);
        if (cancelled) return;
        patch[assignmentId] = {
          ...sel,
          avances: String(totals.totalAvances || 0),
          retenues: String(totals.totalRetenues || 0),
          autoAvances: totals.totalAvances || 0,
          autoRetenues: totals.totalRetenues || 0,
          adjustmentsLoaded: true,
        };
      }));
      if (!cancelled && Object.keys(patch).length) {
        setForm((p) => ({ ...p, selected: { ...p.selected, ...patch } }));
      }
    })();

    return () => { cancelled = true; };
  }, [active, form.projectId, form.selected]);

  const paymentSelectedLines = useMemo(
    () => Object.entries(form.selected || {})
      .filter(([, v]) => v.checked)
      .map(([assignmentId, v]) => ({ assignmentId, ...v })),
    [form.selected],
  );

  const paymentLineTotals = useMemo(
    () => paymentSelectedLines.map((l) => ({
      assignmentId: l.assignmentId,
      ...calcSubPaymentTotals(form.paymentType, l),
    })),
    [paymentSelectedLines, form.paymentType],
  );

  const paymentBatchGross = useMemo(
    () => paymentLineTotals.reduce((s, t) => s + t.gross, 0),
    [paymentLineTotals],
  );

  const paymentBatchAvances = useMemo(
    () => paymentLineTotals.reduce((s, t) => s + t.avances, 0),
    [paymentLineTotals],
  );

  const paymentBatchRetenues = useMemo(
    () => paymentLineTotals.reduce((s, t) => s + t.retenues, 0),
    [paymentLineTotals],
  );

  const paymentBatchTotal = useMemo(
    () => paymentLineTotals.reduce((s, t) => s + t.net, 0),
    [paymentLineTotals],
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
          avances: '',
          retenues: '',
          adjustmentsLoaded: false,
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
    paymentLineTotals,
    paymentBatchGross,
    paymentBatchAvances,
    paymentBatchRetenues,
    paymentBatchTotal,
    resetForm,
    handlePaymentProjectChange,
    toggleSubPayment,
    setSubPaymentField,
  };
}

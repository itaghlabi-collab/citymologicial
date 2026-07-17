import { Handshake, Plus, Loader2, X, FileDown, Printer, Pencil } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { useSubcontractorPaymentForm } from '../hooks/useSubcontractorPaymentForm';
import SubcontractorPaymentFormBody from './SubcontractorPaymentFormBody';
import SubcontractorPaymentEditForm, {
  paymentToEditForm,
  validateSubcontractorPaymentEdit,
  buildSubcontractorPaymentUpdatePayload,
} from './SubcontractorPaymentEditForm';
import {
  createPaymentBatch,
  listAllSubcontractorPayments,
  updateSubcontractorPayment,
} from '../services/rh/subcontractors';
import { paymentStatusFromDb, paymentStatusToDb } from '../services/rh/subcontractorConstants';
import {
  validateSubcontractorPaymentForm,
  buildSubcontractorPaymentPayload,
  paymentTypeLabel,
} from '../utils/rh/subcontractorPaymentFormUtils';
import { exportSubcontractorPaymentPdf } from '../services/rh/subcontractorPaymentPdf';
import { formatSupabaseError } from '../services/supabase/formatError';
import { isSupabaseConfigured } from '../lib/supabase';

function fmtMAD(n) {
  return Number(n || 0).toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' MAD';
}

function fmtDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('fr-MA'); } catch { return iso; }
}

export default function PaiementSousTraitantsSection({ onNotify, standalone = false }) {
  const [showModal, setShowModal] = useState(false);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [editRecord, setEditRecord] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editFormErr, setEditFormErr] = useState({});
  const [editSaving, setEditSaving] = useState(false);

  const [detailRecord, setDetailRecord] = useState(null);

  const paymentForm = useSubcontractorPaymentForm({ active: showModal });

  const loadPayments = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await listAllSubcontractorPayments(50);
      setPayments(rows);
    } catch (err) {
      onNotify?.('error', formatSupabaseError(err, 'Erreur chargement paiements sous-traitants.'));
    } finally {
      setLoading(false);
    }
  }, [onNotify]);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  function openCreate() {
    paymentForm.resetForm();
    setShowModal(true);
  }

  function openEdit(p) {
    setDetailRecord(null);
    setEditRecord(p);
    setEditForm(paymentToEditForm(p));
    setEditFormErr({});
  }

  function openDetail(p) {
    setDetailRecord(p);
  }

  function setEditField(field, value) {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubPdf(record, print = false) {
    try {
      await exportSubcontractorPaymentPdf(record, { print });
    } catch {
      onNotify?.('error', 'Erreur lors de la génération du PDF.');
    }
  }

  async function handleEditSave(e) {
    e.preventDefault();
    const err = validateSubcontractorPaymentEdit(editForm);
    if (Object.keys(err).length) {
      setEditFormErr(err);
      return;
    }
    setEditSaving(true);
    try {
      const payload = buildSubcontractorPaymentUpdatePayload(editForm, {
        projectId: editRecord.projectId,
        assignmentId: editRecord.assignmentId,
      });
      await updateSubcontractorPayment(editRecord.id, payload, editRecord.subcontractorId);
      onNotify?.('success', 'Paiement sous-traitant modifié.');
      setEditRecord(null);
      setEditForm(null);
      await loadPayments();
    } catch (err) {
      onNotify?.('error', formatSupabaseError(err, 'Erreur modification paiement.'));
    } finally {
      setEditSaving(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const err = validateSubcontractorPaymentForm(paymentForm.form, paymentForm.paymentSelectedLines);
    if (Object.keys(err).length) {
      paymentForm.setFormErr(err);
      return;
    }
    setSaving(true);
    try {
      const { shared, lines } = buildSubcontractorPaymentPayload(
        paymentForm.form,
        paymentForm.paymentSelectedLines,
        paymentStatusToDb,
      );
      await createPaymentBatch(paymentForm.form.projectId, shared, lines);
      onNotify?.('success', `${lines.length} paiement(s) sous-traitant enregistré(s) — ${fmtMAD(paymentForm.paymentBatchTotal)}`);
      setShowModal(false);
      paymentForm.resetForm();
      await loadPayments();
    } catch (err) {
      onNotify?.('error', formatSupabaseError(err, 'Erreur enregistrement paiement sous-traitant.'));
    } finally {
      setSaving(false);
    }
  }

  const totalPaid = payments.reduce((s, p) => s + Number(p.amount || 0), 0);

  return (
    <div className={standalone ? 'card rh-ext-table-card' : 'card rh-ext-table-card'} style={standalone ? {} : { marginTop: 24 }}>
      <div className="flex-between finance-page-header" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div className={standalone ? 'rh-ext-hide-mobile' : undefined}>
          <div className="card-title" style={{ marginBottom: 4 }}>
            <Handshake size={16} /> {standalone ? 'Situation sous-traitants' : 'Paiement sous-traitant'}
          </div>
          <p className="rh-ext-hide-mobile" style={{ margin: 0, fontSize: '0.83rem', color: 'var(--text-3)' }}>
            Projet → sous-traitants → avances / retenues → montant net (mètre / tâche / service)
          </p>
        </div>
        <div className="finance-page-actions finance-page-actions--solo">
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            <Plus size={15} /> {standalone ? 'Nouveau paiement' : 'Ajouter paiement sous-traitant'}
          </button>
        </div>
      </div>

      <div className="stat-grid rh-ext-stat-grid finance-kpi-strip">
        <div className="stat-card">
          <div className="stat-body">
            <div className="stat-value" style={{ fontSize: '0.95rem' }}>{loading ? '—' : payments.length}</div>
            <div className="stat-label">Paiements enregistrés</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-body">
            <div className="stat-value" style={{ fontSize: '0.95rem', color: '#2E7D32' }}>{loading ? '—' : fmtMAD(totalPaid)}</div>
            <div className="stat-label">Total sous-traitants</div>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-3)' }}>
          <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 10px' }} />
          Chargement…
        </div>
      ) : payments.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-3)', fontSize: '0.88rem' }}>
          Aucun paiement sous-traitant. Cliquez sur « Ajouter paiement sous-traitant ».
        </div>
      ) : (
        <div className="table-wrap" style={standalone ? { padding: 0 } : undefined}>
          <table>
            <thead>
                <tr>
                <th>Sous-traitant</th><th>Date</th><th>Projet</th><th>Type</th>
                <th>Brut</th><th>Avances</th><th>Retenues</th><th>Net</th><th>Statut</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="rh-ext-compact-row">
                  <td data-label="Sous-traitant" style={{ fontWeight: 600 }}>
                    <button type="button" onClick={() => openDetail(p)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, color: 'var(--text)', padding: 0, textDecoration: 'underline', textUnderlineOffset: 2 }}>
                      {p.subcontractorName || '—'}
                    </button>
                  </td>
                  <td data-label="Date paiement">{fmtDate(p.paymentDate)}</td>
                  <td data-label="Projet">{p.projectName || '—'}</td>
                  <td data-label="Type">{paymentTypeLabel(p.paymentType)}</td>
                  <td data-label="Brut">{fmtMAD(p.grossAmount)}</td>
                  <td data-label="Avances" style={{ color: '#E65100' }}>{fmtMAD(p.avances)}</td>
                  <td data-label="Retenues" style={{ color: '#C62828' }}>{fmtMAD(p.retenues)}</td>
                  <td data-label="Net" style={{ fontWeight: 700, color: '#2E7D32' }}>{fmtMAD(p.amount)}</td>
                  <td data-label="Statut">{paymentStatusFromDb(p.status)}</td>
                  <td data-label="Actions" className="payment-actions-cell">
                    <div className="payment-row-actions">
                      <button type="button" className="btn btn-secondary btn-sm" title="Modifier" onClick={() => openEdit(p)}><Pencil size={13} /> Modifier</button>
                      <button type="button" className="btn btn-secondary btn-sm" title="PDF" onClick={() => handleSubPdf(p, false)}><FileDown size={13} /> Télécharger PDF</button>
                      <button type="button" className="btn btn-secondary btn-sm" title="Imprimer" onClick={() => handleSubPdf(p, true)}><Printer size={13} /> Imprimer</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="rh-ext-modal-overlay">
          <div className="card rh-ext-modal-box rh-ext-modal-box--lg">
            <div className="flex-between" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
              <div>
                <button type="button" className="rh-ext-back-btn" onClick={() => setShowModal(false)} aria-label="Retour aux sous-traitants" style={{ marginBottom: 8 }}>
                  ← Retour aux sous-traitants
                </button>
                <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.05rem', margin: 0 }}>
                  Paiement sous-traitant
                </h2>
              </div>
              <button type="button" onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', minWidth: 44, minHeight: 44 }} aria-label="Fermer">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <SubcontractorPaymentFormBody {...paymentForm} />
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editRecord && editForm && (
        <div className="rh-ext-modal-overlay">
          <div className="card rh-ext-modal-box rh-ext-modal-box--md">
            <div className="flex-between" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <div>
                <button type="button" className="rh-ext-back-btn" onClick={() => { setEditRecord(null); setEditForm(null); }} aria-label="Retour aux sous-traitants" style={{ marginBottom: 8 }}>
                  ← Retour aux sous-traitants
                </button>
                <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.05rem', margin: 0 }}>Modifier paiement sous-traitant</h2>
                <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--text-3)' }}>{editRecord.subcontractorName} · {editRecord.projectName || '—'}</p>
              </div>
              <button type="button" onClick={() => { setEditRecord(null); setEditForm(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', minWidth: 44, minHeight: 44 }} aria-label="Fermer">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleEditSave}>
              <SubcontractorPaymentEditForm form={editForm} setF={setEditField} formErr={editFormErr} />
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
                <button type="button" className="btn btn-secondary" onClick={() => { setEditRecord(null); setEditForm(null); }}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={editSaving}>
                  {editSaving ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {detailRecord && (
        <div className="rh-ext-modal-overlay">
          <div className="card rh-ext-modal-box rh-ext-modal-box--md">
            <div className="flex-between" style={{ marginBottom: 12 }}>
              <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.05rem', margin: 0 }}>Détail paiement sous-traitant</h2>
              <button type="button" onClick={() => setDetailRecord(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
            <SubcontractorPaymentEditForm
              form={paymentToEditForm(detailRecord)}
              setF={() => {}}
              formErr={{}}
              readOnly
            />
            <div className="rh-ext-detail-header-actions" style={{ marginTop: 16 }}>
              <button type="button" className="btn btn-secondary" onClick={() => { setDetailRecord(null); openEdit(detailRecord); }}>Modifier</button>
              <button type="button" className="btn btn-secondary" onClick={() => handleSubPdf(detailRecord, false)}><FileDown size={14} /> Télécharger PDF</button>
              <button type="button" className="btn btn-secondary" onClick={() => handleSubPdf(detailRecord, true)}><Printer size={14} /> Imprimer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

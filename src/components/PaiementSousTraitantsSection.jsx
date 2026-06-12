import { Handshake, Plus, Loader2, X } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { useSubcontractorPaymentForm } from '../hooks/useSubcontractorPaymentForm';
import SubcontractorPaymentFormBody from './SubcontractorPaymentFormBody';
import { createPaymentBatch, listAllSubcontractorPayments } from '../services/rh/subcontractors';
import { paymentStatusFromDb, paymentStatusToDb } from '../services/rh/subcontractorConstants';
import {
  validateSubcontractorPaymentForm,
  buildSubcontractorPaymentPayload,
  paymentTypeLabel,
} from '../utils/rh/subcontractorPaymentFormUtils';
import { formatSupabaseError } from '../services/supabase/formatError';
import { isSupabaseConfigured } from '../lib/supabase';

function fmtMAD(n) {
  return Number(n || 0).toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' MAD';
}

function fmtDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('fr-MA'); } catch { return iso; }
}

export default function PaiementSousTraitantsSection({ onNotify }) {
  const [showModal, setShowModal] = useState(false);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
    <div className="card" style={{ marginTop: 24 }}>
      <div className="flex-between" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="card-title" style={{ marginBottom: 4 }}>
            <Handshake size={16} /> Paiement sous-traitant
          </div>
          <p style={{ margin: 0, fontSize: '0.83rem', color: 'var(--text-3)' }}>
            Formulaire séparé — projet, sous-traitants, type de paiement (mètre / tâche / service)
          </p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={openCreate}>
          <Plus size={15} /> Ajouter paiement sous-traitant
        </button>
      </div>

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', marginBottom: 16 }}>
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
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th><th>Sous-traitant</th><th>Projet</th><th>Type</th>
                <th>Désignation</th><th>Montant</th><th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td>{fmtDate(p.paymentDate)}</td>
                  <td style={{ fontWeight: 600 }}>{p.subcontractorName || '—'}</td>
                  <td>{p.projectName || '—'}</td>
                  <td>{paymentTypeLabel(p.paymentType)}</td>
                  <td>{p.designation || p.description || '—'}</td>
                  <td style={{ fontWeight: 700, color: '#2E7D32' }}>{fmtMAD(p.amount)}</td>
                  <td>{paymentStatusFromDb(p.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="card" style={{ width: '100%', maxWidth: 560, maxHeight: '92vh', overflowY: 'auto', padding: 24 }}>
            <div className="flex-between" style={{ marginBottom: 16 }}>
              <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.05rem', margin: 0 }}>
                Paiement sous-traitant
              </h2>
              <button type="button" onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
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
    </div>
  );
}

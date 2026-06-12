import { Handshake, Plus, Loader2, X } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { useSubcontractorPayroll } from '../hooks/useSubcontractorPayroll';
import { PAYMENT_BALANCE_LABEL, PAYMENT_METHODS } from '../services/rh/subcontractorConstants';

function fmtMAD(n) {
  return Number(n).toLocaleString('fr-MA') + ' MAD';
}

function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

const INPUT_S = (err) => ({
  padding: '9px 12px', width: '100%', outline: 'none',
  fontFamily: 'var(--font-body)', fontSize: '0.9rem',
  border: '1.5px solid ' + (err ? 'var(--red)' : 'var(--border)'),
  borderRadius: 'var(--radius)', background: '#fff', boxSizing: 'border-box',
});

const EMPTY_PAYMENT = {
  subcontractorId: '',
  assignmentId: '',
  paymentDate: new Date().toISOString().slice(0, 10),
  amount: '',
  paymentMethod: 'virement',
  reference: '',
  description: '',
  status: 'paid',
};

export default function PaiementSousTraitantsSection({ onNotify }) {
  const {
    subcontractors,
    balances,
    payments,
    summary,
    loading,
    saving,
    error,
    configured,
    load,
    loadAssignments,
    addPayment,
  } = useSubcontractorPayroll();

  const [filterSub, setFilterSub] = useState('');
  const [filterProjet, setFilterProjet] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_PAYMENT);
  const [assignments, setAssignments] = useState([]);
  const [formErr, setFormErr] = useState({});

  const filteredBalances = useMemo(() => {
    return (balances || []).filter((b) => {
      if (filterSub && b.subcontractorId !== filterSub) return false;
      if (filterProjet && b.projectName !== filterProjet) return false;
      return true;
    });
  }, [balances, filterSub, filterProjet]);

  const projectOptions = useMemo(() => {
    const set = new Set((balances || []).map((b) => b.projectName).filter(Boolean));
    return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
  }, [balances]);

  useEffect(() => {
    if (!form.subcontractorId) {
      setAssignments([]);
      return;
    }
    loadAssignments(form.subcontractorId).then(setAssignments).catch(() => setAssignments([]));
  }, [form.subcontractorId, loadAssignments]);

  function setF(k, v) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  function openCreate() {
    setForm(EMPTY_PAYMENT);
    setFormErr({});
    setShowModal(true);
  }

  function validate() {
    const e = {};
    if (!form.subcontractorId) e.subcontractorId = 'Requis';
    if (!form.assignmentId) e.assignmentId = 'Requis';
    if (!form.paymentDate) e.paymentDate = 'Requis';
    if (!form.amount || Number(form.amount) <= 0) e.amount = 'Montant valide requis';
    return e;
  }

  async function handleSubmit(ev) {
    ev.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) {
      setFormErr(errs);
      return;
    }
    const assignment = assignments.find((a) => a.id === form.assignmentId);
    const result = await addPayment(form.subcontractorId, {
      assignmentId: form.assignmentId,
      projectId: assignment?.projectId || '',
      paymentDate: form.paymentDate,
      amount: form.amount,
      paymentMethod: form.paymentMethod,
      reference: form.reference,
      description: form.description,
      status: form.status,
    });
    if (!result.success) {
      onNotify?.('error', result.error || 'Erreur.');
      return;
    }
    onNotify?.('success', 'Paiement sous-traitant enregistré.');
    setShowModal(false);
  }

  return (
    <div className="card" style={{ marginTop: 24 }}>
      <div className="flex-between" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="card-title" style={{ marginBottom: 4 }}>
            <Handshake size={16} /> Paiements sous-traitants
          </div>
          <p style={{ margin: 0, fontSize: '0.83rem', color: 'var(--text-3)' }}>
            Suivi par sous-traitant et par projet — prestations réalisées vs montants payés (à la tâche, au m², forfait…)
          </p>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={openCreate}
          disabled={loading || saving || !configured || subcontractors.length === 0}
        >
          <Plus size={15} /> Ajouter paiement
        </button>
      </div>

      {error && !loading && (
        <div style={{ background: '#FFEBEE', border: '1px solid #EF9A9A', borderRadius: 'var(--radius)', padding: '10px 16px', marginBottom: 16, fontSize: '0.85rem', color: '#C62828', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span>{error}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={load}>Réessayer</button>
        </div>
      )}

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', marginBottom: 16 }}>
        <div className="stat-card">
          <div className="stat-body">
            <div className="stat-value" style={{ fontSize: '0.95rem' }}>{loading ? '—' : fmtMAD(summary.totalServices)}</div>
            <div className="stat-label">Prestations totales</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-body">
            <div className="stat-value" style={{ fontSize: '0.95rem', color: '#2E7D32' }}>{loading ? '—' : fmtMAD(summary.totalPaid)}</div>
            <div className="stat-label">Déjà payé</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-body">
            <div className="stat-value" style={{ fontSize: '0.95rem', color: 'var(--red)' }}>{loading ? '—' : fmtMAD(summary.remaining)}</div>
            <div className="stat-label">Reste à payer</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <select
          value={filterSub}
          onChange={(e) => setFilterSub(e.target.value)}
          style={{ padding: '7px 12px', border: '1.5px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.85rem', background: '#fff' }}
        >
          <option value="">Tous les sous-traitants</option>
          {subcontractors.map((s) => (
            <option key={s.id} value={s.id}>{s.fullName}</option>
          ))}
        </select>
        <select
          value={filterProjet}
          onChange={(e) => setFilterProjet(e.target.value)}
          style={{ padding: '7px 12px', border: '1.5px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.85rem', background: '#fff' }}
        >
          <option value="">Tous les projets</option>
          {projectOptions.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '32px 24px', color: 'var(--text-3)' }}>
          <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 10px' }} />
          Chargement…
        </div>
      ) : filteredBalances.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 24px', color: 'var(--text-3)', fontSize: '0.88rem' }}>
          {balances.length === 0
            ? 'Aucune affectation projet. Affectez vos sous-traitants depuis Employés Externes → Sous-traitants.'
            : 'Aucun résultat pour ces filtres.'}
        </div>
      ) : (
        <div className="table-wrap" style={{ marginBottom: 20 }}>
          <table>
            <thead>
              <tr>
                <th>Sous-traitant</th>
                <th>Projet</th>
                <th>Type rémun.</th>
                <th>Prestations</th>
                <th>Payé</th>
                <th>Reste</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {filteredBalances.map((b) => (
                <tr key={b.assignmentId}>
                  <td style={{ fontWeight: 600 }}>{b.subcontractorName}</td>
                  <td>{b.projectName}</td>
                  <td>{b.remunerationType || '—'}</td>
                  <td>{fmtMAD(b.totalServicesAmount)}</td>
                  <td style={{ color: '#2E7D32' }}>{fmtMAD(b.totalPaidAmount)}</td>
                  <td style={{ fontWeight: 800, color: 'var(--red)' }}>{fmtMAD(b.remainingAmount)}</td>
                  <td>
                    <span className={'badge ' + (b.paymentStatus === 'payé' ? 'badge-green' : b.paymentStatus === 'partiellement payé' ? 'badge-orange' : 'badge-red')}>
                      {PAYMENT_BALANCE_LABEL[b.paymentStatus] || b.paymentStatus}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {payments.length > 0 && (
        <>
          <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.9rem', marginBottom: 10 }}>Derniers paiements enregistrés</div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Sous-traitant</th>
                  <th>Projet</th>
                  <th>Montant</th>
                  <th>Mode</th>
                  <th>Réf.</th>
                </tr>
              </thead>
              <tbody>
                {payments.slice(0, 15).map((p) => (
                  <tr key={p.id}>
                    <td>{fmtDate(p.paymentDate)}</td>
                    <td style={{ fontWeight: 600 }}>{p.subcontractorName || '—'}</td>
                    <td>{p.projectName || '—'}</td>
                    <td style={{ fontWeight: 700, color: '#2E7D32' }}>{fmtMAD(p.amount)}</td>
                    <td>{p.paymentMethod || '—'}</td>
                    <td>{p.reference || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="card" style={{ width: '100%', maxWidth: 480, padding: 24 }}>
            <div className="flex-between" style={{ marginBottom: 16 }}>
              <h2 style={{ fontFamily: 'var(--font-head)', fontSize: '1.05rem', fontWeight: 800, margin: 0 }}>Paiement sous-traitant</h2>
              <button type="button" onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 5 }}>Sous-traitant *</label>
                <select value={form.subcontractorId} onChange={(e) => setF('subcontractorId', e.target.value)} style={INPUT_S(formErr.subcontractorId)}>
                  <option value="">Sélectionner…</option>
                  {subcontractors.map((s) => (
                    <option key={s.id} value={s.id}>{s.fullName}</option>
                  ))}
                </select>
                {formErr.subcontractorId && <div style={{ color: 'var(--red)', fontSize: '0.78rem', marginTop: 4 }}>{formErr.subcontractorId}</div>}
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 5 }}>Projet / affectation *</label>
                <select
                  value={form.assignmentId}
                  onChange={(e) => setF('assignmentId', e.target.value)}
                  style={INPUT_S(formErr.assignmentId)}
                  disabled={!form.subcontractorId}
                >
                  <option value="">Sélectionner…</option>
                  {assignments.map((a) => (
                    <option key={a.id} value={a.id}>{a.projectName || a.projectRef || 'Projet'}</option>
                  ))}
                </select>
                {formErr.assignmentId && <div style={{ color: 'var(--red)', fontSize: '0.78rem', marginTop: 4 }}>{formErr.assignmentId}</div>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 5 }}>Date *</label>
                  <input type="date" value={form.paymentDate} onChange={(e) => setF('paymentDate', e.target.value)} style={INPUT_S(formErr.paymentDate)} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 5 }}>Montant *</label>
                  <input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setF('amount', e.target.value)} style={INPUT_S(formErr.amount)} />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 5 }}>Mode de paiement</label>
                <select value={form.paymentMethod} onChange={(e) => setF('paymentMethod', e.target.value)} style={INPUT_S(false)}>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 5 }}>Référence</label>
                <input value={form.reference} onChange={(e) => setF('reference', e.target.value)} style={INPUT_S(false)} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 5 }}>Description</label>
                <input value={form.description} onChange={(e) => setF('description', e.target.value)} style={INPUT_S(false)} />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

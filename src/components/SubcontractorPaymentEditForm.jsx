import {
  PAYMENT_METHODS, PAYMENT_TYPES, PAYMENT_STATUS_UI,
  paymentStatusFromDb, paymentStatusToDb,
} from '../services/rh/subcontractorConstants';
import { calcSubPaymentTotals } from '../utils/rh/subcontractorPaymentFormUtils';

const METRE_UNITS = ['m²', 'ml', 'm³'];

function fmtMAD(n) {
  return Number(n || 0).toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' MAD';
}

const INPUT_S = (err) => ({
  padding: '9px 12px', width: '100%', outline: 'none', boxSizing: 'border-box',
  fontFamily: 'var(--font-body)', fontSize: '0.9rem', borderRadius: 'var(--radius)',
  border: '1.5px solid ' + (err ? 'var(--red)' : 'var(--border)'), background: '#fff',
});

const LABEL = ({ children, req }) => (
  <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>
    {children}{req ? ' *' : ''}
  </label>
);

export function paymentToEditForm(p) {
  const isMetre = p.paymentType === 'metre';
  return {
    paymentType: p.paymentType || 'metre',
    paymentDate: p.paymentDate || '',
    paymentMethod: p.paymentMethod || 'virement',
    reference: p.reference || '',
    description: p.description || '',
    statusUi: paymentStatusFromDb(p.status) || 'En attente',
    designation: p.designation || '',
    quantity: isMetre ? String(p.quantity ?? '') : '',
    unit: p.unit || 'm²',
    unitPrice: isMetre ? String(p.unitPrice ?? '') : '',
    amount: !isMetre ? String(p.grossAmount ?? p.amount ?? '') : '',
    avances: String(p.avances ?? 0),
    retenues: String(p.retenues ?? 0),
  };
}

export default function SubcontractorPaymentEditForm({ form, setF, formErr, readOnly = false }) {
  const line = {
    designation: form.designation,
    quantity: form.quantity,
    unit: form.unit,
    unitPrice: form.unitPrice,
    amount: form.amount,
    avances: form.avances,
    retenues: form.retenues,
  };
  const totals = calcSubPaymentTotals(form.paymentType, line);
  const disabled = readOnly ? { disabled: true } : {};

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <LABEL req>Type de paiement</LABEL>
        <select value={form.paymentType} onChange={(e) => setF('paymentType', e.target.value)} style={INPUT_S(false)} {...disabled}>
          {PAYMENT_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </div>

      {form.paymentType === 'metre' && (
        <>
          <div><LABEL req>Désignation</LABEL>
            <input value={form.designation || ''} onChange={(e) => setF('designation', e.target.value)} style={INPUT_S(formErr.designation)} {...disabled} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <div><LABEL req>Quantité</LABEL>
              <input type="number" min="0" step="0.01" value={form.quantity ?? ''} onChange={(e) => setF('quantity', e.target.value)} style={INPUT_S(formErr.quantity)} {...disabled} /></div>
            <div><LABEL req>Unité</LABEL>
              <select value={form.unit || 'm²'} onChange={(e) => setF('unit', e.target.value)} style={INPUT_S(false)} {...disabled}>
                {METRE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select></div>
            <div><LABEL req>Prix unitaire</LABEL>
              <input type="number" min="0" step="0.01" value={form.unitPrice ?? ''} onChange={(e) => setF('unitPrice', e.target.value)} style={INPUT_S(formErr.unitPrice)} {...disabled} /></div>
          </div>
        </>
      )}

      {form.paymentType === 'tache' && (
        <>
          <div><LABEL req>Désignation de la tâche</LABEL>
            <input value={form.designation || ''} onChange={(e) => setF('designation', e.target.value)} style={INPUT_S(formErr.designation)} {...disabled} /></div>
          <div><LABEL req>Montant forfaitaire</LABEL>
            <input type="number" min="0" step="0.01" value={form.amount ?? ''} onChange={(e) => setF('amount', e.target.value)} style={INPUT_S(formErr.amount)} {...disabled} /></div>
        </>
      )}

      {form.paymentType === 'service' && (
        <>
          <div><LABEL req>Désignation du service</LABEL>
            <input value={form.designation || ''} onChange={(e) => setF('designation', e.target.value)} style={INPUT_S(formErr.designation)} {...disabled} /></div>
          <div><LABEL req>Montant forfaitaire</LABEL>
            <input type="number" min="0" step="0.01" value={form.amount ?? ''} onChange={(e) => setF('amount', e.target.value)} style={INPUT_S(formErr.amount)} {...disabled} /></div>
        </>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div><LABEL>Avances (MAD)</LABEL>
          <input type="number" min="0" step="0.01" value={form.avances ?? '0'} onChange={(e) => setF('avances', e.target.value)} style={INPUT_S(false)} {...disabled} /></div>
        <div><LABEL>Retenues (MAD)</LABEL>
          <input type="number" min="0" step="0.01" value={form.retenues ?? '0'} onChange={(e) => setF('retenues', e.target.value)} style={INPUT_S(false)} {...disabled} /></div>
      </div>

      <div style={{ padding: '10px 12px', background: '#F8F9FA', borderRadius: 8, fontSize: '0.85rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span>Montant brut</span><strong>{fmtMAD(totals.gross)}</strong></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: '#E65100' }}><span>Avances déduites</span><strong>{fmtMAD(totals.avances)}</strong></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: '#C62828' }}><span>Retenues déduites</span><strong>{fmtMAD(totals.retenues)}</strong></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6, borderTop: '1px solid var(--border)' }}><span style={{ fontWeight: 700 }}>Net à payer</span><strong style={{ color: 'var(--red)' }}>{fmtMAD(totals.net)}</strong></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div><LABEL req>Date</LABEL>
          <input type="date" value={form.paymentDate || ''} onChange={(e) => setF('paymentDate', e.target.value)} style={INPUT_S(formErr.paymentDate)} {...disabled} /></div>
        <div><LABEL>Statut</LABEL>
          <select value={form.statusUi || 'En attente'} onChange={(e) => setF('statusUi', e.target.value)} style={INPUT_S(false)} {...disabled}>
            {PAYMENT_STATUS_UI.map((s) => <option key={s} value={s}>{s}</option>)}
          </select></div>
      </div>
      <div><LABEL>Mode de paiement</LABEL>
        <select value={form.paymentMethod || ''} onChange={(e) => setF('paymentMethod', e.target.value)} style={INPUT_S(false)} {...disabled}>
          {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select></div>
      <div><LABEL>Référence</LABEL>
        <input value={form.reference || ''} onChange={(e) => setF('reference', e.target.value)} style={INPUT_S(false)} {...disabled} /></div>
      <div><LABEL>Description / Observation</LABEL>
        <textarea rows={2} value={form.description || ''} onChange={(e) => setF('description', e.target.value)} style={{ ...INPUT_S(false), resize: 'vertical' }} {...disabled} /></div>
    </div>
  );
}

export function validateSubcontractorPaymentEdit(form) {
  const err = {};
  if (!form.paymentDate) err.paymentDate = 'Date requise';
  const totals = calcSubPaymentTotals(form.paymentType, form);
  if (form.paymentType === 'metre') {
    if (!form.designation?.trim()) err.designation = 'Requis';
    if (!form.quantity || Number(form.quantity) <= 0) err.quantity = 'Requis';
    if (!form.unitPrice || Number(form.unitPrice) <= 0) err.unitPrice = 'Requis';
  } else {
    if (!form.designation?.trim()) err.designation = 'Requis';
    if (!form.amount || Number(form.amount) <= 0) err.amount = 'Requis';
  }
  if (totals.gross <= 0) err.gross = 'Montant brut requis';
  return err;
}

export function buildSubcontractorPaymentUpdatePayload(form, meta = {}) {
  const totals = calcSubPaymentTotals(form.paymentType, form);
  return {
    projectId: meta.projectId,
    assignmentId: meta.assignmentId,
    paymentDate: form.paymentDate,
    paymentType: form.paymentType,
    paymentMethod: form.paymentMethod,
    reference: form.reference,
    description: form.description,
    designation: form.designation,
    quantity: form.paymentType === 'metre' ? form.quantity : 0,
    unit: form.paymentType === 'metre' ? form.unit : null,
    unitPrice: form.paymentType === 'metre' ? form.unitPrice : 0,
    amount: form.paymentType === 'metre' ? totals.gross : form.amount,
    grossAmount: totals.gross,
    avances: totals.avances,
    retenues: totals.retenues,
    status: paymentStatusToDb(form.statusUi),
  };
}

export { paymentStatusToDb };

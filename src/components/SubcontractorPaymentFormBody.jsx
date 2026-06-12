import {
  PAYMENT_METHODS, PAYMENT_TYPES, PAYMENT_STATUS_UI,
} from '../services/rh/subcontractorConstants';
import { calcSubPaymentAmount, calcSubPaymentTotals } from '../utils/rh/subcontractorPaymentFormUtils';

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

function LineTotalsBox({ totals }) {
  return (
    <div style={{ padding: '10px 12px', background: '#F8F9FA', borderRadius: 8, fontSize: '0.82rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span>Montant brut</span>
        <strong>{fmtMAD(totals.gross)}</strong>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: '#E65100' }}>
        <span>Avances déduites</span>
        <strong>{fmtMAD(totals.avances)}</strong>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, color: '#C62828' }}>
        <span>Retenues déduites</span>
        <strong>{fmtMAD(totals.retenues)}</strong>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6, borderTop: '1px solid var(--border)' }}>
        <span style={{ fontWeight: 700 }}>Net à payer</span>
        <strong style={{ color: 'var(--red)', fontSize: '0.95rem' }}>{fmtMAD(totals.net)}</strong>
      </div>
    </div>
  );
}

/** Champs conditionnels selon le type de paiement */
function PaymentTypeFields({ paymentType, sel, assignmentId, formErr, setSubPaymentField }) {
  const gross = calcSubPaymentAmount(paymentType, sel);

  if (paymentType === 'metre') {
    return (
      <div style={{ display: 'grid', gap: 8 }}>
        <div>
          <LABEL req>Désignation</LABEL>
          <input
            placeholder="Ex : Carrelage sol salon"
            value={sel.designation || ''}
            onChange={(e) => setSubPaymentField(assignmentId, 'designation', e.target.value)}
            style={INPUT_S(formErr[`d_${assignmentId}`])}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <div>
            <LABEL req>Quantité réalisée</LABEL>
            <input
              type="number" min="0" step="0.01"
              placeholder="0"
              value={sel.quantity ?? ''}
              onChange={(e) => setSubPaymentField(assignmentId, 'quantity', e.target.value)}
              style={INPUT_S(formErr[`q_${assignmentId}`])}
            />
          </div>
          <div>
            <LABEL req>Unité</LABEL>
            <select
              value={sel.unit || 'm²'}
              onChange={(e) => setSubPaymentField(assignmentId, 'unit', e.target.value)}
              style={INPUT_S(false)}
            >
              {METRE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <LABEL req>Prix unitaire (MAD)</LABEL>
            <input
              type="number" min="0" step="0.01"
              placeholder="0"
              value={sel.unitPrice ?? ''}
              onChange={(e) => setSubPaymentField(assignmentId, 'unitPrice', e.target.value)}
              style={INPUT_S(formErr[`p_${assignmentId}`])}
            />
          </div>
        </div>
        <div style={{ padding: '8px 12px', background: '#E3F2FD', borderRadius: 8, display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
          <span>Montant brut calculé</span>
          <strong style={{ color: '#1565C0' }}>{fmtMAD(gross)}</strong>
        </div>
      </div>
    );
  }

  if (paymentType === 'tache') {
    return (
      <div style={{ display: 'grid', gap: 8 }}>
        <div>
          <LABEL req>Désignation de la tâche</LABEL>
          <input
            placeholder="Ex : Pose plomberie complète"
            value={sel.designation || ''}
            onChange={(e) => setSubPaymentField(assignmentId, 'designation', e.target.value)}
            style={INPUT_S(formErr[`d_${assignmentId}`])}
          />
        </div>
        <div>
          <LABEL>Description</LABEL>
          <textarea
            rows={2}
            placeholder="Détails de la tâche réalisée…"
            value={sel.lineDescription || ''}
            onChange={(e) => setSubPaymentField(assignmentId, 'lineDescription', e.target.value)}
            style={{ ...INPUT_S(false), resize: 'vertical' }}
          />
        </div>
        <div>
          <LABEL req>Montant forfaitaire (MAD)</LABEL>
          <input
            type="number" min="0" step="0.01"
            placeholder="0"
            value={sel.amount ?? ''}
            onChange={(e) => setSubPaymentField(assignmentId, 'amount', e.target.value)}
            style={INPUT_S(formErr[`a_${assignmentId}`])}
          />
        </div>
        <div style={{ padding: '8px 12px', background: '#E3F2FD', borderRadius: 8, display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
          <span>Montant brut</span>
          <strong style={{ color: '#1565C0' }}>{fmtMAD(gross)}</strong>
        </div>
      </div>
    );
  }

  // service
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div>
        <LABEL req>Désignation du service</LABEL>
        <input
          placeholder="Ex : Maintenance électrique"
          value={sel.designation || ''}
          onChange={(e) => setSubPaymentField(assignmentId, 'designation', e.target.value)}
          style={INPUT_S(formErr[`d_${assignmentId}`])}
        />
      </div>
      <div>
        <LABEL>Description</LABEL>
        <textarea
          rows={2}
          placeholder="Détails du service rendu…"
          value={sel.lineDescription || ''}
          onChange={(e) => setSubPaymentField(assignmentId, 'lineDescription', e.target.value)}
          style={{ ...INPUT_S(false), resize: 'vertical' }}
        />
      </div>
      <div>
        <LABEL req>Montant forfaitaire (MAD)</LABEL>
        <input
          type="number" min="0" step="0.01"
          placeholder="0"
          value={sel.amount ?? ''}
          onChange={(e) => setSubPaymentField(assignmentId, 'amount', e.target.value)}
          style={INPUT_S(formErr[`a_${assignmentId}`])}
        />
      </div>
      <div style={{ padding: '8px 12px', background: '#E3F2FD', borderRadius: 8, display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
        <span>Montant brut</span>
        <strong style={{ color: '#1565C0' }}>{fmtMAD(gross)}</strong>
      </div>
    </div>
  );
}

export default function SubcontractorPaymentFormBody({
  form,
  setF,
  formErr,
  projects,
  projectAssignments,
  assignmentsLoading,
  usingAllSubcontractors,
  paymentSelectedLines,
  paymentBatchGross,
  paymentBatchAvances,
  paymentBatchRetenues,
  paymentBatchTotal,
  handlePaymentProjectChange,
  toggleSubPayment,
  setSubPaymentField,
}) {
  const paymentType = form.paymentType || 'metre';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <LABEL req>Projet / chantier</LABEL>
        <select value={form.projectId || ''} onChange={(e) => handlePaymentProjectChange(e.target.value)} style={INPUT_S(formErr.projectId)}>
          <option value="">Choisir un projet…</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.ref ? `${p.ref} — ${p.nom}` : p.nom}</option>
          ))}
        </select>
        {formErr.projectId && <div style={{ color: 'var(--red)', fontSize: '0.75rem' }}>{formErr.projectId}</div>}
      </div>

      <div>
        <LABEL req>Type de paiement</LABEL>
        <select value={paymentType} onChange={(e) => setF('paymentType', e.target.value)} style={INPUT_S(false)}>
          {PAYMENT_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </div>

      <div>
        <LABEL req>Sous-traitants — cochez pour saisir le paiement</LABEL>
        {usingAllSubcontractors && form.projectId && (
          <div style={{ padding: '8px 12px', background: '#FFF3E0', borderRadius: 8, color: '#E65100', fontSize: '0.82rem', marginBottom: 8 }}>
            Aucune affectation enregistrée sur ce projet — liste de tous les sous-traitants disponibles.
          </div>
        )}
        {!form.projectId ? (
          <div style={{ padding: 12, background: 'var(--bg)', borderRadius: 8, color: 'var(--text-3)', fontSize: '0.85rem' }}>
            Sélectionnez d&apos;abord un projet.
          </div>
        ) : assignmentsLoading ? (
          <div style={{ padding: 12, color: 'var(--text-3)', fontSize: '0.85rem' }}>Chargement…</div>
        ) : projectAssignments.length === 0 ? (
          <div style={{ padding: 12, background: '#FFF3E0', borderRadius: 8, color: '#E65100', fontSize: '0.85rem' }}>
            Aucun sous-traitant dans la base. Ajoutez-en via le module Sous-traitants.
          </div>
        ) : (
          <div style={{ border: '1.5px solid var(--border)', borderRadius: 8, maxHeight: 520, overflowY: 'auto' }}>
            {projectAssignments.map((a) => {
              const sel = form.selected?.[a.id];
              const totals = sel?.checked ? calcSubPaymentTotals(paymentType, sel) : null;
              const loadingAdj = sel?.checked && !sel?.adjustmentsLoaded;
              const hasAutoAvances = (sel?.autoAvances || 0) > 0;
              const hasAutoRetenues = (sel?.autoRetenues || 0) > 0;
              return (
                <div key={a.id} style={{ padding: '12px', borderBottom: '1px solid var(--border)', background: sel?.checked ? '#FFF5F5' : '#fff' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: sel?.checked ? 12 : 0 }}>
                    <input type="checkbox" checked={!!sel?.checked} onChange={() => toggleSubPayment(a)} />
                    <span style={{ fontWeight: 700 }}>{a.subcontractorName}</span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>{a.subcontractorFonction || '—'}</span>
                    {totals && (
                      <span style={{ marginLeft: 'auto', fontWeight: 800, color: 'var(--red)', fontSize: '0.88rem' }}>{fmtMAD(totals.net)}</span>
                    )}
                  </label>

                  {sel?.checked && (
                    <div style={{ display: 'grid', gap: 12, paddingLeft: 26 }}>
                      {/* 1. Détail selon type */}
                      <div style={{ padding: '12px', border: '1.5px solid #90CAF9', borderRadius: 8, background: '#FAFCFF' }}>
                        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#1565C0', marginBottom: 10, textTransform: 'uppercase' }}>
                          {PAYMENT_TYPES.find((t) => t.id === paymentType)?.label}
                        </div>
                        <PaymentTypeFields
                          paymentType={paymentType}
                          sel={sel}
                          assignmentId={a.id}
                          formErr={formErr}
                          setSubPaymentField={setSubPaymentField}
                        />
                      </div>

                      {/* 2. Avances / retenues */}
                      <div style={{ padding: '12px', border: '1.5px solid #FFB74D', borderRadius: 8, background: '#FFF8E1' }}>
                        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#E65100', marginBottom: 8, textTransform: 'uppercase' }}>
                          Avances et retenues
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <div>
                            <LABEL>Avances (MAD)</LABEL>
                            <input
                              type="number" min="0" step="0.01"
                              value={sel.avances ?? '0'}
                              onChange={(e) => setSubPaymentField(a.id, 'avances', e.target.value)}
                              style={INPUT_S(false)}
                            />
                            {loadingAdj ? (
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 2 }}>Chargement…</div>
                            ) : hasAutoAvances ? (
                              <div style={{ fontSize: '0.72rem', color: '#E65100', marginTop: 2 }}>Auto : {fmtMAD(sel.autoAvances)}</div>
                            ) : (
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 2 }}>0 MAD si aucune avance</div>
                            )}
                          </div>
                          <div>
                            <LABEL>Retenues (MAD)</LABEL>
                            <input
                              type="number" min="0" step="0.01"
                              value={sel.retenues ?? '0'}
                              onChange={(e) => setSubPaymentField(a.id, 'retenues', e.target.value)}
                              style={INPUT_S(false)}
                            />
                            {loadingAdj ? (
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 2 }}>Chargement…</div>
                            ) : hasAutoRetenues ? (
                              <div style={{ fontSize: '0.72rem', color: '#C62828', marginTop: 2 }}>Auto : {fmtMAD(sel.autoRetenues)}</div>
                            ) : (
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 2 }}>0 MAD si aucune retenue</div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* 3. Récap net */}
                      {totals && <LineTotalsBox totals={totals} />}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {formErr.selected && <div style={{ color: 'var(--red)', fontSize: '0.75rem', marginTop: 4 }}>{formErr.selected}</div>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <LABEL req>Date</LABEL>
          <input type="date" value={form.paymentDate || ''} onChange={(e) => setF('paymentDate', e.target.value)} style={INPUT_S(formErr.paymentDate)} />
        </div>
        <div>
          <LABEL>Statut</LABEL>
          <select value={form.statusUi || 'En attente'} onChange={(e) => setF('statusUi', e.target.value)} style={INPUT_S(false)}>
            {PAYMENT_STATUS_UI.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <div>
        <LABEL>Mode de paiement</LABEL>
        <select value={form.paymentMethod || ''} onChange={(e) => setF('paymentMethod', e.target.value)} style={INPUT_S(false)}>
          {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <div><LABEL>Référence</LABEL><input value={form.reference || ''} onChange={(e) => setF('reference', e.target.value)} style={INPUT_S(false)} /></div>
      <div>
        <LABEL>Description / Observation (global)</LABEL>
        <textarea rows={2} value={form.description || ''} onChange={(e) => setF('description', e.target.value)} style={{ ...INPUT_S(false), resize: 'vertical' }} />
      </div>

      {paymentSelectedLines.length > 0 && (
        <div style={{ padding: '14px 16px', background: '#FFF5F5', borderRadius: 8, fontSize: '0.85rem', border: '1.5px solid #FFCDD2' }}>
          <div style={{ fontWeight: 700, marginBottom: 10, fontSize: '0.9rem' }}>Récapitulatif du paiement</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span>Montant brut</span><strong>{fmtMAD(paymentBatchGross)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: '#E65100' }}>
            <span>Avances déduites</span><strong>{fmtMAD(paymentBatchAvances)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, color: '#C62828' }}>
            <span>Retenues déduites</span><strong>{fmtMAD(paymentBatchRetenues)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            <span style={{ fontWeight: 700 }}>Net à payer ({paymentSelectedLines.length} sous-traitant{paymentSelectedLines.length > 1 ? 's' : ''})</span>
            <span style={{ fontWeight: 800, color: 'var(--red)', fontSize: '1.05rem' }}>{fmtMAD(paymentBatchTotal)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

import {
  PAYMENT_METHODS, PAYMENT_TYPES, PAYMENT_UNITS, PAYMENT_STATUS_UI,
} from '../services/rh/subcontractorConstants';
import { calcSubPaymentTotals } from '../utils/rh/subcontractorPaymentFormUtils';

function fmtMAD(n) {
  return Number(n || 0).toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' MAD';
}

const INPUT_S = (err) => ({
  padding: '9px 12px', width: '100%', outline: 'none', boxSizing: 'border-box',
  fontFamily: 'var(--font-body)', fontSize: '0.9rem', borderRadius: 'var(--radius)',
  border: '1.5px solid ' + (err ? 'var(--red)' : 'var(--border)'), background: '#fff',
});

function LineTotalsBox({ totals, loadingAdjustments }) {
  return (
    <div style={{ padding: '10px 12px', background: '#F8F9FA', borderRadius: 8, fontSize: '0.82rem' }}>
      {loadingAdjustments && (
        <div style={{ color: 'var(--text-3)', marginBottom: 6, fontSize: '0.78rem' }}>Chargement avances / retenues…</div>
      )}
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
        <span style={{ fontWeight: 700 }}>Montant net à payer</span>
        <strong style={{ color: 'var(--red)', fontSize: '0.95rem' }}>{fmtMAD(totals.net)}</strong>
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
  paymentSelectedLines,
  paymentBatchGross,
  paymentBatchAvances,
  paymentBatchRetenues,
  paymentBatchTotal,
  handlePaymentProjectChange,
  toggleSubPayment,
  setSubPaymentField,
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <label>Projet / chantier *</label>
        <select value={form.projectId || ''} onChange={(e) => handlePaymentProjectChange(e.target.value)} style={INPUT_S(formErr.projectId)}>
          <option value="">Choisir un projet…</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.ref ? `${p.ref} — ${p.nom}` : p.nom}</option>
          ))}
        </select>
        {formErr.projectId && <div style={{ color: 'var(--red)', fontSize: '0.75rem' }}>{formErr.projectId}</div>}
      </div>

      <div>
        <label>Type de paiement *</label>
        <select value={form.paymentType || 'metre'} onChange={(e) => setF('paymentType', e.target.value)} style={INPUT_S(false)}>
          {PAYMENT_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </div>

      <div>
        <label>Sous-traitants affectés au projet *</label>
        {!form.projectId ? (
          <div style={{ padding: 12, background: 'var(--bg)', borderRadius: 8, color: 'var(--text-3)', fontSize: '0.85rem' }}>
            Sélectionnez d&apos;abord un projet.
          </div>
        ) : assignmentsLoading ? (
          <div style={{ padding: 12, color: 'var(--text-3)', fontSize: '0.85rem' }}>Chargement…</div>
        ) : projectAssignments.length === 0 ? (
          <div style={{ padding: 12, background: '#FFF3E0', borderRadius: 8, color: '#E65100', fontSize: '0.85rem' }}>
            Aucun sous-traitant affecté à ce projet.
          </div>
        ) : (
          <div style={{ border: '1.5px solid var(--border)', borderRadius: 8, maxHeight: 420, overflowY: 'auto' }}>
            {projectAssignments.map((a) => {
              const sel = form.selected?.[a.id];
              const totals = sel?.checked ? calcSubPaymentTotals(form.paymentType, sel) : null;
              const loadingAdj = sel?.checked && !sel?.adjustmentsLoaded;
              const hasAutoAvances = (sel?.autoAvances || 0) > 0;
              const hasAutoRetenues = (sel?.autoRetenues || 0) > 0;
              return (
                <div key={a.id} style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', background: sel?.checked ? '#FFF5F5' : '#fff' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: sel?.checked ? 10 : 0 }}>
                    <input type="checkbox" checked={!!sel?.checked} onChange={() => toggleSubPayment(a)} />
                    <span style={{ fontWeight: 700 }}>{a.subcontractorName}</span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>{a.subcontractorFonction || '—'}</span>
                    {totals && !loadingAdj && (
                      <span style={{ marginLeft: 'auto', fontWeight: 800, color: 'var(--red)', fontSize: '0.88rem' }}>{fmtMAD(totals.net)}</span>
                    )}
                  </label>
                  {sel?.checked && (
                    <div style={{ display: 'grid', gap: 10, paddingLeft: 26 }}>
                      {/* Avances / retenues — visible dès la sélection */}
                      <div style={{ padding: '10px 12px', border: '1.5px solid #FFB74D', borderRadius: 8, background: '#FFF8E1' }}>
                        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#E65100', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                          Avances et retenues
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <div>
                            <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Avances (MAD)</label>
                            <input
                              type="number" min="0" step="0.01"
                              placeholder="0"
                              value={sel.avances ?? '0'}
                              onChange={(e) => setSubPaymentField(a.id, 'avances', e.target.value)}
                              style={INPUT_S(false)}
                            />
                            {loadingAdj ? (
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 2 }}>Chargement…</div>
                            ) : hasAutoAvances ? (
                              <div style={{ fontSize: '0.72rem', color: '#E65100', marginTop: 2 }}>
                                Auto : {fmtMAD(sel.autoAvances)} enregistrée(s)
                              </div>
                            ) : (
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 2 }}>Aucune avance enregistrée</div>
                            )}
                          </div>
                          <div>
                            <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Retenues (MAD)</label>
                            <input
                              type="number" min="0" step="0.01"
                              placeholder="0"
                              value={sel.retenues ?? '0'}
                              onChange={(e) => setSubPaymentField(a.id, 'retenues', e.target.value)}
                              style={INPUT_S(false)}
                            />
                            {loadingAdj ? (
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 2 }}>Chargement…</div>
                            ) : hasAutoRetenues ? (
                              <div style={{ fontSize: '0.72rem', color: '#C62828', marginTop: 2 }}>
                                Auto : {fmtMAD(sel.autoRetenues)} enregistrée(s)
                              </div>
                            ) : (
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 2 }}>Aucune retenue enregistrée</div>
                            )}
                          </div>
                        </div>
                        {totals && <div style={{ marginTop: 10 }}><LineTotalsBox totals={totals} loadingAdjustments={loadingAdj} /></div>}
                      </div>

                      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                        Détail du paiement
                      </div>
                      {form.paymentType === 'metre' && (
                        <>
                          <input placeholder="Désignation *" value={sel.designation || ''} onChange={(e) => setSubPaymentField(a.id, 'designation', e.target.value)} style={INPUT_S(formErr[`d_${a.id}`])} />
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                            <input type="number" min="0" step="0.01" placeholder="Quantité *" value={sel.quantity || ''} onChange={(e) => setSubPaymentField(a.id, 'quantity', e.target.value)} style={INPUT_S(formErr[`q_${a.id}`])} />
                            <select value={sel.unit || 'm²'} onChange={(e) => setSubPaymentField(a.id, 'unit', e.target.value)} style={INPUT_S(false)}>
                              {PAYMENT_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                            </select>
                            <input type="number" min="0" step="0.01" placeholder="Prix unit. *" value={sel.unitPrice || ''} onChange={(e) => setSubPaymentField(a.id, 'unitPrice', e.target.value)} style={INPUT_S(formErr[`p_${a.id}`])} />
                          </div>
                        </>
                      )}
                      {form.paymentType === 'tache' && (
                        <>
                          <input placeholder="Désignation de la tâche *" value={sel.designation || ''} onChange={(e) => setSubPaymentField(a.id, 'designation', e.target.value)} style={INPUT_S(formErr[`d_${a.id}`])} />
                          <input type="number" min="0" step="0.01" placeholder="Montant brut (MAD) *" value={sel.amount || ''} onChange={(e) => setSubPaymentField(a.id, 'amount', e.target.value)} style={INPUT_S(formErr[`a_${a.id}`])} />
                        </>
                      )}
                      {form.paymentType === 'service' && (
                        <>
                          <input placeholder="Description du service *" value={sel.designation || ''} onChange={(e) => setSubPaymentField(a.id, 'designation', e.target.value)} style={INPUT_S(formErr[`d_${a.id}`])} />
                          <input type="number" min="0" step="0.01" placeholder="Montant brut (MAD) *" value={sel.amount || ''} onChange={(e) => setSubPaymentField(a.id, 'amount', e.target.value)} style={INPUT_S(formErr[`a_${a.id}`])} />
                        </>
                      )}

                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {formErr.selected && <div style={{ color: 'var(--red)', fontSize: '0.75rem' }}>{formErr.selected}</div>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label>Date *</label>
          <input type="date" value={form.paymentDate || ''} onChange={(e) => setF('paymentDate', e.target.value)} style={INPUT_S(formErr.paymentDate)} />
        </div>
        <div>
          <label>Statut</label>
          <select value={form.statusUi || 'En attente'} onChange={(e) => setF('statusUi', e.target.value)} style={INPUT_S(false)}>
            {PAYMENT_STATUS_UI.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label>Mode de paiement</label>
        <select value={form.paymentMethod || ''} onChange={(e) => setF('paymentMethod', e.target.value)} style={INPUT_S(false)}>
          {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <div><label>Référence</label><input value={form.reference || ''} onChange={(e) => setF('reference', e.target.value)} style={INPUT_S(false)} /></div>
      <div>
        <label>Description / Observation</label>
        <textarea rows={2} value={form.description || ''} onChange={(e) => setF('description', e.target.value)} style={{ ...INPUT_S(false), resize: 'vertical' }} />
      </div>

      {paymentSelectedLines.length > 0 && (
        <div style={{ padding: '12px 14px', background: '#FFF5F5', borderRadius: 8, fontSize: '0.85rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span>Montant brut total</span><strong>{fmtMAD(paymentBatchGross)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: '#E65100' }}>
            <span>Avances déduites</span><strong>{fmtMAD(paymentBatchAvances)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, color: '#C62828' }}>
            <span>Retenues déduites</span><strong>{fmtMAD(paymentBatchRetenues)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            <span style={{ fontWeight: 700 }}>Montant net ({paymentSelectedLines.length} sous-traitant{paymentSelectedLines.length > 1 ? 's' : ''})</span>
            <span style={{ fontWeight: 800, color: 'var(--red)', fontSize: '1.05rem' }}>{fmtMAD(paymentBatchTotal)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

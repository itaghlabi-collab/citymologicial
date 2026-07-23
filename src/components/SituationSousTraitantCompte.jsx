import { useCallback, useEffect, useState } from 'react';
import {
  ChevronLeft, FileDown, Loader2, Printer, X, Pencil, Plus, Lock, Trash2,
} from 'lucide-react';
import { getSubcontractorAccount } from '../services/rh/subcontractorAccount';
import { updateSubcontractorPayment, deleteSubcontractorPayment } from '../services/rh/subcontractors';
import { closeSituation, SITUATION_STATUS_LABEL } from '../services/rh/subcontractorSituations';
import { createGlobalAdvance, cancelGlobalAdvance } from '../services/rh/subcontractorAdvances';
import { PAYMENT_METHODS } from '../services/rh/subcontractorConstants';
import { exportSubcontractorPaymentPdf } from '../services/rh/subcontractorPaymentPdf';
import { exportSubcontractorAccountPdf } from '../services/rh/subcontractorAccountPdf';
import { formatSupabaseError } from '../services/supabase/formatError';
import { isSupabaseConfigured } from '../lib/supabase';
import { paymentTypeLabel } from '../utils/rh/subcontractorPaymentFormUtils';
import SubcontractorPaymentEditForm, {
  paymentToEditForm,
  validateSubcontractorPaymentEdit,
  buildSubcontractorPaymentUpdatePayload,
} from './SubcontractorPaymentEditForm';

function fmtMAD(n) {
  return Number(n || 0).toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' MAD';
}

function fmtDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('fr-MA'); } catch { return iso; }
}

function Kpi({ label, value, hint, accent }) {
  return (
    <div className="stat-card">
      <div className="stat-body">
        <div className="stat-value" style={{ fontSize: '0.92rem', color: accent || undefined }}>{value}</div>
        <div className="stat-label">{label}</div>
        {hint ? <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', marginTop: 4 }}>{hint}</div> : null}
      </div>
    </div>
  );
}

const TABS = [
  { id: 'general', label: 'Vue générale' },
  { id: 'situations', label: 'Situations par projet' },
  { id: 'avances', label: 'Avances' },
  { id: 'historique', label: 'Historique' },
  { id: 'documents', label: 'Documents' },
];

export default function SituationSousTraitantCompte({
  subcontractorId,
  onBack,
  onNotify,
  onNewSituation,
  accountOverride = null,
}) {
  const [loading, setLoading] = useState(!accountOverride);
  const [account, setAccount] = useState(accountOverride);
  const [tab, setTab] = useState('general');
  const [editRecord, setEditRecord] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editFormErr, setEditFormErr] = useState({});
  const [editSaving, setEditSaving] = useState(false);
  const [showAdvance, setShowAdvance] = useState(false);
  const [advForm, setAdvForm] = useState({
    advanceDate: new Date().toISOString().slice(0, 10),
    amount: '',
    paymentMethod: 'virement',
    reference: '',
    observation: '',
  });
  const [advSaving, setAdvSaving] = useState(false);

  const load = useCallback(async () => {
    if (accountOverride) {
      setAccount(accountOverride);
      setLoading(false);
      return;
    }
    if (!isSupabaseConfigured() || !subcontractorId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setAccount(await getSubcontractorAccount(subcontractorId));
    } catch (err) {
      onNotify?.('error', formatSupabaseError(err, 'Erreur chargement compte sous-traitant.'));
    } finally {
      setLoading(false);
    }
  }, [subcontractorId, onNotify, accountOverride]);

  useEffect(() => { load(); }, [load]);

  async function handlePdf(record, print = false) {
    try {
      await exportSubcontractorPaymentPdf(record, { print });
    } catch {
      onNotify?.('error', 'Erreur lors de la génération du PDF.');
    }
  }

  async function handleAccountPdf() {
    try {
      await exportSubcontractorAccountPdf(account);
    } catch {
      onNotify?.('error', 'Erreur PDF état global.');
    }
  }

  function openEdit(p) {
    setEditRecord(p);
    setEditForm(paymentToEditForm(p));
    setEditFormErr({});
  }

  async function handleDeletePayment(payment) {
    if (!payment?.id) return;
    const label = [
      payment.projectName || 'Projet',
      Number(payment.amount || 0).toLocaleString('fr-MA', { minimumFractionDigits: 2 }) + ' MAD',
    ].join(' · ');
    if (!window.confirm(`Supprimer ce paiement ?\n${label}\n\nLa ligne de caisse liée sera également retirée.`)) {
      return;
    }
    try {
      await deleteSubcontractorPayment(payment.id);
      onNotify?.('success', 'Paiement supprimé.');
      setEditRecord(null);
      setEditForm(null);
      await load();
    } catch (err) {
      onNotify?.('error', formatSupabaseError(err, 'Erreur suppression paiement.'));
    }
  }

  async function handleEditSave(e) {
    e.preventDefault();
    const err = validateSubcontractorPaymentEdit(editForm);
    if (Object.keys(err).length) { setEditFormErr(err); return; }
    setEditSaving(true);
    try {
      const payload = buildSubcontractorPaymentUpdatePayload(editForm, {
        projectId: editRecord.projectId,
        assignmentId: editRecord.assignmentId,
      });
      await updateSubcontractorPayment(editRecord.id, payload, editRecord.subcontractorId);
      onNotify?.('success', 'Paiement modifié.');
      setEditRecord(null);
      setEditForm(null);
      await load();
    } catch (err) {
      onNotify?.('error', formatSupabaseError(err, 'Erreur modification.'));
    } finally {
      setEditSaving(false);
    }
  }

  async function handleCloseSituation(sit) {
    try {
      await closeSituation(sit.id, subcontractorId);
      onNotify?.('success', 'Situation clôturée.');
      await load();
    } catch (err) {
      onNotify?.('error', formatSupabaseError(err, 'Clôture impossible.'));
    }
  }

  async function handleCreateAdvance(e) {
    e.preventDefault();
    setAdvSaving(true);
    try {
      await createGlobalAdvance(subcontractorId, advForm, {
        subcontractorName: account?.subcontractor?.fullName,
      });
      onNotify?.('success', 'Avance enregistrée (1 écriture caisse).');
      setShowAdvance(false);
      setAdvForm({
        advanceDate: new Date().toISOString().slice(0, 10),
        amount: '',
        paymentMethod: 'virement',
        reference: '',
        observation: '',
      });
      await load();
    } catch (err) {
      onNotify?.('error', formatSupabaseError(err, 'Erreur avance.'));
    } finally {
      setAdvSaving(false);
    }
  }

  async function handleCancelAdvance(adv) {
    try {
      await cancelGlobalAdvance(adv.id, subcontractorId, {
        subcontractorName: account?.subcontractor?.fullName,
      });
      onNotify?.('success', 'Avance annulée.');
      await load();
    } catch (err) {
      onNotify?.('error', formatSupabaseError(err, 'Annulation impossible.'));
    }
  }

  if (loading) {
    return (
      <div className="animate-fade-in rh-ext-page" style={{ textAlign: 'center', padding: 48, color: 'var(--text-3)' }}>
        <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
        Chargement du compte…
      </div>
    );
  }

  if (!account?.subcontractor) {
    return (
      <div className="animate-fade-in rh-ext-page">
        <button type="button" className="rh-ext-back-btn" onClick={onBack}>← Retour</button>
        <p style={{ color: 'var(--text-3)', marginTop: 16 }}>Compte introuvable.</p>
      </div>
    );
  }

  const { subcontractor: sub, kpis, situations, legacySituations, history, documents, payments, advances, imputations } = account;
  const statutLabel = sub.statut === 'actif' ? 'Actif' : (sub.statut || '—');
  const sitRows = situations?.length ? situations : null;

  return (
    <div className="animate-fade-in rh-ext-page st-compte-page">
      <div className="rh-ext-back-bar">
        <button type="button" className="rh-ext-back-btn" onClick={onBack} aria-label="Retour à la liste">
          <ChevronLeft size={16} /> Retour aux situations
        </button>
        <button type="button" className="rh-ext-back-close" onClick={onBack} aria-label="Fermer" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', minWidth: 44, minHeight: 44 }}>
          <X size={20} />
        </button>
      </div>

      <div className="card rh-ext-profile-card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
              <h1 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.35rem', color: 'var(--text)', margin: 0 }}>
                {sub.fullName}
              </h1>
              <span className={`badge ${sub.statut === 'actif' ? 'badge-green' : 'badge-grey'}`}>{statutLabel}</span>
            </div>
            <div style={{ fontSize: '0.88rem', color: 'var(--text-2)' }}>{sub.fonction || '—'}</div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-3)', marginTop: 6 }}>
              {sub.telephone || '—'} · CIN / ID : {sub.cinLabel || '—'}
            </div>
          </div>
          <div className="rh-ext-detail-header-actions st-compte-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleAccountPdf}>
              <FileDown size={14} /> État global PDF
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowAdvance(true)}>
              <Plus size={14} /> Avance globale
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => onNewSituation?.(subcontractorId)}>
              <Plus size={14} /> Nouvelle situation
            </button>
          </div>
        </div>
      </div>

      <div className="stat-grid rh-ext-stat-grid finance-kpi-strip st-compte-kpi" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', marginBottom: 20 }}>
        <Kpi label="Avances versées" value={fmtMAD(kpis.avancesVersees)} accent="#E65100" />
        <Kpi label="Avances consommées" value={fmtMAD(kpis.avancesConsommees)} accent="#E65100" />
        <Kpi label="Reliquat disponible" value={fmtMAD(kpis.reliquatAvance)} accent="#E65100" />
        <Kpi label="Travaux réalisés" value={fmtMAD(kpis.travauxRealises)} />
        <Kpi label="Montants payés" value={fmtMAD(kpis.montantsPayes)} accent="#2E7D32" />
        <Kpi label="Retenues" value={fmtMAD(kpis.retenues)} accent="#C62828" />
        <Kpi label="Reste à payer" value={fmtMAD(kpis.resteAPayer)} accent={kpis.resteAPayer > 0 ? '#C62828' : undefined} />
        <Kpi label="Nombre de projets" value={String(kpis.nombreProjets)} />
        <Kpi label="Situations ouvertes" value={String(kpis.situationsOuvertes)} />
        <Kpi label="Situations soldées" value={String(kpis.situationsSoldees)} />
        <Kpi label="Situations clôturées" value={String(kpis.situationsCloturees)} />
      </div>

      <div className="rh-ext-detail-tabs" style={{ marginBottom: 16 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className="rh-ext-detail-tab-btn"
            style={{
              fontWeight: tab === t.id ? 700 : 500,
              color: tab === t.id ? 'var(--red)' : 'var(--text-2)',
              borderBottom: tab === t.id ? '2px solid var(--red)' : '2px solid transparent',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'general' && (
        <div className="card rh-ext-table-card">
          <div className="card-title" style={{ marginBottom: 12 }}>Informations générales</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 14 }}>
            {[
              ['Nom', sub.fullName],
              ['Métier', sub.fonction || '—'],
              ['Téléphone', sub.telephone || '—'],
              ['Email', sub.email || '—'],
              ['CIN', sub.cinLabel || '—'],
              ['RIB', sub.rib || '—'],
              ['Solde global', fmtMAD(kpis.resteAPayer)],
              ['Reliquat avance', fmtMAD(kpis.reliquatAvance)],
            ].map(([label, val]) => (
              <div key={label}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', textTransform: 'uppercase' }}>{label}</div>
                <div style={{ fontWeight: 600, marginTop: 2 }}>{val}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'situations' && (
        <div className="card rh-ext-table-card">
          <div className="flex-between" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div className="card-title" style={{ margin: 0 }}>Situations par projet</div>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => onNewSituation?.(subcontractorId)}>
              <Plus size={14} /> Nouvelle situation
            </button>
          </div>
          {sitRows ? (
            <>
              <div className="table-wrap st-desktop-only" style={{ padding: 0 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Réf.</th><th>Projet</th><th>Désignation</th><th>Type</th>
                      <th>Qté</th><th>Unité</th><th>PU</th><th>Brut</th>
                      <th>Avance</th><th>Retenues</th><th>Payé</th><th>Net restant</th>
                      <th>Statut</th><th>Créée</th><th>Clôture</th><th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sitRows.map((s) => (
                      <tr key={s.id} className="rh-ext-compact-row">
                        <td data-label="Réf.">{s.reference || '—'}{s.isHistorical ? ' · hist.' : ''}</td>
                        <td data-label="Projet">{s.projectName || '—'}</td>
                        <td data-label="Désignation">{s.designation || '—'}</td>
                        <td data-label="Type">{paymentTypeLabel(s.paymentType)}</td>
                        <td data-label="Qté">{s.quantity || '—'}</td>
                        <td data-label="Unité">{s.unit || '—'}</td>
                        <td data-label="PU">{fmtMAD(s.unitPrice)}</td>
                        <td data-label="Brut">{fmtMAD(s.grossAmount)}</td>
                        <td data-label="Avance" style={{ color: '#E65100' }}>{fmtMAD(s.avancesImputees)}</td>
                        <td data-label="Retenues" style={{ color: '#C62828' }}>{fmtMAD(s.retenues)}</td>
                        <td data-label="Payé" style={{ color: '#2E7D32' }}>{fmtMAD(s.amountPaid)}</td>
                        <td data-label="Restant">{fmtMAD(s.remaining)}</td>
                        <td data-label="Statut">
                          <span className={`badge ${s.status === 'closed' || s.status === 'settled' ? 'badge-green' : s.status === 'cancelled' ? 'badge-grey' : 'badge-orange'}`}>
                            {s.statusLabel || SITUATION_STATUS_LABEL[s.status]}
                          </span>
                        </td>
                        <td data-label="Créée">{fmtDate(s.situationDate || s.created_at)}</td>
                        <td data-label="Clôture">{fmtDate(s.closedAt)}</td>
                        <td data-label="Actions">
                          {s.status === 'settled' && (
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleCloseSituation(s)}>
                              <Lock size={12} /> Clôturer
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="st-mobile-cards">
                {sitRows.map((s) => (
                  <article key={s.id} className="st-situation-card">
                    <header>
                      <strong>{s.reference || 'Situation'}</strong>
                      <span className="badge badge-orange">{s.statusLabel}</span>
                    </header>
                    <p>{s.projectName} · {s.designation || '—'}</p>
                    <dl>
                      <div><dt>Brut</dt><dd>{fmtMAD(s.grossAmount)}</dd></div>
                      <div><dt>Avance</dt><dd>{fmtMAD(s.avancesImputees)}</dd></div>
                      <div><dt>Payé</dt><dd>{fmtMAD(s.amountPaid)}</dd></div>
                      <div><dt>Reste</dt><dd>{fmtMAD(s.remaining)}</dd></div>
                    </dl>
                    {s.status === 'settled' && (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleCloseSituation(s)}>Clôturer</button>
                    )}
                  </article>
                ))}
              </div>
            </>
          ) : (
            <div className="table-wrap" style={{ padding: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th>Projet</th><th>Travaux</th><th>Avances</th><th>Retenues</th><th>Net payé</th><th>Solde</th><th>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {(legacySituations || []).map((s) => (
                    <tr key={s.key}>
                      <td>{s.projectName}</td>
                      <td>{fmtMAD(s.totalTravaux)}</td>
                      <td style={{ color: '#E65100' }}>{fmtMAD(s.totalAvances)}</td>
                      <td style={{ color: '#C62828' }}>{fmtMAD(s.totalRetenues)}</td>
                      <td style={{ color: '#2E7D32' }}>{fmtMAD(s.totalPaye)}</td>
                      <td>{fmtMAD(s.soldeRestant)}</td>
                      <td>{s.statutLabel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-3)', marginTop: 10 }}>
                Exécutez <code>RUN_SUBCONTRACTOR_ACCOUNT_V2.sql</code> pour activer les situations multi-projets détaillées.
              </p>
            </div>
          )}
        </div>
      )}

      {tab === 'avances' && (
        <div className="card rh-ext-table-card">
          <div className="flex-between" style={{ marginBottom: 12 }}>
            <div className="card-title" style={{ margin: 0 }}>Avances globales</div>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowAdvance(true)}>
              <Plus size={14} /> Nouvelle avance
            </button>
          </div>
          {(advances || []).length === 0 ? (
            <p style={{ color: 'var(--text-3)' }}>Aucune avance globale. Le reliquat suivra le sous-traitant entre projets.</p>
          ) : (
            <div className="table-wrap" style={{ padding: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th>Date</th><th>Montant</th><th>Consommé</th><th>Reliquat</th>
                    <th>Mode</th><th>Réf.</th><th>Statut</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {advances.map((a) => (
                    <tr key={a.id}>
                      <td>{fmtDate(a.advanceDate)}</td>
                      <td>{fmtMAD(a.amount)}</td>
                      <td>{fmtMAD(a.consumedAmount)}</td>
                      <td style={{ color: '#E65100', fontWeight: 700 }}>{fmtMAD(a.reliquat)}</td>
                      <td>{a.paymentMethod || '—'}</td>
                      <td>{a.reference || '—'}</td>
                      <td><span className="badge badge-orange">{a.statusLabel}</span></td>
                      <td>
                        {a.status !== 'cancelled' && a.consumedAmount <= 0.009 && (
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleCancelAdvance(a)}>Annuler</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="card-title" style={{ margin: '20px 0 10px' }}>Historique des imputations</div>
          {(imputations || []).length === 0 ? (
            <p style={{ color: 'var(--text-3)', fontSize: '0.85rem' }}>Aucune imputation.</p>
          ) : (
            <div className="table-wrap" style={{ padding: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th>Date</th><th>Projet</th><th>Situation</th><th>Avance utilisée</th><th>Reliquat après</th>
                  </tr>
                </thead>
                <tbody>
                  {imputations.map((i) => (
                    <tr key={i.id}>
                      <td>{fmtDate(i.imputationDate)}</td>
                      <td>{i.projectName || '—'}</td>
                      <td>{i.situationId ? String(i.situationId).slice(0, 8) : '—'}</td>
                      <td style={{ color: '#E65100' }}>{fmtMAD(i.amount)}</td>
                      <td>{fmtMAD(i.reliquatAfter)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'historique' && (
        <div className="card rh-ext-table-card">
          <div className="card-title" style={{ marginBottom: 12 }}>Historique complet</div>
          {history.length === 0 ? (
            <p style={{ color: 'var(--text-3)' }}>Aucun mouvement.</p>
          ) : (
            <div className="table-wrap" style={{ padding: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th>Date</th><th>Type</th><th>Projet</th><th>Brut</th><th>Avances</th>
                    <th>Retenues</th><th>Net</th><th>Obs.</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id}>
                      <td>{fmtDate(h.date)}</td>
                      <td>{h.typeLabel}</td>
                      <td>{h.projectLabel}</td>
                      <td>{fmtMAD(h.montantBrut)}</td>
                      <td style={{ color: '#E65100' }}>{fmtMAD(h.avances)}</td>
                      <td style={{ color: '#C62828' }}>{fmtMAD(h.retenues)}</td>
                      <td style={{ color: '#2E7D32', fontWeight: 700 }}>{fmtMAD(h.montant)}</td>
                      <td>{h.observation || '—'}</td>
                      <td>
                        {h.payment && (
                          <div className="payment-row-actions">
                            <button type="button" className="btn btn-secondary btn-sm" title="Modifier" onClick={() => openEdit(h.payment)}>
                              <Pencil size={13} />
                            </button>
                            <button type="button" className="btn btn-secondary btn-sm" title="PDF" onClick={() => handlePdf(h.payment, false)}>
                              <FileDown size={13} />
                            </button>
                            <button type="button" className="btn btn-secondary btn-sm" title="Imprimer" onClick={() => handlePdf(h.payment, true)}>
                              <Printer size={13} />
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              title="Supprimer"
                              onClick={() => handleDeletePayment(h.payment)}
                              style={{ color: 'var(--red)' }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'documents' && (
        <div className="card rh-ext-table-card">
          <div className="card-title" style={{ marginBottom: 12 }}>Documents & bons de paiement</div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-3)' }}>
            Pièces : {(documents || []).length} · Bons : {(payments || []).length}
          </p>
          {(payments || []).map((p) => (
            <div key={p.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
              <span>{fmtDate(p.paymentDate)} · {p.projectName || '—'} · {fmtMAD(p.amount)}</span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => handlePdf(p, false)}>PDF</button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                title="Supprimer"
                onClick={() => handleDeletePayment(p)}
                style={{ color: 'var(--red)' }}
              >
                <Trash2 size={13} /> Supprimer
              </button>
            </div>
          ))}
        </div>
      )}

      {showAdvance && (
        <div className="rh-ext-modal-overlay">
          <div className="card rh-ext-modal-box rh-ext-modal-box--md">
            <div className="flex-between" style={{ marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontFamily: 'var(--font-head)', fontWeight: 800 }}>Avance globale</h2>
              <button type="button" onClick={() => setShowAdvance(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-3)' }}>
              Une seule opération financière sera créée. L’imputation sur les projets est analytique.
            </p>
            <form onSubmit={handleCreateAdvance} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label>Date<input type="date" value={advForm.advanceDate} onChange={(e) => setAdvForm((p) => ({ ...p, advanceDate: e.target.value }))} required /></label>
              <label>Montant (MAD)<input type="number" min="0.01" step="0.01" value={advForm.amount} onChange={(e) => setAdvForm((p) => ({ ...p, amount: e.target.value }))} required /></label>
              <label>Mode
                <select value={advForm.paymentMethod} onChange={(e) => setAdvForm((p) => ({ ...p, paymentMethod: e.target.value }))}>
                  {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </label>
              <label>Référence<input value={advForm.reference} onChange={(e) => setAdvForm((p) => ({ ...p, reference: e.target.value }))} /></label>
              <label>Observation<input value={advForm.observation} onChange={(e) => setAdvForm((p) => ({ ...p, observation: e.target.value }))} /></label>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAdvance(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={advSaving}>{advSaving ? '…' : 'Enregistrer'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editRecord && editForm && (
        <div className="rh-ext-modal-overlay">
          <div className="card rh-ext-modal-box rh-ext-modal-box--md">
            <form onSubmit={handleEditSave}>
              <SubcontractorPaymentEditForm form={editForm} setF={(f, v) => setEditForm((p) => ({ ...p, [f]: v }))} formErr={editFormErr} />
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ color: 'var(--red)', marginRight: 'auto' }}
                  onClick={() => handleDeletePayment(editRecord)}
                >
                  <Trash2 size={14} /> Supprimer
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => { setEditRecord(null); setEditForm(null); }}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={editSaving}>Enregistrer</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

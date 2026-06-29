/**
 * DemandeAchatDetail.jsx — Tableau de bord demande d'achat (workflow CITYMO)
 */
import { useState, useEffect, useCallback } from 'react';
import {
  ChevronLeft, ClipboardList, History, FileText, CheckCircle, Send,
  Plus, Loader2, Star, Lock, Package, CreditCard, Eye, Edit2, Trash2,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { getPurchaseRequestBundle } from '../../services/achats/purchaseWorkflow';
import {
  submitPurchaseRequest,
  addQuoteToRequest,
  updateQuoteOnRequest,
  removeQuoteFromRequest,
  takeInChargePurchaseRequest,
  validateSupplierQuote,
} from '../../services/achats/purchaseWorkflow';
import { resolveCurrentPurchaseRole, purchasePermissions } from '../../services/achats/purchaseWorkflowRoles';
import { PURCHASE_ASSIGNEE } from '../../constants/purchaseWorkflow';
import {
  canEditPurchaseRequest, canAddQuoteToRequest, canValidateQuoteOnRequest,
  normalizePurchaseStatus, getPurchaseStatusBadge,
} from '../../constants/purchaseWorkflow';
import { generatePurchaseRequestPdf } from '../../services/achats/purchaseRequestPdf';
import {
  SectionTitle, FField, FRow, INPUT_STYLE, SELECT_STYLE, TEXTAREA_STYLE,
  BADGE_PRIORITE, TVA_OPTIONS, UploadField, formatMAD, Modal,
} from './shared.jsx';

const EMPTY_QUOTE = {
  supplier_id: '',
  supplier_name: '',
  ref_devis_fournisseur: '',
  montant_ht: '',
  tva_rate: 20,
  montant_ttc: '',
  delai: '',
  validite: '',
  conditions_paiement: '',
  garantie: '',
  observations: '',
  attachment_url: '',
};

function QuoteComparisonTable({
  quotes, onValidate, canValidate, validatingId, canManage, onEdit, onDelete, onView,
}) {
  if (!quotes?.length) {
    return (
      <div style={{ fontSize: '0.84rem', color: 'var(--text-3)', padding: 16, textAlign: 'center' }}>
        Aucun devis enregistré pour cette demande.
      </div>
    );
  }
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Fournisseur</th>
            <th>Réf. devis</th>
            <th>HT</th>
            <th>TVA</th>
            <th>TTC</th>
            <th>Délai</th>
            <th>Garantie</th>
            <th>Conditions</th>
            <th>Observations</th>
            {canManage && <th>Gestion</th>}
            {canValidate && <th>Validation DG</th>}
          </tr>
        </thead>
        <tbody>
          {quotes.map((q) => (
            <tr key={q.id} style={q.selected ? { background: 'rgba(46, 125, 50, 0.08)' } : undefined}>
              <td>
                <div style={{ fontWeight: 700 }}>{q.supplier_name}</div>
                {q.selected && <span className="badge badge-green" style={{ fontSize: '0.65rem' }}>Retenu</span>}
                {q.verrouille && !q.selected && <span className="badge badge-grey" style={{ fontSize: '0.65rem' }}><Lock size={10} /> Verrouillé</span>}
              </td>
              <td>{q.ref_devis || '—'}</td>
              <td>{formatMAD(q.montant_ht)}</td>
              <td>{q.tva_rate}%</td>
              <td style={{ fontWeight: 700 }}>{formatMAD(q.montant_ttc)}</td>
              <td>{q.delai || '—'}</td>
              <td>{q.garantie || '—'}</td>
              <td>{q.conditions_paiement || '—'}</td>
              <td style={{ maxWidth: 140, fontSize: '0.78rem' }}>{q.observations || '—'}</td>
              {canManage && (
                <td>
                  <div style={{ display: 'flex', gap: 3 }}>
                    <button type="button" className="btn btn-ghost btn-sm" title="Voir" onClick={() => onView(q)}><Eye size={12} /></button>
                    {!q.selected && !q.verrouille && (
                      <>
                        <button type="button" className="btn btn-ghost btn-sm" title="Modifier" onClick={() => onEdit(q)}><Edit2 size={12} /></button>
                        <button type="button" className="btn btn-ghost btn-sm" title="Supprimer" style={{ color: 'var(--red)' }} onClick={() => onDelete(q.id)}><Trash2 size={12} /></button>
                      </>
                    )}
                    {q.attachment_url && (
                      <a href={q.attachment_url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" title="Télécharger PDF">
                        <Download size={12} />
                      </a>
                    )}
                  </div>
                </td>
              )}
              {canValidate && (
                <td>
                  {!q.selected && !q.verrouille && (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={validatingId === q.id}
                      onClick={() => onValidate(q.id)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    >
                      {validatingId === q.id ? <Loader2 size={12} className="cin-spin" /> : <CheckCircle size={12} />}
                      Valider ce devis
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QuoteForm({ suppliers, initial, onSave, onCancel, saving }) {
  const [form, setForm] = useState(() => (initial ? { ...EMPTY_QUOTE, ...initial, ref_devis_fournisseur: initial.ref_devis || initial.ref_devis_fournisseur || '' } : EMPTY_QUOTE));
  const [errors, setErrors] = useState({});
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const fournActifs = suppliers.filter((f) => f.statut === 'Actif' || f.status === 'active');

  function handleSupplierChange(id) {
    const s = fournActifs.find((x) => x.id === id);
    setForm((p) => ({
      ...p,
      supplier_id: id || '',
      supplier_name: s ? (s.company_name || s.nom || s.raison_sociale) : '',
    }));
    if (id) setErrors((e) => ({ ...e, supplier_name: undefined }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!(form.supplier_name || '').trim()) {
      setErrors({ supplier_name: 'Sélectionnez ou saisissez un fournisseur' });
      return;
    }
    setErrors({});
    onSave(form);
  }

  function handleHtChange(val) {
    const ht = parseFloat(val) || 0;
    const tva = parseFloat(form.tva_rate) || 0;
    setForm((p) => ({
      ...p,
      montant_ht: val,
      montant_ttc: ht > 0 ? (ht * (1 + tva / 100)).toFixed(2) : '',
    }));
  }

  function handleTvaChange(val) {
    const ht = parseFloat(form.montant_ht) || 0;
    const tva = parseFloat(val) || 0;
    setForm((p) => ({
      ...p,
      tva_rate: val,
      montant_ttc: ht > 0 ? (ht * (1 + tva / 100)).toFixed(2) : '',
    }));
  }

  return (
    <form onSubmit={handleSubmit}>
      <FRow>
        <FField label="Fournisseur" required>
          {fournActifs.length > 0 && (
            <select
              value={form.supplier_id || ''}
              onChange={(e) => handleSupplierChange(e.target.value)}
              style={{ ...SELECT_STYLE, marginBottom: 8, borderColor: errors.supplier_name ? 'var(--red)' : 'var(--border)' }}
            >
              <option value="">— Sélectionner un fournisseur —</option>
              {fournActifs.map((s) => (
                <option key={s.id} value={s.id}>{s.company_name || s.nom || s.raison_sociale}</option>
              ))}
            </select>
          )}
          <input
            value={form.supplier_name}
            onChange={(e) => setForm((p) => ({
              ...p,
              supplier_name: e.target.value,
              supplier_id: '',
            }))}
            placeholder="Ou saisir le nom du fournisseur..."
            style={{ ...INPUT_STYLE, borderColor: errors.supplier_name ? 'var(--red)' : 'var(--border)' }}
            required
          />
          {errors.supplier_name && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors.supplier_name}</div>}
        </FField>
        <FField label="Réf. devis fournisseur">
          <input value={form.ref_devis_fournisseur} onChange={(e) => set('ref_devis_fournisseur', e.target.value)} style={INPUT_STYLE} placeholder="Réf. fournisseur" />
        </FField>
        <FField label="Montant HT">
          <input type="number" step="0.01" min="0" value={form.montant_ht} onChange={(e) => handleHtChange(e.target.value)} style={INPUT_STYLE} />
        </FField>
        <FField label="TVA %">
          <select value={form.tva_rate} onChange={(e) => handleTvaChange(e.target.value)} style={SELECT_STYLE}>
            {TVA_OPTIONS.map((t) => <option key={t} value={t}>{t}%</option>)}
          </select>
        </FField>
        <FField label="Total TTC">
          <input value={form.montant_ttc} readOnly style={{ ...INPUT_STYLE, background: 'var(--surface-2)' }} />
        </FField>
      </FRow>
      <FRow>
        <FField label="Délai"><input value={form.delai} onChange={(e) => set('delai', e.target.value)} style={INPUT_STYLE} placeholder="ex. 15 jours" /></FField>
        <FField label="Validité"><input value={form.validite} onChange={(e) => set('validite', e.target.value)} style={INPUT_STYLE} placeholder="ex. 30 jours" /></FField>
        <FField label="Conditions paiement"><input value={form.conditions_paiement} onChange={(e) => set('conditions_paiement', e.target.value)} style={INPUT_STYLE} /></FField>
        <FField label="Garantie"><input value={form.garantie} onChange={(e) => set('garantie', e.target.value)} style={INPUT_STYLE} /></FField>
      </FRow>
      <FField label="Observations">
        <textarea value={form.observations} onChange={(e) => set('observations', e.target.value)} style={TEXTAREA_STYLE} />
      </FField>
      <div style={{ marginBottom: 14 }}><UploadField label="Pièce jointe PDF" /></div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel} disabled={saving}>Annuler</button>
        <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
          {saving ? <Loader2 size={13} className="cin-spin" /> : <Plus size={13} />} {initial ? 'Enregistrer' : 'Ajouter devis'}
        </button>
      </div>
    </form>
  );
}

export default function DemandeAchatDetail({
  requestId, onBack, onEdit, onRefresh, suppliers = [], initialShowQuoteForm = false,
}) {
  const { user } = useAuth();
  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [role, setRole] = useState(null);
  const [showQuoteForm, setShowQuoteForm] = useState(initialShowQuoteForm);
  const [editQuote, setEditQuote] = useState(null);
  const [viewQuote, setViewQuote] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [validatingId, setValidatingId] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const load = useCallback(async () => {
    if (!requestId) return;
    setLoading(true);
    setError('');
    try {
      const [data, r] = await Promise.all([
        getPurchaseRequestBundle(requestId),
        resolveCurrentPurchaseRole(user),
      ]);
      setBundle(data);
      setRole(r);
    } catch (err) {
      setError(err.message || 'Erreur chargement');
    } finally {
      setLoading(false);
    }
  }, [requestId, user]);

  useEffect(() => { load(); }, [load]);

  const perms = purchasePermissions(role);
  const request = bundle?.request;
  const quotes = bundle?.quotes || [];
  const history = bundle?.history || [];

  async function runAction(fn) {
    setSaving(true);
    setError('');
    try {
      await fn();
      await load();
      if (onRefresh) await onRefresh();
    } catch (err) {
      setError(err.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>
        <Loader2 size={22} className="cin-spin" /> Chargement de la demande…
      </div>
    );
  }

  if (!request) {
    return (
      <div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>← Retour</button>
        <p style={{ color: 'var(--red)' }}>Demande introuvable.</p>
      </div>
    );
  }

  const projectDisplay = request.projet_lie || request.project_name || request.project_ref || '—';

  const canEdit = canEditPurchaseRequest(request.statut);
  const isTerminal = ['Clôturée', 'Refusée'].includes(request.statut);
  const canManageQuotesOnRequest = perms.canManageQuotes && canAddQuoteToRequest(request.statut);
  const showQuotesSection = !isTerminal;
  const canValidateDg = perms.canValidateSupplier && canValidateQuoteOnRequest(request.statut);

  return (
    <div className="animate-fade-in">
      <button type="button" className="btn btn-ghost btn-sm" style={{ marginBottom: 14, display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={onBack}>
        <ChevronLeft size={15} /> Retour
      </button>

      <div className="flex-between" style={{ marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 4 }}>{request.ref}</h1>
          <p className="page-subtitle">{request.titre}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className={`badge ${BADGE_PRIORITE[request.priorite] || 'badge-grey'}`}>{request.priorite}</span>
          <span className={`badge ${getPurchaseStatusBadge(request.statut)}`}>{normalizePurchaseStatus(request.statut)}</span>
          {canEdit && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={onEdit}>Modifier</button>
          )}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={pdfLoading}
            onClick={async () => {
              setPdfLoading(true);
              try {
                await generatePurchaseRequestPdf(request);
              } catch (err) {
                setError(err.message || 'Erreur PDF');
              } finally {
                setPdfLoading(false);
              }
            }}
          >
            {pdfLoading ? <Loader2 size={13} className="cin-spin" /> : <FileText size={13} />} PDF
          </button>
          {request.statut === 'Brouillon' && (
            <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={() => runAction(() => submitPurchaseRequest(request.id))}>
              <Send size={13} /> Soumettre
            </button>
          )}
          {request.statut === 'Soumise' && perms.canManageQuotes && (
            <button type="button" className="btn btn-secondary btn-sm" disabled={saving} onClick={() => runAction(() => takeInChargePurchaseRequest(request.id))}>
              Prendre en charge
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="card" style={{ marginBottom: 14, padding: 12, color: 'var(--red)', fontSize: '0.85rem' }}>{error}</div>
      )}

      <div className="finance-detail-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card">
            <SectionTitle icon={<ClipboardList size={12} />}>Informations générales</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, fontSize: '0.84rem' }}>
              {[
                ['Projet', projectDisplay],
                ['Demandeur', request.requester_name || request.demandeur || '—'],
                ['Responsable Achats', request.assigned_employee_name || PURCHASE_ASSIGNEE.label],
                ['Fournisseur souhaité', request.payload?.fournisseur_souhaite || request.payload?.lines?.[0]?.fournisseur || '—'],
                ['Quantité', (() => {
                  const l = request.payload?.lines?.[0];
                  if (!l?.quantite && l?.quantite !== 0) return '—';
                  return `${l.quantite} ${l.unite || 'u'}`;
                })()],
                ['Priorité', request.priorite],
                ['Date souhaitée', request.date_limite || '—'],
                ['Créée le', request.date_creation || '—'],
              ].map(([l, v]) => (
                <div key={l}>
                  <span style={{ color: 'var(--text-3)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', display: 'block' }}>{l}</span>
                  <div style={{ fontWeight: 600 }}>{v || '—'}</div>
                </div>
              ))}
            </div>
            {request.description && (
              <div style={{ marginTop: 14, padding: 12, background: 'var(--surface-2)', borderRadius: 8, fontSize: '0.85rem' }}>
                {request.description}
              </div>
            )}
          </div>

          {showQuotesSection && (
            <div className="card">
              <div className="flex-between" style={{ marginBottom: 12 }}>
                <SectionTitle icon={<Star size={12} />}>Devis fournisseurs</SectionTitle>
                {!showQuoteForm && canManageQuotesOnRequest && (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setEditQuote(null); setShowQuoteForm(true); }}>
                    <Plus size={13} /> Ajouter devis
                  </button>
                )}
              </div>
              {request.statut === 'Brouillon' && perms.canManageQuotes && (
                <div style={{ marginBottom: 12, padding: 10, background: '#FFF3E0', borderRadius: 8, fontSize: '0.82rem', color: '#E65100' }}>
                  La demande doit être <strong>soumise</strong> avant d&apos;enregistrer les devis fournisseurs.
                </div>
              )}
              {request.statut === 'Soumise' && perms.canManageQuotes && (
                <div style={{ marginBottom: 12, padding: 10, background: 'var(--surface-2)', borderRadius: 8, fontSize: '0.82rem' }}>
                  Prenez en charge la demande ou ajoutez un devis — le statut évoluera automatiquement.
                </div>
              )}
              {!perms.canManageQuotes && quotes.length === 0 && (
                <div style={{ marginBottom: 12, fontSize: '0.82rem', color: 'var(--text-3)' }}>
                  Les devis seront saisis par la Chargée d&apos;Achats puis validés par le DG.
                </div>
              )}
              {showQuoteForm && (
                <div style={{ marginBottom: 16, padding: 12, border: '1px solid var(--border)', borderRadius: 8 }}>
                  <QuoteForm
                    suppliers={suppliers}
                    initial={editQuote}
                    saving={saving}
                    onCancel={() => { setShowQuoteForm(false); setEditQuote(null); }}
                    onSave={(form) => runAction(async () => {
                      if (editQuote?.id) {
                        await updateQuoteOnRequest(request.id, editQuote.id, form);
                      } else {
                        await addQuoteToRequest(request.id, form);
                      }
                      setShowQuoteForm(false);
                      setEditQuote(null);
                    })}
                  />
                </div>
              )}
              <QuoteComparisonTable
                quotes={quotes}
                canValidate={canValidateDg}
                canManage={canManageQuotesOnRequest}
                validatingId={validatingId}
                onView={setViewQuote}
                onEdit={(q) => { setEditQuote(q); setShowQuoteForm(true); }}
                onDelete={(quoteId) => {
                  if (!window.confirm('Supprimer ce devis ?')) return;
                  runAction(() => removeQuoteFromRequest(request.id, quoteId));
                }}
                onValidate={(quoteId) => runAction(async () => {
                  if (!window.confirm('Valider ce devis ? OA et OP seront créés automatiquement.')) return;
                  setValidatingId(quoteId);
                  try {
                    await validateSupplierQuote(request.id, quoteId);
                  } finally {
                    setValidatingId(null);
                  }
                })}
              />
            </div>
          )}

          <div className="card">
            <SectionTitle icon={<History size={12} />}>Historique</SectionTitle>
            {history.length === 0 ? (
              <p style={{ fontSize: '0.84rem', color: 'var(--text-3)' }}>Aucun événement enregistré.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {history.slice(0, 8).map((h) => (
                  <div key={h.id} style={{ display: 'flex', gap: 10, fontSize: '0.82rem', paddingBottom: 8, borderBottom: '1px solid var(--surface-2)' }}>
                    <div style={{ minWidth: 88, color: 'var(--text-3)', fontSize: '0.75rem' }}>
                      {h.date_label}<br />{h.time_label}
                    </div>
                    <div style={{ flex: 1 }}>
                      <strong>{h.action}</strong>
                      {h.detail && <div style={{ color: 'var(--text-2)' }}>{h.detail}</div>}
                      {h.commentaire && <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', fontStyle: 'italic' }}>{h.commentaire}</div>}
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>{h.user_name}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {history.length > 8 && (
              <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => setShowHistory(true)}>
                Voir tout l&apos;historique
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card">
            <SectionTitle>Workflow</SectionTitle>
            <div style={{ fontSize: '0.82rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {bundle?.acquisitionOrder && (
                <div style={{ padding: 10, background: 'var(--surface-2)', borderRadius: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, marginBottom: 4 }}>
                    <Package size={14} /> Ordre d&apos;achat
                  </div>
                  <div>{bundle.acquisitionOrder.ref} — {bundle.acquisitionOrder.supplier_name}</div>
                  <div style={{ color: 'var(--text-3)' }}>{formatMAD(bundle.acquisitionOrder.montant_ttc)} — {bundle.acquisitionOrder.statut}</div>
                </div>
              )}
              {bundle?.paymentOrder && (
                <div style={{ padding: 10, background: 'var(--surface-2)', borderRadius: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, marginBottom: 4 }}>
                    <CreditCard size={14} /> Ordre de paiement
                  </div>
                  <div>{bundle.paymentOrder.ref} — {formatMAD(bundle.paymentOrder.montant)}</div>
                  <div style={{ color: 'var(--text-3)' }}>{bundle.paymentOrder.statut}</div>
                </div>
              )}
              {['Ordre d\'achat créé', 'Commande envoyée', 'En attente réception', 'Réceptionnée'].includes(request.statut) && (
                <p style={{ fontSize: '0.78rem', color: 'var(--text-3)', margin: 0 }}>
                  Les statuts commande et réception sont mis à jour automatiquement depuis l&apos;ordre d&apos;achat.
                </p>
              )}
            </div>
          </div>

          <div className="card">
            <SectionTitle icon={<FileText size={12} />}>Commentaires internes</SectionTitle>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-2)', margin: 0, whiteSpace: 'pre-wrap' }}>
              {request.commentaires_internes || '—'}
            </p>
          </div>
        </div>
      </div>

      <Modal open={!!viewQuote} onClose={() => setViewQuote(null)} title="Détail devis fournisseur" width={520}>
        {viewQuote && (
          <div style={{ fontSize: '0.84rem', display: 'grid', gap: 10 }}>
            {[
              ['Fournisseur', viewQuote.supplier_name],
              ['Réf. devis', viewQuote.ref_devis || '—'],
              ['HT', formatMAD(viewQuote.montant_ht)],
              ['TVA', `${viewQuote.tva_rate}%`],
              ['TTC', formatMAD(viewQuote.montant_ttc)],
              ['Délai', viewQuote.delai],
              ['Validité', viewQuote.validite],
              ['Conditions paiement', viewQuote.conditions_paiement],
              ['Observations', viewQuote.observations],
            ].map(([l, v]) => (
              <div key={l}><span style={{ color: 'var(--text-3)', fontSize: '0.72rem', fontWeight: 700 }}>{l}</span><div>{v || '—'}</div></div>
            ))}
          </div>
        )}
      </Modal>

      <Modal open={showHistory} onClose={() => setShowHistory(false)} title="Historique complet" width={560}>
        <div style={{ maxHeight: 400, overflowY: 'auto' }}>
          {history.map((h) => (
            <div key={h.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', fontSize: '0.84rem' }}>
              <div style={{ fontWeight: 700 }}>{h.action} <span style={{ fontWeight: 400, color: 'var(--text-3)' }}>— {h.date_label} {h.time_label}</span></div>
              {h.detail && <div>{h.detail}</div>}
              {h.commentaire && <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{h.commentaire}</div>}
              <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>{h.user_name}</div>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}

/**
 * DemandeAchatDetail.jsx — Tableau de bord demande d'achat (workflow CITYMO)
 */
import { useState, useEffect, useCallback } from 'react';
import {
  ChevronLeft, ClipboardList, History, FileText, CheckCircle, Send,
  Plus, Loader2, Star, Lock, Package, CreditCard, Eye, Edit2, Trash2, Download,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import Big from 'big.js';
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
import {
  canEditPurchaseRequest, canAddQuoteToRequest, canValidateQuoteOnRequest,
  getPurchaseStatusBadge, getPurchaseStatusLabel,
  QUOTE_STATUS_BADGE,
} from '../../constants/purchaseWorkflow';
import { generatePurchaseRequestPdf } from '../../services/achats/purchaseRequestPdf';
import { purchaseRequestProjectLabel, isGroupedPurchaseRequest } from '../../services/achats/purchaseRequests';
import { isSuperAdmin } from '../../services/rh/isSuperAdmin';
import { normalizeRequestLines } from '../../services/achats/purchasePdfShared';
import {
  EMPTY_QUOTE_LINE,
  computeQuoteLineTotal,
  normalizeQuoteLines,
  formatQuoteReferencesSummary,
  sumQuoteLinesHt,
} from '../../services/achats/purchaseRequestQuotes';
import PurchaseRequestAttachments from './PurchaseRequestAttachments';
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
  quotes, onValidate, canValidate, validatingId, canManage, canSuperAdminEditSelectedQuote, onEdit, onDelete, onView,
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
            <th>Référence devis</th>
            <th>Montant HT</th>
            <th>TVA</th>
            <th>TTC</th>
            <th>Délai</th>
            <th>Garantie</th>
            <th>Conditions</th>
            <th>Observations</th>
            <th>Pièce jointe</th>
            <th>Statut</th>
            <th>Devis retenu</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {quotes.map((q) => {
            const locked = q.selected || q.verrouille;
            const canEditQuote = (canManage && !locked) || (canSuperAdminEditSelectedQuote && q.selected);
            return (
              <tr key={q.id} style={q.selected ? { background: 'rgba(46, 125, 50, 0.08)' } : undefined}>
                <td style={{ fontWeight: 700 }}>{q.supplier_name}</td>
                <td style={{ maxWidth: 160, fontSize: '0.78rem' }}>
                  {q.lines?.length
                    ? formatQuoteReferencesSummary(q.lines)
                    : (q.ref_devis || '-')}
                </td>
                <td>{formatMAD(q.montant_ht)}</td>
                <td>{q.tva_rate}%</td>
                <td style={{ fontWeight: 700 }}>{formatMAD(q.montant_ttc)}</td>
                <td>{q.delai || '-'}</td>
                <td>{q.garantie || '-'}</td>
                <td style={{ maxWidth: 120, fontSize: '0.78rem' }}>{q.conditions_paiement || '-'}</td>
                <td style={{ maxWidth: 140, fontSize: '0.78rem' }}>{q.observations || '-'}</td>
                <td>
                  {q.attachment_url ? (
                    <a href={q.attachment_url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" title="Voir PDF">
                      <FileText size={12} />
                    </a>
                  ) : '-'}
                </td>
                <td>
                  <span className={`badge ${QUOTE_STATUS_BADGE[q.statut] || 'badge-grey'}`} style={{ fontSize: '0.68rem' }}>
                    {q.statut}
                  </span>
                </td>
                <td style={{ fontWeight: 700, color: q.selected ? 'var(--green)' : 'var(--text-3)' }}>
                  {q.selected ? 'Oui' : 'Non'}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                    <button type="button" className="btn btn-ghost btn-sm" title="Voir détail" onClick={() => onView(q)}>
                      <Eye size={12} />
                    </button>
                    {canEditQuote && (
                      <button type="button" className="btn btn-ghost btn-sm" title={q.selected && canSuperAdminEditSelectedQuote ? 'Modifier (super admin)' : 'Modifier'} onClick={() => onEdit(q)}>
                        <Edit2 size={12} />
                      </button>
                    )}
                    {q.attachment_url && (
                      <a href={q.attachment_url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" title="Télécharger PDF">
                        <Download size={12} />
                      </a>
                    )}
                    {canManage && !locked && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        title="Supprimer"
                        style={{ color: 'var(--red)' }}
                        onClick={() => onDelete(q.id)}
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                    {canValidate && !locked && (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={validatingId === q.id}
                        onClick={() => onValidate(q.id)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      >
                        {validatingId === q.id ? <Loader2 size={12} className="cin-spin" /> : <CheckCircle size={12} />}
                        Valider
                      </button>
                    )}
                    {q.verrouille && !q.selected && (
                      <span className="badge badge-grey" style={{ fontSize: '0.65rem' }}><Lock size={10} /> Verrouillé</span>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function QuoteForm({ suppliers, initial, onSave, onCancel, saving, requestId, requestLines = [], superAdminEdit = false }) {
  const [form, setForm] = useState(() => (initial ? { ...EMPTY_QUOTE, ...initial, ref_devis_fournisseur: initial.ref_devis || initial.ref_devis_fournisseur || '' } : EMPTY_QUOTE));
  const [lines, setLines] = useState(() => {
    const normalized = normalizeQuoteLines(initial?.lines);
    if (normalized.length) return normalized;
    const fromRequest = requestLines || [];
    if (fromRequest.length) {
      return fromRequest.map((l) => ({
        ...EMPTY_QUOTE_LINE(),
        request_line_id: l.id || null,
        designation: l.designation && l.designation !== '—' ? l.designation : (l.designation || ''),
        quantite: l.quantite != null && l.quantite !== '—' ? l.quantite : '',
        unite: l.unite && l.unite !== '—' ? l.unite : 'u',
      }));
    }
    return [EMPTY_QUOTE_LINE()];
  });
  const [attachment, setAttachment] = useState(() => {
    if (!initial?.attachment_url && !initial?.attachment_storage_path) return null;
    return {
      name: initial.attachment_name || 'Pièce jointe',
      storage_path: initial.attachment_storage_path || initial.attachment_url,
      url: initial.attachment_storage_path ? '' : initial.attachment_url,
    };
  });
  const [errors, setErrors] = useState({});
  const [totalEditSource, setTotalEditSource] = useState('ht');
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const fournActifs = suppliers.filter((f) => f.statut === 'Actif' || f.status === 'active');

  function applyTtcToLines(nextLines, targetTtc, tvaRate) {
    const factor = new Big(1).plus(new Big(tvaRate || 0).div(100));
    if (factor.lte(0) || !targetTtc) return nextLines;
    const targetHt = new Big(targetTtc || 0).div(factor);
    const normalized = normalizeQuoteLines(nextLines);
    const currentHt = sumQuoteLinesHt(normalized);
    if (!normalized.length) return nextLines;

    if (normalized.length === 1 || currentHt <= 0) {
      const line = normalized[0];
      const qty = new Big(Number(line.quantite) || 1);
      const remise = new Big(Number(line.remise_pct) || 0);
      const divisor = qty.times(new Big(1).minus(remise.div(100)));
      const safeDiv = divisor.eq(0) ? new Big(1) : divisor;
      const pu = targetHt.div(safeDiv);
      return normalized.map((l, i) => {
        if (i !== 0) return l;
        const qtyVal = l.quantite === '' || l.quantite == null ? '1' : l.quantite;
        const updated = {
          ...l,
          quantite: qtyVal,
          prix_unitaire_ht: pu.gt(0) ? String(pu.round(6, Big.roundHalfUp)) : '',
        };
        updated.montant_ht = computeQuoteLineTotal(updated);
        return updated;
      });
    }

    const ratio = targetHt.div(new Big(currentHt || 1));
    return normalized.map((l) => {
      const pu = new Big(Number(l.prix_unitaire_ht) || 0).times(ratio);
      const updated = { ...l, prix_unitaire_ht: pu.gt(0) ? String(pu.round(6, Big.roundHalfUp)) : '' };
      updated.montant_ht = computeQuoteLineTotal(updated);
      return updated;
    });
  }

  function syncTotalsFromLines(nextLines, tvaRate = form.tva_rate) {
    const normalized = normalizeQuoteLines(nextLines);
    const ht = sumQuoteLinesHt(normalized);
    const tva = new Big(tvaRate || 0);
    const ttc = ht > 0 ? new Big(ht).times(new Big(1).plus(tva.div(100))) : new Big(0);
    setTotalEditSource('ht');
    setForm((p) => ({
      ...p,
      montant_ht: ht > 0 ? ht.toFixed(2) : '',
      montant_ttc: ht > 0 ? String(ttc.round(2, Big.roundHalfUp)) : '',
    }));
  }

  function syncHtOnlyFromLines(nextLines) {
    const ht = sumQuoteLinesHt(normalizeQuoteLines(nextLines));
    setForm((p) => ({
      ...p,
      montant_ht: ht > 0 ? ht.toFixed(2) : '',
    }));
  }

  function updateLine(idx, key, value) {
    setLines((prev) => {
      const next = prev.map((l, i) => {
        if (i !== idx) return l;
        const updated = { ...l, [key]: value };
        updated.montant_ht = computeQuoteLineTotal(updated);
        return updated;
      });
      if (totalEditSource === 'ttc') {
        syncHtOnlyFromLines(next);
      } else {
        syncTotalsFromLines(next);
      }
      return next;
    });
  }

  function addLine() {
    setLines((prev) => [...prev, EMPTY_QUOTE_LINE()]);
  }

  function removeLine(idx) {
    setLines((prev) => {
      const next = prev.length > 1 ? prev.filter((_, i) => i !== idx) : [EMPTY_QUOTE_LINE()];
      if (totalEditSource === 'ttc') syncHtOnlyFromLines(next);
      else syncTotalsFromLines(next);
      return next;
    });
  }

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
    onSave({
      ...form,
      lines: normalizeQuoteLines(lines),
      attachment_url: attachment?.storage_path || attachment?.url || form.attachment_url || '',
    });
  }

  function handleTtcChange(val) {
    setTotalEditSource('ttc');
    const tva = Number(form.tva_rate) || 0;
    const ttc = Number(String(val).replace(',', '.'));
    if (val === '' || Number.isNaN(ttc) || ttc < 0) {
      setForm((p) => ({ ...p, montant_ttc: val }));
      return;
    }
    const next = applyTtcToLines(lines, ttc, tva);
    const ht = sumQuoteLinesHt(normalizeQuoteLines(next));
    setLines(next);
    setForm((p) => ({
      ...p,
      montant_ttc: val,
      montant_ht: ht > 0 ? ht.toFixed(2) : '',
    }));
  }

  function handleTvaChange(val) {
    const tva = parseFloat(val) || 0;
    if (totalEditSource === 'ttc') {
      const ttc = parseFloat(form.montant_ttc) || 0;
      if (ttc > 0) {
        const next = applyTtcToLines(lines, ttc, tva);
        const ht = sumQuoteLinesHt(normalizeQuoteLines(next));
        setLines(next);
        setForm((p) => ({ ...p, tva_rate: val, montant_ht: ht > 0 ? ht.toFixed(2) : '' }));
        return;
      }
    }
    setForm((p) => ({ ...p, tva_rate: val }));
    syncTotalsFromLines(lines, val);
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {superAdminEdit && (
        <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 8, background: 'rgba(198,40,40,0.08)', border: '1px solid rgba(198,40,40,0.25)', fontSize: '0.82rem', color: 'var(--text-2)' }}>
          Modification super administrateur — les changements sur ce devis retenu seront appliqués à l&apos;ordre d&apos;achat et l&apos;ordre de paiement.
        </div>
      )}
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
          <input value={form.ref_devis_fournisseur} onChange={(e) => set('ref_devis_fournisseur', e.target.value)} style={INPUT_STYLE} placeholder="Réf. document fournisseur" />
        </FField>
      </FRow>

      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>Références / lignes</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={addLine}>
            <Plus size={12} /> Ajouter une référence
          </button>
        </div>
        <div className="table-wrap">
          <table style={{ fontSize: '0.78rem' }}>
            <thead>
              <tr>
                <th>Référence</th>
                <th>Désignation</th>
                <th>Qté</th>
                <th>Unité</th>
                <th>P.U. HT</th>
                <th>Remise %</th>
                <th>Total HT</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => (
                <tr key={line.id || idx}>
                  <td><input value={line.reference} onChange={(e) => updateLine(idx, 'reference', e.target.value)} style={{ ...INPUT_STYLE, minWidth: 90 }} placeholder="Réf." /></td>
                  <td><input value={line.designation} onChange={(e) => updateLine(idx, 'designation', e.target.value)} style={{ ...INPUT_STYLE, minWidth: 120 }} placeholder="Désignation" /></td>
                  <td><input type="number" min="0" step="any" value={line.quantite} onChange={(e) => updateLine(idx, 'quantite', e.target.value)} style={{ ...INPUT_STYLE, width: 70 }} /></td>
                  <td><input value={line.unite} onChange={(e) => updateLine(idx, 'unite', e.target.value)} style={{ ...INPUT_STYLE, width: 56 }} /></td>
                  <td>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={line.prix_unitaire_ht}
                      onChange={(e) => updateLine(idx, 'prix_unitaire_ht', e.target.value)}
                      style={{ ...INPUT_STYLE, width: 100 }}
                      placeholder="P.U. HT"
                      title="Valeur libre (ex. 91,666667) — le TTC saisi n'est pas modifié"
                    />
                  </td>
                  <td><input type="number" min="0" max="100" step="any" value={line.remise_pct} onChange={(e) => updateLine(idx, 'remise_pct', e.target.value)} style={{ ...INPUT_STYLE, width: 70 }} /></td>
                  <td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{formatMAD(line.montant_ht || computeQuoteLineTotal(line))}</td>
                  <td>
                    <button type="button" className="btn btn-ghost btn-sm" title="Supprimer la ligne" onClick={() => removeLine(idx)} style={{ color: 'var(--red)' }}>
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <FRow>
        <FField label="Total HT (lignes)">
          <input value={form.montant_ht} readOnly style={{ ...INPUT_STYLE, background: 'var(--surface-2)' }} title="Calculé depuis P.U. HT × quantité" />
        </FField>
        <FField label="TVA %">
          <select value={form.tva_rate} onChange={(e) => handleTvaChange(e.target.value)} style={SELECT_STYLE}>
            {TVA_OPTIONS.map((t) => <option key={t} value={t}>{t}%</option>)}
          </select>
        </FField>
        <FField label="Total TTC">
          <input
            type="text"
            inputMode="decimal"
            value={form.montant_ttc}
            onChange={(e) => handleTtcChange(e.target.value)}
            style={INPUT_STYLE}
            placeholder="TTC fournisseur → calcule le P.U. HT"
            title="Saisissez le TTC exact du devis — il reste fixe si vous ajustez le P.U. HT"
          />
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
      <div style={{ marginBottom: 14 }}>
        <UploadField
          label="Pièce jointe (PDF / image)"
          value={attachment}
          onChange={setAttachment}
          multiple={false}
          scope="quotes"
          scopeId={requestId || 'draft'}
        />
      </div>
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
  requestId, onBack, onEdit, onRefresh, suppliers = [], initialShowQuoteForm = false, refreshKey = 0,
}) {
  const { user } = useAuth();
  const superAdmin = isSuperAdmin(user);
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
  }, [requestId, user, refreshKey]);

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

  const projectDisplay = purchaseRequestProjectLabel(request);
  const isGrouped = isGroupedPurchaseRequest(request);
  const besoinsLines = isGrouped
    ? (request.payload?.lines || [])
    : normalizeRequestLines(request);

  const canEdit = canEditPurchaseRequest(request.statut, { isSuperAdmin: superAdmin });
  const isTerminal = ['Clôturée', 'Refusée'].includes(request.statut);
  const canManageQuotesOnRequest = perms.canManageQuotes && canAddQuoteToRequest(request.statut);
  const canSuperAdminEditSelectedQuote = superAdmin && !!request.selected_quote_id && !isTerminal;
  const showQuotesSection = request.statut !== 'Refusée';
  const quotesReadOnly = isTerminal || (!canManageQuotesOnRequest && !canSuperAdminEditSelectedQuote);
  const canValidateDg = perms.canValidateSupplier && canValidateQuoteOnRequest(request.statut);

  return (
    <div className="animate-fade-in">
      <button type="button" className="btn btn-ghost btn-sm" style={{ marginBottom: 14, display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={onBack}>
        <ChevronLeft size={15} /> Retour
      </button>

      <div className="flex-between" style={{ marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 4 }}>{request.ref}</h1>
          <p className="page-subtitle">{request.titre}{isGrouped && <span className="badge badge-blue" style={{ marginLeft: 8, fontSize: '0.72rem' }}>Achats groupés</span>}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className={`badge ${BADGE_PRIORITE[request.priorite] || 'badge-grey'}`}>{request.priorite}</span>
          <span className={`badge ${getPurchaseStatusBadge(request.statut)}`}>{getPurchaseStatusLabel(request.statut)}</span>
          {canEdit && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={onEdit} title={superAdmin && request.statut !== 'Brouillon' ? 'Modifier (super admin — OA/OP synchronisés)' : 'Modifier'}>
              Modifier
            </button>
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
                ['Responsable', request.assigned_employee_name || request.requester_name || '—'],
                ['Fournisseur souhaité', request.payload?.fournisseur_souhaite || request.payload?.lines?.[0]?.fournisseur || '—'],
                ['Nb. besoins', besoinsLines.length ? `${besoinsLines.length} ligne${besoinsLines.length > 1 ? 's' : ''}` : '—'],
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
            <PurchaseRequestAttachments
              request={request}
              canEdit={canEdit}
              user={user}
              refreshKey={refreshKey}
              onError={setError}
              onUpdated={(updated, resolved) => {
                setBundle((b) => (b ? {
                  ...b,
                  request: {
                    ...updated,
                    payload: { ...updated.payload, attachments: resolved },
                  },
                } : b));
              }}
            />
          </div>

          <div className="card">
            <SectionTitle icon={<Package size={12} />}>Besoins demandés</SectionTitle>
            {besoinsLines.length === 0 ? (
              <p style={{ fontSize: '0.84rem', color: 'var(--text-3)', margin: 0 }}>Aucune ligne enregistrée.</p>
            ) : (
              <div className="table-wrap" style={{ marginTop: 4 }}>
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 40 }}>N°</th>
                      <th>Désignation</th>
                      <th style={{ width: 90 }}>Qté</th>
                      <th style={{ width: 80 }}>Unité</th>
                      {isGrouped && <th>Projet</th>}
                      {isGrouped && <th>Fournisseur</th>}
                      {isGrouped && <th>Commentaire</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {besoinsLines.map((line, idx) => (
                      <tr key={line.id || idx}>
                        <td style={{ color: 'var(--text-3)', fontWeight: 700 }}>{idx + 1}</td>
                        <td style={{ fontWeight: 600 }}>{line.designation || '—'}</td>
                        <td>{line.quantite !== '—' && line.quantite != null && line.quantite !== '' ? line.quantite : '—'}</td>
                        <td>{line.unite || '—'}</td>
                        {isGrouped && <td style={{ fontSize: '0.78rem' }}>{line.projet_lie || line.project_name || '—'}</td>}
                        {isGrouped && <td style={{ fontSize: '0.78rem' }}>{line.fournisseur || '—'}</td>}
                        {isGrouped && <td style={{ fontSize: '0.78rem', color: 'var(--text-2)' }}>{line.commentaire || '—'}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {showQuotesSection && (
            <div className="card">
              <div className="flex-between" style={{ marginBottom: 12 }}>
                <SectionTitle icon={<Star size={12} />}>Devis fournisseurs / Comparatif</SectionTitle>
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
              {request.statut === 'En étude' && perms.canManageQuotes && (
                <div style={{ marginBottom: 12, padding: 10, background: 'var(--surface-2)', borderRadius: 8, fontSize: '0.82rem' }}>
                  Demande en cours de traitement — vous pouvez enregistrer les devis fournisseurs.
                </div>
              )}
              {!perms.canManageQuotes && quotes.length === 0 && (
                <div style={{ marginBottom: 12, fontSize: '0.82rem', color: 'var(--text-3)' }}>
                  Les devis seront saisis par la Chargée d&apos;Achats puis validés par le DG depuis ce comparatif.
                </div>
              )}
              {quotesReadOnly && quotes.length > 0 && !canSuperAdminEditSelectedQuote && (
                <div style={{ marginBottom: 12, fontSize: '0.82rem', color: 'var(--text-3)' }}>
                  Comparatif en lecture seule — validation et saisie effectuées depuis cette demande.
                </div>
              )}
              {canSuperAdminEditSelectedQuote && quotes.some((q) => q.selected) && (
                <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 8, background: 'rgba(198,40,40,0.08)', border: '1px solid rgba(198,40,40,0.25)', fontSize: '0.82rem', color: 'var(--text-2)' }}>
                  Super administrateur — vous pouvez modifier le devis retenu (lignes, montants, fournisseur). Les ordres d&apos;achat et de paiement seront mis à jour automatiquement.
                </div>
              )}
              {showQuoteForm && (
                <div style={{ marginBottom: 16, padding: 12, border: '1px solid var(--border)', borderRadius: 8 }}>
                  <QuoteForm
                    suppliers={suppliers}
                    initial={editQuote}
                    saving={saving}
                    requestId={request.id}
                    requestLines={request.payload?.lines || []}
                    superAdminEdit={superAdmin && editQuote?.selected}
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
                canSuperAdminEditSelectedQuote={canSuperAdminEditSelectedQuote}
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
              {(bundle?.acquisitionOrders?.length ? bundle.acquisitionOrders : (bundle?.acquisitionOrder ? [bundle.acquisitionOrder] : [])).map((oa) => (
                <div key={oa.id} style={{ padding: 10, background: 'var(--surface-2)', borderRadius: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, marginBottom: 4 }}>
                    <Package size={14} /> Ordre d&apos;achat
                    {oa.projet_lie || oa.project_name ? (
                      <span style={{ fontSize: '0.72rem', fontWeight: 500, color: 'var(--text-3)' }}>— {oa.projet_lie || oa.project_name}</span>
                    ) : null}
                  </div>
                  <div>{oa.ref} — {oa.supplier_name}</div>
                  <div style={{ color: 'var(--text-3)' }}>{formatMAD(oa.montant_ttc)} — {oa.statut}</div>
                </div>
              ))}
              {(bundle?.paymentOrders?.length ? bundle.paymentOrders : (bundle?.paymentOrder ? [bundle.paymentOrder] : [])).map((op) => (
                <div key={op.id} style={{ padding: 10, background: 'var(--surface-2)', borderRadius: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, marginBottom: 4 }}>
                    <CreditCard size={14} /> Ordre de paiement
                  </div>
                  <div>{op.ref} — {formatMAD(op.montant)}</div>
                  <div style={{ color: 'var(--text-3)' }}>{op.statut}</div>
                </div>
              ))}
              {['Ordre d\'achat créé', 'Ordre de paiement créé', 'Commande envoyée', 'En attente réception', 'Réceptionnée'].includes(request.statut) && (
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

      <Modal open={!!viewQuote} onClose={() => setViewQuote(null)} title="Détail devis fournisseur" width={640}>
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
            {viewQuote.lines?.length > 0 && (
              <div>
                <span style={{ color: 'var(--text-3)', fontSize: '0.72rem', fontWeight: 700 }}>Références</span>
                <div className="table-wrap" style={{ marginTop: 8 }}>
                  <table style={{ fontSize: '0.78rem' }}>
                    <thead>
                      <tr>
                        <th>Réf.</th>
                        <th>Désignation</th>
                        <th>Qté</th>
                        <th>Unité</th>
                        <th>P.U. HT</th>
                        <th>Remise</th>
                        <th>Total HT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewQuote.lines.map((line) => (
                        <tr key={line.id}>
                          <td>{line.reference || '—'}</td>
                          <td>{line.designation || '—'}</td>
                          <td>{line.quantite || '—'}</td>
                          <td>{line.unite || '—'}</td>
                          <td>{line.prix_unitaire_ht ? formatMAD(line.prix_unitaire_ht) : '—'}</td>
                          <td>{line.remise_pct ? `${line.remise_pct}%` : '—'}</td>
                          <td style={{ fontWeight: 700 }}>{formatMAD(line.montant_ht)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
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

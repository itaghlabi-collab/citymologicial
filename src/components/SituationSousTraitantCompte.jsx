import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive, ChevronLeft, CreditCard, Eye, FileDown, FilePlus, Link2, Loader2, Lock,
  Pencil, Plus, Printer, Trash2, X,
} from 'lucide-react';
import { getSubcontractorAccount } from '../services/rh/subcontractorAccount';
import {
  updateSubcontractorPayment,
  deleteSubcontractorPayment,
  updateSubcontractor,
  archiveSubcontractor,
  createSubcontractorDocument,
  archiveSubcontractorDocument,
  assignPaymentsToProject,
} from '../services/rh/subcontractors';
import { closeSituation, updateSituation, cancelSituation, SITUATION_STATUS_LABEL } from '../services/rh/subcontractorSituations';
import {
  createGlobalAdvance,
  cancelGlobalAdvance,
  updateGlobalAdvance,
  updateImputationAmount,
  imputeAdvanceOnSituation,
  resyncAdvanceConsumedFromImputations,
} from '../services/rh/subcontractorAdvances';
import {
  PAYMENT_METHODS,
  SUBCONTRACTOR_DOC_TYPES,
  RETENTION_TYPES,
  SUB_STATUT_LABEL,
} from '../services/rh/subcontractorConstants';
import { exportSubcontractorPaymentPdf } from '../services/rh/subcontractorPaymentPdf';
import { exportSubcontractorAccountPdf } from '../services/rh/subcontractorAccountPdf';
import { ST_FICHE_TABS } from '../services/rh/sousTraitantRoutes';
import { filterLedger, LEDGER_TYPE_LABEL } from '../services/rh/subcontractorLedger';
import { createEvaluation } from '../services/rh/subcontractorEvaluations';
import { listRetenues, createRetenue, releaseRetenue } from '../services/rh/subcontractorRetenues';
import { logSubcontractorAccountEvent } from '../services/rh/subcontractorAccountEvents';
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

function fmtDateTime(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('fr-MA'); } catch { return iso; }
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

const PAGE_SIZE = 20;

/**
 * Fiche compte sous-traitant — 5 onglets (finance, travaux, documents, historique, analyse).
 */
export default function SituationSousTraitantCompte({
  subcontractorId,
  onBack,
  onNotify,
  onNewSituation,
  onNewPayment,
  initialTab = 'finance',
  onTabChange,
  accountOverride = null,
}) {
  const [loading, setLoading] = useState(!accountOverride);
  const [account, setAccount] = useState(accountOverride);
  const [tab, setTab] = useState(initialTab || 'finance');
  const [retenues, setRetenues] = useState([]);
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
  const [projectPick, setProjectPick] = useState(null);
  const [sitEdit, setSitEdit] = useState(null);
  const [sitSaving, setSitSaving] = useState(false);
  const [showEditFiche, setShowEditFiche] = useState(false);
  const [ficheForm, setFicheForm] = useState({});
  const [ficheSaving, setFicheSaving] = useState(false);
  const [showDoc, setShowDoc] = useState(false);
  const [docForm, setDocForm] = useState({
    doc_type: 'contrat', file_name: '', reference: '', projectId: '', notes: '', documentDate: '',
  });
  const [docSaving, setDocSaving] = useState(false);
  const [showRet, setShowRet] = useState(false);
  const [retForm, setRetForm] = useState({
    retentionType: 'garantie', amount: '', percentage: '', projectId: '', motif: '',
    retentionDate: new Date().toISOString().slice(0, 10), releaseDatePlanned: '', observation: '',
  });
  const [retSaving, setRetSaving] = useState(false);
  const [showEval, setShowEval] = useState(false);
  const [evalForm, setEvalForm] = useState({
    projectId: '', qualite: 3, respectDelais: 3, consignes: 3, securite: 3,
    reactivite: 3, administratif: 3, communication: 3, rapportQualitePrix: 3, commentaire: '',
  });
  const [evalSaving, setEvalSaving] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [advEdit, setAdvEdit] = useState(null);
  const [advEditSaving, setAdvEditSaving] = useState(false);
  const [impEdit, setImpEdit] = useState(null);
  const [impEditSaving, setImpEditSaving] = useState(false);
  const [imputeSit, setImputeSit] = useState(null);
  const [imputeAmount, setImputeAmount] = useState('');
  const [imputeSaving, setImputeSaving] = useState(false);
  const [assignRow, setAssignRow] = useState(null);
  const [assignProjectId, setAssignProjectId] = useState('');
  const [assignSaving, setAssignSaving] = useState(false);
  const [sitDetail, setSitDetail] = useState(null);
  const [ledgerFilters, setLedgerFilters] = useState({
    q: '', type: '', projectId: '', dateFrom: '', dateTo: '',
  });
  const [ledgerPage, setLedgerPage] = useState(0);

  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);

  function changeTab(id) {
    setTab(id);
    onTabChange?.(id);
  }

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
      const [acc, rets] = await Promise.all([
        getSubcontractorAccount(subcontractorId),
        listRetenues(subcontractorId).catch(() => []),
      ]);
      setAccount(acc);
      setRetenues(rets || []);
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
    if (!window.confirm(`Annuler ce paiement ?\n${label}\n\nLa ligne de caisse liée sera retirée.`)) return;
    try {
      await deleteSubcontractorPayment(payment.id);
      onNotify?.('success', 'Paiement annulé.');
      setEditRecord(null);
      setEditForm(null);
      await load();
    } catch (err) {
      onNotify?.('error', formatSupabaseError(err, 'Erreur annulation paiement.'));
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

  function openLegacyProjectEdit(legacyRow) {
    const ids = new Set(legacyRow.paymentIds || []);
    const list = (account?.payments || []).filter((p) => ids.has(p.id));
    if (list.length === 1) { openEdit(list[0]); return; }
    if (list.length === 0) {
      onNotify?.('error', 'Aucun paiement à modifier pour ce projet.');
      return;
    }
    setProjectPick({ projectName: legacyRow.projectName, payments: list });
  }

  function openSituationEdit(s) {
    if (s.status === 'closed') {
      onNotify?.('error', 'Situation clôturée — non modifiable.');
      return;
    }
    setSitEdit({
      id: s.id,
      reference: s.reference || '',
      designation: s.designation || '',
      grossAmount: String(s.grossAmount ?? ''),
      avancesImputees: String(s.avancesImputees ?? ''),
      retenues: String(s.retenues ?? ''),
      amountPaid: String(s.amountPaid ?? ''),
      status: s.status || 'in_progress',
      notes: s.notes || '',
      paymentType: s.paymentType || 'metre',
      quantity: String(s.quantity ?? ''),
      unit: s.unit || '',
      unitPrice: String(s.unitPrice ?? ''),
      projectId: s.projectId || '',
      assignmentId: s.assignmentId || null,
      situationDate: s.situationDate || '',
    });
  }

  async function handleSituationSave(e) {
    e.preventDefault();
    if (!sitEdit?.id) return;
    setSitSaving(true);
    try {
      let gross = Math.max(0, Number(sitEdit.grossAmount) || 0);
      const qty = Number(sitEdit.quantity) || 0;
      const pu = Number(sitEdit.unitPrice) || 0;
      if ((sitEdit.paymentType || 'metre') === 'metre' && qty > 0 && pu > 0) {
        gross = Math.round(qty * pu * 100) / 100;
      }
      const av = Math.min(Math.max(0, Number(sitEdit.avancesImputees) || 0), gross);
      const ret = Math.max(0, Number(sitEdit.retenues) || 0);
      await updateSituation(sitEdit.id, subcontractorId, {
        ...sitEdit,
        grossAmount: gross,
        avancesImputees: av,
        retenues: ret,
        amountPaid: Math.max(0, Number(sitEdit.amountPaid) || 0),
        quantity: qty,
        unitPrice: pu,
      });
      const linked = (account?.payments || []).find((p) => p.situationId === sitEdit.id);
      if (linked) {
        const payload = buildSubcontractorPaymentUpdatePayload(
          paymentToEditForm({ ...linked, grossAmount: gross, avances: av, retenues: ret }),
          { projectId: linked.projectId, assignmentId: linked.assignmentId },
        );
        await updateSubcontractorPayment(linked.id, payload, linked.subcontractorId);
      }
      onNotify?.('success', 'Situation mise à jour.');
      setSitEdit(null);
      await load();
    } catch (err) {
      onNotify?.('error', formatSupabaseError(err, 'Erreur modification situation.'));
    } finally {
      setSitSaving(false);
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

  async function handleSaveAdvanceEdit(e) {
    e.preventDefault();
    if (!advEdit?.id) return;
    const amountChanged = Number(advEdit.amount) !== Number(advEdit._prevAmount);
    if (amountChanged) {
      const ok = window.confirm(
        `Modifier le montant de l’avance (${advEdit._prevAmount} → ${advEdit.amount} MAD) ?\n`
        + 'La caisse ne sera mise à jour que si vous confirmez la sync.',
      );
      if (!ok) return;
    }
    let syncCash = false;
    if (amountChanged) {
      syncCash = window.confirm('Mettre à jour aussi l’écriture de caisse liée à cette avance ?');
    }
    setAdvEditSaving(true);
    try {
      await updateGlobalAdvance(advEdit.id, subcontractorId, advEdit, {
        subcontractorName: account?.subcontractor?.fullName,
        syncCash,
      });
      onNotify?.('success', 'Avance mise à jour.');
      setAdvEdit(null);
      await load();
    } catch (err) {
      onNotify?.('error', formatSupabaseError(err, 'Erreur modification avance.'));
    } finally {
      setAdvEditSaving(false);
    }
  }

  async function handleResyncAdvance(adv) {
    try {
      await resyncAdvanceConsumedFromImputations(adv.id, subcontractorId);
      onNotify?.('success', 'Consommation recalculée depuis les imputations.');
      await load();
    } catch (err) {
      onNotify?.('error', formatSupabaseError(err, 'Resync impossible.'));
    }
  }

  async function handleSaveImpEdit(e) {
    e.preventDefault();
    if (!impEdit?.id) return;
    setImpEditSaving(true);
    try {
      await updateImputationAmount(impEdit.id, subcontractorId, impEdit.newAmount);
      onNotify?.('success', 'Imputation corrigée.');
      setImpEdit(null);
      await load();
    } catch (err) {
      onNotify?.('error', formatSupabaseError(err, 'Erreur imputation.'));
    } finally {
      setImpEditSaving(false);
    }
  }

  async function handleImpute(e) {
    e.preventDefault();
    if (!imputeSit?.id) return;
    setImputeSaving(true);
    try {
      const res = await imputeAdvanceOnSituation({
        subcontractorId,
        situationId: imputeSit.id,
        requestedAmount: imputeAmount === '' ? null : imputeAmount,
        useMax: imputeAmount === '',
      });
      onNotify?.('success', `Imputation : ${fmtMAD(res.imputed)}`);
      setImputeSit(null);
      setImputeAmount('');
      await load();
    } catch (err) {
      onNotify?.('error', formatSupabaseError(err, 'Imputation impossible.'));
    } finally {
      setImputeSaving(false);
    }
  }

  async function handleAssignProject(e) {
    e.preventDefault();
    if (!assignRow || !assignProjectId) return;
    setAssignSaving(true);
    try {
      await assignPaymentsToProject(assignRow.paymentIds || [], assignProjectId);
      onNotify?.('success', 'Projet affecté.');
      setAssignRow(null);
      setAssignProjectId('');
      await load();
    } catch (err) {
      onNotify?.('error', formatSupabaseError(err, 'Affectation impossible.'));
    } finally {
      setAssignSaving(false);
    }
  }

  async function handleCancelSituation(sit) {
    if (!window.confirm(`Annuler la situation ${sit.reference || ''} ?`)) return;
    try {
      await cancelSituation(sit.id, subcontractorId);
      onNotify?.('success', 'Situation annulée.');
      await load();
    } catch (err) {
      onNotify?.('error', formatSupabaseError(err, 'Annulation impossible.'));
    }
  }

  function openEditFiche() {
    const s = account?.subcontractor;
    setFicheForm({
      prenom: s?.prenom || '',
      nom: s?.nom || '',
      raison_sociale: s?.raison_sociale || '',
      telephone: s?.telephone || '',
      email: s?.email || '',
      fonction: s?.fonction || '',
      responsableInterne: s?.responsableInterne || '',
      notes: s?.notes || '',
      statut: s?.statut || 'actif',
    });
    setShowEditFiche(true);
  }

  async function handleSaveFiche(e) {
    e.preventDefault();
    setFicheSaving(true);
    try {
      await updateSubcontractor(subcontractorId, ficheForm);
      onNotify?.('success', 'Fiche mise à jour.');
      setShowEditFiche(false);
      await load();
    } catch (err) {
      onNotify?.('error', formatSupabaseError(err, 'Erreur modification fiche.'));
    } finally {
      setFicheSaving(false);
    }
  }

  async function handleArchive() {
    if (!window.confirm('Archiver ce sous-traitant ? Il ne sera pas supprimé.')) return;
    try {
      await archiveSubcontractor(subcontractorId);
      await logSubcontractorAccountEvent({
        subcontractorId,
        eventType: 'archived',
        observation: 'Archivage depuis la fiche situation',
      }).catch(() => {});
      onNotify?.('success', 'Sous-traitant archivé.');
      onBack?.();
    } catch (err) {
      onNotify?.('error', formatSupabaseError(err, 'Archivage impossible.'));
    }
  }

  async function handleCreateDoc(e) {
    e.preventDefault();
    setDocSaving(true);
    try {
      await createSubcontractorDocument(subcontractorId, docForm);
      await logSubcontractorAccountEvent({
        subcontractorId,
        eventType: 'document_added',
        projectId: docForm.projectId || null,
        observation: docForm.file_name || docForm.doc_type,
      }).catch(() => {});
      onNotify?.('success', 'Document ajouté.');
      setShowDoc(false);
      setDocForm({
        doc_type: 'contrat', file_name: '', reference: '', projectId: '', notes: '', documentDate: '',
      });
      await load();
    } catch (err) {
      onNotify?.('error', formatSupabaseError(err, 'Erreur document.'));
    } finally {
      setDocSaving(false);
    }
  }

  async function handleArchiveDoc(doc) {
    try {
      await archiveSubcontractorDocument(doc.id);
      onNotify?.('success', 'Document archivé.');
      await load();
    } catch (err) {
      onNotify?.('error', formatSupabaseError(err, 'Archivage document impossible (exécutez RUN_SUBCONTRACTOR_FICHE_V3.sql).'));
    }
  }

  async function handleCreateRetenue(e) {
    e.preventDefault();
    setRetSaving(true);
    try {
      await createRetenue(subcontractorId, retForm);
      onNotify?.('success', 'Retenue enregistrée.');
      setShowRet(false);
      await load();
    } catch (err) {
      onNotify?.('error', formatSupabaseError(err, 'Erreur retenue (V3 SQL requis).'));
    } finally {
      setRetSaving(false);
    }
  }

  async function handleReleaseRetenue(r) {
    try {
      await releaseRetenue(r.id, subcontractorId);
      onNotify?.('success', 'Retenue libérée.');
      await load();
    } catch (err) {
      onNotify?.('error', formatSupabaseError(err, 'Libération impossible.'));
    }
  }

  async function handleCreateEval(e) {
    e.preventDefault();
    setEvalSaving(true);
    try {
      await createEvaluation(subcontractorId, evalForm);
      await logSubcontractorAccountEvent({
        subcontractorId,
        eventType: 'evaluation_added',
        projectId: evalForm.projectId || null,
        observation: 'Nouvelle évaluation',
      }).catch(() => {});
      onNotify?.('success', 'Évaluation enregistrée.');
      setShowEval(false);
      await load();
    } catch (err) {
      onNotify?.('error', formatSupabaseError(err, 'Erreur évaluation (exécutez RUN_SUBCONTRACTOR_FICHE_V3.sql).'));
    } finally {
      setEvalSaving(false);
    }
  }

  const ledgerFiltered = useMemo(() => {
    const rows = account?.ledger || [];
    return filterLedger(rows, ledgerFilters);
  }, [account?.ledger, ledgerFilters]);

  const ledgerPageRows = useMemo(() => {
    const start = ledgerPage * PAGE_SIZE;
    return ledgerFiltered.slice(start, start + PAGE_SIZE);
  }, [ledgerFiltered, ledgerPage]);

  const projectGroups = useMemo(() => {
    const situations = account?.situations || [];
    if (situations.length) {
      const map = new Map();
      situations.forEach((s) => {
        const key = String(s.projectId || '') || '__none';
        if (!map.has(key)) {
          map.set(key, {
            key,
            projectId: s.projectId || '',
            projectName: s.projectName || 'Sans projet',
            totalTravaux: 0,
            totalAvances: 0,
            totalRetenues: 0,
            totalPaye: 0,
            lastDate: null,
            situations: [],
          });
        }
        const row = map.get(key);
        row.totalTravaux += Number(s.grossAmount) || 0;
        row.totalAvances += Math.min(Number(s.avancesImputees) || 0, Number(s.grossAmount) || 0);
        row.totalRetenues += Number(s.retenues) || 0;
        row.totalPaye += Number(s.amountPaid) || 0;
        row.situations.push(s);
        const d = s.situationDate || s.created_at;
        if (d && (!row.lastDate || String(d) > String(row.lastDate))) row.lastDate = d;
      });
      return [...map.values()].map((r) => {
        const soldeRestant = Math.max(0, r.totalTravaux - r.totalAvances - r.totalRetenues - r.totalPaye);
        return {
          ...r,
          soldeRestant,
          statutLabel: soldeRestant <= 0.009 ? 'Soldée' : 'Ouverte',
        };
      });
    }
    return account?.legacySituations || [];
  }, [account]);

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

  const {
    subcontractor: sub, kpis, situations, history, documents, payments,
    advances, imputations, performance, evaluations, assignments,
  } = account;
  const statutLabel = SUB_STATUT_LABEL[sub.statut] || sub.statut || '—';
  const sitRows = situations?.length ? situations : null;
  const resteNet = kpis.resteNetAPayer ?? kpis.resteAPayer;

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
          {sub.photoUrl ? (
            <img src={sub.photoUrl} alt="" style={{ width: 64, height: 64, borderRadius: 12, objectFit: 'cover' }} />
          ) : (
            <div style={{
              width: 64, height: 64, borderRadius: 12, background: 'var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontFamily: 'var(--font-head)', color: 'var(--text-2)',
            }}>
              {(sub.fullName || '?').slice(0, 1).toUpperCase()}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
              <h1 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.35rem', color: 'var(--text)', margin: 0 }}>
                {sub.fullName}
              </h1>
              <span className={`badge ${sub.statut === 'actif' ? 'badge-green' : 'badge-grey'}`}>{statutLabel}</span>
            </div>
            <div style={{ fontSize: '0.88rem', color: 'var(--text-2)' }}>{sub.fonction || '—'}</div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-3)', marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: '4px 14px' }}>
              <span>{sub.telephone || '—'}</span>
              <span>{sub.email || '—'}</span>
              <span>CIN / ID : {sub.cinLabel || '—'}</span>
              <span>{kpis.nombreProjets || 0} projet(s)</span>
              <span>Créé : {fmtDate(sub.created_at)}</span>
              {sub.responsableInterne ? <span>Resp. : {sub.responsableInterne}</span> : null}
            </div>
          </div>
          <div className="rh-ext-detail-header-actions st-compte-actions" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={openEditFiche}>
              <Pencil size={14} /> Modifier
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowAdvance(true)}>
              <Plus size={14} /> Avance
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => onNewSituation?.(subcontractorId)}>
              <Plus size={14} /> Situation / Travaux
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => (onNewPayment || onNewSituation)?.(subcontractorId)}>
              <CreditCard size={14} /> Paiement
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowDoc(true)}>
              <FilePlus size={14} /> Document
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleAccountPdf}>
              <FileDown size={14} /> PDF
            </button>
            {sub.statut !== 'archive' && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={handleArchive} style={{ color: 'var(--red)' }}>
                <Archive size={14} /> Archiver
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="stat-grid rh-ext-stat-grid finance-kpi-strip st-compte-kpi" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', marginBottom: 20 }}>
        <Kpi label="Travaux réalisés" value={fmtMAD(kpis.travauxRealises)} />
        <Kpi label="Avances versées" value={fmtMAD(kpis.avancesVersees)} accent="#E65100" />
        <Kpi label="Avances consommées" value={fmtMAD(kpis.avancesConsommees)} accent="#E65100" />
        <Kpi label="Reliquat d’avance" value={fmtMAD(kpis.reliquatAvance)} accent="#E65100" />
        <Kpi label="Montant brut à payer" value={fmtMAD(kpis.montantBrutAPayer)} />
        <Kpi label="Total retenues" value={fmtMAD(kpis.retenues)} accent="#C62828" />
        <Kpi label="Total déjà payé" value={fmtMAD(kpis.montantsPayes)} accent="#2E7D32" />
        <Kpi label="Reste net à payer" value={fmtMAD(resteNet)} accent={resteNet > 0 ? '#C62828' : undefined} />
      </div>
      {kpis._debug?.rawPaymentAvancesUncapped > (kpis.avancesConsommees || 0) + 0.01 && (
        <p style={{ fontSize: '0.78rem', color: 'var(--text-3)', margin: '-8px 0 16px' }}>
          Note : la somme brute des champs « avances » sur paiements (
          {fmtMAD(kpis._debug.rawPaymentAvancesUncapped)}) dépasse les imputations réelles (
          {fmtMAD(kpis.avancesConsommees)}). Les KPI utilisent les imputations plafonnées au brut — pas la somme par projet.
        </p>
      )}

      <div className="rh-ext-detail-tabs" style={{ marginBottom: 16 }}>
        {ST_FICHE_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => changeTab(t.id)}
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

      {tab === 'finance' && (
        <>
          <div className="card rh-ext-table-card" style={{ marginBottom: 16 }}>
            <div className="flex-between" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <div className="card-title" style={{ margin: 0 }}>Avances globales</div>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowAdvance(true)}>
                <Plus size={14} /> Nouvelle avance
              </button>
            </div>
            {(advances || []).length === 0 ? (
              <p style={{ color: 'var(--text-3)' }}>Aucune avance. Le reliquat suit le sous-traitant entre projets.</p>
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
                          <div className="payment-row-actions">
                            <button type="button" className="btn btn-secondary btn-sm" title="Modifier" onClick={() => setAdvEdit({
                              ...a,
                              _prevAmount: a.amount,
                              amount: String(a.amount),
                              advanceDate: a.advanceDate,
                              paymentMethod: a.paymentMethod || 'virement',
                              reference: a.reference || '',
                              observation: a.observation || '',
                            })}>
                              <Pencil size={12} />
                            </button>
                            <button type="button" className="btn btn-secondary btn-sm" title="Resync conso." onClick={() => handleResyncAdvance(a)}>
                              Recalc.
                            </button>
                            {a.status !== 'cancelled' && a.consumedAmount <= 0.009 && (
                              <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleCancelAdvance(a)}>Annuler</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {(imputations || []).length > 0 && (
              <>
                <div className="card-title" style={{ margin: '20px 0 10px' }}>Imputations d’avance</div>
                <div className="table-wrap" style={{ padding: 0 }}>
                  <table>
                    <thead>
                      <tr><th>Date</th><th>Projet</th><th>Situation</th><th>Montant</th><th>Reliquat après</th><th>Actions</th></tr>
                    </thead>
                    <tbody>
                      {imputations.map((i) => (
                        <tr key={i.id}>
                          <td>{fmtDate(i.imputationDate)}</td>
                          <td>{i.projectName || '—'}</td>
                          <td>{i.situationId ? String(i.situationId).slice(0, 8) : '—'}</td>
                          <td style={{ color: '#E65100' }}>{fmtMAD(i.amount)}</td>
                          <td>{fmtMAD(i.reliquatAfter)}</td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              title="Corriger"
                              onClick={() => setImpEdit({
                                ...i,
                                newAmount: String(i.amount),
                              })}
                            >
                              <Pencil size={12} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          <div className="card rh-ext-table-card" style={{ marginBottom: 16 }}>
            <div className="flex-between" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <div className="card-title" style={{ margin: 0 }}>Retenues</div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowRet(true)}>
                <Plus size={14} /> Ajouter une retenue
              </button>
            </div>
            {retenues.length === 0 ? (
              <p style={{ color: 'var(--text-3)', fontSize: '0.85rem' }}>
                Aucune retenue dédiée. Les retenues sur situations/paiements restent dans les KPIs.
              </p>
            ) : (
              <div className="table-wrap" style={{ padding: 0 }}>
                <table>
                  <thead>
                    <tr><th>Date</th><th>Type</th><th>Projet</th><th>Montant</th><th>Statut</th><th>Actions</th></tr>
                  </thead>
                  <tbody>
                    {retenues.map((r) => (
                      <tr key={r.id}>
                        <td>{fmtDate(r.retentionDate)}</td>
                        <td>{r.retentionTypeLabel}</td>
                        <td>{r.projectName || '—'}</td>
                        <td style={{ color: '#C62828' }}>{fmtMAD(r.amount)}</td>
                        <td>{r.statusLabel}</td>
                        <td>
                          {r.status === 'active' && (
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleReleaseRetenue(r)}>Libérer</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card rh-ext-table-card">
            <div className="card-title" style={{ marginBottom: 12 }}>Grand livre</div>
            <div className="st-calcul-grid" style={{ marginBottom: 12 }}>
              <label>Recherche
                <input value={ledgerFilters.q} onChange={(e) => { setLedgerFilters((p) => ({ ...p, q: e.target.value })); setLedgerPage(0); }} placeholder="Libellé, réf…" />
              </label>
              <label>Type
                <select value={ledgerFilters.type} onChange={(e) => { setLedgerFilters((p) => ({ ...p, type: e.target.value })); setLedgerPage(0); }}>
                  <option value="">Tous</option>
                  {Object.entries(LEDGER_TYPE_LABEL).map(([id, lab]) => (
                    <option key={id} value={id}>{lab}</option>
                  ))}
                </select>
              </label>
              <label>Projet
                <select value={ledgerFilters.projectId} onChange={(e) => { setLedgerFilters((p) => ({ ...p, projectId: e.target.value })); setLedgerPage(0); }}>
                  <option value="">Tous</option>
                  {(assignments || []).map((a) => (
                    <option key={a.id} value={a.projectId}>{a.projectName || a.projectRef}</option>
                  ))}
                </select>
              </label>
              <label>Du
                <input type="date" value={ledgerFilters.dateFrom} onChange={(e) => { setLedgerFilters((p) => ({ ...p, dateFrom: e.target.value })); setLedgerPage(0); }} />
              </label>
              <label>Au
                <input type="date" value={ledgerFilters.dateTo} onChange={(e) => { setLedgerFilters((p) => ({ ...p, dateTo: e.target.value })); setLedgerPage(0); }} />
              </label>
            </div>
            <div className="table-wrap" style={{ padding: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th>Date</th><th>Type</th><th>Projet</th><th>Réf.</th><th>Libellé</th>
                    <th>Montant</th><th>Débit</th><th>Crédit</th><th>Solde</th><th>Statut</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerPageRows.length === 0 ? (
                    <tr><td colSpan={11} style={{ color: 'var(--text-3)' }}>Aucune opération.</td></tr>
                  ) : ledgerPageRows.map((r) => (
                    <tr key={r.id}>
                      <td>{fmtDate(r.date)}</td>
                      <td>{r.typeLabel}</td>
                      <td>{r.projectName || '—'}</td>
                      <td>{r.reference || '—'}</td>
                      <td>{r.label || '—'}</td>
                      <td>{fmtMAD(r.amount)}</td>
                      <td>{r.debit ? fmtMAD(r.debit) : '—'}</td>
                      <td>{r.credit ? fmtMAD(r.credit) : '—'}</td>
                      <td style={{ fontWeight: 700 }}>{fmtMAD(r.balanceAfter)}</td>
                      <td>{r.status || '—'}</td>
                      <td>
                        {r.payment && (
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEdit(r.payment)}>
                            <Pencil size={12} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, alignItems: 'center' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-3)' }}>
                {ledgerFiltered.length} ligne(s) · page {ledgerPage + 1}/{Math.max(1, Math.ceil(ledgerFiltered.length / PAGE_SIZE))}
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn-secondary btn-sm" disabled={ledgerPage <= 0} onClick={() => setLedgerPage((p) => p - 1)}>Préc.</button>
                <button type="button" className="btn btn-secondary btn-sm" disabled={(ledgerPage + 1) * PAGE_SIZE >= ledgerFiltered.length} onClick={() => setLedgerPage((p) => p + 1)}>Suiv.</button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={handleAccountPdf}><FileDown size={13} /> Export PDF</button>
              </div>
            </div>
          </div>
        </>
      )}

      {tab === 'travaux' && (
        <div className="card rh-ext-table-card">
          <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))', marginBottom: 16 }}>
            <Kpi label="Projets" value={String(kpis.nombreProjets)} />
            <Kpi label="Situations" value={String(kpis.totalSituations || sitRows?.length || 0)} />
            <Kpi label="Réalisé" value={fmtMAD(kpis.travauxRealises)} />
            <Kpi label="Validé" value={fmtMAD(kpis.montantValide)} />
            <Kpi label="En attente" value={fmtMAD(kpis.montantEnAttente)} />
            <Kpi label="Payé" value={fmtMAD(kpis.montantsPayes)} accent="#2E7D32" />
            <Kpi label="Restant" value={fmtMAD(resteNet)} />
          </div>
          <div className="flex-between" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div className="card-title" style={{ margin: 0 }}>Travaux par projet</div>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => onNewSituation?.(subcontractorId)}>
              <Plus size={14} /> Ajouter une situation
            </button>
          </div>
          <div className="table-wrap" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Projet</th><th>Réalisé</th><th>Avance imputée</th><th>Retenues</th><th>Payé</th><th>Reste</th><th>Statut</th><th>MAJ</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {projectGroups.map((s) => (
                  <tr key={s.key} style={{ cursor: 'pointer', background: selectedProjectId === s.key ? 'color-mix(in srgb, var(--red) 6%, transparent)' : undefined }} onClick={() => setSelectedProjectId(selectedProjectId === s.key ? null : s.key)}>
                    <td>{s.projectName}</td>
                    <td>{fmtMAD(s.totalTravaux)}</td>
                    <td style={{ color: '#E65100' }}>{fmtMAD(s.totalAvances)}</td>
                    <td style={{ color: '#C62828' }}>{fmtMAD(s.totalRetenues)}</td>
                    <td style={{ color: '#2E7D32' }}>{fmtMAD(s.totalPaye)}</td>
                    <td>{fmtMAD(s.soldeRestant)}</td>
                    <td>{s.statutLabel}</td>
                    <td>{fmtDate(s.lastDate)}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="payment-row-actions">
                        <button type="button" className="btn btn-secondary btn-sm" title="Voir" onClick={() => setSelectedProjectId(s.key)}>
                          <Eye size={12} />
                        </button>
                        <button type="button" className="btn btn-secondary btn-sm" title="Situation" onClick={() => onNewSituation?.(subcontractorId)}>
                          <Plus size={12} />
                        </button>
                        {(s.paymentIds || []).length > 0 && (
                          <button type="button" className="btn btn-secondary btn-sm" title="Modifier paiement" onClick={() => openLegacyProjectEdit(s)}>
                            <Pencil size={12} />
                          </button>
                        )}
                        {s.canAssignProject && (
                          <button type="button" className="btn btn-secondary btn-sm" title="Affecter à un projet" onClick={() => { setAssignRow(s); setAssignProjectId(''); }}>
                            <Link2 size={12} /> Affecter
                          </button>
                        )}
                        <button type="button" className="btn btn-secondary btn-sm" title="Paiement" onClick={() => (onNewPayment || onNewSituation)?.(subcontractorId)}>
                          <CreditCard size={12} />
                        </button>
                        <button type="button" className="btn btn-secondary btn-sm" title="PDF" onClick={handleAccountPdf}>
                          <FileDown size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {selectedProjectId && sitRows && (
            <div style={{ marginTop: 16 }}>
              <div className="card-title" style={{ marginBottom: 8 }}>
                Situations — {projectGroups.find((p) => p.key === selectedProjectId)?.projectName || ''}
              </div>
              <div className="table-wrap" style={{ padding: 0 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Réf.</th><th>Date</th><th>Désignation</th><th>Qté</th><th>PU</th><th>Brut</th>
                      <th>Avance</th><th>Retenue</th><th>Payé</th><th>Reste</th><th>Statut</th><th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(projectGroups.find((p) => p.key === selectedProjectId)?.situations || []).map((s) => (
                      <tr key={s.id}>
                        <td>{s.reference || '—'}</td>
                        <td>{fmtDate(s.situationDate)}</td>
                        <td>{s.designation || '—'}</td>
                        <td>{s.quantity || '—'}</td>
                        <td>{fmtMAD(s.unitPrice)}</td>
                        <td>{fmtMAD(s.grossAmount)}</td>
                        <td style={{ color: '#E65100' }}>{fmtMAD(s.avancesImputees)}</td>
                        <td style={{ color: '#C62828' }}>{fmtMAD(s.retenues)}</td>
                        <td style={{ color: '#2E7D32' }}>{fmtMAD(s.amountPaid)}</td>
                        <td>{fmtMAD(s.remaining)}</td>
                        <td><span className="badge badge-orange">{s.statusLabel}</span></td>
                        <td>
                          <div className="payment-row-actions">
                            <button type="button" className="btn btn-secondary btn-sm" title="Détail" onClick={() => setSitDetail(s)}>
                              <Eye size={12} />
                            </button>
                            {s.status !== 'closed' && s.status !== 'cancelled' && (
                              <>
                                <button type="button" className="btn btn-secondary btn-sm" title="Modifier" onClick={() => openSituationEdit(s)}>
                                  <Pencil size={12} />
                                </button>
                                <button type="button" className="btn btn-secondary btn-sm" title="Imputer avance" onClick={() => { setImputeSit(s); setImputeAmount(''); }}>
                                  Avance
                                </button>
                                <button type="button" className="btn btn-secondary btn-sm" title="Paiement" onClick={() => (onNewPayment || onNewSituation)?.(subcontractorId)}>
                                  <CreditCard size={12} />
                                </button>
                              </>
                            )}
                            {s.status === 'settled' && (
                              <button type="button" className="btn btn-secondary btn-sm" title="Clôturer" onClick={() => handleCloseSituation(s)}>
                                <Lock size={12} />
                              </button>
                            )}
                            {s.status !== 'closed' && s.status !== 'cancelled' && (
                              <button type="button" className="btn btn-secondary btn-sm" title="Annuler" style={{ color: 'var(--red)' }} onClick={() => handleCancelSituation(s)}>
                                <Trash2 size={12} />
                              </button>
                            )}
                            <button type="button" className="btn btn-secondary btn-sm" title="PDF" onClick={handleAccountPdf}>
                              <FileDown size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {!sitRows && (
            <p style={{ fontSize: '0.8rem', color: 'var(--text-3)', marginTop: 10 }}>
              Exécutez <code>RUN_SUBCONTRACTOR_ACCOUNT_V2.sql</code> pour le détail des situations.
            </p>
          )}
        </div>
      )}

      {tab === 'documents' && (
        <div className="card rh-ext-table-card">
          <div className="flex-between" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div className="card-title" style={{ margin: 0 }}>Documents</div>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowDoc(true)}>
              <Plus size={14} /> Ajouter
            </button>
          </div>
          {(documents || []).length === 0 ? (
            <p style={{ color: 'var(--text-3)' }}>Aucun document enregistré.</p>
          ) : (
            <div className="table-wrap" style={{ padding: 0 }}>
              <table>
                <thead>
                  <tr><th>Nom</th><th>Catégorie</th><th>Réf.</th><th>Date</th><th>Statut</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {(documents || []).filter((d) => d.status !== 'archived').map((d) => (
                    <tr key={d.id}>
                      <td>{d.file_name || d.nom || '—'}</td>
                      <td>{SUBCONTRACTOR_DOC_TYPES.find((t) => t.id === d.doc_type)?.label || d.doc_type}</td>
                      <td>{d.reference || '—'}</td>
                      <td>{fmtDate(d.document_date || d.created_at)}</td>
                      <td>{d.status || 'active'}</td>
                      <td>
                        {d.storage_path && (
                          <a className="btn btn-secondary btn-sm" href={d.storage_path} target="_blank" rel="noreferrer">Ouvrir</a>
                        )}
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleArchiveDoc(d)}>Archiver</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="card-title" style={{ margin: '20px 0 10px' }}>Bons de paiement (PDF)</div>
          {(payments || []).map((p) => (
            <div key={p.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
              <span>{fmtDate(p.paymentDate)} · {p.projectName || '—'} · {fmtMAD(p.amount)}</span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => handlePdf(p, false)}>PDF</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => handlePdf(p, true)}><Printer size={13} /></button>
            </div>
          ))}
        </div>
      )}

      {tab === 'historique' && (
        <div className="card rh-ext-table-card">
          <div className="card-title" style={{ marginBottom: 12 }}>Historique des actions (lecture seule)</div>
          {(history || []).length === 0 ? (
            <p style={{ color: 'var(--text-3)' }}>Aucun mouvement.</p>
          ) : (
            <div className="table-wrap" style={{ padding: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th>Date</th><th>Action</th><th>Projet</th><th>Réf.</th><th>Montant</th>
                    <th>Observation</th><th>Utilisateur</th><th>Opérations liées</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id}>
                      <td>{fmtDateTime(h.date)}</td>
                      <td>{h.typeLabel}</td>
                      <td>{h.projectLabel || '—'}</td>
                      <td>{h.reference || '—'}</td>
                      <td>{fmtMAD(h.montant || h.montantBrut)}</td>
                      <td>{h.observation || '—'}</td>
                      <td>{h.userLabel || '—'}</td>
                      <td>
                        {h.payment && (
                          <div className="payment-row-actions">
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEdit(h.payment)}><Pencil size={13} /></button>
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => handlePdf(h.payment, false)}><FileDown size={13} /></button>
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleDeletePayment(h.payment)} style={{ color: 'var(--red)' }}><Trash2 size={13} /></button>
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

      {tab === 'analyse' && (
        <div className="card rh-ext-table-card">
          <div className="flex-between" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div className="card-title" style={{ margin: 0 }}>Analyse et performance</div>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowEval(true)}>
              <Plus size={14} /> Évaluer
            </button>
          </div>
          <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', marginBottom: 16 }}>
            <Kpi label="Projets réalisés" value={String(performance?.projetsRealises ?? 0)} />
            <Kpi label="Projets en cours" value={String(performance?.projetsEnCours ?? 0)} />
            <Kpi label="Montant confié" value={fmtMAD(performance?.montantTotalConfie)} />
            <Kpi label="Montant réalisé" value={fmtMAD(performance?.montantTotalRealise)} />
            <Kpi label="Montant payé" value={fmtMAD(performance?.montantTotalPaye)} />
            <Kpi label="Note globale" value={performance?.noteGlobale ? `${performance.noteGlobale} / 5` : '—'} accent="#1565C0" />
            <Kpi label="Taux conformité" value={performance?.tauxConformite != null ? `${performance.tauxConformite} %` : '—'} />
            <Kpi label="Évaluations" value={String(performance?.evaluationsCount ?? 0)} />
          </div>
          {(evaluations || []).length === 0 ? (
            <p style={{ color: 'var(--text-3)' }}>
              Aucune évaluation. Exécutez <code>RUN_SUBCONTRACTOR_FICHE_V3.sql</code> pour activer la table.
            </p>
          ) : (
            <div className="table-wrap" style={{ padding: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th>Date</th><th>Projet</th><th>Note</th><th>Qualité</th><th>Délais</th>
                    <th>Sécurité</th><th>Réactivité</th><th>Commentaire</th>
                  </tr>
                </thead>
                <tbody>
                  {evaluations.map((ev) => (
                    <tr key={ev.id}>
                      <td>{fmtDate(ev.createdAt)}</td>
                      <td>{ev.projectName || '—'}</td>
                      <td style={{ fontWeight: 700 }}>{ev.note}</td>
                      <td>{ev.qualite || '—'}</td>
                      <td>{ev.respectDelais || '—'}</td>
                      <td>{ev.securite || '—'}</td>
                      <td>{ev.reactivite || '—'}</td>
                      <td>{ev.commentaire || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── Modales existantes + nouvelles ─── */}
      {showAdvance && (
        <div className="rh-ext-modal-overlay">
          <div className="card rh-ext-modal-box rh-ext-modal-box--md">
            <div className="flex-between" style={{ marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontFamily: 'var(--font-head)', fontWeight: 800 }}>Avance globale</h2>
              <button type="button" onClick={() => setShowAdvance(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-3)' }}>
              Une seule opération financière. L’imputation sur les projets est analytique.
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

      {showEditFiche && (
        <div className="rh-ext-modal-overlay">
          <div className="card rh-ext-modal-box rh-ext-modal-box--md">
            <div className="flex-between" style={{ marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontFamily: 'var(--font-head)', fontWeight: 800 }}>Modifier la fiche</h2>
              <button type="button" onClick={() => setShowEditFiche(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <form onSubmit={handleSaveFiche} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label>Téléphone<input value={ficheForm.telephone} onChange={(e) => setFicheForm((p) => ({ ...p, telephone: e.target.value }))} /></label>
              <label>Email<input type="email" value={ficheForm.email} onChange={(e) => setFicheForm((p) => ({ ...p, email: e.target.value }))} /></label>
              <label>Spécialité<input value={ficheForm.fonction} onChange={(e) => setFicheForm((p) => ({ ...p, fonction: e.target.value }))} /></label>
              <label>Responsable interne<input value={ficheForm.responsableInterne} onChange={(e) => setFicheForm((p) => ({ ...p, responsableInterne: e.target.value }))} /></label>
              <label>Notes<input value={ficheForm.notes} onChange={(e) => setFicheForm((p) => ({ ...p, notes: e.target.value }))} /></label>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowEditFiche(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={ficheSaving}>{ficheSaving ? '…' : 'Enregistrer'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDoc && (
        <div className="rh-ext-modal-overlay">
          <div className="card rh-ext-modal-box rh-ext-modal-box--md">
            <div className="flex-between" style={{ marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontFamily: 'var(--font-head)', fontWeight: 800 }}>Ajouter un document</h2>
              <button type="button" onClick={() => setShowDoc(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <form onSubmit={handleCreateDoc} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label>Catégorie
                <select value={docForm.doc_type} onChange={(e) => setDocForm((p) => ({ ...p, doc_type: e.target.value }))}>
                  {SUBCONTRACTOR_DOC_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </label>
              <label>Nom *<input value={docForm.file_name} onChange={(e) => setDocForm((p) => ({ ...p, file_name: e.target.value }))} required /></label>
              <label>Référence<input value={docForm.reference} onChange={(e) => setDocForm((p) => ({ ...p, reference: e.target.value }))} /></label>
              <label>Projet
                <select value={docForm.projectId} onChange={(e) => setDocForm((p) => ({ ...p, projectId: e.target.value }))}>
                  <option value="">—</option>
                  {(assignments || []).map((a) => (
                    <option key={a.id} value={a.projectId}>{a.projectName || a.projectRef}</option>
                  ))}
                </select>
              </label>
              <label>Date document<input type="date" value={docForm.documentDate} onChange={(e) => setDocForm((p) => ({ ...p, documentDate: e.target.value }))} /></label>
              <label>Description / chemin fichier<input value={docForm.notes} onChange={(e) => setDocForm((p) => ({ ...p, notes: e.target.value }))} /></label>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowDoc(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={docSaving}>{docSaving ? '…' : 'Enregistrer'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showRet && (
        <div className="rh-ext-modal-overlay">
          <div className="card rh-ext-modal-box rh-ext-modal-box--md">
            <div className="flex-between" style={{ marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontFamily: 'var(--font-head)', fontWeight: 800 }}>Ajouter une retenue</h2>
              <button type="button" onClick={() => setShowRet(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <form onSubmit={handleCreateRetenue} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label>Type
                <select value={retForm.retentionType} onChange={(e) => setRetForm((p) => ({ ...p, retentionType: e.target.value }))}>
                  {RETENTION_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </label>
              <label>Montant (MAD)<input type="number" min="0" step="0.01" value={retForm.amount} onChange={(e) => setRetForm((p) => ({ ...p, amount: e.target.value }))} /></label>
              <label>Projet
                <select value={retForm.projectId} onChange={(e) => setRetForm((p) => ({ ...p, projectId: e.target.value }))}>
                  <option value="">—</option>
                  {(assignments || []).map((a) => (
                    <option key={a.id} value={a.projectId}>{a.projectName || a.projectRef}</option>
                  ))}
                </select>
              </label>
              <label>Date<input type="date" value={retForm.retentionDate} onChange={(e) => setRetForm((p) => ({ ...p, retentionDate: e.target.value }))} /></label>
              <label>Libération prévue<input type="date" value={retForm.releaseDatePlanned} onChange={(e) => setRetForm((p) => ({ ...p, releaseDatePlanned: e.target.value }))} /></label>
              <label>Motif<input value={retForm.motif} onChange={(e) => setRetForm((p) => ({ ...p, motif: e.target.value }))} /></label>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowRet(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={retSaving}>{retSaving ? '…' : 'Enregistrer'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEval && (
        <div className="rh-ext-modal-overlay">
          <div className="card rh-ext-modal-box rh-ext-modal-box--md">
            <div className="flex-between" style={{ marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontFamily: 'var(--font-head)', fontWeight: 800 }}>Évaluation (1–5)</h2>
              <button type="button" onClick={() => setShowEval(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <form onSubmit={handleCreateEval} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label>Projet
                <select value={evalForm.projectId} onChange={(e) => setEvalForm((p) => ({ ...p, projectId: e.target.value }))}>
                  <option value="">—</option>
                  {(assignments || []).map((a) => (
                    <option key={a.id} value={a.projectId}>{a.projectName || a.projectRef}</option>
                  ))}
                </select>
              </label>
              {[
                ['qualite', 'Qualité des travaux'],
                ['respectDelais', 'Respect des délais'],
                ['consignes', 'Respect des consignes'],
                ['securite', 'Sécurité'],
                ['reactivite', 'Réactivité'],
                ['administratif', 'Qualité administrative'],
                ['communication', 'Communication'],
                ['rapportQualitePrix', 'Rapport qualité-prix'],
              ].map(([k, lab]) => (
                <label key={k}>{lab}
                  <select value={evalForm[k]} onChange={(e) => setEvalForm((p) => ({ ...p, [k]: Number(e.target.value) }))}>
                    {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
              ))}
              <label>Commentaire<input value={evalForm.commentaire} onChange={(e) => setEvalForm((p) => ({ ...p, commentaire: e.target.value }))} /></label>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowEval(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={evalSaving}>{evalSaving ? '…' : 'Enregistrer'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editRecord && editForm && (
        <div className="rh-ext-modal-overlay">
          <div className="card rh-ext-modal-box rh-ext-modal-box--md">
            <form onSubmit={handleEditSave}>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-3)', marginTop: 0 }}>
                L’avance est plafonnée au montant brut (net = brut − avances − retenues).
              </p>
              <SubcontractorPaymentEditForm form={editForm} setF={(f, v) => setEditForm((p) => ({ ...p, [f]: v }))} formErr={editFormErr} />
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-secondary" style={{ color: 'var(--red)', marginRight: 'auto' }} onClick={() => handleDeletePayment(editRecord)}>
                  <Trash2 size={14} /> Annuler l’opération
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => { setEditRecord(null); setEditForm(null); }}>Fermer</button>
                <button type="submit" className="btn btn-primary" disabled={editSaving}>Enregistrer</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {projectPick && (
        <div className="rh-ext-modal-overlay">
          <div className="card rh-ext-modal-box rh-ext-modal-box--md">
            <div className="flex-between" style={{ marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontFamily: 'var(--font-head)', fontWeight: 800 }}>Modifier — {projectPick.projectName}</h2>
              <button type="button" onClick={() => setProjectPick(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {projectPick.payments.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="btn btn-secondary"
                  style={{ justifyContent: 'flex-start', textAlign: 'left' }}
                  onClick={() => { setProjectPick(null); openEdit(p); }}
                >
                  {fmtDate(p.paymentDate)} · Brut {fmtMAD(p.grossAmount)} · Net {fmtMAD(p.amount)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {sitEdit && (
        <div className="rh-ext-modal-overlay">
          <div className="card rh-ext-modal-box rh-ext-modal-box--md">
            <div className="flex-between" style={{ marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontFamily: 'var(--font-head)', fontWeight: 800 }}>Modifier la situation</h2>
              <button type="button" onClick={() => setSitEdit(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <form onSubmit={handleSituationSave} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label>Référence<input value={sitEdit.reference} onChange={(e) => setSitEdit((p) => ({ ...p, reference: e.target.value }))} /></label>
              <label>Désignation<input value={sitEdit.designation} onChange={(e) => setSitEdit((p) => ({ ...p, designation: e.target.value }))} /></label>
              <label>Quantité<input type="number" min="0" step="0.01" value={sitEdit.quantity} onChange={(e) => setSitEdit((p) => ({ ...p, quantity: e.target.value }))} /></label>
              <label>Unité<input value={sitEdit.unit} onChange={(e) => setSitEdit((p) => ({ ...p, unit: e.target.value }))} /></label>
              <label>Prix unitaire<input type="number" min="0" step="0.01" value={sitEdit.unitPrice} onChange={(e) => setSitEdit((p) => ({ ...p, unitPrice: e.target.value }))} /></label>
              <label>Montant brut (MAD)<input type="number" min="0" step="0.01" value={sitEdit.grossAmount} onChange={(e) => setSitEdit((p) => ({ ...p, grossAmount: e.target.value }))} /></label>
              <label>Avance imputée (MAD)<input type="number" min="0" step="0.01" value={sitEdit.avancesImputees} onChange={(e) => setSitEdit((p) => ({ ...p, avancesImputees: e.target.value }))} /></label>
              <label>Retenues (MAD)<input type="number" min="0" step="0.01" value={sitEdit.retenues} onChange={(e) => setSitEdit((p) => ({ ...p, retenues: e.target.value }))} /></label>
              <label>Net déjà payé (MAD)<input type="number" min="0" step="0.01" value={sitEdit.amountPaid} onChange={(e) => setSitEdit((p) => ({ ...p, amountPaid: e.target.value }))} /></label>
              <label>Observation<input value={sitEdit.notes || ''} onChange={(e) => setSitEdit((p) => ({ ...p, notes: e.target.value }))} /></label>
              <label>Statut
                <select value={sitEdit.status} onChange={(e) => setSitEdit((p) => ({ ...p, status: e.target.value }))}>
                  {Object.entries(SITUATION_STATUS_LABEL).filter(([k]) => k !== 'closed').map(([k, lab]) => (
                    <option key={k} value={k}>{lab}</option>
                  ))}
                </select>
              </label>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-3)', margin: 0 }}>
                Aucune nouvelle écriture de caisse. Avance plafonnée au brut. Net = max(0, brut − avance − retenues).
              </p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setSitEdit(null)}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={sitSaving}>{sitSaving ? '…' : 'Enregistrer'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {advEdit && (
        <div className="rh-ext-modal-overlay">
          <div className="card rh-ext-modal-box rh-ext-modal-box--md">
            <div className="flex-between" style={{ marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontFamily: 'var(--font-head)', fontWeight: 800 }}>Modifier l’avance</h2>
              <button type="button" onClick={() => setAdvEdit(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <form onSubmit={handleSaveAdvanceEdit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label>Date<input type="date" value={advEdit.advanceDate} onChange={(e) => setAdvEdit((p) => ({ ...p, advanceDate: e.target.value }))} /></label>
              <label>Montant (MAD)<input type="number" min="0" step="0.01" value={advEdit.amount} onChange={(e) => setAdvEdit((p) => ({ ...p, amount: e.target.value }))} /></label>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-3)', margin: 0 }}>
                Déjà consommé : {fmtMAD(advEdit.consumedAmount)} — le montant ne peut pas descendre en dessous.
              </p>
              <label>Mode
                <select value={advEdit.paymentMethod} onChange={(e) => setAdvEdit((p) => ({ ...p, paymentMethod: e.target.value }))}>
                  {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </label>
              <label>Référence<input value={advEdit.reference} onChange={(e) => setAdvEdit((p) => ({ ...p, reference: e.target.value }))} /></label>
              <label>Observation<input value={advEdit.observation} onChange={(e) => setAdvEdit((p) => ({ ...p, observation: e.target.value }))} /></label>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setAdvEdit(null)}>Fermer</button>
                <button type="submit" className="btn btn-primary" disabled={advEditSaving}>{advEditSaving ? '…' : 'Enregistrer'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {impEdit && (
        <div className="rh-ext-modal-overlay">
          <div className="card rh-ext-modal-box rh-ext-modal-box--md">
            <div className="flex-between" style={{ marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontFamily: 'var(--font-head)', fontWeight: 800 }}>Corriger l’imputation</h2>
              <button type="button" onClick={() => setImpEdit(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <form onSubmit={handleSaveImpEdit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>Projet : <strong>{impEdit.projectName || '—'}</strong></div>
              <div>Montant actuel : <strong>{fmtMAD(impEdit.amount)}</strong></div>
              <label>Nouveau montant (MAD)
                <input type="number" min="0" step="0.01" value={impEdit.newAmount} onChange={(e) => setImpEdit((p) => ({ ...p, newAmount: e.target.value }))} required />
              </label>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>Analytique uniquement — aucune écriture de caisse.</p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setImpEdit(null)}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={impEditSaving}>{impEditSaving ? '…' : 'Enregistrer'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {imputeSit && (
        <div className="rh-ext-modal-overlay">
          <div className="card rh-ext-modal-box rh-ext-modal-box--md">
            <div className="flex-between" style={{ marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontFamily: 'var(--font-head)', fontWeight: 800 }}>Imputer une avance</h2>
              <button type="button" onClick={() => setImputeSit(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <form onSubmit={handleImpute} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>{imputeSit.reference || 'Situation'} — {imputeSit.projectName || '—'}</div>
              <div>Brut : {fmtMAD(imputeSit.grossAmount)} · Déjà imputé : {fmtMAD(imputeSit.avancesImputees)}</div>
              <div>Reliquat dispo. : <strong style={{ color: '#E65100' }}>{fmtMAD(kpis.reliquatAvance)}</strong></div>
              <label>Montant à imputer (vide = max)
                <input type="number" min="0" step="0.01" value={imputeAmount} onChange={(e) => setImputeAmount(e.target.value)} placeholder="Maximum auto" />
              </label>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setImputeSit(null)}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={imputeSaving}>{imputeSaving ? '…' : 'Imputer'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {assignRow && (
        <div className="rh-ext-modal-overlay">
          <div className="card rh-ext-modal-box rh-ext-modal-box--md">
            <div className="flex-between" style={{ marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontFamily: 'var(--font-head)', fontWeight: 800 }}>Affecter à un projet</h2>
              <button type="button" onClick={() => setAssignRow(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <form onSubmit={handleAssignProject} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-3)' }}>
                Régularisation de « {assignRow.projectName} » — {(assignRow.paymentIds || []).length} paiement(s).
              </p>
              <label>Projet *
                <select value={assignProjectId} onChange={(e) => setAssignProjectId(e.target.value)} required>
                  <option value="">Choisir…</option>
                  {(assignments || []).filter((a) => a.projectId).map((a) => (
                    <option key={a.id} value={a.projectId}>{a.projectName || a.projectRef}</option>
                  ))}
                </select>
              </label>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setAssignRow(null)}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={assignSaving}>{assignSaving ? '…' : 'Affecter'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {sitDetail && (
        <div className="rh-ext-modal-overlay">
          <div className="card rh-ext-modal-box rh-ext-modal-box--md">
            <div className="flex-between" style={{ marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontFamily: 'var(--font-head)', fontWeight: 800 }}>Détail situation</h2>
              <button type="button" onClick={() => setSitDetail(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, margin: 0 }}>
              <div><dt style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Réf.</dt><dd>{sitDetail.reference || '—'}</dd></div>
              <div><dt style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Projet</dt><dd>{sitDetail.projectName || 'Sans projet'}</dd></div>
              <div><dt style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Désignation</dt><dd>{sitDetail.designation || '—'}</dd></div>
              <div><dt style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Statut</dt><dd>{sitDetail.statusLabel}</dd></div>
              <div><dt style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Brut</dt><dd>{fmtMAD(sitDetail.grossAmount)}</dd></div>
              <div><dt style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Avance imputée</dt><dd>{fmtMAD(sitDetail.avancesImputees)}</dd></div>
              <div><dt style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Retenues</dt><dd>{fmtMAD(sitDetail.retenues)}</dd></div>
              <div><dt style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Payé</dt><dd>{fmtMAD(sitDetail.amountPaid)}</dd></div>
              <div><dt style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Reste</dt><dd>{fmtMAD(sitDetail.remaining)}</dd></div>
            </dl>
            <div style={{ marginTop: 14, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              {sitDetail.status !== 'closed' && (
                <button type="button" className="btn btn-secondary" onClick={() => { setSitDetail(null); openSituationEdit(sitDetail); }}>Modifier</button>
              )}
              <button type="button" className="btn btn-primary" onClick={() => setSitDetail(null)}>Fermer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

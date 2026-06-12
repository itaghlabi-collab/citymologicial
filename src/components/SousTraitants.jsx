import {
  Users, Plus, Search, X, ChevronLeft, Eye, Edit2, Trash2, Download,
  FolderKanban, ClipboardList, Banknote, Scale, FileText, Loader2, RefreshCw,
} from 'lucide-react';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSubcontractors } from '../hooks/useSubcontractors';
import { generateSubcontractorProjectPdf } from '../services/rh/subcontractorProjectPdf';
import {
  REMUNERATION_TYPES, UNIT_TYPES, ASSIGNMENT_STATUSES, SERVICE_STATUSES,
  PAYMENT_METHODS, SUB_STATUTS, ASSIGNMENT_STATUS_LABEL, SERVICE_STATUS_LABEL,
  SUB_STATUT_LABEL, PAYMENT_BALANCE_LABEL, PAYMENT_TYPES, PAYMENT_UNITS,
  PAYMENT_STATUS_UI, paymentStatusToDb, paymentStatusFromDb,
} from '../services/rh/subcontractorConstants';

function fmtMAD(n) {
  return Number(n || 0).toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' MAD';
}
function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('fr-MA'); } catch { return d; }
}
const INPUT_S = (err) => ({
  padding: '9px 12px', width: '100%', outline: 'none', boxSizing: 'border-box',
  fontFamily: 'var(--font-body)', fontSize: '0.9rem', borderRadius: 'var(--radius)',
  border: '1.5px solid ' + (err ? 'var(--red)' : 'var(--border)'), background: '#fff',
});

const TABS = [
  { id: 'info', label: 'Informations', icon: Users },
  { id: 'projects', label: 'Projets affectés', icon: FolderKanban },
  { id: 'services', label: 'Prestations réalisées', icon: ClipboardList },
  { id: 'payments', label: 'Paiements', icon: Banknote },
  { id: 'balances', label: 'Solde par projet', icon: Scale },
  { id: 'documents', label: 'Documents', icon: FileText },
];

const EMPTY_PAYMENT = {
  projectId: '',
  paymentDate: new Date().toISOString().slice(0, 10),
  paymentType: 'metre',
  paymentMethod: 'virement',
  reference: '',
  description: '',
  statusUi: 'En attente',
  selected: {},
};

function calcSubPaymentAmount(type, line) {
  if (type === 'metre') {
    return Math.round((Number(line.quantity) || 0) * (Number(line.unitPrice) || 0) * 100) / 100;
  }
  return Math.round((Number(line.amount) || 0) * 100) / 100;
}

function paymentTypeLabel(type) {
  return PAYMENT_TYPES.find((t) => t.id === type)?.label || type || '—';
}

const EMPTY_SUB = {
  prenom: '', nom: '', raison_sociale: '', fonction: '', numero_cin: '', passeport: '',
  telephone: '', email: '', adresse: '', ice: '', statut: 'actif', notes: '',
};

export default function SousTraitants() {
  const {
    items, projects, loading, saving, error, configured, load, loadDetail,
    create, update, remove, createAssignment, createService, updateService,
    createPaymentBatch, listAssignmentsByProject,
  } = useSubcontractors();

  const [view, setView] = useState('list');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [tab, setTab] = useState('info');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [formErr, setFormErr] = useState({});
  const [toast, setToast] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [projectAssignments, setProjectAssignments] = useState([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);

  const setF = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const notify = (msg, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const refreshDetail = useCallback(async (id) => {
    if (!id) return;
    setDetailLoading(true);
    try {
      const d = await loadDetail(id);
      setDetail(d);
    } catch (e) {
      notify(e.message || 'Erreur chargement fiche.', false);
    } finally {
      setDetailLoading(false);
    }
  }, [loadDetail]);

  useEffect(() => {
    if (selectedId && view === 'detail') refreshDetail(selectedId);
  }, [selectedId, view, refreshDetail]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((s) =>
      s.fullName.toLowerCase().includes(q)
      || s.fonction?.toLowerCase().includes(q)
      || s.numero_cin?.toLowerCase().includes(q)
      || s.passeport?.toLowerCase().includes(q),
    );
  }, [items, search]);

  function openList() {
    setView('list');
    setSelectedId(null);
    setDetail(null);
    setTab('info');
  }

  async function openDetail(id) {
    setSelectedId(id);
    setView('detail');
    setTab('info');
  }

  function openModal(type, payload = {}) {
    setModal(type);
    setFormErr({});
    if (type === 'sub-create') setForm({ ...EMPTY_SUB });
    else if (type === 'sub-edit') setForm({ ...EMPTY_SUB, ...payload });
    else if (type === 'payment') {
      setForm({ ...EMPTY_PAYMENT, ...payload });
      setProjectAssignments([]);
    } else setForm({ ...payload });
  }

  useEffect(() => {
    if (modal !== 'payment' || !form.projectId) {
      if (modal !== 'payment') setProjectAssignments([]);
      return;
    }
    setAssignmentsLoading(true);
    listAssignmentsByProject(form.projectId)
      .then(setProjectAssignments)
      .catch(() => setProjectAssignments([]))
      .finally(() => setAssignmentsLoading(false));
  }, [modal, form.projectId, listAssignmentsByProject]);

  const paymentSelectedLines = useMemo(() => {
    return Object.entries(form.selected || {})
      .filter(([, v]) => v.checked)
      .map(([assignmentId, v]) => ({ assignmentId, ...v }));
  }, [form.selected]);

  const paymentBatchTotal = useMemo(
    () => paymentSelectedLines.reduce((s, l) => s + calcSubPaymentAmount(form.paymentType, l), 0),
    [paymentSelectedLines, form.paymentType],
  );

  function handlePaymentProjectChange(projectId) {
    setForm((p) => ({ ...p, projectId, selected: {} }));
  }

  function toggleSubPayment(assignment) {
    setForm((p) => {
      const sel = { ...(p.selected || {}) };
      if (sel[assignment.id]?.checked) {
        delete sel[assignment.id];
      } else {
        sel[assignment.id] = {
          checked: true,
          subcontractorId: assignment.subcontractorId,
          designation: '',
          quantity: '',
          unit: 'm²',
          unitPrice: '',
          amount: '',
        };
      }
      return { ...p, selected: sel };
    });
  }

  function setSubPaymentField(assignmentId, field, value) {
    setForm((p) => ({
      ...p,
      selected: {
        ...p.selected,
        [assignmentId]: { ...p.selected[assignmentId], [field]: value },
      },
    }));
  }

  async function handleSaveSub(e) {
    e?.preventDefault?.();
    const err = {};
    if (!form.nom?.trim() && !form.raison_sociale?.trim()) err.nom = 'Nom ou raison sociale requis';
    if (Object.keys(err).length) { setFormErr(err); return; }
    const res = modal === 'sub-edit'
      ? await update(selectedId || form.id, form)
      : await create(form);
    if (!res.success) return notify(res.error, false);
    notify(modal === 'sub-edit' ? 'Sous-traitant modifié.' : 'Sous-traitant créé.');
    setModal(null);
    if (modal === 'sub-edit' && selectedId) refreshDetail(selectedId);
    else if (res.data?.id) openDetail(res.data.id);
  }

  async function handleSaveAssignment(e) {
    e.preventDefault();
    const pr = projects.find((p) => String(p.id) === String(form.projectId));
    const payload = {
      ...form,
      projectName: pr?.nom || form.projectName,
      projectRef: pr?.ref || form.projectRef,
    };
    if (!payload.projectId) { setFormErr({ projectId: 'Projet requis' }); return; }
    const res = await createAssignment(selectedId, payload);
    if (!res.success) return notify(res.error, false);
    notify('Affectation projet enregistrée.');
    setModal(null);
    refreshDetail(selectedId);
  }

  async function handleSaveService(e) {
    e.preventDefault();
    if (!form.assignmentId) { setFormErr({ assignmentId: 'Affectation requise' }); return; }
    const assign = detail?.assignments?.find((a) => a.id === form.assignmentId);
    const res = await createService(selectedId, {
      ...form,
      projectId: assign?.projectId || form.projectId,
    });
    if (!res.success) return notify(res.error, false);
    notify('Prestation enregistrée.');
    setModal(null);
    refreshDetail(selectedId);
  }

  async function handleSavePayment(e) {
    e.preventDefault();
    const err = {};
    if (!form.projectId) err.projectId = 'Projet requis';
    if (!form.paymentDate) err.paymentDate = 'Date requise';
    if (!paymentSelectedLines.length) err.selected = 'Sélectionnez au moins un sous-traitant';
    paymentSelectedLines.forEach((l) => {
      if (form.paymentType === 'metre') {
        if (!l.designation?.trim()) err[`d_${l.assignmentId}`] = 'Désignation requise';
        if (!l.quantity || Number(l.quantity) <= 0) err[`q_${l.assignmentId}`] = 'Quantité requise';
        if (!l.unitPrice || Number(l.unitPrice) <= 0) err[`p_${l.assignmentId}`] = 'Prix unitaire requis';
      } else if (form.paymentType === 'tache') {
        if (!l.designation?.trim()) err[`d_${l.assignmentId}`] = 'Tâche requise';
        if (!l.amount || Number(l.amount) <= 0) err[`a_${l.assignmentId}`] = 'Montant requis';
      } else {
        if (!l.designation?.trim()) err[`d_${l.assignmentId}`] = 'Description requise';
        if (!l.amount || Number(l.amount) <= 0) err[`a_${l.assignmentId}`] = 'Montant requis';
      }
    });
    if (Object.keys(err).length) { setFormErr(err); return; }

    const shared = {
      paymentDate: form.paymentDate,
      paymentType: form.paymentType,
      paymentMethod: form.paymentMethod,
      reference: form.reference,
      description: form.description,
      status: paymentStatusToDb(form.statusUi),
    };

    const lines = paymentSelectedLines.map((l) => ({
      subcontractorId: l.subcontractorId,
      assignmentId: l.assignmentId,
      designation: l.designation,
      quantity: l.quantity,
      unit: l.unit,
      unitPrice: l.unitPrice,
      amount: calcSubPaymentAmount(form.paymentType, l),
    }));

    const res = await createPaymentBatch(form.projectId, shared, lines);
    if (!res.success) return notify(res.error, false);
    notify(`${lines.length} paiement(s) enregistré(s) — total ${fmtMAD(paymentBatchTotal)}`);
    setModal(null);
    if (selectedId) refreshDetail(selectedId);
  }

  async function handleDelete(id) {
    if (!window.confirm('Supprimer ce sous-traitant ?')) return;
    const res = await remove(id);
    if (!res.success) return notify(res.error, false);
    notify('Sous-traitant supprimé.');
    openList();
  }

  async function validateService(svc) {
    const res = await updateService(selectedId, svc.id, { ...svc, status: 'validated' });
    if (!res.success) return notify(res.error, false);
    notify('Prestation validée.');
    refreshDetail(selectedId);
  }

  async function exportBalancePdf(bal) {
    if (!detail?.sub) return;
    await generateSubcontractorProjectPdf({
      subcontractor: detail.sub,
      balance: bal,
      services: detail.services,
      payments: detail.payments,
    });
  }

  const sub = detail?.sub;

  return (
    <div className="animate-fade-in">
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999, padding: '12px 20px', borderRadius: 10,
          background: toast.ok ? '#2E7D32' : '#D32F2F', color: '#fff', fontWeight: 600, fontSize: '0.88rem',
        }}>{toast.msg}</div>
      )}

      {view === 'list' ? (
        <>
          <div className="page-header flex-between">
            <div>
              <h1 className="page-title">Sous-traitants</h1>
              <p className="page-subtitle">Fiche globale, affectations multi-projets et suivi des paiements</p>
            </div>
            <button className="btn btn-primary" onClick={() => openModal('sub-create')} disabled={loading}>
              <Plus size={15} /> Nouveau sous-traitant
            </button>
          </div>

          {!configured && (
            <div style={{ background: '#FFF3E0', border: '1px solid #FFB74D', borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: '0.85rem', color: '#E65100' }}>
              Supabase non configuré
            </div>
          )}

          {error && (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, background: '#FFEBEE', border: '1px solid #EF9A9A', borderRadius: 8, padding: '10px 16px', marginBottom: 16, color: '#C62828', fontSize: '0.85rem' }}>
              <span>{error}</span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={load}>Réessayer</button>
            </div>
          )}

          <div className="card" style={{ marginBottom: 12, padding: '12px 16px' }}>
            <div style={{ position: 'relative', maxWidth: 360 }}>
              <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher..." style={{ ...INPUT_S(false), paddingLeft: 34 }} />
            </div>
          </div>

          <div className="card">
            {loading ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>
                <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />Chargement…
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>
                {items.length === 0 ? 'Aucun sous-traitant. Exécutez RUN_SUBCONTRACTORS.sql dans Supabase.' : 'Aucun résultat.'}
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Nom complet</th><th>Fonction</th><th>CIN / Passeport</th>
                      <th>Projets actifs</th><th>Total prestations</th><th>Total payé</th>
                      <th>Reste à payer</th><th>Statut</th><th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((s) => (
                      <tr key={s.id}>
                        <td style={{ fontWeight: 700 }}>{s.fullName}</td>
                        <td>{s.fonction || '—'}</td>
                        <td>{s.cinLabel}</td>
                        <td style={{ textAlign: 'center' }}>{s.activeProjectsCount}</td>
                        <td style={{ fontWeight: 600, color: 'var(--text-2)' }}>{fmtMAD(s.totalServices)}</td>
                        <td style={{ fontWeight: 600, color: '#2E7D32' }}>{fmtMAD(s.totalPaid)}</td>
                        <td style={{ fontWeight: 800, color: 'var(--red)' }}>{fmtMAD(s.remaining)}</td>
                        <td><span className="badge badge-green">{SUB_STATUT_LABEL[s.statut] || s.statut}</span></td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => openDetail(s.id)} title="Voir"><Eye size={14} /></button>
                            <button className="btn btn-ghost btn-sm" onClick={() => { openDetail(s.id); setTimeout(() => openModal('sub-edit', s), 0); }} title="Modifier"><Edit2 size={14} /></button>
                            <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(s.id)} title="Supprimer"><Trash2 size={14} style={{ color: 'var(--red)' }} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="page-header flex-between">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button className="btn btn-ghost" onClick={openList}><ChevronLeft size={16} /> Retour</button>
              <div>
                <h1 className="page-title">{sub?.fullName || 'Sous-traitant'}</h1>
                <p className="page-subtitle">{sub?.fonction || '—'} · {sub?.cinLabel}</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary" onClick={() => refreshDetail(selectedId)} disabled={detailLoading}>
                <RefreshCw size={14} /> Actualiser
              </button>
              <button className="btn btn-primary" onClick={() => openModal('sub-edit', sub)}>Modifier</button>
            </div>
          </div>

          {detail?.summary && (
            <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', marginBottom: 16 }}>
              <div className="stat-card"><div className="stat-body"><div className="stat-value">{detail.summary.activeProjects}</div><div className="stat-label">Projets</div></div></div>
              <div className="stat-card"><div className="stat-body"><div className="stat-value" style={{ fontSize: '0.95rem' }}>{fmtMAD(detail.summary.totalServices)}</div><div className="stat-label">Prestations</div></div></div>
              <div className="stat-card"><div className="stat-body"><div className="stat-value" style={{ fontSize: '0.95rem', color: '#2E7D32' }}>{fmtMAD(detail.summary.totalPaid)}</div><div className="stat-label">Payé</div></div></div>
              <div className="stat-card"><div className="stat-body"><div className="stat-value" style={{ fontSize: '0.95rem', color: 'var(--red)' }}>{fmtMAD(detail.summary.remaining)}</div><div className="stat-label">Reste à payer</div></div></div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
            {TABS.map((t) => (
              <button key={t.id} type="button" onClick={() => setTab(t.id)}
                className={'btn ' + (tab === t.id ? 'btn-primary' : 'btn-secondary')} style={{ fontSize: '0.78rem' }}>
                <t.icon size={13} /> {t.label}
              </button>
            ))}
          </div>

          {detailLoading ? (
            <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>Chargement…</div>
          ) : (
            <div className="card" style={{ padding: 20 }}>
              {tab === 'info' && sub && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 12 }}>
                  {[['Nom', sub.fullName], ['Fonction', sub.fonction], ['CIN', sub.numero_cin], ['Passeport', sub.passeport], ['Téléphone', sub.telephone], ['Email', sub.email], ['Adresse', sub.adresse], ['ICE', sub.ice], ['Statut', SUB_STATUT_LABEL[sub.statut]], ['Notes', sub.notes]].map(([k, v]) => (
                    <div key={k}><div style={{ fontSize: '0.7rem', color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase' }}>{k}</div><div style={{ fontWeight: 600, marginTop: 4 }}>{v || '—'}</div></div>
                  ))}
                </div>
              )}

              {tab === 'projects' && (
                <>
                  <div className="flex-between" style={{ marginBottom: 12 }}>
                    <strong>Projets affectés</strong>
                    <button className="btn btn-primary btn-sm" onClick={() => openModal('assignment', { status: 'active', remunerationType: REMUNERATION_TYPES[0], unitType: UNIT_TYPES[0] })}>
                      <Plus size={13} /> Affecter à un projet
                    </button>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Projet</th><th>Rôle</th><th>Rémunération</th><th>Unité</th><th>Prix unit.</th><th>Statut</th></tr></thead>
                      <tbody>
                        {(detail?.assignments || []).map((a) => (
                          <tr key={a.id}>
                            <td style={{ fontWeight: 600 }}>{a.projectName || a.projectRef || '—'}</td>
                            <td>{a.role || '—'}</td>
                            <td>{a.remunerationType || '—'}</td>
                            <td>{a.unitType || '—'}</td>
                            <td>{fmtMAD(a.unitPrice)}</td>
                            <td>{ASSIGNMENT_STATUS_LABEL[a.status] || a.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {tab === 'services' && (
                <>
                  <div className="flex-between" style={{ marginBottom: 12 }}>
                    <strong>Prestations réalisées</strong>
                    <button className="btn btn-primary btn-sm" onClick={() => openModal('service', { serviceDate: new Date().toISOString().slice(0, 10), status: 'pending', quantity: '', unitPrice: '' })}>
                      <Plus size={13} /> Ajouter prestation
                    </button>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Date</th><th>Description</th><th>Qté</th><th>Montant</th><th>Statut</th><th>Actions</th></tr></thead>
                      <tbody>
                        {(detail?.services || []).map((s) => (
                          <tr key={s.id}>
                            <td>{fmtDate(s.serviceDate)}</td>
                            <td>{s.description || '—'}</td>
                            <td>{s.quantity} {s.unitType}</td>
                            <td style={{ fontWeight: 700, color: 'var(--red)' }}>{fmtMAD(s.totalAmount)}</td>
                            <td>{SERVICE_STATUS_LABEL[s.status] || s.status}</td>
                            <td>
                              {s.status === 'pending' && (
                                <button className="btn btn-ghost btn-sm" onClick={() => validateService(s)}>Valider</button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {tab === 'payments' && (
                <>
                  <div className="flex-between" style={{ marginBottom: 12 }}>
                    <strong>Paiements</strong>
                    <button className="btn btn-primary btn-sm" onClick={() => openModal('payment')}>
                      <Plus size={13} /> Ajouter paiement
                    </button>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Date</th><th>Type</th><th>Désignation</th><th>Montant</th>
                          <th>Mode</th><th>Réf.</th><th>Statut</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(detail?.payments || []).map((p) => (
                          <tr key={p.id}>
                            <td>{fmtDate(p.paymentDate)}</td>
                            <td>{paymentTypeLabel(p.paymentType)}</td>
                            <td>{p.designation || p.description || '—'}</td>
                            <td style={{ fontWeight: 700, color: '#2E7D32' }}>{fmtMAD(p.amount)}</td>
                            <td>{p.paymentMethod || '—'}</td>
                            <td>{p.reference || '—'}</td>
                            <td>{paymentStatusFromDb(p.status)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {tab === 'balances' && (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>Projet</th><th>Type rémun.</th><th>Prestations</th><th>Payé</th><th>Reste</th><th>Statut</th><th>Actions</th></tr>
                    </thead>
                    <tbody>
                      {(detail?.balances || []).map((b) => (
                        <tr key={b.assignmentId}>
                          <td style={{ fontWeight: 600 }}>{b.projectName}</td>
                          <td>{b.remunerationType || '—'}</td>
                          <td>{fmtMAD(b.totalServicesAmount)}</td>
                          <td>{fmtMAD(b.totalPaidAmount)}</td>
                          <td style={{ fontWeight: 800, color: 'var(--red)' }}>{fmtMAD(b.remainingAmount)}</td>
                          <td>{PAYMENT_BALANCE_LABEL[b.paymentStatus] || b.paymentStatus}</td>
                          <td>
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                              <button className="btn btn-ghost btn-sm" onClick={() => openModal('service', { assignmentId: b.assignmentId, serviceDate: new Date().toISOString().slice(0, 10), status: 'pending' })}>+ Prestation</button>
                              <button className="btn btn-ghost btn-sm" onClick={() => openModal('payment', { projectId: b.projectId || '' })}>+ Paiement</button>
                              <button className="btn btn-ghost btn-sm" onClick={() => exportBalancePdf(b)}><Download size={13} /> PDF</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {tab === 'documents' && (
                <div>
                  <p style={{ color: 'var(--text-3)', fontSize: '0.88rem', marginBottom: 12 }}>Documents liés au sous-traitant (contrats, attestations, etc.)</p>
                  {(detail?.documents || []).length === 0 ? (
                    <div style={{ color: 'var(--text-3)', fontSize: '0.85rem' }}>Aucun document enregistré.</div>
                  ) : (
                    <ul>{detail.documents.map((d) => <li key={d.id}>{d.file_name || d.storage_path || d.id}</li>)}</ul>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="flex-between" style={{ marginBottom: 16 }}>
              <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.1rem', margin: 0 }}>
                {modal === 'sub-create' && 'Nouveau sous-traitant'}
                {modal === 'sub-edit' && 'Modifier sous-traitant'}
                {modal === 'assignment' && 'Affecter à un projet'}
                {modal === 'service' && 'Ajouter prestation'}
                {modal === 'payment' && 'Ajouter paiement'}
              </h2>
              <button type="button" onClick={() => setModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            {(modal === 'sub-create' || modal === 'sub-edit') && (
              <form onSubmit={handleSaveSub} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div><label>Prénom</label><input value={form.prenom || ''} onChange={(e) => setF('prenom', e.target.value)} style={INPUT_S(false)} /></div>
                  <div><label>Nom *</label><input value={form.nom || ''} onChange={(e) => setF('nom', e.target.value)} style={INPUT_S(formErr.nom)} /></div>
                </div>
                <div><label>Raison sociale</label><input value={form.raison_sociale || ''} onChange={(e) => setF('raison_sociale', e.target.value)} style={INPUT_S(false)} /></div>
                <div><label>Fonction</label><input value={form.fonction || ''} onChange={(e) => setF('fonction', e.target.value)} style={INPUT_S(false)} /></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div><label>CIN</label><input value={form.numero_cin || ''} onChange={(e) => setF('numero_cin', e.target.value)} style={INPUT_S(false)} /></div>
                  <div><label>Passeport</label><input value={form.passeport || ''} onChange={(e) => setF('passeport', e.target.value)} style={INPUT_S(false)} /></div>
                </div>
                <div><label>Téléphone</label><input value={form.telephone || ''} onChange={(e) => setF('telephone', e.target.value)} style={INPUT_S(false)} /></div>
                <div><label>Adresse</label><input value={form.adresse || ''} onChange={(e) => setF('adresse', e.target.value)} style={INPUT_S(false)} /></div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Annuler</button>
                  <button type="submit" className="btn btn-primary" disabled={saving}>Enregistrer</button>
                </div>
              </form>
            )}

            {modal === 'assignment' && (
              <form onSubmit={handleSaveAssignment} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div><label>Projet *</label>
                  <select value={form.projectId || ''} onChange={(e) => setF('projectId', e.target.value)} style={INPUT_S(formErr.projectId)}>
                    <option value="">Choisir…</option>
                    {projects.map((p) => <option key={p.id} value={p.id}>{p.ref ? `${p.ref} — ${p.nom}` : p.nom}</option>)}
                  </select>
                </div>
                <div><label>Type rémunération</label>
                  <select value={form.remunerationType || ''} onChange={(e) => setF('remunerationType', e.target.value)} style={INPUT_S(false)}>
                    {REMUNERATION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div><label>Unité</label>
                    <select value={form.unitType || ''} onChange={(e) => setF('unitType', e.target.value)} style={INPUT_S(false)}>
                      {UNIT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div><label>Prix unitaire</label><input type="number" min="0" step="0.01" value={form.unitPrice || ''} onChange={(e) => setF('unitPrice', e.target.value)} style={INPUT_S(false)} /></div>
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Annuler</button>
                  <button type="submit" className="btn btn-primary" disabled={saving}>Enregistrer</button>
                </div>
              </form>
            )}

            {modal === 'service' && (
              <form onSubmit={handleSaveService} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div><label>Affectation projet *</label>
                  <select value={form.assignmentId || ''} onChange={(e) => setF('assignmentId', e.target.value)} style={INPUT_S(formErr.assignmentId)}>
                    <option value="">Choisir…</option>
                    {(detail?.assignments || []).map((a) => <option key={a.id} value={a.id}>{a.projectName}</option>)}
                  </select>
                </div>
                <div><label>Date</label><input type="date" value={form.serviceDate || ''} onChange={(e) => setF('serviceDate', e.target.value)} style={INPUT_S(false)} /></div>
                <div><label>Description</label><input value={form.description || ''} onChange={(e) => setF('description', e.target.value)} style={INPUT_S(false)} /></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <div><label>Quantité</label><input type="number" min="0" step="0.01" value={form.quantity || ''} onChange={(e) => setF('quantity', e.target.value)} style={INPUT_S(false)} /></div>
                  <div><label>Unité</label>
                    <select value={form.unitType || ''} onChange={(e) => setF('unitType', e.target.value)} style={INPUT_S(false)}>
                      {UNIT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div><label>Prix unit.</label><input type="number" min="0" step="0.01" value={form.unitPrice || ''} onChange={(e) => setF('unitPrice', e.target.value)} style={INPUT_S(false)} /></div>
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Annuler</button>
                  <button type="submit" className="btn btn-primary" disabled={saving}>Enregistrer</button>
                </div>
              </form>
            )}

            {modal === 'payment' && (
              <form onSubmit={handleSavePayment} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label>Projet / chantier *</label>
                  <select value={form.projectId || ''} onChange={(e) => handlePaymentProjectChange(e.target.value)} style={INPUT_S(formErr.projectId)}>
                    <option value="">Choisir un projet…</option>
                    {projects.map((p) => <option key={p.id} value={p.id}>{p.ref ? `${p.ref} — ${p.nom}` : p.nom}</option>)}
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
                    <div style={{ padding: 12, background: 'var(--bg)', borderRadius: 8, color: 'var(--text-3)', fontSize: '0.85rem' }}>Sélectionnez d&apos;abord un projet.</div>
                  ) : assignmentsLoading ? (
                    <div style={{ padding: 12, color: 'var(--text-3)', fontSize: '0.85rem' }}>Chargement…</div>
                  ) : projectAssignments.length === 0 ? (
                    <div style={{ padding: 12, background: '#FFF3E0', borderRadius: 8, color: '#E65100', fontSize: '0.85rem' }}>Aucun sous-traitant affecté à ce projet.</div>
                  ) : (
                    <div style={{ border: '1.5px solid var(--border)', borderRadius: 8, maxHeight: 320, overflowY: 'auto' }}>
                      {projectAssignments.map((a) => {
                        const sel = form.selected?.[a.id];
                        const lineAmount = sel?.checked ? calcSubPaymentAmount(form.paymentType, sel) : 0;
                        return (
                          <div key={a.id} style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', background: sel?.checked ? '#FFF5F5' : '#fff' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: sel?.checked ? 10 : 0 }}>
                              <input type="checkbox" checked={!!sel?.checked} onChange={() => toggleSubPayment(a)} />
                              <span style={{ fontWeight: 700 }}>{a.subcontractorName}</span>
                              <span style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>{a.subcontractorFonction || '—'}</span>
                            </label>
                            {sel?.checked && (
                              <div style={{ display: 'grid', gap: 8, paddingLeft: 26 }}>
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
                                    <input type="number" min="0" step="0.01" placeholder="Montant (MAD) *" value={sel.amount || ''} onChange={(e) => setSubPaymentField(a.id, 'amount', e.target.value)} style={INPUT_S(formErr[`a_${a.id}`])} />
                                  </>
                                )}
                                {form.paymentType === 'service' && (
                                  <>
                                    <input placeholder="Description du service *" value={sel.designation || ''} onChange={(e) => setSubPaymentField(a.id, 'designation', e.target.value)} style={INPUT_S(formErr[`d_${a.id}`])} />
                                    <input type="number" min="0" step="0.01" placeholder="Montant (MAD) *" value={sel.amount || ''} onChange={(e) => setSubPaymentField(a.id, 'amount', e.target.value)} style={INPUT_S(formErr[`a_${a.id}`])} />
                                  </>
                                )}
                                <div style={{ textAlign: 'right', fontWeight: 700, color: 'var(--red)', fontSize: '0.88rem' }}>{fmtMAD(lineAmount)}</div>
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
                  <div><label>Date *</label><input type="date" value={form.paymentDate || ''} onChange={(e) => setF('paymentDate', e.target.value)} style={INPUT_S(formErr.paymentDate)} /></div>
                  <div><label>Statut</label>
                    <select value={form.statusUi || 'En attente'} onChange={(e) => setF('statusUi', e.target.value)} style={INPUT_S(false)}>
                      {PAYMENT_STATUS_UI.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <div><label>Mode de paiement</label>
                  <select value={form.paymentMethod || ''} onChange={(e) => setF('paymentMethod', e.target.value)} style={INPUT_S(false)}>
                    {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div><label>Référence</label><input value={form.reference || ''} onChange={(e) => setF('reference', e.target.value)} style={INPUT_S(false)} /></div>
                <div><label>Description / Observation</label><textarea rows={2} value={form.description || ''} onChange={(e) => setF('description', e.target.value)} style={{ ...INPUT_S(false), resize: 'vertical' }} /></div>

                {paymentBatchTotal > 0 && (
                  <div style={{ padding: '12px 14px', background: '#FFF5F5', borderRadius: 8, display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 600 }}>Total ({paymentSelectedLines.length} sous-traitant{paymentSelectedLines.length > 1 ? 's' : ''})</span>
                    <span style={{ fontWeight: 800, color: 'var(--red)' }}>{fmtMAD(paymentBatchTotal)}</span>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Annuler</button>
                  <button type="submit" className="btn btn-primary" disabled={saving}>Enregistrer</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

import {
  Users, Plus, Search, X, ChevronLeft, Eye, Edit2, Trash2, Download,
  FolderKanban, ClipboardList, Banknote, Scale, FileText, Loader2, RefreshCw,
} from 'lucide-react';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSubcontractors } from '../hooks/useSubcontractors';
import { useSubcontractorPaymentForm } from '../hooks/useSubcontractorPaymentForm';
import SubcontractorPaymentFormBody from './SubcontractorPaymentFormBody';
import { generateSubcontractorProjectPdf } from '../services/rh/subcontractorProjectPdf';
import {
  REMUNERATION_TYPES, UNIT_TYPES, ASSIGNMENT_STATUSES, SERVICE_STATUSES,
  SUB_STATUTS, ASSIGNMENT_STATUS_LABEL, SERVICE_STATUS_LABEL,
  SUB_STATUT_LABEL, PAYMENT_BALANCE_LABEL,
  paymentStatusToDb, paymentStatusFromDb,
} from '../services/rh/subcontractorConstants';
import {
  validateSubcontractorPaymentForm,
  buildSubcontractorPaymentPayload,
  paymentTypeLabel,
} from '../utils/rh/subcontractorPaymentFormUtils';

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

const EMPTY_SUB = {
  prenom: '', nom: '', raison_sociale: '', fonction: '', numero_cin: '', passeport: '',
  telephone: '', email: '', adresse: '', ice: '', statut: 'actif', notes: '',
  assignmentProjectId: '',
  remunerationType: REMUNERATION_TYPES[0],
  unitType: UNIT_TYPES[0],
  unitPrice: '',
};

export default function SousTraitants() {
  const {
    items, projects, loading, saving, error, configured, load, loadDetail,
    create, update, remove, createAssignment, createService, updateService,
    createPaymentBatch,
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
  const subPayment = useSubcontractorPaymentForm({ active: modal === 'payment' });

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
    else if (type === 'payment') subPayment.resetForm(payload);
    else setForm({ ...payload });
  }

  async function handleSaveSub(e) {
    e?.preventDefault?.();
    const err = {};
    if (!form.nom?.trim() && !form.raison_sociale?.trim()) err.nom = 'Nom ou raison sociale requis';
    if (Object.keys(err).length) { setFormErr(err); return; }

    const {
      assignmentProjectId,
      remunerationType,
      unitType,
      unitPrice,
      ...subForm
    } = form;

    const res = modal === 'sub-edit'
      ? await update(selectedId || form.id, subForm)
      : await create(subForm);
    if (!res.success) return notify(res.error, false);

    const subId = modal === 'sub-edit' ? (selectedId || form.id) : res.data?.id;

    if (assignmentProjectId && subId) {
      const alreadyAssigned = (detail?.assignments || []).some(
        (a) => String(a.projectId) === String(assignmentProjectId),
      );
      if (!alreadyAssigned) {
        const pr = projects.find((p) => String(p.id) === String(assignmentProjectId));
        const assignRes = await createAssignment(subId, {
          projectId: assignmentProjectId,
          projectName: pr?.nom || '',
          projectRef: pr?.ref || '',
          remunerationType: remunerationType || REMUNERATION_TYPES[0],
          unitType: unitType || UNIT_TYPES[0],
          unitPrice: unitPrice || 0,
          status: 'active',
        });
        if (!assignRes.success) return notify(assignRes.error, false);
      }
    }

    notify(modal === 'sub-edit' ? 'Sous-traitant modifié.' : 'Sous-traitant créé.');
    setModal(null);
    if (subId && (modal === 'sub-edit' || assignmentProjectId)) {
      if (view === 'detail') refreshDetail(subId);
      else openDetail(subId);
    } else if (modal === 'sub-create' && res.data?.id) {
      openDetail(res.data.id);
    }
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
    const err = validateSubcontractorPaymentForm(subPayment.form, subPayment.paymentSelectedLines);
    if (Object.keys(err).length) {
      subPayment.setFormErr(err);
      return;
    }
    const { shared, lines } = buildSubcontractorPaymentPayload(
      subPayment.form,
      subPayment.paymentSelectedLines,
      paymentStatusToDb,
    );
    const res = await createPaymentBatch(subPayment.form.projectId, shared, lines);
    if (!res.success) return notify(res.error, false);
    notify(`${lines.length} paiement(s) enregistré(s) — total ${fmtMAD(subPayment.paymentBatchTotal)}`);
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
    <div className="animate-fade-in rh-ext-page">
      {toast && (
        <div className="rh-ext-toast" style={{
          padding: '12px 20px', borderRadius: 10,
          background: toast.ok ? '#2E7D32' : '#D32F2F', color: '#fff', fontWeight: 600, fontSize: '0.88rem',
        }}>{toast.msg}</div>
      )}

      {view === 'list' ? (
        <>
          <div className="page-header flex-between finance-page-header">
            <div>
              <h1 className="page-title">Sous-traitants</h1>
              <p className="page-subtitle finance-sub-hide-mobile">Fiche globale, affectations multi-projets et suivi des paiements</p>
            </div>
            <div className="finance-page-actions finance-page-actions--solo">
              <button className="btn btn-primary" onClick={() => openModal('sub-create')} disabled={loading}>
                <Plus size={15} /> Nouveau sous-traitant
              </button>
            </div>
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

          <div className="card rh-ext-filter-card">
            <div className="rh-ext-search-wrap" style={{ maxWidth: 360 }}>
              <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher..." style={INPUT_S(false)} />
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
                        <td data-label="Nom complet" style={{ fontWeight: 700 }}>{s.fullName}</td>
                        <td data-label="Fonction">{s.fonction || '—'}</td>
                        <td data-label="CIN / Passeport">{s.cinLabel}</td>
                        <td data-label="Projets actifs" style={{ textAlign: 'center' }}>{s.activeProjectsCount}</td>
                        <td data-label="Prestations" style={{ fontWeight: 600, color: 'var(--text-2)' }}>{fmtMAD(s.totalServices)}</td>
                        <td data-label="Total payé" style={{ fontWeight: 600, color: '#2E7D32' }}>{fmtMAD(s.totalPaid)}</td>
                        <td data-label="Reste à payer" style={{ fontWeight: 800, color: 'var(--red)' }}>{fmtMAD(s.remaining)}</td>
                        <td data-label="Statut"><span className="badge badge-green">{SUB_STATUT_LABEL[s.statut] || s.statut}</span></td>
                        <td className="rh-ext-actions-cell">
                          <div className="rh-ext-actions">
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
            <div className="rh-ext-detail-header-actions">
              <button className="btn btn-secondary" onClick={() => refreshDetail(selectedId)} disabled={detailLoading}>
                <RefreshCw size={14} /> Actualiser
              </button>
              <button className="btn btn-primary" onClick={() => openModal('sub-edit', sub)}>Modifier</button>
            </div>
          </div>

          {detail?.summary && (
            <div className="stat-grid rh-ext-stat-grid">
              <div className="stat-card"><div className="stat-body"><div className="stat-value">{detail.summary.activeProjects}</div><div className="stat-label">Projets</div></div></div>
              <div className="stat-card"><div className="stat-body"><div className="stat-value" style={{ fontSize: '0.95rem' }}>{fmtMAD(detail.summary.totalServices)}</div><div className="stat-label">Prestations</div></div></div>
              <div className="stat-card"><div className="stat-body"><div className="stat-value" style={{ fontSize: '0.95rem', color: '#2E7D32' }}>{fmtMAD(detail.summary.totalPaid)}</div><div className="stat-label">Payé</div></div></div>
              <div className="stat-card"><div className="stat-body"><div className="stat-value" style={{ fontSize: '0.95rem', color: 'var(--red)' }}>{fmtMAD(detail.summary.remaining)}</div><div className="stat-label">Reste à payer</div></div></div>
            </div>
          )}

          <div className="rh-ext-tab-bar">
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
                <div className="rh-ext-info-grid">
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
                            <td data-label="Projet" style={{ fontWeight: 600 }}>{a.projectName || a.projectRef || '—'}</td>
                            <td data-label="Rôle">{a.role || '—'}</td>
                            <td data-label="Rémunération">{a.remunerationType || '—'}</td>
                            <td data-label="Unité">{a.unitType || '—'}</td>
                            <td data-label="Prix unit.">{fmtMAD(a.unitPrice)}</td>
                            <td data-label="Statut">{ASSIGNMENT_STATUS_LABEL[a.status] || a.status}</td>
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
                            <td data-label="Date">{fmtDate(s.serviceDate)}</td>
                            <td data-label="Description">{s.description || '—'}</td>
                            <td data-label="Quantité">{s.quantity} {s.unitType}</td>
                            <td data-label="Montant" style={{ fontWeight: 700, color: 'var(--red)' }}>{fmtMAD(s.totalAmount)}</td>
                            <td data-label="Statut">{SERVICE_STATUS_LABEL[s.status] || s.status}</td>
                            <td className="rh-ext-actions-cell">
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
                            <td data-label="Date">{fmtDate(p.paymentDate)}</td>
                            <td data-label="Type">{paymentTypeLabel(p.paymentType)}</td>
                            <td data-label="Désignation">{p.designation || p.description || '—'}</td>
                            <td data-label="Montant" style={{ fontWeight: 700, color: '#2E7D32' }}>{fmtMAD(p.amount)}</td>
                            <td data-label="Mode">{p.paymentMethod || '—'}</td>
                            <td data-label="Référence">{p.reference || '—'}</td>
                            <td data-label="Statut">{paymentStatusFromDb(p.status)}</td>
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
                          <td data-label="Projet" style={{ fontWeight: 600 }}>{b.projectName}</td>
                          <td data-label="Type rémun.">{b.remunerationType || '—'}</td>
                          <td data-label="Prestations">{fmtMAD(b.totalServicesAmount)}</td>
                          <td data-label="Payé">{fmtMAD(b.totalPaidAmount)}</td>
                          <td data-label="Reste" style={{ fontWeight: 800, color: 'var(--red)' }}>{fmtMAD(b.remainingAmount)}</td>
                          <td data-label="Statut">{PAYMENT_BALANCE_LABEL[b.paymentStatus] || b.paymentStatus}</td>
                          <td className="rh-ext-actions-cell">
                            <div className="rh-ext-actions">
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
        <div className="rh-ext-modal-overlay" style={{ zIndex: 1000 }}>
          <div className="card rh-ext-modal-box rh-ext-modal-box--md">
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

                <div style={{ borderTop: '1.5px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: 6, color: '#1565C0' }}>Affectation projet</div>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-3)', margin: '0 0 10px' }}>
                    Nécessaire pour afficher ce sous-traitant dans le formulaire <strong>Paiement sous-traitant</strong> du projet choisi.
                  </p>
                  {modal === 'sub-edit' && (detail?.assignments || []).length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: 6, color: 'var(--text-3)' }}>Projets déjà affectés</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {(detail?.assignments || []).map((a) => (
                          <span key={a.id} style={{ padding: '4px 10px', background: '#E3F2FD', borderRadius: 20, fontSize: '0.78rem', fontWeight: 600, color: '#1565C0' }}>
                            {a.projectName || a.projectRef || 'Projet'}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div><label>Projet / chantier</label>
                    <select value={form.assignmentProjectId || ''} onChange={(e) => setF('assignmentProjectId', e.target.value)} style={INPUT_S(false)}>
                      <option value="">— Choisir un projet —</option>
                      {projects
                        .filter((p) => !(detail?.assignments || []).some((a) => String(a.projectId) === String(p.id)))
                        .map((p) => (
                          <option key={p.id} value={p.id}>{p.ref ? `${p.ref} — ${p.nom}` : p.nom}</option>
                        ))}
                    </select>
                  </div>
                  {form.assignmentProjectId && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                      <div><label>Type rémunération</label>
                        <select value={form.remunerationType || REMUNERATION_TYPES[0]} onChange={(e) => setF('remunerationType', e.target.value)} style={INPUT_S(false)}>
                          {REMUNERATION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div><label>Unité</label>
                        <select value={form.unitType || UNIT_TYPES[0]} onChange={(e) => setF('unitType', e.target.value)} style={INPUT_S(false)}>
                          {UNIT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}><label>Prix unitaire (MAD)</label>
                        <input type="number" min="0" step="0.01" value={form.unitPrice || ''} onChange={(e) => setF('unitPrice', e.target.value)} style={INPUT_S(false)} placeholder="0" />
                      </div>
                    </div>
                  )}
                </div>

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
                <SubcontractorPaymentFormBody {...subPayment} formErr={subPayment.formErr} />
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

import {
  Users, Plus, Search, X, ChevronLeft, Eye, Edit2, Trash2, Download,
  FolderKanban, ClipboardList, Banknote, Scale, FileText, Loader2, RefreshCw,
  UserCheck, UserX, TrendingUp, Filter,
} from 'lucide-react';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSubcontractors } from '../hooks/useSubcontractors';
import { useSubcontractorPaymentForm } from '../hooks/useSubcontractorPaymentForm';
import SubcontractorPaymentFormBody from './SubcontractorPaymentFormBody';
import { generateSubcontractorProjectPdf } from '../services/rh/subcontractorProjectPdf';
import {
  REMUNERATION_TYPES, UNIT_TYPES,
  SUB_STATUTS, ASSIGNMENT_STATUS_LABEL, SERVICE_STATUS_LABEL,
  SUB_STATUT_LABEL, PAYMENT_BALANCE_LABEL,
  SUBCONTRACTOR_METIERS, SUBCONTRACTOR_DOC_TYPES,
  paymentStatusToDb, paymentStatusFromDb,
} from '../services/rh/subcontractorConstants';
import {
  filterSubcontractors, computeListKpis,
} from '../services/rh/subcontractors';
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

const EMPTY_FILTERS = {
  search: '', nom: '', telephone: '', cin: '',
  metier: '', ville: '', projet: '', statut: '',
};

const DETAIL_TABS = [
  { id: 'info', label: 'Informations générales', icon: Users },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'history', label: 'Historique projets', icon: FolderKanban },
  { id: 'finance', label: 'Financier', icon: Banknote },
];

const EMPTY_SUB = {
  prenom: '', nom: '', raison_sociale: '', fonction: '', numero_cin: '', passeport: '',
  telephone: '', email: '', adresse: '', ville: '', ice: '', numero_if: '', rc: '',
  patente: '', rib: '', statut: 'actif', notes: '',
  assignmentProjectId: '',
  remunerationType: REMUNERATION_TYPES[0],
  unitType: UNIT_TYPES[0],
  unitPrice: '',
};

function StatutBadge({ statut }) {
  const cls = statut === 'actif' ? 'badge-green'
    : statut === 'suspendu' ? 'badge-orange'
      : statut === 'archive' ? 'badge-grey' : 'badge-grey';
  return <span className={'badge ' + cls}>{SUB_STATUT_LABEL[statut] || statut}</span>;
}

function KpiCard({ label, value, icon: Icon, color }) {
  return (
    <div className="stat-card">
      <div className="stat-icon" style={{ background: color + '15', color }}>
        <Icon size={18} />
      </div>
      <div className="stat-body">
        <div className="stat-value" style={{ fontSize: typeof value === 'string' && value.includes('MAD') ? '0.92rem' : undefined }}>{value}</div>
        <div className="stat-label">{label}</div>
      </div>
    </div>
  );
}

function assignmentAmount(assignment, balances) {
  const bal = (balances || []).find((b) => b.assignmentId === assignment.id);
  if (bal) return bal.totalServicesAmount;
  return assignment.estimatedTotal || 0;
}

export default function SousTraitants() {
  const {
    items, projects, loading, saving, error, configured, load, loadDetail,
    create, update, remove, createAssignment, createService, updateService,
    createPaymentBatch, createDocument,
  } = useSubcontractors();

  const [view, setView] = useState('list');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [tab, setTab] = useState('info');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [formErr, setFormErr] = useState({});
  const [toast, setToast] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [docForm, setDocForm] = useState({ doc_type: 'cin', file_name: '', notes: '' });
  const subPayment = useSubcontractorPaymentForm({ active: modal === 'payment' });

  const setF = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const setFilter = (k, v) => setFilters((p) => ({ ...p, [k]: v }));

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

  const filtered = useMemo(() => filterSubcontractors(items, filters), [items, filters]);
  const kpis = useMemo(() => computeListKpis(items), [items]);

  const villes = useMemo(() => {
    const s = new Set(items.map((i) => i.ville).filter(Boolean));
    return [...s].sort();
  }, [items]);

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
      assignmentProjectId, remunerationType, unitType, unitPrice, ...subForm
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

  async function handleSaveDocument(e) {
    e.preventDefault();
    if (!docForm.file_name?.trim()) return notify('Nom du document requis.', false);
    const res = await createDocument(selectedId, docForm);
    if (!res.success) return notify(res.error, false);
    notify('Document enregistré.');
    setDocForm({ doc_type: 'cin', file_name: '', notes: '' });
    refreshDetail(selectedId);
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
  const docsByType = useMemo(() => {
    const map = {};
    (detail?.documents || []).forEach((d) => {
      const key = d.doc_type || 'other';
      if (!map[key]) map[key] = [];
      map[key].push(d);
    });
    return map;
  }, [detail?.documents]);

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
              <p className="page-subtitle finance-sub-hide-mobile">Base de données ERP — fiches, affectations et suivi financier</p>
            </div>
            <div className="finance-page-actions finance-page-actions--solo">
              <button className="btn btn-ghost" onClick={load} disabled={loading} title="Actualiser">
                <RefreshCw size={15} />
              </button>
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

          <div className="stat-grid rh-ext-stat-grid" style={{ marginBottom: 16 }}>
            <KpiCard label="Sous-traitants actifs" value={kpis.actifs} icon={UserCheck} color="#2E7D32" />
            <KpiCard label="Sous-traitants inactifs" value={kpis.inactifs} icon={UserX} color="#757575" />
            <KpiCard label="Montant total prestations" value={fmtMAD(kpis.totalServices)} icon={TrendingUp} color="#1565C0" />
            <KpiCard label="Montant total payé" value={fmtMAD(kpis.totalPaid)} icon={Banknote} color="#2E7D32" />
            <KpiCard label="Reste à payer" value={fmtMAD(kpis.remaining)} icon={Scale} color="#C62828" />
          </div>

          <div className="card rh-ext-filter-card" style={{ marginBottom: 16, padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              <Filter size={14} /> Filtres avancés
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
              <div style={{ gridColumn: '1 / -1', maxWidth: 420, position: 'relative' }}>
                <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
                <input type="search" value={filters.search} onChange={(e) => setFilter('search', e.target.value)} placeholder="Recherche globale…" style={{ ...INPUT_S(false), paddingLeft: 32 }} />
              </div>
              <div>
                <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>Nom</label>
                <input value={filters.nom} onChange={(e) => setFilter('nom', e.target.value)} style={INPUT_S(false)} placeholder="Nom…" />
              </div>
              <div>
                <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>Téléphone</label>
                <input value={filters.telephone} onChange={(e) => setFilter('telephone', e.target.value)} style={INPUT_S(false)} placeholder="06…" />
              </div>
              <div>
                <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>CIN</label>
                <input value={filters.cin} onChange={(e) => setFilter('cin', e.target.value)} style={INPUT_S(false)} placeholder="CIN…" />
              </div>
              <div>
                <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>Métier</label>
                <select value={filters.metier} onChange={(e) => setFilter('metier', e.target.value)} style={INPUT_S(false)}>
                  <option value="">Tous</option>
                  {SUBCONTRACTOR_METIERS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>Ville</label>
                <select value={filters.ville} onChange={(e) => setFilter('ville', e.target.value)} style={INPUT_S(false)}>
                  <option value="">Toutes</option>
                  {villes.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>Projet</label>
                <select value={filters.projet} onChange={(e) => setFilter('projet', e.target.value)} style={INPUT_S(false)}>
                  <option value="">Tous</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.ref ? `${p.ref} — ${p.nom}` : p.nom}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>Statut</label>
                <select value={filters.statut} onChange={(e) => setFilter('statut', e.target.value)} style={INPUT_S(false)}>
                  <option value="">Tous</option>
                  {SUB_STATUTS.map((s) => <option key={s} value={s}>{SUB_STATUT_LABEL[s]}</option>)}
                </select>
              </div>
            </div>
            {(filters.search || filters.nom || filters.telephone || filters.cin || filters.metier || filters.ville || filters.projet || filters.statut) && (
              <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => setFilters(EMPTY_FILTERS)}>
                Réinitialiser les filtres
              </button>
            )}
          </div>

          <div className="card">
            {loading ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>
                <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />Chargement…
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>
                {items.length === 0 ? 'Aucun sous-traitant. Exécutez RUN_SUBCONTRACTORS.sql dans Supabase.' : 'Aucun résultat pour ces filtres.'}
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Nom complet</th>
                      <th>Métier / Fonction</th>
                      <th>Téléphone</th>
                      <th>Ville</th>
                      <th>CIN</th>
                      <th>Projet en cours</th>
                      <th>Statut</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((s) => (
                      <tr key={s.id}>
                        <td data-label="Nom complet" style={{ fontWeight: 700 }}>{s.fullName}</td>
                        <td data-label="Métier">{s.fonction || '—'}</td>
                        <td data-label="Téléphone">{s.telephone || '—'}</td>
                        <td data-label="Ville">{s.ville || '—'}</td>
                        <td data-label="CIN">{s.numero_cin || s.passeport || '—'}</td>
                        <td data-label="Projet en cours" style={{ fontSize: '0.85rem' }}>{s.currentProject || '—'}</td>
                        <td data-label="Statut"><StatutBadge statut={s.statut} /></td>
                        <td className="rh-ext-actions-cell">
                          <div className="rh-ext-actions">
                            <button className="btn btn-ghost btn-sm" onClick={() => openDetail(s.id)} title="Voir fiche"><Eye size={14} /></button>
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
                <p className="page-subtitle">{sub?.fonction || '—'} · {sub?.ville || '—'} · {sub?.cinLabel}</p>
              </div>
            </div>
            <div className="rh-ext-detail-header-actions">
              <button className="btn btn-secondary" onClick={() => refreshDetail(selectedId)} disabled={detailLoading}>
                <RefreshCw size={14} /> Actualiser
              </button>
              <button className="btn btn-primary" onClick={() => openModal('sub-edit', sub)}>Modifier</button>
            </div>
          </div>

          <div className="rh-ext-tab-bar">
            {DETAIL_TABS.map((t) => (
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
                  {[
                    ['Nom complet', sub.fullName],
                    ['Téléphone', sub.telephone],
                    ['Email', sub.email],
                    ['Adresse', sub.adresse],
                    ['Ville', sub.ville],
                    ['CIN', sub.numero_cin],
                    ['Passeport', sub.passeport],
                    ['ICE', sub.ice],
                    ['IF', sub.numero_if],
                    ['RC', sub.rc],
                    ['Patente', sub.patente],
                    ['RIB', sub.rib],
                    ['Métier / Fonction', sub.fonction],
                    ['Statut', SUB_STATUT_LABEL[sub.statut]],
                    ['Notes', sub.notes],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase' }}>{k}</div>
                      <div style={{ fontWeight: 600, marginTop: 4 }}>{v || '—'}</div>
                    </div>
                  ))}
                </div>
              )}

              {tab === 'documents' && (
                <>
                  <p style={{ color: 'var(--text-3)', fontSize: '0.88rem', marginBottom: 16 }}>
                    Documents administratifs et contractuels du sous-traitant.
                  </p>
                  <div className="table-wrap" style={{ marginBottom: 20 }}>
                    <table>
                      <thead>
                        <tr><th>Type</th><th>Fichier</th><th>Date</th><th>Notes</th></tr>
                      </thead>
                      <tbody>
                        {SUBCONTRACTOR_DOC_TYPES.map((dt) => {
                          const docs = docsByType[dt.id] || [];
                          if (!docs.length) {
                            return (
                              <tr key={dt.id}>
                                <td data-label="Type" style={{ fontWeight: 600 }}>{dt.label}</td>
                                <td data-label="Fichier" colSpan={3} style={{ color: 'var(--text-3)', fontSize: '0.85rem' }}>Non fourni</td>
                              </tr>
                            );
                          }
                          return docs.map((d, i) => (
                            <tr key={d.id}>
                              <td data-label="Type" style={{ fontWeight: 600 }}>{i === 0 ? dt.label : ''}</td>
                              <td data-label="Fichier">{d.file_name || d.storage_path || '—'}</td>
                              <td data-label="Date">{fmtDate(d.created_at)}</td>
                              <td data-label="Notes">{d.notes || '—'}</td>
                            </tr>
                          ));
                        })}
                      </tbody>
                    </table>
                  </div>
                  <form onSubmit={handleSaveDocument} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10, alignItems: 'end', padding: 14, background: 'var(--surface-2)', borderRadius: 8 }}>
                    <div>
                      <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)' }}>Type</label>
                      <select value={docForm.doc_type} onChange={(e) => setDocForm((p) => ({ ...p, doc_type: e.target.value }))} style={INPUT_S(false)}>
                        {SUBCONTRACTOR_DOC_TYPES.map((dt) => <option key={dt.id} value={dt.id}>{dt.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)' }}>Nom fichier *</label>
                      <input value={docForm.file_name} onChange={(e) => setDocForm((p) => ({ ...p, file_name: e.target.value }))} style={INPUT_S(false)} placeholder="document.pdf" />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)' }}>Notes</label>
                      <input value={docForm.notes} onChange={(e) => setDocForm((p) => ({ ...p, notes: e.target.value }))} style={INPUT_S(false)} />
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={saving}>Ajouter document</button>
                  </form>
                </>
              )}

              {tab === 'history' && (
                <>
                  <div className="flex-between" style={{ marginBottom: 12 }}>
                    <strong>Historique des affectations projet</strong>
                    <button className="btn btn-primary btn-sm" onClick={() => openModal('assignment', { status: 'active', remunerationType: REMUNERATION_TYPES[0], unitType: UNIT_TYPES[0] })}>
                      <Plus size={13} /> Affecter à un projet
                    </button>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr><th>Projet</th><th>Date début</th><th>Date fin</th><th>Montant</th><th>Statut</th></tr>
                      </thead>
                      <tbody>
                        {(detail?.assignments || []).map((a) => (
                          <tr key={a.id}>
                            <td data-label="Projet" style={{ fontWeight: 600 }}>{a.projectName || a.projectRef || '—'}</td>
                            <td data-label="Date début">{fmtDate(a.startDate)}</td>
                            <td data-label="Date fin">{fmtDate(a.endDate)}</td>
                            <td data-label="Montant" style={{ fontWeight: 700 }}>{fmtMAD(assignmentAmount(a, detail?.balances))}</td>
                            <td data-label="Statut">{ASSIGNMENT_STATUS_LABEL[a.status] || a.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {tab === 'finance' && (
                <>
                  {detail?.summary && (
                    <div className="stat-grid rh-ext-stat-grid" style={{ marginBottom: 20 }}>
                      <KpiCard label="Projets actifs" value={detail.summary.activeProjects} icon={FolderKanban} color="#1565C0" />
                      <KpiCard label="Total prestations" value={fmtMAD(detail.summary.totalServices)} icon={ClipboardList} color="#1565C0" />
                      <KpiCard label="Total payé" value={fmtMAD(detail.summary.totalPaid)} icon={Banknote} color="#2E7D32" />
                      <KpiCard label="Reste à payer" value={fmtMAD(detail.summary.remaining)} icon={Scale} color="#C62828" />
                    </div>
                  )}

                  <div className="flex-between" style={{ marginBottom: 12 }}>
                    <strong>Solde par projet</strong>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-primary btn-sm" onClick={() => openModal('service', { serviceDate: new Date().toISOString().slice(0, 10), status: 'pending', quantity: '', unitPrice: '' })}>
                        <Plus size={13} /> Prestation
                      </button>
                      <button className="btn btn-primary btn-sm" onClick={() => openModal('payment')}>
                        <Plus size={13} /> Paiement
                      </button>
                    </div>
                  </div>
                  <div className="table-wrap" style={{ marginBottom: 24 }}>
                    <table>
                      <thead>
                        <tr><th>Projet</th><th>Prestations</th><th>Payé</th><th>Reste</th><th>Statut</th><th>Actions</th></tr>
                      </thead>
                      <tbody>
                        {(detail?.balances || []).map((b) => (
                          <tr key={b.assignmentId}>
                            <td data-label="Projet" style={{ fontWeight: 600 }}>{b.projectName}</td>
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

                  <strong style={{ display: 'block', marginBottom: 8 }}>Prestations réalisées</strong>
                  <div className="table-wrap" style={{ marginBottom: 24 }}>
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

                  <strong style={{ display: 'block', marginBottom: 8 }}>Paiements</strong>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr><th>Date</th><th>Type</th><th>Désignation</th><th>Montant</th><th>Mode</th><th>Statut</th></tr>
                      </thead>
                      <tbody>
                        {(detail?.payments || []).map((p) => (
                          <tr key={p.id}>
                            <td data-label="Date">{fmtDate(p.paymentDate)}</td>
                            <td data-label="Type">{paymentTypeLabel(p.paymentType)}</td>
                            <td data-label="Désignation">{p.designation || p.description || '—'}</td>
                            <td data-label="Montant" style={{ fontWeight: 700, color: '#2E7D32' }}>{fmtMAD(p.amount)}</td>
                            <td data-label="Mode">{p.paymentMethod || '—'}</td>
                            <td data-label="Statut">{paymentStatusFromDb(p.status)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
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
              <form onSubmit={handleSaveSub} style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '70vh', overflowY: 'auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div><label>Prénom</label><input value={form.prenom || ''} onChange={(e) => setF('prenom', e.target.value)} style={INPUT_S(false)} /></div>
                  <div><label>Nom *</label><input value={form.nom || ''} onChange={(e) => setF('nom', e.target.value)} style={INPUT_S(formErr.nom)} /></div>
                </div>
                <div><label>Raison sociale</label><input value={form.raison_sociale || ''} onChange={(e) => setF('raison_sociale', e.target.value)} style={INPUT_S(false)} /></div>
                <div><label>Métier / Fonction</label>
                  <select value={form.fonction || ''} onChange={(e) => setF('fonction', e.target.value)} style={INPUT_S(false)}>
                    <option value="">— Choisir —</option>
                    {SUBCONTRACTOR_METIERS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div><label>CIN</label><input value={form.numero_cin || ''} onChange={(e) => setF('numero_cin', e.target.value)} style={INPUT_S(false)} /></div>
                  <div><label>Passeport</label><input value={form.passeport || ''} onChange={(e) => setF('passeport', e.target.value)} style={INPUT_S(false)} /></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div><label>Téléphone</label><input value={form.telephone || ''} onChange={(e) => setF('telephone', e.target.value)} style={INPUT_S(false)} /></div>
                  <div><label>Email</label><input type="email" value={form.email || ''} onChange={(e) => setF('email', e.target.value)} style={INPUT_S(false)} /></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
                  <div><label>Adresse</label><input value={form.adresse || ''} onChange={(e) => setF('adresse', e.target.value)} style={INPUT_S(false)} /></div>
                  <div><label>Ville</label><input value={form.ville || ''} onChange={(e) => setF('ville', e.target.value)} style={INPUT_S(false)} /></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div><label>ICE</label><input value={form.ice || ''} onChange={(e) => setF('ice', e.target.value)} style={INPUT_S(false)} /></div>
                  <div><label>IF</label><input value={form.numero_if || ''} onChange={(e) => setF('numero_if', e.target.value)} style={INPUT_S(false)} /></div>
                  <div><label>RC</label><input value={form.rc || ''} onChange={(e) => setF('rc', e.target.value)} style={INPUT_S(false)} /></div>
                  <div><label>Patente</label><input value={form.patente || ''} onChange={(e) => setF('patente', e.target.value)} style={INPUT_S(false)} /></div>
                </div>
                <div><label>RIB</label><input value={form.rib || ''} onChange={(e) => setF('rib', e.target.value)} style={INPUT_S(false)} /></div>
                <div><label>Statut</label>
                  <select value={form.statut || 'actif'} onChange={(e) => setF('statut', e.target.value)} style={INPUT_S(false)}>
                    {SUB_STATUTS.map((s) => <option key={s} value={s}>{SUB_STATUT_LABEL[s]}</option>)}
                  </select>
                </div>

                <div style={{ borderTop: '1.5px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: 6, color: '#1565C0' }}>Affectation projet (optionnel)</div>
                  {modal === 'sub-edit' && (detail?.assignments || []).length > 0 && (
                    <div style={{ marginBottom: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {(detail?.assignments || []).map((a) => (
                        <span key={a.id} style={{ padding: '4px 10px', background: '#E3F2FD', borderRadius: 20, fontSize: '0.78rem', fontWeight: 600, color: '#1565C0' }}>
                          {a.projectName || a.projectRef || 'Projet'}
                        </span>
                      ))}
                    </div>
                  )}
                  <div><label>Projet / chantier</label>
                    <select value={form.assignmentProjectId || ''} onChange={(e) => setF('assignmentProjectId', e.target.value)} style={INPUT_S(false)}>
                      <option value="">— Aucun —</option>
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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div><label>Date début</label><input type="date" value={form.startDate || ''} onChange={(e) => setF('startDate', e.target.value)} style={INPUT_S(false)} /></div>
                  <div><label>Date fin</label><input type="date" value={form.endDate || ''} onChange={(e) => setF('endDate', e.target.value)} style={INPUT_S(false)} /></div>
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

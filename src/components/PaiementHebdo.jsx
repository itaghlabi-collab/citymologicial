import {
  Banknote, CheckCircle, Filter, Search, Users, TrendingUp, Plus, Trash2, Loader2, X,
  FileDown, Printer,
} from 'lucide-react';
import { useState, useRef, useMemo } from 'react';
import { useWorkerPayroll } from '../hooks/useWorkerPayroll';
import {
  calcWorkerPayrollTotals,
  PAYROLL_UI_STATUTS,
  buildWorkerPayrollLine,
  weekStartMonday,
  weekEndSunday,
  WORKER_HOURS_PER_DAY,
} from '../services/rh/workerPayroll';
import { PAYMENT_METHODS } from '../services/rh/subcontractorConstants';
import { exportWorkerPaymentPdf } from '../services/rh/workerPaymentPdf';
import { workerFullName } from '../services/rh/attendance';
import PaiementSousTraitantsSection from './PaiementSousTraitantsSection';

function fmtMAD(n) {
  return Number(n).toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' MAD';
}

function currentWeekStart() {
  return weekStartMonday(new Date().toISOString().slice(0, 10));
}

function Toast({ toast }) {
  if (!toast) return null;
  const bg = toast.type === 'success' ? '#2E7D32' : '#D32F2F';
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, background: bg, color: '#fff', padding: '12px 20px', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.22)', fontSize: '0.88rem', fontWeight: 600 }}>
      {toast.msg}
    </div>
  );
}

const INPUT_S = (err) => ({
  padding: '9px 12px', width: '100%', outline: 'none',
  fontFamily: 'var(--font-body)', fontSize: '0.9rem',
  border: '1.5px solid ' + (err ? 'var(--red)' : 'var(--border)'),
  borderRadius: 'var(--radius)', background: '#fff', boxSizing: 'border-box',
});

const EMPTY_BATCH = {
  projectId: '',
  projet: '',
  semaineDebut: currentWeekStart(),
  statut: 'En attente',
  notes: '',
  selected: {},
};

function lineFromSelection(workerId, sel) {
  return {
    workerId,
    joursPaies: sel.joursPaies,
    heuresSup: sel.heuresSup,
    tarifHoraire: sel.tarifHoraire,
    tarifSup: sel.tarifSup,
    avances: sel.avances,
    retenues: sel.retenues,
  };
}

export default function PaiementHebdo() {
  const {
    records, projects, workersByProject, loading, saving, error, configured, load,
    createBatch, update, markPaid, remove, filterWorkerPayroll, computePayrollStats, chantiers,
  } = useWorkerPayroll();

  const [search, setSearch] = useState('');
  const [filterProjet, setFilterProjet] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [form, setForm] = useState(EMPTY_BATCH);
  const [editForm, setEditForm] = useState({});
  const [errors, setErrors] = useState({});
  const [toast, setToast] = useState(null);
  const toastRef = useRef(null);

  function notify(type, msg) {
    setToast({ type, msg });
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 3000);
  }

  const projectWorkers = useMemo(
    () => (editId ? [] : workersByProject(form.projectId)),
    [editId, form.projectId, workersByProject],
  );

  const selectedLines = useMemo(
    () => Object.entries(form.selected)
      .filter(([, v]) => v.checked)
      .map(([workerId, v]) => lineFromSelection(workerId, v)),
    [form.selected],
  );

  const selectedTotals = useMemo(
    () => selectedLines.map((l) => ({ ...l, totals: calcWorkerPayrollTotals(l) })),
    [selectedLines],
  );

  const batchTotal = useMemo(
    () => selectedTotals.reduce((s, l) => s + l.totals.montantNet, 0),
    [selectedTotals],
  );

  const batchMontantSup = useMemo(
    () => selectedTotals.reduce((s, l) => s + l.totals.montantSup, 0),
    [selectedTotals],
  );

  function handleProjectChange(projectId) {
    const pr = projects.find((p) => String(p.id) === String(projectId));
    setForm((p) => ({ ...p, projectId, projet: pr?.nom || '', selected: {} }));
  }

  function toggleWorker(worker) {
    setForm((p) => {
      const sel = { ...p.selected };
      if (sel[worker.id]?.checked) {
        delete sel[worker.id];
      } else {
        const line = buildWorkerPayrollLine(worker);
        sel[worker.id] = { checked: true, ...line };
      }
      return { ...p, selected: sel };
    });
  }

  function toggleAll(checked) {
    if (!checked) {
      setForm((p) => ({ ...p, selected: {} }));
      return;
    }
    const sel = {};
    projectWorkers.forEach((w) => {
      const line = buildWorkerPayrollLine(w);
      sel[w.id] = { checked: true, ...line };
    });
    setForm((p) => ({ ...p, selected: sel }));
  }

  function setWorkerField(workerId, field, value) {
    setForm((p) => ({
      ...p,
      selected: {
        ...p.selected,
        [workerId]: { ...p.selected[workerId], [field]: value },
      },
    }));
  }

  function openCreate() {
    setEditId(null);
    setForm({ ...EMPTY_BATCH, semaineDebut: currentWeekStart() });
    setErrors({});
    setShowModal(true);
  }

  function openEdit(record) {
    setEditId(record.id);
    setDetailId(null);
    setEditForm({
      projectId: record.projectId || '',
      projet: record.projet || '',
      semaineDebut: record.semaineDebut || currentWeekStart(),
      joursPaies: String(record.joursPaies ?? ''),
      tarifHoraire: String(record.tarifHoraire ?? ''),
      heuresSup: String(record.heuresSup ?? ''),
      tarifSup: String(record.tarifSup ?? ''),
      avances: String(record.avances ?? ''),
      retenues: String(record.retenues ?? ''),
      statut: record.statut || 'En attente',
      notes: record.notes || '',
      reference: record.reference || '',
      paymentMethod: record.paymentMethod || '',
    });
    setErrors({});
    setShowModal(true);
  }

  function openDetail(record) {
    setDetailId(record.id);
  }

  async function handleWorkerPdf(record, print = false) {
    try {
      await exportWorkerPaymentPdf(record, { print });
    } catch {
      notify('error', 'Erreur lors de la génération du PDF.');
    }
  }

  function validateBatch() {
    const e = {};
    if (!form.projectId) e.projectId = 'Requis';
    if (!form.semaineDebut) e.semaineDebut = 'Requis';
    if (!selectedLines.length) e.workers = 'Sélectionnez au moins un ouvrier';
    selectedLines.forEach((l) => {
      if (l.joursPaies === '' || Number(l.joursPaies) < 0) e[`j_${l.workerId}`] = 'Jours requis';
      if (!l.tarifHoraire || Number(l.tarifHoraire) <= 0) e[`t_${l.workerId}`] = 'Tarif requis';
    });
    return e;
  }

  function validateEdit() {
    const e = {};
    if (!editForm.semaineDebut) e.semaineDebut = 'Requis';
    if (editForm.joursPaies === '' || Number(editForm.joursPaies) < 0) e.joursPaies = 'Jours requis';
    if (!editForm.tarifHoraire || Number(editForm.tarifHoraire) <= 0) e.tarifHoraire = 'Tarif requis';
    return e;
  }

  async function handleSubmit(ev) {
    ev.preventDefault();
    if (editId) {
      const errs = validateEdit();
      if (Object.keys(errs).length) { setErrors(errs); return; }
      const result = await update(editId, {
        ...editForm,
        semaineFin: weekEndSunday(editForm.semaineDebut),
      });
      if (!result.success) { notify('error', result.error || 'Erreur.'); return; }
      notify('success', 'Paiement modifié.');
    } else {
      const errs = validateBatch();
      if (Object.keys(errs).length) { setErrors(errs); return; }
      const result = await createBatch(
        {
          projectId: form.projectId,
          projet: form.projet,
          semaineDebut: form.semaineDebut,
          semaineFin: weekEndSunday(form.semaineDebut),
          statut: form.statut,
          notes: form.notes,
        },
        selectedLines,
      );
      if (!result.success) { notify('error', result.error || 'Erreur.'); return; }
      notify('success', `${result.count} paiement(s) ouvrier(s) — total ${fmtMAD(batchTotal)}`);
    }
    setShowModal(false);
  }

  async function handleDelete(id) {
    if (!window.confirm('Supprimer ce paiement ?')) return;
    const result = await remove(id);
    notify(result.success ? 'success' : 'error', result.success ? 'Supprimé.' : (result.error || 'Erreur.'));
  }

  const filtered = useMemo(
    () => filterWorkerPayroll(records, { search, projet: filterProjet, statut: filterStatut }),
    [records, search, filterProjet, filterStatut, filterWorkerPayroll],
  );

  const stats = useMemo(() => computePayrollStats(filtered), [filtered, computePayrollStats]);
  const allSelected = projectWorkers.length > 0 && projectWorkers.every((w) => form.selected[w.id]?.checked);
  const hasFilters = search || filterProjet || filterStatut;
  const editPreview = calcWorkerPayrollTotals(editForm);
  const detailRecord = detailId ? filtered.find((p) => p.id === detailId) : null;

  return (
    <div className="animate-fade-in rh-ext-page">
      <Toast toast={toast} />

      <div className="page-header flex-between">
        <div>
          <h1 className="page-title">Paiement hebdomadaire ouvriers</h1>
          <p className="page-subtitle">Projet → ouvriers affectés → jours × 8h × tarif/h + heures sup − avances − retenues</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate} disabled={loading || saving || !configured}>
          <Plus size={15} /> Nouveau paiement ouvrier
        </button>
      </div>

      {!configured && (
        <div style={{ background: '#FFF3E0', border: '1px solid #FFB74D', borderRadius: 'var(--radius)', padding: '10px 16px', marginBottom: 16, fontSize: '0.85rem', color: '#E65100' }}>
          Supabase non configuré
        </div>
      )}

      {error && !loading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#FFEBEE', border: '1px solid #EF9A9A', borderRadius: 'var(--radius)', padding: '10px 16px', marginBottom: 16, fontSize: '0.85rem', color: '#C62828' }}>
          <span>{error}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={load}>Réessayer</button>
        </div>
      )}

      <div className="stat-grid rh-ext-stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))' }}>
        <div className="stat-card"><div className="stat-icon blue"><Banknote size={18} /></div><div className="stat-body"><div className="stat-value" style={{ fontSize: '1rem' }}>{loading ? '—' : fmtMAD(stats.totalAPayer)}</div><div className="stat-label">Total ouvriers</div></div></div>
        <div className="stat-card"><div className="stat-icon green"><CheckCircle size={18} /></div><div className="stat-body"><div className="stat-value" style={{ fontSize: '1rem' }}>{loading ? '—' : fmtMAD(stats.totalPaye)}</div><div className="stat-label">Payé</div></div></div>
        <div className="stat-card"><div className="stat-icon orange"><TrendingUp size={18} /></div><div className="stat-body"><div className="stat-value" style={{ fontSize: '1rem' }}>{loading ? '—' : fmtMAD(stats.totalEnAttente)}</div><div className="stat-label">En attente</div></div></div>
        <div className="stat-card"><div className="stat-icon"><Users size={18} /></div><div className="stat-body"><div className="stat-value">{loading ? '—' : stats.count}</div><div className="stat-label">Lignes</div></div></div>
      </div>

      <div className="card rh-ext-filter-card">
        <div className="rh-ext-filter-bar">
          <Filter size={14} style={{ color: 'var(--text-3)' }} />
          <div className="rh-ext-search-wrap">
            <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input type="search" placeholder="Rechercher un ouvrier..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select value={filterProjet} onChange={(e) => setFilterProjet(e.target.value)}>
            <option value="">Tous les projets</option>
            {chantiers.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={filterStatut} onChange={(e) => setFilterStatut(e.target.value)}>
            <option value="">Tous les statuts</option>
            {PAYROLL_UI_STATUTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="card">
        <div className="card-title" style={{ marginBottom: 4 }}><Banknote size={16} /> Paiement hebdomadaire — Ouvriers</div>
        <p style={{ margin: '0 0 16px', fontSize: '0.83rem', color: 'var(--text-3)' }}>
          Sélectionnez un projet, cochez les ouvriers affectés, saisissez jours / heures sup / avances / retenues
        </p>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}><Loader2 size={28} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />Chargement…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)', fontSize: '0.88rem' }}>Aucun paiement ouvrier.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ouvrier</th><th>Semaine</th><th>Projet</th><th>Jours</th><th>H. sup</th>
                  <th>Montant sup</th><th>Total net</th><th>Statut</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id}>
                    <td data-label="Ouvrier" style={{ fontWeight: 600 }}>
                      <button type="button" onClick={() => openDetail(p)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, color: 'var(--text)', padding: 0, textDecoration: 'underline', textUnderlineOffset: 2 }}>
                        {p.ouvrier}
                      </button>
                    </td>
                    <td data-label="Semaine">{p.semaineDebut ? new Date(p.semaineDebut).toLocaleDateString('fr-MA') : '—'}</td>
                    <td data-label="Projet">{p.projet || '—'}</td>
                    <td data-label="Jours">{p.joursPaies} j</td>
                    <td data-label="H. sup">{p.heuresSup > 0 ? `${p.heuresSup} h` : '—'}</td>
                    <td data-label="Montant sup">{p.montantSup > 0 ? fmtMAD(p.montantSup) : '—'}</td>
                    <td data-label="Total net" style={{ fontWeight: 800, color: 'var(--red)' }}>{fmtMAD(p.total)}</td>
                    <td data-label="Statut"><span className={'badge ' + (p.statut === 'Payé' ? 'badge-green' : p.statut === 'En attente' ? 'badge-orange' : 'badge-red')}>{p.statut}</span></td>
                    <td data-label="Actions" className="payment-actions-cell">
                      <div className="payment-row-actions">
                        {p.statut === 'En attente' && (
                          <button type="button" className="btn btn-sm" style={{ background: '#E8F5E9', color: '#2E7D32', border: 'none' }} onClick={() => markPaid(p.id).then((r) => notify(r.success ? 'success' : 'error', r.success ? 'Payé.' : r.error))}>Payer</button>
                        )}
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEdit(p)}>Modifier</button>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleWorkerPdf(p, false)}><FileDown size={13} /> Télécharger PDF</button>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleWorkerPdf(p, true)}><Printer size={13} /> Imprimer</button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleDelete(p.id)} title="Supprimer"><Trash2 size={13} style={{ color: 'var(--red)' }} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="rh-ext-modal-overlay">
          <div className="card rh-ext-modal-box">
            <div className="flex-between" style={{ marginBottom: 16 }}>
              <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.05rem', margin: 0 }}>
                {editId ? 'Modifier paiement ouvrier' : 'Paiement hebdomadaire ouvriers'}
              </h2>
              <button type="button" onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
            </div>

            <form onSubmit={handleSubmit}>
              {editId ? (
                <div style={{ display: 'grid', gap: 14 }}>
                  <div><label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Semaine (début) *</label>
                    <input type="date" value={editForm.semaineDebut} onChange={(e) => setEditForm((p) => ({ ...p, semaineDebut: weekStartMonday(e.target.value) }))} style={INPUT_S(errors.semaineDebut)} /></div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div><label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Jours travaillés *</label>
                      <input type="number" min="0" step="0.5" value={editForm.joursPaies} onChange={(e) => setEditForm((p) => ({ ...p, joursPaies: e.target.value }))} style={INPUT_S(errors.joursPaies)} />
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginTop: 4 }}>{Number(editForm.joursPaies || 0) * WORKER_HOURS_PER_DAY} h normales</div></div>
                    <div><label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Tarif horaire *</label>
                      <input type="number" min="0" step="0.01" value={editForm.tarifHoraire} onChange={(e) => setEditForm((p) => ({ ...p, tarifHoraire: e.target.value }))} style={INPUT_S(errors.tarifHoraire)} /></div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div><label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Heures supplémentaires</label>
                      <input type="number" min="0" step="0.5" value={editForm.heuresSup} onChange={(e) => setEditForm((p) => ({ ...p, heuresSup: e.target.value }))} style={INPUT_S(false)} /></div>
                    <div><label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Tarif heures sup</label>
                      <input type="number" min="0" step="0.01" value={editForm.tarifSup} onChange={(e) => setEditForm((p) => ({ ...p, tarifSup: e.target.value }))} style={INPUT_S(false)} /></div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div><label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Avances</label>
                      <input type="number" min="0" step="0.01" value={editForm.avances} onChange={(e) => setEditForm((p) => ({ ...p, avances: e.target.value }))} style={INPUT_S(false)} /></div>
                    <div><label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Retenues</label>
                      <input type="number" min="0" step="0.01" value={editForm.retenues} onChange={(e) => setEditForm((p) => ({ ...p, retenues: e.target.value }))} style={INPUT_S(false)} /></div>
                  </div>
                  <div><label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Statut</label>
                    <select value={editForm.statut} onChange={(e) => setEditForm((p) => ({ ...p, statut: e.target.value }))} style={INPUT_S(false)}>
                      {PAYROLL_UI_STATUTS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select></div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div><label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Référence</label>
                      <input value={editForm.reference || ''} onChange={(e) => setEditForm((p) => ({ ...p, reference: e.target.value }))} style={INPUT_S(false)} /></div>
                    <div><label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Mode de paiement</label>
                      <select value={editForm.paymentMethod || ''} onChange={(e) => setEditForm((p) => ({ ...p, paymentMethod: e.target.value }))} style={INPUT_S(false)}>
                        <option value="">—</option>
                        {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                      </select></div>
                  </div>
                  <div><label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Description / Observation</label>
                    <textarea rows={2} value={editForm.notes || ''} onChange={(e) => setEditForm((p) => ({ ...p, notes: e.target.value }))} style={{ ...INPUT_S(false), resize: 'vertical' }} /></div>
                  <div style={{ padding: 12, background: '#F8F9FA', borderRadius: 8, fontSize: '0.85rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span>Montant brut</span><strong>{fmtMAD(editPreview.montantBrut)}</strong></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: '#E65100' }}><span>Avances déduites</span><strong>{fmtMAD(editPreview.avances)}</strong></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: '#C62828' }}><span>Retenues déduites</span><strong>{fmtMAD(editPreview.retenues)}</strong></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span>Montant heures sup</span><strong>{fmtMAD(editPreview.montantSup)}</strong></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6, borderTop: '1px solid var(--border)' }}><span style={{ fontWeight: 700 }}>Net à payer</span><strong style={{ color: 'var(--red)' }}>{fmtMAD(editPreview.montantNet)}</strong></div>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 14 }}>
                  <div>
                    <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Projet / Chantier *</label>
                    <select value={form.projectId} onChange={(e) => handleProjectChange(e.target.value)} style={INPUT_S(errors.projectId)}>
                      <option value="">Choisir un projet…</option>
                      {projects.map((p) => <option key={p.id} value={p.id}>{p.ref ? `${p.ref} — ${p.nom}` : p.nom}</option>)}
                    </select>
                    {errors.projectId && <div style={{ color: 'var(--red)', fontSize: '0.78rem' }}>{errors.projectId}</div>}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Semaine (début) *</label>
                      <input type="date" value={form.semaineDebut} onChange={(e) => setForm((p) => ({ ...p, semaineDebut: weekStartMonday(e.target.value) }))} style={INPUT_S(errors.semaineDebut)} />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Statut</label>
                      <select value={form.statut} onChange={(e) => setForm((p) => ({ ...p, statut: e.target.value }))} style={INPUT_S(false)}>
                        {PAYROLL_UI_STATUTS.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>

                  <div>
                    <div className="flex-between" style={{ marginBottom: 8 }}>
                      <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Ouvriers affectés au projet *</label>
                      {projectWorkers.length > 0 && (
                        <label style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                          <input type="checkbox" checked={allSelected} onChange={(e) => toggleAll(e.target.checked)} /> Tout sélectionner
                        </label>
                      )}
                    </div>
                    {!form.projectId ? (
                      <div style={{ padding: 12, background: 'var(--bg)', borderRadius: 8, color: 'var(--text-3)', fontSize: '0.85rem' }}>Sélectionnez d&apos;abord un projet.</div>
                    ) : projectWorkers.length === 0 ? (
                      <div style={{ padding: 12, background: '#FFF3E0', borderRadius: 8, color: '#E65100', fontSize: '0.85rem' }}>Aucun ouvrier affecté à ce projet.</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {projectWorkers.map((w) => {
                          const sel = form.selected[w.id];
                          const totals = sel?.checked ? calcWorkerPayrollTotals(lineFromSelection(w.id, sel)) : null;
                          return (
                            <div key={w.id} style={{ border: '1.5px solid var(--border)', borderRadius: 8, padding: 12, background: sel?.checked ? '#FFF5F5' : '#fff' }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: sel?.checked ? 12 : 0 }}>
                                <input type="checkbox" checked={!!sel?.checked} onChange={() => toggleWorker(w)} />
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontWeight: 700 }}>{workerFullName(w)}</div>
                                  <div style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>{w.fonction || '—'} · Tarif/h : {fmtMAD(sel?.tarifHoraire ?? buildWorkerPayrollLine(w).tarifHoraire)}</div>
                                </div>
                                {totals && <div style={{ fontWeight: 800, color: 'var(--red)', fontSize: '0.9rem' }}>{fmtMAD(totals.montantNet)}</div>}
                              </label>
                              {sel?.checked && (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8, paddingLeft: 28 }}>
                                  <div><label style={{ fontSize: '0.72rem', fontWeight: 600 }}>Jours travaillés</label>
                                    <input type="number" min="0" step="0.5" value={sel.joursPaies ?? ''} onChange={(e) => setWorkerField(w.id, 'joursPaies', e.target.value)} style={{ ...INPUT_S(errors[`j_${w.id}`]), padding: '6px 8px', fontSize: '0.85rem' }} />
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-3)' }}>{Number(sel.joursPaies || 0) * WORKER_HOURS_PER_DAY} h</div></div>
                                  <div><label style={{ fontSize: '0.72rem', fontWeight: 600 }}>Heures sup</label>
                                    <input type="number" min="0" step="0.5" value={sel.heuresSup ?? ''} onChange={(e) => setWorkerField(w.id, 'heuresSup', e.target.value)} style={{ ...INPUT_S(false), padding: '6px 8px', fontSize: '0.85rem' }} /></div>
                                  <div><label style={{ fontSize: '0.72rem', fontWeight: 600 }}>Tarif h. sup</label>
                                    <input type="number" min="0" step="0.01" value={sel.tarifSup ?? ''} onChange={(e) => setWorkerField(w.id, 'tarifSup', e.target.value)} style={{ ...INPUT_S(false), padding: '6px 8px', fontSize: '0.85rem' }} /></div>
                                  <div><label style={{ fontSize: '0.72rem', fontWeight: 600 }}>Avances</label>
                                    <input type="number" min="0" step="0.01" value={sel.avances ?? ''} onChange={(e) => setWorkerField(w.id, 'avances', e.target.value)} style={{ ...INPUT_S(false), padding: '6px 8px', fontSize: '0.85rem' }} /></div>
                                  <div><label style={{ fontSize: '0.72rem', fontWeight: 600 }}>Retenues</label>
                                    <input type="number" min="0" step="0.01" value={sel.retenues ?? ''} onChange={(e) => setWorkerField(w.id, 'retenues', e.target.value)} style={{ ...INPUT_S(false), padding: '6px 8px', fontSize: '0.85rem' }} /></div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {errors.workers && <div style={{ color: 'var(--red)', fontSize: '0.78rem', marginTop: 4 }}>{errors.workers}</div>}
                  </div>

                  {selectedLines.length > 0 && (
                    <div style={{ padding: '12px 14px', background: '#F8F9FA', borderRadius: 8, fontSize: '0.85rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}><span>Montant heures supplémentaires</span><strong style={{ color: '#E65100' }}>{fmtMAD(batchMontantSup)}</strong></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Total général ({selectedLines.length} ouvrier{selectedLines.length > 1 ? 's' : ''})</span><strong style={{ color: 'var(--red)', fontSize: '1.1rem' }}>{fmtMAD(batchTotal)}</strong></div>
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {detailRecord && (
        <div className="rh-ext-modal-overlay">
          <div className="card rh-ext-modal-box rh-ext-modal-box--md">
            <div className="flex-between" style={{ marginBottom: 16 }}>
              <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.05rem', margin: 0 }}>Détail paiement ouvrier</h2>
              <button type="button" onClick={() => setDetailId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <div style={{ display: 'grid', gap: 8, fontSize: '0.88rem', marginBottom: 16 }}>
              <div><strong>Ouvrier :</strong> {detailRecord.ouvrier}</div>
              <div><strong>Projet :</strong> {detailRecord.projet || '—'}</div>
              <div><strong>Semaine :</strong> {detailRecord.semaineDebut ? new Date(detailRecord.semaineDebut).toLocaleDateString('fr-MA') : '—'}</div>
              <div><strong>Référence :</strong> {detailRecord.reference || '—'}</div>
              <div><strong>Statut :</strong> {detailRecord.statut}</div>
              <div><strong>Mode :</strong> {detailRecord.paymentMethod || '—'}</div>
              <div><strong>Jours / H. sup :</strong> {detailRecord.joursPaies} j · {detailRecord.heuresSup || 0} h sup</div>
              <div><strong>Brut :</strong> {fmtMAD(detailRecord.montantBrut)}</div>
              <div><strong style={{ color: '#E65100' }}>Avances :</strong> {fmtMAD(detailRecord.avances)}</div>
              <div><strong style={{ color: '#C62828' }}>Retenues :</strong> {fmtMAD(detailRecord.retenues)}</div>
              <div><strong>Net à payer :</strong> <span style={{ color: 'var(--red)', fontWeight: 800 }}>{fmtMAD(detailRecord.total)}</span></div>
              {detailRecord.notes && <div><strong>Observations :</strong> {detailRecord.notes}</div>}
            </div>
            <div className="rh-ext-detail-header-actions">
              <button type="button" className="btn btn-secondary" onClick={() => { setDetailId(null); openEdit(detailRecord); }}>Modifier</button>
              <button type="button" className="btn btn-secondary" onClick={() => handleWorkerPdf(detailRecord, false)}><FileDown size={14} /> Télécharger PDF</button>
              <button type="button" className="btn btn-secondary" onClick={() => handleWorkerPdf(detailRecord, true)}><Printer size={14} /> Imprimer</button>
            </div>
          </div>
        </div>
      )}

      <PaiementSousTraitantsSection onNotify={notify} />
    </div>
  );
}

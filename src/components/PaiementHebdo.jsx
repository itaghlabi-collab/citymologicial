import {
  Banknote, CheckCircle, Filter, Search, Users, TrendingUp, Plus, Trash2, Loader2, X,
  FileDown, Printer, RefreshCw, Building2, Calendar, Eye, Pencil,
} from 'lucide-react';
import { useState, useRef, useMemo, useEffect } from 'react';
import { useWorkerPayroll } from '../hooks/useWorkerPayroll';
import {
  calcWorkerPayrollTotals,
  PAYROLL_UI_STATUTS,
  buildWorkerPayrollLine,
  weekStartMonday,
  weekEndSunday,
  todayIso,
  fmtWeekRange,
  enrichPayrollWithAttendance,
} from '../services/rh/workerPayroll';
import { exportWorkerPaymentPdf } from '../services/rh/workerPaymentPdf';
import { collectAttendanceWeeks } from '../services/rh/attendance';
import WorkerPaymentDetailModal from './rh/WorkerPaymentDetailModal';
import { workerFullName } from '../services/rh/attendance';

function fmtMAD(n) {
  return Number(n).toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' MAD';
}

function fmtDayEquiv(n) {
  return Number(n || 0).toLocaleString('fr-MA', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

function fmtHours(n) {
  return `${Number(n || 0).toLocaleString('fr-MA', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} h`;
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

const READONLY_S = {
  padding: '9px 12px', width: '100%', fontFamily: 'var(--font-body)', fontSize: '0.9rem',
  border: '1.5px solid var(--border)', borderRadius: 'var(--radius)', background: '#F5F5F5',
  boxSizing: 'border-box', color: 'var(--text-2)',
};

function fmtDateFr(iso) {
  if (!iso) return '—';
  return new Date(`${iso}T12:00:00`).toLocaleDateString('fr-MA');
}

const EMPTY_BATCH = {
  projectId: '',
  projet: '',
  semaineDebut: currentWeekStart(),
  paymentDate: todayIso(),
  statut: 'En attente',
  notes: '',
  selected: {},
};

function lineFromSelection(workerId, sel) {
  return {
    workerId,
    joursPaies: sel.joursPaies,
    heuresNormales: sel.heuresNormales,
    heuresSup: sel.heuresSup,
    tarifJournalier: sel.tarifJournalier,
    tarifHoraire: sel.tarifHoraire,
    tarifSup: sel.tarifSup,
    avances: sel.avances,
    retenues: sel.retenues,
  };
}

function statutSelectStyle(statut) {
  const palette = {
    'Payé': { bg: '#E8F5E9', color: '#2E7D32' },
    'En attente': { bg: '#FFF3E0', color: '#E65100' },
    'Partiellement payé': { bg: '#E3F2FD', color: '#1565C0' },
    'Annulé': { bg: '#FFEBEE', color: '#C62828' },
    Mixte: { bg: '#F5F5F5', color: '#616161' },
  };
  const c = palette[statut] || palette['En attente'];
  return {
    backgroundColor: c.bg,
    color: c.color,
    border: 'none',
    borderRadius: 999,
    padding: '5px 26px 5px 10px',
    fontSize: '0.72rem',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    minWidth: 130,
    maxWidth: '100%',
    appearance: 'none',
    WebkitAppearance: 'none',
    MozAppearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='${encodeURIComponent(c.color)}' stroke-width='2.5'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 8px center',
  };
}

export default function PaiementHebdo() {
  const {
    records, projects, workersByProject, loading, saving, syncing, error, configured, load,
    createBatch, updateAdjustments, markPaid, remove, filterWorkerPayroll,
    chantiers, weeks, computeLineFromPresence, groupPayrollByProjectWeek, syncFromPresence,
    attendance,
  } = useWorkerPayroll();

  const [search, setSearch] = useState('');
  const [filterProjet, setFilterProjet] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [filterSemaine, setFilterSemaine] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editRecord, setEditRecord] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [detailChefChantier, setDetailChefChantier] = useState('');
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

  async function handleStatutChange(p, newStatut) {
    if (newStatut === p.statut) return;
    const payDate = newStatut === 'Payé'
      ? (p.paymentDate || todayIso())
      : undefined;
    if (p.mergeAllWeeks && p.weeklyRecords?.length) {
      for (const rec of p.weeklyRecords) {
        if (!rec.id) continue;
        const r = await updateAdjustments(rec.id, rec, {
          statut: newStatut,
          paymentDate: newStatut === 'Payé'
            ? (payDate || todayIso())
            : undefined,
        });
        if (!r.success) {
          notify('error', r.error);
          return;
        }
      }
      notify('success', `Statut : ${newStatut}`);
      return;
    }
    if (!p.id) return;
    const r = await updateAdjustments(p.id, p, { statut: newStatut, paymentDate: payDate });
    notify(r.success ? 'success' : 'error', r.success ? `Statut : ${newStatut}` : r.error);
  }

  async function handlePaymentDateChange(p, newDate) {
    if (!newDate) return;
    if (p.mergeAllWeeks && p.weeklyRecords?.length) {
      for (const rec of p.weeklyRecords) {
        if (!rec.id) continue;
        const r = await updateAdjustments(rec.id, rec, { paymentDate: newDate });
        if (!r.success) {
          notify('error', r.error);
          return;
        }
      }
      notify('success', 'Date de paiement mise à jour.');
      return;
    }
    if (!p.id) return;
    const r = await updateAdjustments(p.id, p, { paymentDate: newDate });
    notify(r.success ? 'success' : 'error', r.success ? 'Date de paiement mise à jour.' : r.error);
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

  function enrichLineFromPresence(worker, projectId, projet, semaineDebut) {
    return computeLineFromPresence(worker, projectId, semaineDebut, projet);
  }

  function toggleWorker(worker) {
    setForm((p) => {
      const sel = { ...p.selected };
      if (sel[worker.id]?.checked) {
        delete sel[worker.id];
      } else {
        const line = enrichLineFromPresence(worker, p.projectId, p.projet, p.semaineDebut);
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
    setForm((p) => {
      const sel = {};
      workersByProject(p.projectId).forEach((w) => {
        const line = enrichLineFromPresence(w, p.projectId, p.projet, p.semaineDebut);
        sel[w.id] = { checked: true, ...line };
      });
      return { ...p, selected: sel };
    });
  }

  useEffect(() => {
    if (!form.projectId || !form.semaineDebut || editId) return;
    setForm((p) => {
      const keys = Object.keys(p.selected).filter((id) => p.selected[id]?.checked);
      if (!keys.length) return p;
      let changed = false;
      const sel = { ...p.selected };
      keys.forEach((workerId) => {
        const w = workersByProject(p.projectId).find((x) => String(x.id) === workerId);
        if (!w) return;
        const line = computeLineFromPresence(w, p.projectId, p.semaineDebut, p.projet);
        const prev = sel[workerId];
        if (String(prev.joursPaies) !== String(line.joursPaies)
          || String(prev.heuresNormales) !== String(line.heuresNormales)
          || String(prev.heuresSup) !== String(line.heuresSup)) {
          changed = true;
          sel[workerId] = {
            ...prev,
            joursPaies: line.joursPaies,
            heuresNormales: line.heuresNormales,
            heuresSup: line.heuresSup,
            tarifSup: line.tarifSup,
            fromPresence: line.fromPresence,
          };
        }
      });
      return changed ? { ...p, selected: sel } : p;
    });
  }, [form.projectId, form.semaineDebut, form.projet, editId, computeLineFromPresence, workersByProject]);

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
    setEditRecord(null);
    const semaine = filterSemaine || currentWeekStart();
    setForm({
      ...EMPTY_BATCH,
      semaineDebut: semaine,
      paymentDate: todayIso(),
    });
    setErrors({});
    setShowModal(true);
  }

  function openEdit(record) {
    setEditId(record.id);
    setEditRecord(record);
    setDetailId(null);
    setEditForm({
      heuresSup: String(record.heuresSup ?? ''),
      tarifSup: String(record.tarifSup ?? ''),
      avances: String(record.avances ?? ''),
      retenues: String(record.retenues ?? ''),
      statut: record.statut || 'En attente',
      paymentDate: record.paymentDate || todayIso(),
      notes: record.notes || '',
    });
    setErrors({});
    setShowModal(true);
  }

  function openDetail(record, chefChantier = '') {
    setDetailId(record.key || record.id);
    setDetailChefChantier(chefChantier);
  }

  function payrollGroupKey(group) {
    return filterSemaine ? `${group.projectId}|${group.semaineDebut}` : String(group.projectId || group.projet);
  }

  async function handleWorkerPdf(record, print = false) {
    try {
      const enriched = enrichPayrollWithAttendance(record, attendance);
      const days = enriched?.presenceLignes || [];
      await exportWorkerPaymentPdf(enriched || record, { attendanceDays: days, print });
    } catch {
      notify('error', 'Erreur lors de la génération du PDF.');
    }
  }

  async function handleSync() {
    const result = await syncFromPresence();
    if (!result.success) {
      notify('error', result.error || 'Erreur synchronisation.');
      return;
    }
    const { created = 0, updated = 0, removed = 0 } = result;
    if (created + updated + removed === 0) {
      notify('success', 'Situations à jour — aucune modification.');
    } else {
      const parts = [];
      if (created) parts.push(`${created} créée(s)`);
      if (updated) parts.push(`${updated} mise(s) à jour`);
      if (removed) parts.push(`${removed} supprimée(s)`);
      notify('success', `${parts.join(', ')} depuis les présences.`);
    }
  }

  function validateBatch() {
    const e = {};
    if (!form.projectId) e.projectId = 'Requis';
    if (!form.semaineDebut) e.semaineDebut = 'Requis';
    if (!form.paymentDate) e.paymentDate = 'Requis';
    if (!selectedLines.length) e.workers = 'Sélectionnez au moins un ouvrier';
    selectedLines.forEach((l) => {
      if (l.joursPaies === '' || Number(l.joursPaies) < 0) e[`j_${l.workerId}`] = 'Jours requis';
      if (!l.tarifJournalier || Number(l.tarifJournalier) <= 0) e[`t_${l.workerId}`] = 'Tarif journalier requis';
    });
    return e;
  }

  async function handleSubmit(ev) {
    ev.preventDefault();
    if (editId && editRecord) {
      const result = await updateAdjustments(editId, editRecord, {
        heuresSup: editForm.heuresSup === '' ? 0 : Number(editForm.heuresSup),
        tarifSup: editForm.tarifSup === '' ? undefined : Number(editForm.tarifSup),
        avances: editForm.avances === '' ? 0 : Number(editForm.avances),
        retenues: editForm.retenues === '' ? 0 : Number(editForm.retenues),
        statut: editForm.statut,
        paymentDate: editForm.statut === 'Payé' ? (editForm.paymentDate || todayIso()) : editForm.paymentDate,
        notes: editForm.notes,
      });
      if (!result.success) { notify('error', result.error || 'Erreur.'); return; }
      notify('success', 'Ajustements enregistrés — net recalculé.');
    } else {
      const errs = validateBatch();
      if (Object.keys(errs).length) { setErrors(errs); return; }
      const pr = projects.find((p) => String(p.id) === String(form.projectId));
      const result = await createBatch(
        {
          projectId: form.projectId,
          projet: form.projet,
          semaineDebut: form.semaineDebut,
          semaineFin: weekEndSunday(form.semaineDebut),
          paymentDate: form.paymentDate || todayIso(),
          statut: form.statut,
          notes: form.notes,
          chefProjet: pr?.chef_projet || pr?.responsable || '',
          chefChantier: pr?.chef_chantier || '',
        },
        selectedLines,
      );
      if (!result.success) { notify('error', result.error || 'Erreur.'); return; }
      notify('success', `${result.count} paiement(s) manuel(s) — total ${fmtMAD(batchTotal)}`);
    }
    setShowModal(false);
  }

  async function handleDelete(id) {
    if (!window.confirm('Supprimer ce paiement ?')) return;
    const result = await remove(id);
    notify(result.success ? 'success' : 'error', result.success ? 'Supprimé.' : (result.error || 'Erreur.'));
  }

  const filtered = useMemo(
    () => filterWorkerPayroll(records, {
      search, projet: filterProjet, statut: filterStatut, semaine: filterSemaine,
    }),
    [records, search, filterProjet, filterStatut, filterSemaine, filterWorkerPayroll],
  );

  const situationGroups = useMemo(
    () => groupPayrollByProjectWeek(filtered, filterSemaine),
    [filtered, filterSemaine, groupPayrollByProjectWeek],
  );

  const enrichedGroups = useMemo(
    () => situationGroups.map((g) => {
      const lignes = g.lignes.map((p) => enrichPayrollWithAttendance(p, attendance));
      return {
        ...g,
        lignes,
        totalNet: Math.round(lignes.reduce((s, p) => s + (Number(p.total) || 0), 0) * 100) / 100,
        totalBrut: Math.round(lignes.reduce((s, p) => s + (Number(p.montantBrut) || 0), 0) * 100) / 100,
      };
    }),
    [situationGroups, attendance],
  );

  const summaryCount = useMemo(
    () => enrichedGroups.reduce((n, g) => n + g.lignes.length, 0),
    [enrichedGroups],
  );

  const stats = useMemo(() => {
    const lignes = enrichedGroups.flatMap((g) => g.lignes);
    return {
      totalAPayer: Math.round(lignes.reduce((s, p) => s + (Number(p.total) || 0), 0) * 100) / 100,
      totalPaye: Math.round(lignes.filter((p) => p.statut === 'Payé').reduce((s, p) => s + (Number(p.total) || 0), 0) * 100) / 100,
      totalEnAttente: Math.round(lignes.filter((p) => p.statut === 'En attente').reduce((s, p) => s + (Number(p.total) || 0), 0) * 100) / 100,
      count: summaryCount,
    };
  }, [enrichedGroups, summaryCount]);
  const allSelected = projectWorkers.length > 0 && projectWorkers.every((w) => form.selected[w.id]?.checked);
  const editPreview = editRecord ? calcWorkerPayrollTotals({
    joursPaies: editRecord.joursPaies,
    tarifJournalier: editRecord.tarifJournalier,
    tarifHoraire: editRecord.tarifHoraire,
    heuresSup: editForm.heuresSup,
    tarifSup: editForm.tarifSup || editRecord.tarifSup,
    avances: editForm.avances,
    retenues: editForm.retenues,
  }) : null;
  const detailRecord = detailId
    ? enrichedGroups.flatMap((g) => g.lignes).find((p) => (p.key || p.id) === detailId)
    : null;

  const weekOptions = useMemo(() => {
    const set = new Set([...weeks, ...collectAttendanceWeeks(attendance)]);
    if (filterSemaine) set.add(filterSemaine);
    set.add(currentWeekStart());
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [weeks, filterSemaine, attendance]);

  const formWeekOptions = useMemo(() => {
    const set = new Set(weekOptions);
    if (form.semaineDebut) set.add(form.semaineDebut);
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [weekOptions, form.semaineDebut]);

  return (
    <div className="animate-fade-in rh-ext-page">
      <Toast toast={toast} />

      <div className="page-header flex-between finance-page-header">
        <div>
          <h1 className="page-title">Paiement hebdomadaire ouvriers</h1>
          <p className="page-subtitle finance-sub-hide-mobile">
            Flux normal : synchroniser les présences puis <strong>Payer</strong>.
            Correction manuelle uniquement en cas d&apos;erreur de saisie par le chef de chantier.
          </p>
        </div>
        <div className="finance-page-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleSync}
            disabled={loading || syncing || !configured}
            title="Recalculer depuis les présences"
          >
            {syncing ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={15} />}
            {' '}Synchroniser
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={openCreate}
            disabled={loading || saving || !configured}
            title="Uniquement si erreur de présence — ouvrier oublié, mauvaise semaine, etc."
            style={{ border: '1.5px dashed var(--border)', color: 'var(--text-3)', fontSize: '0.82rem' }}
          >
            <Plus size={14} /> Correction exceptionnelle
          </button>
        </div>
      </div>

      {!loading && configured && (
        <div className="rh-ext-hide-mobile" style={{ background: '#E3F2FD', border: '1px solid #90CAF9', borderRadius: 'var(--radius)', padding: '10px 16px', marginBottom: 16, fontSize: '0.84rem', color: '#1565C0' }}>
          <strong>Comment ça marche :</strong> les lignes viennent des <em>présences</em> (bouton Synchroniser).
          Pour payer : statut <strong>Payé</strong> ou bouton <strong>Payer</strong> (date caisse = aujourd&apos;hui).
          Utilisez <strong>Correction exceptionnelle</strong> ou <strong>Ajuster</strong> seulement si le chef de chantier s&apos;est trompé à la saisie.
        </div>
      )}

      {!configured && (
        <div style={{ background: '#FFF3E0', border: '1px solid #FFB74D', borderRadius: 'var(--radius)', padding: '10px 16px', marginBottom: 16, fontSize: '0.85rem', color: '#E65100' }}>
          Supabase non configuré
        </div>
      )}

      {error && !loading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#FFEBEE', border: '1px solid #EF9A9A', borderRadius: 'var(--radius)', padding: '10px 16px', marginBottom: 16, fontSize: '0.85rem', color: '#C62828' }}>
          <span>{error}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => load()}>Réessayer</button>
        </div>
      )}

      <div className="stat-grid rh-ext-stat-grid finance-kpi-strip" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))' }}>
        <div className="stat-card"><div className="stat-icon blue"><Banknote size={18} /></div><div className="stat-body"><div className="stat-value" style={{ fontSize: '1rem' }}>{loading ? '—' : fmtMAD(stats.totalAPayer)}</div><div className="stat-label">Net {filterSemaine ? 'semaine' : 'total'}</div></div></div>
        <div className="stat-card"><div className="stat-icon green"><CheckCircle size={18} /></div><div className="stat-body"><div className="stat-value" style={{ fontSize: '1rem' }}>{loading ? '—' : fmtMAD(stats.totalPaye)}</div><div className="stat-label">Payé</div></div></div>
        <div className="stat-card"><div className="stat-icon orange"><TrendingUp size={18} /></div><div className="stat-body"><div className="stat-value" style={{ fontSize: '1rem' }}>{loading ? '—' : fmtMAD(stats.totalEnAttente)}</div><div className="stat-label">En attente</div></div></div>
        <div className="stat-card"><div className="stat-icon"><Users size={18} /></div><div className="stat-body"><div className="stat-value">{loading ? '—' : stats.count}</div><div className="stat-label">Récap. ouvriers</div></div></div>
      </div>

      <div className="card rh-ext-filter-card">
        <div className="rh-ext-filter-bar">
          <Filter size={14} style={{ color: 'var(--text-3)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Calendar size={14} style={{ color: 'var(--text-3)' }} />
            <select value={filterSemaine} onChange={(e) => setFilterSemaine(e.target.value ? weekStartMonday(e.target.value) : '')} style={{ minWidth: 160 }}>
              <option value="">Toutes les semaines</option>
              {weekOptions.map((w) => (
                <option key={w} value={w}>Semaine du {new Date(`${w}T12:00:00`).toLocaleDateString('fr-MA')}</option>
              ))}
            </select>
          </div>
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

      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: 48, color: 'var(--text-3)' }}>
          <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
          Chargement et synchronisation des présences…
        </div>
      ) : enrichedGroups.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 48, color: 'var(--text-3)' }}>
          <Building2 size={32} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
          <p style={{ margin: '0 0 8px', fontWeight: 600 }}>{filterSemaine ? 'Aucune situation pour cette semaine' : 'Aucune situation enregistrée'}</p>
          <p style={{ margin: '0 0 16px', fontSize: '0.85rem' }}>
            Les paiements sont générés automatiquement dès qu&apos;une présence est enregistrée.
          </p>
          <button type="button" className="btn btn-secondary" onClick={handleSync} disabled={syncing}>
            <RefreshCw size={14} /> Synchroniser depuis les présences
          </button>
        </div>
      ) : (
        enrichedGroups.map((group) => (
          <div key={payrollGroupKey(group)} className="card rh-ext-group-card">
            <div className="rh-ext-group-head">
              <div className="rh-ext-group-head-inner">
                <div>
                  <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.05rem', marginBottom: 6 }}>
                    <Building2 size={16} style={{ verticalAlign: -2, marginRight: 6 }} />
                    {group.projet}
                  </div>
                  <div style={{ fontSize: '0.83rem', color: 'var(--text-3)' }}>
                    {filterSemaine ? fmtWeekRange(group.semaineDebut, group.semaineFin) : 'Toutes les semaines'} · {group.lignes.length} ouvrier{group.lignes.length > 1 ? 's' : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>Total net</div>
                  <div style={{ fontWeight: 800, color: 'var(--red)', fontSize: '1.05rem' }}>{fmtMAD(group.totalNet)}</div>
                </div>
              </div>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Ouvrier</th><th>Projet / chantier</th><th>Chef chantier</th><th>Présences</th>
                    <th>H. travaillées</th><th>Retard</th><th>Équiv. jours</th><th>Tarif/j</th><th>Net à payer</th>
                    <th>Date paiement</th><th>Statut</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {group.lignes.map((p) => (
                    <tr key={p.key || p.id} className="rh-ext-compact-row rh-payroll-row">
                      <td data-label="Ouvrier">
                        <button
                          type="button"
                          onClick={() => openDetail(p, group.chefChantier)}
                          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 700, color: 'var(--text)', textAlign: 'left', fontFamily: 'inherit', fontSize: 'inherit' }}
                        >
                          {p.ouvrier}
                        </button>
                      </td>
                      <td data-label="Projet / chantier">{p.projet || group.projet || '—'}</td>
                      <td data-label="Chef chantier">{p.chefChantier || group.chefChantier || '—'}</td>
                      <td data-label="Présences">{p.nbPresences ?? p.presenceLignes?.length ?? p.nbJoursTravailles ?? 0}</td>
                      <td data-label="H. travaillées">{fmtHours(p.heuresNormales)}</td>
                      <td data-label="Retard" style={{ color: p.totalRetard > 0 ? '#E65100' : 'var(--text-3)' }}>{p.totalRetard > 0 ? fmtHours(p.totalRetard) : '—'}</td>
                      <td data-label="Équiv. jours" style={{ fontWeight: 600 }}>{fmtDayEquiv(p.joursPaies)}</td>
                      <td data-label="Tarif/j">{fmtMAD(p.tarifJournalier)}</td>
                      <td data-label="Net à payer" style={{ fontWeight: 800, color: 'var(--red)' }}>{fmtMAD(p.total)}</td>
                      <td data-label="Date paiement">
                        {p.statut === 'Payé' ? (
                          <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{fmtDateFr(p.paymentDate || todayIso())}</span>
                        ) : (
                          <span style={{ color: 'var(--text-3)', fontSize: '0.78rem' }} title="Date fixée au paiement (aujourd'hui par défaut)">À la validation</span>
                        )}
                      </td>
                      <td data-label="Statut">
                        <select
                          value={PAYROLL_UI_STATUTS.includes(p.statut) ? p.statut : ''}
                          onChange={(e) => handleStatutChange(p, e.target.value)}
                          disabled={saving}
                          style={statutSelectStyle(PAYROLL_UI_STATUTS.includes(p.statut) ? p.statut : 'En attente')}
                          aria-label={`Statut paiement ${p.ouvrier}`}
                        >
                          {!PAYROLL_UI_STATUTS.includes(p.statut) && (
                            <option value="" disabled>{p.statut}</option>
                          )}
                          {PAYROLL_UI_STATUTS.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                      <td data-label="Actions" className="payment-actions-cell">
                        <div className="payment-row-actions">
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => openDetail(p, group.chefChantier)}><Eye size={13} /> Détail</button>
                          {!p.mergeAllWeeks && p.statut === 'En attente' && (
                            <button type="button" className="btn btn-sm" style={{ background: '#E8F5E9', color: '#2E7D32', border: 'none' }} title="Payer" onClick={() => markPaid(p.id, { paymentDate: p.paymentDate || todayIso() }).then((r) => notify(r.success ? 'success' : 'error', r.success ? 'Payé.' : r.error))}><CheckCircle size={13} /> Payer</button>
                          )}
                          {(!p.mergeAllWeeks || p.statut === 'Payé') && (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => openEdit(p)}
                              title="Ajustement ou correction (date caisse, heures sup, avances…)"
                            >
                              <Pencil size={13} /> {p.autoGenerated ? 'Ajuster' : 'Corriger'}
                            </button>
                          )}
                          <button type="button" className="btn btn-secondary btn-sm" title="PDF" onClick={() => handleWorkerPdf(p, false)}><FileDown size={13} /></button>
                          <button type="button" className="btn btn-secondary btn-sm" title="Imprimer" onClick={() => handleWorkerPdf(p, true)}><Printer size={13} /></button>
                          {!p.autoGenerated && !p.mergeAllWeeks && (
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleDelete(p.id)} title="Supprimer"><Trash2 size={13} style={{ color: 'var(--red)' }} /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}

      {showModal && (
        <div className="rh-ext-modal-overlay">
          <div className="card rh-ext-modal-box">
            <div className="flex-between" style={{ marginBottom: 16 }}>
              <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.05rem', margin: 0 }}>
                {editId
                  ? (editRecord?.autoGenerated ? 'Ajuster le paiement' : 'Correction saisie manuelle')
                  : 'Correction exceptionnelle (erreur présence)'}
              </h2>
              <button type="button" onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
            </div>

            <form onSubmit={handleSubmit}>
              {editId && editRecord ? (
                <div style={{ display: 'grid', gap: 14 }}>
                  <div style={{ padding: 12, background: '#F8F9FA', borderRadius: 8, fontSize: '0.85rem' }}>
                    <div><strong>{editRecord.ouvrier}</strong> · {editRecord.fonction || '—'}</div>
                    <div style={{ color: 'var(--text-3)', marginTop: 4 }}>
                      {editRecord.projet} · {fmtWeekRange(editRecord.semaineDebut, editRecord.semaineFin)}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 10 }}>
                      <div><span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Jours équivalents</span><div style={{ fontWeight: 700 }}>{fmtDayEquiv(editRecord.joursPaies)} j</div></div>
                      <div><span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Heures travaillées</span><div style={{ fontWeight: 700 }}>{fmtHours(editRecord.heuresNormales)}</div></div>
                      <div><span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Tarif journalier</span><div style={{ fontWeight: 700 }}>{fmtMAD(editRecord.tarifJournalier)}</div></div>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginTop: 8 }}>
                      Calculé automatiquement depuis les présences — non modifiable ici.
                    </div>
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
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div><label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Statut</label>
                      <select
                        value={editForm.statut}
                        onChange={(e) => setEditForm((p) => ({ ...p, statut: e.target.value }))}
                        style={INPUT_S(false)}
                      >
                        {PAYROLL_UI_STATUTS.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select></div>
                    <div>
                      <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Période RH</label>
                      <div style={{ ...READONLY_S, marginTop: 0 }}>
                        {fmtWeekRange(editRecord.semaineDebut, editRecord.semaineFin)}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 4 }}>Semaine travaillée — non modifiable ici</div>
                    </div>
                  </div>

                  <div style={{ padding: '12px 14px', background: '#E8F5E9', borderRadius: 8, border: '2px solid #66BB6A' }}>
                    <label style={{ fontSize: '0.88rem', fontWeight: 700, color: '#2E7D32', display: 'block', marginBottom: 8 }}>
                      Date de paiement (feuille de caisse) *
                    </label>
                    <input
                      type="date"
                      value={editForm.paymentDate || todayIso()}
                      onChange={(e) => setEditForm((p) => ({ ...p, paymentDate: e.target.value }))}
                      style={{ ...INPUT_S(false), maxWidth: 220, borderColor: '#66BB6A' }}
                      required
                    />
                    <div style={{ fontSize: '0.78rem', color: '#388E3C', marginTop: 6 }}>
                      À modifier ici si le paiement n&apos;a pas lieu aujourd&apos;hui (ex. payé le 16/06).
                    </div>
                  </div>
                  <div><label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Observation</label>
                    <textarea rows={2} value={editForm.notes || ''} onChange={(e) => setEditForm((p) => ({ ...p, notes: e.target.value }))} style={{ ...INPUT_S(false), resize: 'vertical' }} /></div>

                  {editPreview && (
                    <div style={{ padding: 12, background: '#F8F9FA', borderRadius: 8, fontSize: '0.85rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span>Heures sup</span><strong>{fmtMAD(editPreview.montantSup)}</strong></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span>Montant brut</span><strong>{fmtMAD(editPreview.montantBrut)}</strong></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: '#E65100' }}><span>Avances</span><strong>{fmtMAD(editPreview.avances)}</strong></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: '#C62828' }}><span>Retenues</span><strong>{fmtMAD(editPreview.retenues)}</strong></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6, borderTop: '1px solid var(--border)' }}><span style={{ fontWeight: 700 }}>Net à payer</span><strong style={{ color: 'var(--red)' }}>{fmtMAD(editPreview.montantNet)}</strong></div>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 14 }}>
                  <div style={{ padding: '10px 12px', background: '#FFF8E1', borderRadius: 8, fontSize: '0.82rem', color: '#F57F17' }}>
                    <strong>Erreur de présence uniquement.</strong> Si le chef de chantier a oublié un ouvrier, mal saisi les jours ou la mauvaise semaine — pas pour le flux normal (utilisez Synchroniser).
                  </div>

                  <div>
                    <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Projet / Chantier *</label>
                    <select value={form.projectId} onChange={(e) => handleProjectChange(e.target.value)} style={INPUT_S(errors.projectId)}>
                      <option value="">Choisir un projet…</option>
                      {projects.map((p) => <option key={p.id} value={p.id}>{p.ref ? `${p.ref} — ${p.nom}` : p.nom}</option>)}
                    </select>
                    {errors.projectId && <div style={{ color: 'var(--red)', fontSize: '0.78rem' }}>{errors.projectId}</div>}
                  </div>

                  <div style={{ padding: '12px 14px', background: '#E8F5E9', borderRadius: 8, border: '2px solid #66BB6A' }}>
                    <label style={{ fontSize: '0.88rem', fontWeight: 700, color: '#2E7D32', display: 'block', marginBottom: 8 }}>
                      Date de paiement (feuille de caisse) *
                    </label>
                    <input
                      type="date"
                      value={form.paymentDate || todayIso()}
                      onChange={(e) => setForm((p) => ({ ...p, paymentDate: e.target.value }))}
                      style={{ ...INPUT_S(errors.paymentDate), maxWidth: 220, borderColor: errors.paymentDate ? 'var(--red)' : '#66BB6A' }}
                      required
                    />
                    <div style={{ fontSize: '0.78rem', color: '#388E3C', marginTop: 6 }}>
                      Jour du paiement en caisse — à renseigner si différent d&apos;aujourd&apos;hui.
                    </div>
                    {errors.paymentDate && <div style={{ color: 'var(--red)', fontSize: '0.78rem', marginTop: 4 }}>{errors.paymentDate}</div>}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Semaine travaillée (RH) *</label>
                      <select
                        value={form.semaineDebut}
                        onChange={(e) => setForm((p) => ({ ...p, semaineDebut: e.target.value }))}
                        style={INPUT_S(errors.semaineDebut)}
                      >
                        {formWeekOptions.map((w) => (
                          <option key={w} value={w}>
                            {fmtWeekRange(w, weekEndSunday(w))}
                          </option>
                        ))}
                      </select>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 4 }}>Période de travail — toujours un lundi → dimanche</div>
                      {errors.semaineDebut && <div style={{ color: 'var(--red)', fontSize: '0.78rem' }}>{errors.semaineDebut}</div>}
                    </div>
                    <div>
                      <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Statut</label>
                      <select
                        value={form.statut}
                        onChange={(e) => setForm((p) => ({ ...p, statut: e.target.value }))}
                        style={INPUT_S(false)}
                      >
                        {PAYROLL_UI_STATUTS.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>

                  <div>
                    <div className="flex-between" style={{ marginBottom: 8 }}>
                      <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Ouvriers *</label>
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
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 320, overflowY: 'auto' }}>
                        {projectWorkers.map((w) => {
                          const sel = form.selected[w.id];
                          const totals = sel?.checked ? calcWorkerPayrollTotals(lineFromSelection(w.id, sel)) : null;
                          return (
                            <div key={w.id} style={{ border: '1.5px solid var(--border)', borderRadius: 8, padding: 12, background: sel?.checked ? '#FFF5F5' : '#fff' }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: sel?.checked ? 12 : 0 }}>
                                <input type="checkbox" checked={!!sel?.checked} onChange={() => toggleWorker(w)} />
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontWeight: 700 }}>{workerFullName(w)}</div>
                                  <div style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>
                                    {w.fonction || '—'} · Tarif/j : {fmtMAD(sel?.tarifJournalier ?? buildWorkerPayrollLine(w).tarifJournalier)}
                                    {sel?.fromPresence && <span style={{ color: '#2E7D32', marginLeft: 6 }}>· Présences</span>}
                                  </div>
                                </div>
                                {totals && <div style={{ fontWeight: 800, color: 'var(--red)', fontSize: '0.9rem' }}>{fmtMAD(totals.montantNet)}</div>}
                              </label>
                              {sel?.checked && (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8, paddingLeft: 28 }}>
                                  <div><label style={{ fontSize: '0.72rem', fontWeight: 600 }}>Jours</label>
                                    <input type="number" min="0" step="0.5" value={sel.joursPaies ?? ''} onChange={(e) => setWorkerField(w.id, 'joursPaies', e.target.value)} style={{ ...INPUT_S(errors[`j_${w.id}`]), padding: '6px 8px', fontSize: '0.85rem' }} /></div>
                                  <div><label style={{ fontSize: '0.72rem', fontWeight: 600 }}>Tarif/j</label>
                                    <input type="number" value={sel.tarifJournalier ?? ''} readOnly style={{ ...READONLY_S, padding: '6px 8px', fontSize: '0.85rem' }} /></div>
                                  <div><label style={{ fontSize: '0.72rem', fontWeight: 600 }}>H. sup</label>
                                    <input type="number" min="0" step="0.5" value={sel.heuresSup ?? ''} onChange={(e) => setWorkerField(w.id, 'heuresSup', e.target.value)} style={{ ...INPUT_S(false), padding: '6px 8px', fontSize: '0.85rem' }} /></div>
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
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Total ({selectedLines.length} ouvrier{selectedLines.length > 1 ? 's' : ''})</span><strong style={{ color: 'var(--red)', fontSize: '1.1rem' }}>{fmtMAD(batchTotal)}</strong></div>
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
        <WorkerPaymentDetailModal
          record={detailRecord}
          chefChantierFallback={detailChefChantier}
          onClose={() => { setDetailId(null); setDetailChefChantier(''); }}
          onEdit={() => { setDetailId(null); openEdit(detailRecord); }}
          onPdf={() => handleWorkerPdf(detailRecord, false)}
          onPrint={() => handleWorkerPdf(detailRecord, true)}
        />
      )}
    </div>
  );
}

import { ClockIcon, Plus, X, Filter, CheckCircle, XCircle, CalendarOff, Pencil, Loader2, Search, Users, HardHat, Download, Eye } from 'lucide-react';
import { useState, useRef, useMemo } from 'react';
import { useAttendance } from '../hooks/useAttendance';
import { generateAttendanceSheetPdf } from '../services/rh/attendanceSheetPdf';
import { syncPayrollAfterAttendanceChange } from '../services/rh/workerPayroll';
import { computeAttendanceWorkMetrics, STANDARD_SHIFT_START, groupAttendanceSummariesByProjectWeek, collectAttendanceWeeks, fmtWeekRange, weekStartMonday } from '../services/rh/attendance';
import AttendanceDailyDetailTable from './rh/AttendanceDailyDetailTable';

function EmptyState({ icon, title, sub }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-3)' }}>
      <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
        {icon}
      </div>
      <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-2)', marginBottom: 5 }}>{title}</div>
      <div style={{ fontSize: '0.83rem' }}>{sub}</div>
    </div>
  );
}

const STATUS_OPTS = ['Present', 'Absent', 'Retard', 'Demi-journee'];
const STATUS_BADGE = { Present: 'badge-green', Absent: 'badge-red', Retard: 'badge-orange', 'Demi-journee': 'badge-blue', Mixte: 'badge-grey' };

function currentWeekStart() {
  return weekStartMonday(new Date().toISOString().slice(0, 10));
}

function today() { return new Date().toISOString().slice(0, 10); }

function fmtHours(n) {
  return `${Number(n || 0).toLocaleString('fr-MA', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} h`;
}

function fmtDayEquiv(n) {
  return Number(n || 0).toLocaleString('fr-MA', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

function Toast({ toast }) {
  if (!toast) return null;
  const bg = toast.type === 'success' ? '#2E7D32' : '#D32F2F';
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, background: bg, color: '#fff', padding: '12px 20px', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.22)', fontSize: '0.88rem', fontWeight: 600, maxWidth: 'min(380px, calc(100vw - 32px))' }}>
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

const EMPTY_FORM = {
  workerId: '', workerIds: [], projectId: '', projet: '', projetNom: '',
  chefChantierId: '', chefChantierNom: '',
  date: today(), heureEntree: '07:30', heureSortie: '17:00', statut: 'Present', notes: '',
};

function normalizePersonName(s) {
  return (s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ');
}

function nameTokenKey(s) {
  return normalizePersonName(s).split(' ').filter(Boolean).sort().join(' ');
}

function matchChefChantierEmployee(chefsChantier, name) {
  const target = normalizePersonName(name);
  if (!target) return null;
  const targetKey = nameTokenKey(name);

  return (chefsChantier || []).find((c) => {
    const label = normalizePersonName(c.label);
    if (label === target) return true;
    if (nameTokenKey(c.label) === targetKey) return true;
    if (label.includes(target) || target.includes(label)) return true;
    return false;
  }) || null;
}

function applyProjectChefChantier(next, projectId, projects, chefsChantier) {
  const proj = (projects || []).find((o) => String(o.id) === String(projectId));
  const name = (proj?.chef_chantier || '').trim();
  if (name) {
    const match = matchChefChantierEmployee(chefsChantier, name);
    next.chefChantierId = match?.id || '';
    next.chefChantierNom = match?.label || name;
  } else {
    next.chefChantierId = '';
    next.chefChantierNom = '';
  }
  return next;
}

function WorkerChecklist({ workers, selectedIds, onChange, error, disabled }) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return workers;
    return workers.filter((w) =>
      w.label.toLowerCase().includes(q)
      || (w.projet_nom || '').toLowerCase().includes(q),
    );
  }, [workers, search]);

  function toggle(id) {
    if (disabled) return;
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id],
    );
  }

  function selectAllVisible() {
    if (disabled) return;
    const ids = new Set([...selectedIds, ...filtered.map((w) => w.id)]);
    onChange([...ids]);
  }

  function clearAll() {
    if (disabled) return;
    onChange([]);
  }

  return (
    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
        <label style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Users size={14} /> Ouvriers ({selectedIds.length} sélectionné{selectedIds.length > 1 ? 's' : ''})
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={selectAllVisible} disabled={disabled || !filtered.length}>
            Tout cocher
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={clearAll} disabled={disabled || !selectedIds.length}>
            Tout décocher
          </button>
        </div>
      </div>
      <div style={{ position: 'relative', marginBottom: 8 }}>
        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un ouvrier..."
          disabled={disabled}
          style={{ ...INPUT_S(false), paddingLeft: 32 }}
        />
      </div>
      <div style={{
        border: `1.5px solid ${error ? 'var(--red)' : 'var(--border)'}`,
        borderRadius: 'var(--radius)',
        maxHeight: 220,
        overflowY: 'auto',
        background: 'var(--surface-2)',
      }}>
        {workers.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-3)', fontSize: '0.84rem' }}>
            Aucun ouvrier pour ce projet. Choisissez un projet ou affectez des ouvriers au projet.
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-3)', fontSize: '0.84rem' }}>
            Aucun résultat pour « {search} »
          </div>
        ) : (
          filtered.map((w) => {
            const checked = selectedIds.includes(w.id);
            return (
              <label
                key={w.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  borderBottom: '1px solid var(--border)',
                  background: checked ? '#fff' : 'transparent',
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => toggle(w.id)}
                  style={{ width: 16, height: 16, accentColor: 'var(--red)', flexShrink: 0 }}
                />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 600, fontSize: '0.88rem', display: 'block' }}>{w.label}</span>
                  {w.projet_nom && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{w.projet_nom}</span>
                  )}
                </span>
              </label>
            );
          })
        )}
      </div>
      {error && <div style={{ color: 'var(--red)', fontSize: '0.75rem', marginTop: 6 }}>{error}</div>}
    </div>
  );
}

export default function Presence() {
  const {
    records,
    workerOptions,
    projectOptions,
    chefsChantier,
    projects,
    loading,
    saving,
    error,
    configured,
    load,
    create,
    createBulk,
    update,
    remove,
    filterAttendanceRecords,
    computeAttendanceStats,
    filterWorkersForProject,
    buildAttendanceSheetGroups,
    pickSheetGroupForExport,
    findSheetGroupForRecord,
    sheetGroupLabel,
  } = useAttendance();

  const [filterOuvrier, setFilterOuvrier] = useState('');
  const [filterProjectId, setFilterProjectId] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [filterChefId, setFilterChefId] = useState('');
  const [filterSemaine, setFilterSemaine] = useState(currentWeekStart());
  const [pdfLoading, setPdfLoading] = useState(false);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [pdfGroupKey, setPdfGroupKey] = useState('');
  const [pdfCandidates, setPdfCandidates] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [toast, setToast] = useState(null);
  const [detailSummary, setDetailSummary] = useState(null);
  const toastRef = useRef(null);

  function notify(type, msg) {
    setToast({ type, msg });
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 3000);
  }

  function setF(k, v) {
    setForm((p) => {
      const next = { ...p, [k]: v };
      if (k === 'workerId') {
        const w = workerOptions.find((o) => o.id === v);
        if (w?.project_id) {
          next.projectId = w.project_id;
          next.projetNom = w.projet_nom || '';
          next.projet = w.projet_nom || '';
          applyProjectChefChantier(next, w.project_id, projects, chefsChantier);
        }
      }
      if (k === 'projectId') {
        const pr = projectOptions.find((o) => o.id === v);
        next.projetNom = pr?.label?.includes(' — ') ? pr.label.split(' — ').slice(1).join(' — ') : (pr?.label || '');
        next.projet = next.projetNom;
        const allowed = new Set(
          filterWorkersForProject(workerOptions, v).map((w) => w.id),
        );
        next.workerIds = (p.workerIds || []).filter((id) => allowed.has(id));
        if (v) {
          applyProjectChefChantier(next, v, projects, chefsChantier);
        } else {
          next.chefChantierId = '';
          next.chefChantierNom = '';
        }
      }
      if (k === 'chefChantierId') {
        const chef = chefsChantier.find((c) => c.id === v);
        next.chefChantierNom = chef?.label || '';
      }
      if (k === 'heureEntree' || k === 'heureSortie') {
        if (next.statut !== 'Demi-journee' && next.statut !== 'Absent') {
          const preview = computeAttendanceWorkMetrics(next);
          if (preview.retardHeures > 0) next.statut = 'Retard';
          else if (next.statut === 'Retard') next.statut = 'Present';
        }
      }
      return next;
    });
  }

  function openCreate() {
    setEditId(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setShowModal(true);
  }

  function openEdit(record) {
    setEditId(record.id);
    setForm({
      workerId: record.workerId || '',
      workerIds: record.workerId ? [record.workerId] : [],
      projectId: record.projectId || '',
      projet: record.projet || '',
      projetNom: record.projet || '',
      chefChantierId: record.chefChantierId || '',
      chefChantierNom: record.chefChantier || '',
      date: record.date || today(),
      heureEntree: record.heureEntree || '07:30',
      heureSortie: record.heureSortie || '17:00',
      statut: record.statut || 'Present',
      notes: record.notes || '',
    });
    setErrors({});
    setShowModal(true);
  }

  function validate() {
    const e = {};
    if (editId) {
      if (!form.workerId) e.workerId = 'Requis';
    } else if (!form.workerIds?.length) {
      e.workerIds = 'Sélectionnez au moins un ouvrier';
    }
    if (!form.projectId && !form.projet) e.projet = 'Requis';
    if (!form.chefChantierId) e.chefChantierId = 'Requis';
    if (!form.date) e.date = 'Requis';
    return e;
  }

  function setWorkerIds(ids) {
    setForm((p) => ({ ...p, workerIds: ids }));
    if (errors.workerIds) setErrors((e) => ({ ...e, workerIds: undefined }));
  }

  async function handleSubmit(ev) {
    ev.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    if (editId) {
      const result = await update(editId, form);
      if (!result.success) {
        notify('error', result.error || 'Erreur enregistrement.');
        return;
      }
      notify('success', 'Présence modifiée.');
    } else {
      const payloads = form.workerIds.map((workerId) => ({ ...form, workerId }));
      const result = await createBulk(payloads);
      if (!result.success) {
        notify('error', result.error || 'Erreur enregistrement.');
        return;
      }
      const n = result.created || form.workerIds.length;
      if (result.failed > 0) {
        notify('success', `${n} présence(s) enregistrée(s), ${result.failed} échec(s).`);
      } else {
        notify('success', `${n} présence(s) enregistrée(s).`);
      }
    }

    setShowModal(false);
    setEditId(null);
    syncPayrollAfterAttendanceChange().catch(() => {});
  }

  async function handleDelete(id) {
    const result = await remove(id);
    notify(result.success ? 'success' : 'error', result.success ? 'Enregistrement supprime.' : (result.error || 'Erreur.'));
    if (result.success) syncPayrollAfterAttendanceChange().catch(() => {});
  }

  const filterWorkerOptions = useMemo(
    () => filterWorkersForProject(workerOptions, filterProjectId),
    [workerOptions, filterProjectId, filterWorkersForProject],
  );

  const modalWorkerOptions = useMemo(
    () => filterWorkersForProject(workerOptions, form.projectId || filterProjectId),
    [workerOptions, form.projectId, filterProjectId, filterWorkersForProject],
  );

  const filtered = useMemo(
    () => filterAttendanceRecords(records, {
      ouvrier: filterOuvrier,
      projectId: filterProjectId,
      chefChantierId: filterChefId,
      date: filterDate,
      statut: filterStatut,
    }),
    [records, filterOuvrier, filterProjectId, filterChefId, filterDate, filterStatut, filterAttendanceRecords],
  );

  const summaryGroups = useMemo(
    () => groupAttendanceSummariesByProjectWeek(filtered, {
      weekFilter: filterSemaine,
      projectIdFilter: filterProjectId,
      search: filterOuvrier,
    }),
    [filtered, filterSemaine, filterProjectId, filterOuvrier],
  );

  const weekOptions = useMemo(() => {
    const set = new Set(collectAttendanceWeeks(records));
    if (filterSemaine) set.add(filterSemaine);
    set.add(currentWeekStart());
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [records, filterSemaine]);

  const summaryCount = useMemo(
    () => summaryGroups.reduce((n, g) => n + g.ouvriers.length, 0),
    [summaryGroups],
  );

  const stats = useMemo(() => computeAttendanceStats(filtered), [filtered, computeAttendanceStats]);

  const formWorkPreview = useMemo(
    () => computeAttendanceWorkMetrics(form),
    [form],
  );

  const hasFilters = filterOuvrier || filterProjectId || filterChefId || filterDate || filterStatut;

  const canDownloadSheet = records.length > 0 && !loading;

  function resolveProjectLabel(group) {
    if (group?.projectId) {
      const opt = projectOptions.find((p) => String(p.id) === String(group.projectId));
      if (opt?.label) return opt.label;
    }
    return group?.projet || 'Projet';
  }

  function chefLabelForRecords(rows) {
    if (filterChefId) {
      return chefsChantier.find((c) => c.id === filterChefId)?.label || '';
    }
    const chefs = [...new Set((rows || []).map((r) => r.chefChantier).filter(Boolean))];
    return chefs.join(' · ');
  }

  async function runPdfExport(group) {
    if (!group?.records?.length) {
      notify('error', 'Aucune présence pour cette fiche.');
      return;
    }
    const projectLabel = resolveProjectLabel(group);
    const sheetStats = computeAttendanceStats(group.records);

    setPdfLoading(true);
    try {
      await generateAttendanceSheetPdf({
        projectLabel,
        date: group.date,
        chefChantier: chefLabelForRecords(group.records),
        records: group.records,
        stats: sheetStats,
      });
      notify('success', 'Fiche de présence téléchargée.');
      setShowPdfModal(false);
    } catch (err) {
      console.error('[CITYMO] attendance PDF', err);
      notify('error', err?.message || 'Erreur génération PDF.');
    } finally {
      setPdfLoading(false);
    }
  }

  function handleDownloadSheet() {
    const source = filtered.length ? filtered : records;
    const groups = buildAttendanceSheetGroups(source);
    if (!groups.length) {
      notify('error', 'Aucune présence à exporter.');
      return;
    }

    const { group, ambiguous, candidates } = pickSheetGroupForExport(groups, {
      projectId: filterProjectId,
      date: filterDate,
    });

    if (group && !ambiguous) {
      runPdfExport(group);
      return;
    }

    const list = candidates.length ? candidates : groups;
    setPdfCandidates(list);
    setPdfGroupKey(list[0]?.key || '');
    setShowPdfModal(true);
  }

  function handleDownloadRow(record) {
    const groups = buildAttendanceSheetGroups(records);
    const group = findSheetGroupForRecord(groups, record);
    if (group) {
      runPdfExport(group);
      return;
    }
    notify('error', 'Impossible de générer la fiche pour cette ligne.');
  }

  function confirmPdfPicker() {
    const group = pdfCandidates.find((g) => g.key === pdfGroupKey);
    if (group) runPdfExport(group);
    else notify('error', 'Choisissez une fiche.');
  }

  return (
    <div className="animate-fade-in rh-ext-page">
      <Toast toast={toast} />

      <div className="page-header flex-between">
        <div>
          <h1 className="page-title">Presence ouvriers</h1>
          <p className="page-subtitle">Vue récapitulative par ouvrier et semaine — détail journalier disponible</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate} disabled={loading || saving}>
          <Plus size={15} /> Ajouter une presence
        </button>
      </div>

      {!configured && (
        <div style={{ background: '#FFF3E0', border: '1px solid #FFB74D', borderRadius: 'var(--radius)', padding: '10px 16px', marginBottom: 16, fontSize: '0.85rem', color: '#E65100' }}>
          Supabase non configuré — ajoutez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env
        </div>
      )}

      {error && !loading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#FFEBEE', border: '1px solid #EF9A9A', borderRadius: 'var(--radius)', padding: '10px 16px', marginBottom: 16, fontSize: '0.85rem', color: '#C62828' }}>
          <span>{error}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={load}>Réessayer</button>
        </div>
      )}

      {/* Stats */}
      <div className="stat-grid rh-ext-stat-grid">
        <div className="stat-card">
          <div className="stat-icon green"><CheckCircle size={18} /></div>
          <div className="stat-body"><div className="stat-value">{loading ? '—' : stats.present}</div><div className="stat-label">Presents</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><XCircle size={18} /></div>
          <div className="stat-body"><div className="stat-value">{loading ? '—' : stats.absent}</div><div className="stat-label">Absents</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon blue"><ClockIcon size={18} /></div>
          <div className="stat-body"><div className="stat-value">{loading ? '—' : summaryCount}</div><div className="stat-label">Récap. ouvriers</div></div>
        </div>
      </div>

      {/* Filters */}
      <div className="card rh-ext-filter-card">
        <div className="rh-ext-filter-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-3)', fontSize: '0.85rem' }}>
            <Filter size={14} /> Filtres
          </div>
          <select value={filterSemaine} onChange={e => setFilterSemaine(e.target.value ? weekStartMonday(e.target.value) : '')}>
            <option value="">Toutes les semaines</option>
            {weekOptions.map(w => (
              <option key={w} value={w}>Semaine du {new Date(`${w}T12:00:00`).toLocaleDateString('fr-MA')}</option>
            ))}
          </select>
          <select value={filterOuvrier} onChange={e => setFilterOuvrier(e.target.value)}>
            <option value="">Tous les ouvriers</option>
            {filterWorkerOptions.map(w => <option key={w.id} value={w.label}>{w.label}</option>)}
          </select>
          <select value={filterProjectId} onChange={e => { setFilterProjectId(e.target.value); setFilterOuvrier(''); }}>
            <option value="">Tous les projets</option>
            {projectOptions.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <select value={filterChefId} onChange={e => setFilterChefId(e.target.value)}>
            <option value="">Tous les chefs</option>
            {chefsChantier.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <select value={filterStatut} onChange={e => setFilterStatut(e.target.value)}>
            <option value="">Tous les statuts</option>
            {STATUS_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} />
          {hasFilters && (
            <button type="button" onClick={() => { setFilterOuvrier(''); setFilterProjectId(''); setFilterChefId(''); setFilterDate(''); setFilterStatut(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: '0.82rem', fontWeight: 600 }}>
              Effacer filtres
            </button>
          )}
          <div className="rh-ext-filter-btn-end">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleDownloadSheet}
              disabled={pdfLoading || loading || !canDownloadSheet}
              title="PDF du projet et du jour (détectés automatiquement)"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              {pdfLoading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={14} />}
              Télécharger PDF
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px 24px', color: 'var(--text-3)' }}>
          <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
          <div style={{ fontSize: '0.88rem' }}>Chargement des présences…</div>
        </div>
      ) : summaryGroups.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<CalendarOff size={22} style={{ color: 'var(--text-3)' }} />}
            title={records.length === 0 ? "Aucune presence enregistree" : "Aucun resultat pour ces filtres"}
            sub={records.length === 0 ? "Ajoutez la premiere feuille de presence via le bouton ci-dessus" : "Modifiez vos criteres de recherche"}
          />
        </div>
      ) : (
        summaryGroups.map((group) => (
          <div key={`${group.projectId}|${group.semaineDebut}`} className="card" style={{ marginBottom: 16 }}>
            <div className="card-title" style={{ marginBottom: 12 }}><ClockIcon size={16} /> {group.projet}</div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-3)', marginBottom: 12 }}>
              Semaine : {fmtWeekRange(group.semaineDebut, group.semaineFin)} · {group.ouvriers.length} ouvrier{group.ouvriers.length > 1 ? 's' : ''}
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Ouvrier</th><th>Chef chantier</th><th>Jours trav.</th><th>H. travaillées</th>
                    <th>Retard</th><th>Équiv. jours</th><th>Statut</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {group.ouvriers.map((s) => (
                    <tr key={s.key}>
                      <td data-label="Ouvrier" style={{ fontWeight: 600 }}>{s.ouvrier}</td>
                      <td data-label="Chef chantier">{s.chefChantier || '—'}</td>
                      <td data-label="Jours trav.">{s.nbJoursTravailles}</td>
                      <td data-label="H. travaillées">{fmtHours(s.totalHeures)}</td>
                      <td data-label="Retard" style={{ color: s.totalRetard > 0 ? '#E65100' : 'var(--text-3)' }}>{s.totalRetard > 0 ? fmtHours(s.totalRetard) : '—'}</td>
                      <td data-label="Équiv. jours" style={{ fontWeight: 600 }}>{fmtDayEquiv(s.joursEquivalent)}</td>
                      <td data-label="Statut"><span className={'badge ' + (STATUS_BADGE[s.statutGlobal] || 'badge-grey')}>{s.statutGlobal}</span></td>
                      <td data-label="Actions">
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDetailSummary(s)}>
                          <Eye size={13} /> Voir détail
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}

      {detailSummary && (
        <div className="rh-ext-modal-overlay" style={{ zIndex: 1000 }}>
          <div className="card rh-ext-modal-box rh-ext-modal-box--lg">
            <div className="flex-between" style={{ marginBottom: 16 }}>
              <div>
                <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.05rem', margin: 0 }}>{detailSummary.ouvrier}</h2>
                <div style={{ fontSize: '0.83rem', color: 'var(--text-3)', marginTop: 4 }}>
                  {detailSummary.projet} · {fmtWeekRange(detailSummary.semaineDebut, detailSummary.semaineFin)}
                </div>
              </div>
              <button type="button" onClick={() => setDetailSummary(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10, marginBottom: 16, padding: 12, background: '#F8F9FA', borderRadius: 8, fontSize: '0.84rem' }}>
              <div><span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Jours travaillés</span><div style={{ fontWeight: 700 }}>{detailSummary.nbJoursTravailles}</div></div>
              <div><span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Heures travaillées</span><div style={{ fontWeight: 700 }}>{fmtHours(detailSummary.totalHeures)}</div></div>
              <div><span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Retard total</span><div style={{ fontWeight: 700, color: detailSummary.totalRetard > 0 ? '#E65100' : 'inherit' }}>{detailSummary.totalRetard > 0 ? fmtHours(detailSummary.totalRetard) : '—'}</div></div>
              <div><span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Équivalent jours</span><div style={{ fontWeight: 700 }}>{fmtDayEquiv(detailSummary.joursEquivalent)} j</div></div>
            </div>
            <div style={{ fontSize: '0.82rem', fontWeight: 700, marginBottom: 8 }}>Détail jour par jour</div>
            <AttendanceDailyDetailTable
              lignes={detailSummary.lignes}
              onEdit={(r) => { setDetailSummary(null); openEdit(r); }}
              onDelete={async (id) => {
                await handleDelete(id);
                setDetailSummary(null);
              }}
            />
          </div>
        </div>
      )}

      {/* Modal choix fiche PDF (plusieurs projets / dates) */}
      {showPdfModal && (
        <div className="rh-ext-modal-overlay" style={{ zIndex: 1000 }}>
          <div className="card rh-ext-modal-box rh-ext-modal-box--sm">
            <h3 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1rem', marginBottom: 8, textTransform: 'uppercase' }}>
              Fiche de présence
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-2)', marginBottom: 16 }}>
              Plusieurs fiches disponibles — choisissez celle à télécharger :
            </p>
            <select
              value={pdfGroupKey}
              onChange={(e) => setPdfGroupKey(e.target.value)}
              style={{ ...INPUT_S(false), marginBottom: 20 }}
            >
              {pdfCandidates.map((g) => (
                <option key={g.key} value={g.key}>{sheetGroupLabel(g)}</option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowPdfModal(false)} disabled={pdfLoading}>
                Annuler
              </button>
              <button type="button" className="btn btn-primary" onClick={confirmPdfPicker} disabled={pdfLoading}>
                {pdfLoading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={14} />}
                Télécharger
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="rh-ext-modal-overlay" style={{ zIndex: 1000 }}>
          <div className="card rh-ext-modal-box rh-ext-modal-box--md">
            <div className="flex-between" style={{ marginBottom: 20 }}>
              <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.2rem', textTransform: 'uppercase' }}>
                {editId ? 'Modifier la presence' : 'Ajouter une presence'}
              </h2>
              <button onClick={() => { setShowModal(false); setEditId(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>Projet</label>
                  <select value={form.projectId} onChange={e => setF('projectId', e.target.value)} style={INPUT_S(errors.projet)}>
                    <option value="">Choisir un projet...</option>
                    {projectOptions.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                  {errors.projet && <div style={{ color: 'var(--red)', fontSize: '0.75rem' }}>{errors.projet}</div>}
                </div>
                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <HardHat size={14} /> Chef de chantier
                  </label>
                  <select value={form.chefChantierId} onChange={e => setF('chefChantierId', e.target.value)} style={INPUT_S(errors.chefChantierId)}>
                    <option value="">Qui saisit la présence ?</option>
                    {chefsChantier.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                  {errors.chefChantierId && <div style={{ color: 'var(--red)', fontSize: '0.75rem' }}>{errors.chefChantierId}</div>}
                  {chefsChantier.length === 0 && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginTop: 4 }}>
                      Liste vide : vérifiez le poste « Chef de chantier » en RH ou rechargez la page.
                    </div>
                  )}
                  {form.projectId && !form.chefChantierId && (() => {
                    const proj = projects.find((p) => String(p.id) === String(form.projectId));
                    const name = (proj?.chef_chantier || '').trim();
                    if (!name) return null;
                    return (
                      <div style={{ fontSize: '0.72rem', color: '#E65100', marginTop: 4 }}>
                        « {name} » (fiche projet) introuvable en RH — sélectionnez manuellement.
                      </div>
                    );
                  })()}
                  {form.projectId && form.chefChantierId && (
                    <div style={{ fontSize: '0.72rem', color: '#2E7D32', marginTop: 4 }}>
                      Affecté automatiquement depuis la fiche projet
                    </div>
                  )}
                </div>
              </div>

              {editId ? (
                <>
                  <div className="form-group">
                    <label>Ouvrier</label>
                    <input
                      type="text"
                      readOnly
                      value={workerOptions.find((w) => w.id === form.workerId)?.label || '—'}
                      style={{ ...INPUT_S(false), background: 'var(--surface-2)', color: 'var(--text-2)' }}
                    />
                  </div>
                </>
              ) : (
                <WorkerChecklist
                  workers={modalWorkerOptions}
                  selectedIds={form.workerIds || []}
                  onChange={setWorkerIds}
                  error={errors.workerIds}
                  disabled={saving}
                />
              )}
              <div className="form-group">
                <label>Date</label>
                <input type="date" value={form.date} onChange={e => setF('date', e.target.value)} style={INPUT_S(errors.date)} />
                {errors.date && <div style={{ color: 'var(--red)', fontSize: '0.75rem' }}>{errors.date}</div>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>Heure entree</label>
                  <input type="time" value={form.heureEntree} onChange={e => setF('heureEntree', e.target.value)} style={INPUT_S(false)} />
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 4 }}>Reference : {STANDARD_SHIFT_START}</div>
                </div>
                <div className="form-group">
                  <label>Heure sortie</label>
                  <input type="time" value={form.heureSortie} onChange={e => setF('heureSortie', e.target.value)} style={INPUT_S(false)} />
                </div>
              </div>
              {(form.statut === 'Present' || form.statut === 'Retard') && (
                <div style={{ padding: '10px 12px', background: '#F8F9FA', borderRadius: 8, fontSize: '0.84rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
                  <div><span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Heures travaillees</span><div style={{ fontWeight: 700 }}>{fmtHours(formWorkPreview.heuresTravaillees)}</div></div>
                  <div><span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Retard</span><div style={{ fontWeight: 700, color: formWorkPreview.retardHeures > 0 ? '#E65100' : 'inherit' }}>{formWorkPreview.retardHeures > 0 ? fmtHours(formWorkPreview.retardHeures) : '—'}</div></div>
                  <div><span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Equivalent jour</span><div style={{ fontWeight: 700 }}>{fmtDayEquiv(formWorkPreview.joursEquivalent)} j</div></div>
                </div>
              )}
              <div className="form-group">
                <label>Statut</label>
                <select value={form.statut} onChange={e => setF('statut', e.target.value)} style={INPUT_S(false)}>
                  {STATUS_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Notes (optionnel)</label>
                <textarea rows={2} value={form.notes} onChange={e => setF('notes', e.target.value)} style={{ ...INPUT_S(false), resize: 'vertical' }} placeholder="Remarques..." />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
                <button type="button" className="btn btn-secondary" onClick={() => { setShowModal(false); setEditId(null); }} disabled={saving}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={14} />}
                  {editId ? 'Mettre à jour' : (form.workerIds?.length > 1 ? `Enregistrer (${form.workerIds.length})` : 'Enregistrer')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

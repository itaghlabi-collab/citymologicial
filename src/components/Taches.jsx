import {
  Plus, CheckSquare, Clock, Trash2, Edit2, X, User, Building2, RefreshCw, Bell,
} from 'lucide-react';
import { useState, useEffect, useRef, useMemo } from 'react';
import { listEmployees, employeeFullName } from '../services/rh/employees';
import { DEPARTMENTS, getDeptById } from '../data/departments';
import { useInternalTasks } from '../hooks/useInternalTasks';
import { useAuth } from '../hooks/useAuth';
import { canManageTaskDgPush, canCreateDgTask } from '../services/auth/taskDgPushAccess';
import {
  TASK_STATUTS,
  TASK_STATUT_LABELS,
  TASK_STATUT_SELECT_STYLE,
  formatDgRelanceBadge,
} from '../services/internal/internalTasks';

function Toast({ toast }) {
  if (!toast) return null;
  const bg = toast.type === 'success' ? '#2E7D32' : toast.type === 'info' ? '#1565C0' : '#D32F2F';
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999, background: bg, color: '#fff',
      padding: '12px 20px', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.22)',
      fontSize: '0.88rem', fontWeight: 600, maxWidth: 340,
    }}>
      {toast.msg}
    </div>
  );
}

const PRIORITY_BADGES = { urgente: 'badge-red', haute: 'badge-red', normale: 'badge-blue', basse: 'badge-grey' };

const EMPTY_FORM = {
  titre: '', description: '', assigne: '', departement_id: '', dateLimite: '',
  statut: 'a_faire', priorite: 'normale', module_lie: '', commentaire: '', is_dg_task: false,
};

const INPUT_S = (err) => ({
  padding: '9px 12px', width: '100%', outline: 'none', fontFamily: 'var(--font-body)', fontSize: '0.9rem',
  border: '1.5px solid ' + (err ? 'var(--red)' : 'var(--border)'), borderRadius: 'var(--radius)', background: '#fff',
});

const FILTER_S = {
  padding: '7px 10px', border: '1.5px solid var(--border)', borderRadius: 'var(--radius)',
  fontSize: '0.82rem', background: '#fff', fontFamily: 'var(--font-body)',
};

function ConfirmModal({ open, title, message, confirmLabel, confirmClass, onConfirm, onCancel, loading }) {
  if (!open) return null;
  return (
    <div className="taches-modal-backdrop animate-fade-in" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="taches-modal card taches-confirm-modal">
        <div className="flex-between" style={{ marginBottom: 12 }}>
          <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.05rem', textTransform: 'uppercase', margin: 0 }}>
            {title}
          </h2>
          <button type="button" onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer' }} aria-label="Fermer">
            <X size={20} />
          </button>
        </div>
        <p style={{ color: 'var(--text-2)', fontSize: '0.9rem', margin: '0 0 20px', lineHeight: 1.5 }}>{message}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={loading}>Annuler</button>
          <button type="button" className={`btn ${confirmClass || 'btn-primary'}`} onClick={onConfirm} disabled={loading}>
            {confirmLabel || 'Confirmer'}
          </button>
        </div>
      </div>
    </div>
  );
}

function RelanceDirecteurModal({ task, open, onClose, onSubmit, saving }) {
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (open) setMessage('');
  }, [open, task?.id]);

  if (!open || !task) return null;

  return (
    <div className="taches-modal-backdrop animate-fade-in" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="taches-modal card taches-relance-modal">
        <div className="flex-between" style={{ marginBottom: 4 }}>
          <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.15rem', margin: 0 }}>
            🔔 Relance Directeur
          </h2>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }} aria-label="Fermer">
            <X size={20} />
          </button>
        </div>
        <p style={{ color: 'var(--text-3)', fontSize: '0.85rem', margin: '0 0 18px' }}>
          Envoyer une relance au collaborateur concernant cette tâche.
        </p>
        <div className="form-group" style={{ marginBottom: 14 }}>
          <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Message de relance (optionnel)</label>
          <textarea
            rows={3}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={'Exemple :\nMerci de mettre à jour l\'avancement de cette tâche.'}
            style={{ ...INPUT_S(false), resize: 'vertical', marginTop: 6 }}
          />
        </div>
        <div className="taches-relance-info">
          <div><span>Tâche :</span> {task.titre}</div>
          <div><span>Responsable :</span> {task.assigne || '—'}</div>
          <div><span>Statut :</span> {TASK_STATUT_LABELS[task.statut] || task.statut}</div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Annuler</button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onSubmit(message)}
            disabled={saving}
          >
            Envoyer la relance
          </button>
        </div>
      </div>
    </div>
  );
}

function employeeDepartmentId(emp) {
  if (!emp) return null;
  if (emp.department_id) return Number(emp.department_id);
  const dept = DEPARTMENTS.find(
    (d) => d.code === emp.department || d.nom === emp.department,
  );
  return dept?.id ?? null;
}

function employeeDepartmentCode(emp) {
  const id = employeeDepartmentId(emp);
  return id ? (getDeptById(id)?.code || '—') : '—';
}

function StatusSelect({ value, onChange, disabled }) {
  const style = TASK_STATUT_SELECT_STYLE[value] || TASK_STATUT_SELECT_STYLE.a_faire;
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="taches-statut-select"
      style={{
        ...style,
        padding: '5px 8px',
        borderRadius: 6,
        border: `1.5px solid ${style.borderColor}`,
        fontSize: '0.72rem',
        fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        minWidth: 108,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {TASK_STATUTS.map((s) => (
        <option key={s} value={s}>{TASK_STATUT_LABELS[s]}</option>
      ))}
    </select>
  );
}

function TaskRow({
  t, canDgPush, onStatusChange, onRelance, onToggleDone, onEdit, onDelete, saving, showDgCategoryBadge,
}) {
  const isDone = t.statut === 'terminee';
  const isCancelled = t.statut === 'annulee';
  const relanceBadge = formatDgRelanceBadge(t.dg_relance_count);
  const hasRelance = Boolean(relanceBadge);

  return (
    <div
      className={`taches-row${hasRelance ? ' taches-row--urgent-dg' : ''}${isDone ? ' taches-row--done' : ''}`}
    >
      <input
        type="checkbox"
        checked={isDone}
        disabled={isCancelled || saving}
        onChange={(e) => onToggleDone(t.id, e.target.checked)}
        className="taches-row-check"
      />
      <div className="taches-row-body">
        <div className="taches-row-title-row">
          <div
            className="taches-row-title"
            style={{
              textDecoration: isDone || isCancelled ? 'line-through' : 'none',
              color: isDone || isCancelled ? 'var(--text-3)' : 'var(--text)',
            }}
          >
            {t.titre}
          </div>
          {showDgCategoryBadge && t.is_dg_task && (
            <span className="badge badge-purple taches-urgent-badge">TÂCHE DG</span>
          )}
          {relanceBadge && (
            <span className="badge badge-red taches-urgent-badge">{relanceBadge}</span>
          )}
        </div>
        {t.description && <div className="taches-row-desc">{t.description}</div>}
        <div className="taches-row-meta">
          {t.assigne && <span><User size={11} /> {t.assigne}</span>}
          {t.module_lie && (() => {
            const dept = DEPARTMENTS.find((d) => d.code === t.module_lie);
            return dept
              ? <span><Building2 size={11} /> {dept.code}</span>
              : <span>{t.module_lie}</span>;
          })()}
          {t.dateLimite && <span><Clock size={11} /> {t.dateLimite}</span>}
        </div>
      </div>
      <div className="taches-row-actions">
        <StatusSelect
          value={t.statut}
          disabled={saving}
          onChange={(next) => onStatusChange(t.id, next)}
        />
        <span className={'badge ' + (PRIORITY_BADGES[t.priorite] || 'badge-grey')} style={{ fontSize: '0.7rem' }}>
          {t.priorite}
        </span>
        {canDgPush ? (
          <button
            type="button"
            className="btn btn-sm taches-relance-btn"
            title="Relance Directeur"
            onClick={() => onRelance(t)}
            disabled={saving}
          >
            <Bell size={14} />
          </button>
        ) : null}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onEdit(t)}><Edit2 size={13} /></button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onDelete(t.id)}>
          <Trash2 size={13} style={{ color: 'var(--red)' }} />
        </button>
      </div>
    </div>
  );
}

export default function Taches() {
  const { user } = useAuth();
  const canDgPush = canManageTaskDgPush(user);
  const {
    records: tasks, loading, saving, error, configured, load,
    create, update, remove, setStatut, sendDgRelance,
    responsables, filterInternalTasks, computeInternalTaskStats, computeDgTaskStats, splitTasksByCategory,
  } = useInternalTasks();

  const [employees, setEmployees] = useState([]);
  const [viewTab, setViewTab] = useState('all');
  const [filter, setFilter] = useState('all');
  const [dgFilter, setDgFilter] = useState('all');
  const [prioriteFilter, setPrioriteFilter] = useState('all');
  const [responsableFilter, setResponsableFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [toast, setToast] = useState(null);
  const [relanceTask, setRelanceTask] = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const toastRef = useRef(null);

  useEffect(() => {
    if (!configured) return;
    listEmployees()
      .then((rows) => setEmployees(Array.isArray(rows) ? rows : []))
      .catch(() => setEmployees([]));
  }, [configured]);

  function showToast(type, msg) {
    setToast({ type, msg });
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 3500);
  }

  function deptCodeFromTask(t) {
    if (!t.module_lie) return '';
    const dept = DEPARTMENTS.find((d) => d.code === t.module_lie);
    return dept ? String(dept.id) : '';
  }

  function openCreate() { setForm(EMPTY_FORM); setErrors({}); setEditId(null); setShowModal(true); }
  function openEdit(t) {
    setForm({
      titre: t.titre,
      description: t.description || '',
      assigne: t.assigne || '',
      departement_id: deptCodeFromTask(t),
      dateLimite: t.dateLimite || '',
      statut: t.statut,
      priorite: t.priorite,
      module_lie: t.module_lie || '',
      commentaire: t.commentaire || '',
      is_dg_task: Boolean(t.is_dg_task),
    });
    setErrors({});
    setEditId(t.id);
    setShowModal(true);
  }
  function closeModal() { setShowModal(false); setEditId(null); }
  function setF(k, v) { setForm((p) => ({ ...p, [k]: v })); }

  function handleDepartmentChange(deptId) {
    setForm((p) => ({ ...p, departement_id: deptId, assigne: '' }));
  }

  function payloadFromForm(f) {
    const dept = DEPARTMENTS.find((d) => d.id === Number(f.departement_id));
    return { ...f, module_lie: f.module_lie?.trim() || (dept ? dept.code : '') || null };
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = {};
    if (!form.titre.trim()) errs.titre = 'Requis';
    if (!form.dateLimite) errs.dateLimite = 'Requis';
    if (form.is_dg_task && !form.assigne?.trim()) errs.assigne = 'Responsable requis pour une tâche DG';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    if (!configured) { showToast('error', 'Supabase non configuré.'); return; }
    const payload = payloadFromForm(form);
    if (!canCreateDgTask(user)) {
      delete payload.is_dg_task;
    }
    const result = editId ? await update(editId, payload) : await create(payload);
    if (!result.success) { showToast('error', result.error || 'Erreur.'); return; }
    showToast('success', editId ? 'Tâche mise à jour !' : 'Tâche créée avec succès !');
    closeModal();
  }

  async function deleteTask(id) {
    setConfirmState({
      title: 'Supprimer la tâche',
      message: 'Supprimer cette tâche ? Cette action est irréversible.',
      confirmLabel: 'Supprimer',
      confirmClass: 'btn-primary',
      onConfirm: async () => {
        const result = await remove(id);
        setConfirmState(null);
        showToast(result.success ? 'success' : 'error', result.success ? 'Tâche supprimée.' : (result.error || 'Erreur.'));
      },
    });
  }

  function openRelance(t) {
    if (!canDgPush) return;
    setRelanceTask(t);
  }

  async function handleRelanceSubmit(message) {
    if (!relanceTask) return;
    const result = await sendDgRelance(relanceTask, message);
    if (result.success) {
      showToast('success', 'Relance envoyée avec succès');
      setRelanceTask(null);
    } else {
      showToast('error', result.error || 'Erreur relance.');
    }
  }

  const { normalTasks, dgTasks } = useMemo(
    () => splitTasksByCategory(tasks, user),
    [tasks, user, splitTasksByCategory],
  );

  const activeTasks = viewTab === 'dg' ? dgTasks : normalTasks;
  const activeFilter = viewTab === 'dg' ? dgFilter : filter;
  const setActiveFilter = viewTab === 'dg' ? setDgFilter : setFilter;

  async function handleStatusChange(id, nextStatut) {
    const result = await setStatut(id, nextStatut);
    if (result.success) {
      showToast('success', `Statut : ${TASK_STATUT_LABELS[nextStatut]}`);
    } else {
      showToast('error', result.error || 'Erreur statut.');
    }
  }

  async function toggleDone(id, checked) {
    const result = await setStatut(id, checked ? 'terminee' : 'a_faire');
    if (!result.success) showToast('error', result.error || 'Erreur.');
  }

  const filterBase = useMemo(() => ({
    priorite: prioriteFilter,
    responsable: responsableFilter,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  }), [prioriteFilter, responsableFilter, dateFrom, dateTo]);

  const filteredActive = useMemo(() => {
    if (activeFilter === 'all') {
      return filterInternalTasks(activeTasks, filterBase);
    }
    return filterInternalTasks(activeTasks, { ...filterBase, statut: activeFilter });
  }, [activeTasks, activeFilter, filterBase, filterInternalTasks]);

  const counts = computeInternalTaskStats(normalTasks);
  const dgCounts = computeDgTaskStats(dgTasks);

  const employeeNames = useMemo(() => {
    const fromRh = employees
      .filter((e) => e.statut !== 'Inactif')
      .map(employeeFullName)
      .filter(Boolean);
    return [...new Set([...fromRh, ...responsables])].sort((a, b) => a.localeCompare(b, 'fr'));
  }, [employees, responsables]);

  /** Liste employés du formulaire — filtrée par département sélectionné */
  const assignableEmployees = useMemo(() => {
    const active = employees.filter((e) => e.statut !== 'Inactif');
    const deptId = form.departement_id ? Number(form.departement_id) : null;
    const filtered = deptId
      ? active.filter((e) => employeeDepartmentId(e) === deptId)
      : active;

    const options = filtered.map((e) => ({
      name: employeeFullName(e),
      deptCode: employeeDepartmentCode(e),
    })).filter((o) => o.name);

    if (form.assigne && !options.some((o) => o.name === form.assigne)) {
      const match = active.find((e) => employeeFullName(e) === form.assigne);
      options.push({
        name: form.assigne,
        deptCode: match ? employeeDepartmentCode(match) : '—',
      });
    }

    return options.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [employees, form.departement_id, form.assigne]);

  if (loading && tasks.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '50vh', gap: 12 }}>
        <div style={{ width: 32, height: 32, border: '3px solid var(--border)', borderTopColor: 'var(--red)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <p style={{ color: 'var(--text-3)', fontSize: '0.88rem' }}>Chargement des tâches...</p>
      </div>
    );
  }

  const statCards = [
    ['all', 'Toutes', counts.total],
    ['a_faire', 'À faire', counts.a_faire],
    ['en_cours', 'En cours', counts.en_cours],
    ['en_attente', 'En attente', counts.en_attente],
    ['terminee', 'Terminées', counts.terminee],
  ];

  const dgStatCards = [
    ['all', 'Tâches DG', dgCounts.total],
    ['a_faire', 'DG à faire', dgCounts.a_faire],
    ['en_cours', 'DG en cours', dgCounts.en_cours],
    ['terminee', 'DG terminées', dgCounts.terminee],
  ];

  const kpiCards = viewTab === 'dg' ? dgStatCards : statCards;
  const kpiAccent = viewTab === 'dg' ? '#6A1B9A' : 'var(--red)';

  return (
    <div className="animate-fade-in taches-module">
      <Toast toast={toast} />
      <div className="page-header flex-between">
        <div>
          <h1 className="page-title">Tâches à faire</h1>
          <p className="page-subtitle">Suivi et gestion des tâches de l&apos;équipe</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={load} disabled={loading}><RefreshCw size={14} /></button>
          <button type="button" className="btn btn-primary" onClick={openCreate} disabled={!configured || saving}>
            <Plus size={15} /> Nouvelle tâche
          </button>
        </div>
      </div>

      {!configured && (
        <div className="card" style={{ marginBottom: 16, padding: 12, color: '#E65100', fontSize: '0.85rem' }}>
          Supabase non configuré — exécutez supabase/RUN_INTERNAL_TASKS_ENHANCE.sql et RUN_INTERNAL_TASKS_DG.sql
        </div>
      )}
      {error && (
        <div className="card" style={{ marginBottom: 16, padding: 12, color: 'var(--red)', fontSize: '0.85rem' }}>{error}</div>
      )}

      <div className="card taches-toolbar" style={{ padding: '12px 16px', marginBottom: 12 }}>
        <div className="taches-toolbar-row taches-toolbar-row--tabs-only">
          <div className="taches-view-tabs">
            <button
              type="button"
              className={viewTab === 'all' ? 'active' : ''}
              onClick={() => setViewTab('all')}
            >
              Toutes les tâches
            </button>
            <button
              type="button"
              className={viewTab === 'dg' ? 'active' : ''}
              onClick={() => setViewTab('dg')}
            >
              Tâches DG
            </button>
          </div>
        </div>
      </div>

      <div className="taches-kpi-section-label">{viewTab === 'dg' ? 'Tâches DG' : 'Tâches générales'}</div>
      <div className="stat-grid taches-kpi-grid taches-kpi-grid--compact" style={{ marginBottom: 12 }}>
        {kpiCards.map(([k, label, val]) => (
          <div
            key={viewTab === 'dg' ? `dg-${k}` : k}
            className="stat-card taches-stat-card--compact"
            style={{
              cursor: 'pointer',
              border: activeFilter === k ? `2px solid ${kpiAccent}` : '1px solid var(--border)',
            }}
            onClick={() => setActiveFilter(k)}
          >
            <div className="stat-body">
              <div className="stat-value" style={{ color: activeFilter === k ? kpiAccent : 'var(--text)' }}>
                {val}
              </div>
              <div className="stat-label">{label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="card taches-filters" style={{ padding: '12px 16px', marginBottom: 12 }}>
        <select value={prioriteFilter} onChange={(e) => setPrioriteFilter(e.target.value)} style={FILTER_S}>
          <option value="all">Toutes priorités</option>
          <option value="urgente">Urgente</option>
          <option value="haute">Haute</option>
          <option value="normale">Normale</option>
          <option value="basse">Basse</option>
        </select>
        <select value={responsableFilter} onChange={(e) => setResponsableFilter(e.target.value)} style={FILTER_S}>
          <option value="all">Tous responsables</option>
          {employeeNames.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={FILTER_S} title="Date début" />
        <span style={{ color: 'var(--text-3)', fontSize: '0.82rem' }}>→</span>
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={FILTER_S} title="Date fin" />
      </div>

      <div className="card">
        <div className="card-title" style={{ marginBottom: 12 }}>
          <CheckSquare size={16} />
          {viewTab === 'dg'
            ? (activeFilter === 'all' ? 'Tâches DG' : `Tâches DG — ${TASK_STATUT_LABELS[activeFilter] || activeFilter}`)
            : (activeFilter === 'all' ? 'Toutes les tâches' : (TASK_STATUT_LABELS[activeFilter] || 'Tâches'))}
          {viewTab === 'dg' && dgCounts.total > 0 && (
            <span className="badge badge-purple" style={{ marginLeft: 8, fontSize: '0.68rem' }}>
              {dgCounts.total} tâche{dgCounts.total > 1 ? 's' : ''}
            </span>
          )}
        </div>
        {filteredActive.length === 0 ? (
          <div className="taches-empty-inline">
            {viewTab === 'dg' ? 'Aucune tâche DG pour le moment.' : 'Aucune tâche dans cette catégorie.'}
          </div>
        ) : (
          <div className="taches-list">
            {filteredActive.map((t) => (
              <TaskRow
                key={t.id}
                t={t}
                canDgPush={canDgPush}
                saving={saving}
                showDgCategoryBadge={viewTab === 'dg'}
                onStatusChange={handleStatusChange}
                onRelance={openRelance}
                onToggleDone={toggleDone}
                onEdit={openEdit}
                onDelete={deleteTask}
              />
            ))}
          </div>
        )}
      </div>

      <RelanceDirecteurModal
        task={relanceTask}
        open={Boolean(relanceTask)}
        onClose={() => setRelanceTask(null)}
        onSubmit={handleRelanceSubmit}
        saving={saving}
      />
      <ConfirmModal
        open={Boolean(confirmState)}
        title={confirmState?.title}
        message={confirmState?.message}
        confirmLabel={confirmState?.confirmLabel}
        confirmClass={confirmState?.confirmClass}
        onConfirm={confirmState?.onConfirm}
        onCancel={() => setConfirmState(null)}
        loading={saving}
      />

      {showModal && (
        <div className="taches-modal-backdrop animate-fade-in" onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className="taches-modal card">
            <div className="flex-between" style={{ marginBottom: 20 }}>
              <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.2rem', textTransform: 'uppercase' }}>
                {editId ? 'Modifier la tâche' : 'Nouvelle tâche'}
              </h2>
              <button type="button" onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label>Titre</label>
                <input type="text" placeholder="Description de la tâche..." value={form.titre} onChange={(e) => setF('titre', e.target.value)} style={INPUT_S(errors.titre)} />
                {errors.titre && <div style={{ color: 'var(--red)', fontSize: '0.75rem', marginTop: 2 }}>{errors.titre}</div>}
              </div>
              <div className="form-group">
                <label>Description (optionnel)</label>
                <textarea rows={2} value={form.description} onChange={(e) => setF('description', e.target.value)} style={{ ...INPUT_S(false), resize: 'vertical' }} />
              </div>
              {canCreateDgTask(user) && !editId && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '10px 12px', background: form.is_dg_task ? '#F3E5F5' : 'var(--bg)', borderRadius: 8, border: `1.5px solid ${form.is_dg_task ? '#6A1B9A' : 'var(--border)'}` }}>
                  <input
                    type="checkbox"
                    checked={Boolean(form.is_dg_task)}
                    onChange={(e) => setF('is_dg_task', e.target.checked)}
                  />
                  <span>
                    <strong style={{ display: 'block', fontSize: '0.88rem' }}>Tâche DG</strong>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>Visible uniquement par la Direction et le responsable assigné</span>
                  </span>
                </label>
              )}
              <div className="form-group">
                <label>Département</label>
                <select
                  value={form.departement_id}
                  onChange={(e) => handleDepartmentChange(e.target.value)}
                  style={INPUT_S(false)}
                >
                  <option value="">Tous les départements</option>
                  {DEPARTMENTS.map((d) => <option key={d.id} value={d.id}>{d.code} — {d.nom}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Assigné à{form.is_dg_task ? ' *' : ''}</label>
                <select value={form.assigne} onChange={(e) => setF('assigne', e.target.value)} style={INPUT_S(errors.assigne)}>
                  <option value="">
                    {form.departement_id ? 'Choisir un employé du département…' : 'Liste des employés'}
                  </option>
                  {assignableEmployees.map(({ name, deptCode }) => (
                    <option key={name} value={name}>{name} ({deptCode})</option>
                  ))}
                </select>
                {errors.assigne && <div style={{ color: 'var(--red)', fontSize: '0.75rem', marginTop: 2 }}>{errors.assigne}</div>}
              </div>
              <div className="form-group">
                <label>Date limite</label>
                <input type="date" value={form.dateLimite} onChange={(e) => setF('dateLimite', e.target.value)} style={INPUT_S(errors.dateLimite)} />
              </div>
              <div className="taches-form-grid-2">
                <div className="form-group">
                  <label>Statut</label>
                  <select value={form.statut} onChange={(e) => setF('statut', e.target.value)} style={INPUT_S(false)}>
                    {TASK_STATUTS.map((s) => <option key={s} value={s}>{TASK_STATUT_LABELS[s]}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Priorité</label>
                  <select value={form.priorite} onChange={(e) => setF('priorite', e.target.value)} style={INPUT_S(false)}>
                    <option value="urgente">Urgente</option>
                    <option value="haute">Haute</option>
                    <option value="normale">Normale</option>
                    <option value="basse">Basse</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
                <button type="button" className="btn btn-secondary" onClick={closeModal}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  <Plus size={14} /> {editId ? 'Mettre à jour' : 'Créer la tâche'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

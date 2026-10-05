import { useCallback, useMemo, useState } from 'react';
import { ListChecks, Plus, Clock, AlertTriangle, BellRing, ClipboardList, Loader2, Search } from 'lucide-react';
import { useSuiviTaches } from '../../hooks/useSuiviTaches';
import {
  TASK_STATUTS,
  TASK_STATUT_LABEL,
  TASK_PRIORITES,
  TASK_PRIORITE_META,
  TASK_CATEGORIES,
  TASK_CATEGORIE_LABEL,
  filterTasks,
  computeTaskKpis,
  todayIso,
} from '../../services/commercial/suiviTaches';
import TaskCard from './suiviTaches/TaskCard';
import TaskFormModal from './suiviTaches/TaskFormModal';
import TaskDetailModal from './suiviTaches/TaskDetailModal';
import { Toast, inputStyle } from './suiviTaches/ui';
import './suiviTaches/suiviTaches.css';

const QUICK_FILTERS = [
  { id: 'toutes', label: 'Toutes' },
  { id: 'mes', label: 'Mes tâches' },
  { id: 'urgentes', label: 'Urgentes' },
  { id: 'retard', label: 'En retard' },
  { id: 'relance', label: 'Relance DG' },
];

const EMPTY_FILTERS = {
  search: '', responsable: '', priorite: '', categorie: '', echeance: '', statut: '', quick: 'toutes',
};

export default function SuiviTachesCommercial() {
  const {
    tasks, assignees, projects, userId,
    loading, saving, error, configured, load,
    create, update, patch, moveTask, remove,
    userLabel, projectLabel,
  } = useSuiviTaches();

  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [mobileStatut, setMobileStatut] = useState('a_faire');
  const [formState, setFormState] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [toast, setToast] = useState('');
  const [dragId, setDragId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);

  const today = todayIso();
  const notify = useCallback((msg) => setToast(msg || ''), []);
  const closeToast = useCallback(() => setToast(''), []);
  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }));
  const hasFilters = Object.keys(EMPTY_FILTERS).some((k) => filters[k] !== EMPTY_FILTERS[k]);

  const filtered = useMemo(
    () => filterTasks(tasks, filters, { today, userId, userLabel, projectLabel }),
    [tasks, filters, today, userId, userLabel, projectLabel],
  );

  const columns = useMemo(() => {
    const map = Object.fromEntries(TASK_STATUTS.map((s) => [s, []]));
    filtered.forEach((t) => { (map[t.statut] || map.a_faire).push(t); });
    Object.values(map).forEach((list) => list.sort((a, b) => a.position - b.position));
    return map;
  }, [filtered]);

  const kpis = useMemo(() => computeTaskKpis(tasks, today), [tasks, today]);

  const societes = useMemo(() => {
    const set = new Set();
    tasks.forEach((t) => { if (t.societe?.trim()) set.add(t.societe.trim()); });
    return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
  }, [tasks]);

  const detailTask = detailId ? tasks.find((t) => t.id === detailId) : null;

  function openCreate() {
    const me = assignees.some((u) => u.id === userId) ? userId : '';
    setFormState({ task: null, defaults: { responsable_id: me } });
  }

  async function handleSubmit(form) {
    const editing = formState?.task;
    const res = editing ? await update(editing.id, form) : await create(form);
    if (!res.success) { notify(res.error); return; }
    notify(editing ? 'Tâche mise à jour.' : 'Tâche créée.');
    setFormState(null);
  }

  async function handleMove(id, statut, beforeId = null) {
    const res = await moveTask(id, statut, beforeId);
    if (!res.success) notify(res.error);
  }

  async function handleDelete(task) {
    if (!window.confirm(`Supprimer la tâche « ${task.titre} » ?`)) return;
    const res = await remove(task.id);
    if (res.success) {
      setDetailId(null);
      notify('Tâche supprimée.');
    } else {
      notify(res.error);
    }
  }

  function endDrag() {
    setDragId(null);
    setDropTarget(null);
  }

  function dropOnColumn(e, statut) {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain') || dragId;
    endDrag();
    if (id) handleMove(id, statut, null);
  }

  return (
    <div className="animate-fade-in sta-page">
      <div className="page-header flex-between">
        <div>
          <h1 className="page-title">Suivi des tâches</h1>
          <p className="page-subtitle">Tâches commerciales et marketing de l'équipe</p>
        </div>
        <button type="button" className="btn btn-primary sta-header-add" onClick={openCreate} disabled={loading || !configured}>
          <Plus size={15} /> Nouvelle tâche
        </button>
      </div>

      {!configured && (
        <div className="sta-alert sta-alert--warn">Supabase non configuré — ajoutez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env</div>
      )}

      {error && !loading && (
        <div className="sta-alert sta-alert--error">
          <span>{error}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={load}>Réessayer</button>
        </div>
      )}

      {loading && (
        <div className="sta-muted" style={{ padding: '24px 0' }}><Loader2 size={18} className="spin" /> Chargement des tâches...</div>
      )}

      {!loading && (
        <>
          <div className="stat-grid sta-kpis">
            <div className="stat-card"><div className="stat-icon"><ClipboardList size={18} /></div><div className="stat-body"><div className="stat-value">{kpis.aFaire}</div><div className="stat-label">À faire</div></div></div>
            <div className="stat-card"><div className="stat-icon blue"><Clock size={18} /></div><div className="stat-body"><div className="stat-value">{kpis.enCours}</div><div className="stat-label">En cours</div></div></div>
            <div className="stat-card"><div className="stat-icon orange"><AlertTriangle size={18} /></div><div className="stat-body"><div className="stat-value">{kpis.enRetard}</div><div className="stat-label">En retard</div></div></div>
            <div className="stat-card"><div className="stat-icon purple"><BellRing size={18} /></div><div className="stat-body"><div className="stat-value">{kpis.relancesDg}</div><div className="stat-label">Relances DG</div></div></div>
          </div>

          <div className="sta-quickbar">
            {QUICK_FILTERS.map((q) => (
              <button
                key={q.id}
                type="button"
                className={'sta-chip' + (filters.quick === q.id ? ' is-active' : '')}
                onClick={() => setFilter('quick', q.id)}
              >
                {q.label}
              </button>
            ))}
          </div>

          <div className="sta-filters">
            <div className="sta-search">
              <Search size={14} />
              <input value={filters.search} onChange={(e) => setFilter('search', e.target.value)} placeholder="Rechercher une tâche, société, projet..." />
            </div>
            <select style={inputStyle(false)} value={filters.responsable} onChange={(e) => setFilter('responsable', e.target.value)}>
              <option value="">Tous les responsables</option>
              {assignees.map((u) => <option key={u.id} value={u.id}>{u.nom}</option>)}
            </select>
            <select style={inputStyle(false)} value={filters.priorite} onChange={(e) => setFilter('priorite', e.target.value)}>
              <option value="">Toutes priorités</option>
              {TASK_PRIORITES.map((p) => <option key={p} value={p}>{TASK_PRIORITE_META[p].dot} {TASK_PRIORITE_META[p].label}</option>)}
            </select>
            <select style={inputStyle(false)} value={filters.categorie} onChange={(e) => setFilter('categorie', e.target.value)}>
              <option value="">Toutes catégories</option>
              {TASK_CATEGORIES.map((c) => <option key={c} value={c}>{TASK_CATEGORIE_LABEL[c]}</option>)}
            </select>
            <select style={inputStyle(false)} value={filters.echeance} onChange={(e) => setFilter('echeance', e.target.value)}>
              <option value="">Toutes échéances</option>
              <option value="retard">En retard</option>
              <option value="aujourdhui">Aujourd'hui</option>
              <option value="semaine">7 prochains jours</option>
              <option value="sans">Sans échéance</option>
            </select>
            <select style={inputStyle(false)} value={filters.statut} onChange={(e) => setFilter('statut', e.target.value)}>
              <option value="">Tous les statuts</option>
              {TASK_STATUTS.map((s) => <option key={s} value={s}>{TASK_STATUT_LABEL[s]}</option>)}
            </select>
            {hasFilters && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFilters(EMPTY_FILTERS)}>Réinitialiser</button>
            )}
          </div>

          <div className="sta-mobile-tabs">
            {TASK_STATUTS.map((s) => (
              <button
                key={s}
                type="button"
                className={'sta-chip' + (mobileStatut === s ? ' is-active' : '')}
                onClick={() => setMobileStatut(s)}
              >
                {TASK_STATUT_LABEL[s]} <span className="sta-chip-count">{columns[s].length}</span>
              </button>
            ))}
          </div>

          <div className="sta-board">
            {TASK_STATUTS.map((s) => (
              <div
                key={s}
                className={'sta-col' + (mobileStatut === s ? ' is-mobile-active' : '') + (dragId && dropTarget?.statut === s ? ' is-drop' : '')}
                onDragOver={(e) => { e.preventDefault(); if (dropTarget?.statut !== s || dropTarget?.beforeId) setDropTarget({ statut: s, beforeId: null }); }}
                onDrop={(e) => dropOnColumn(e, s)}
              >
                <div className={'sta-col-head sta-col-head--' + s}>
                  <span className="sta-col-title">{TASK_STATUT_LABEL[s]}</span>
                  <span className="sta-col-count">{columns[s].length}</span>
                </div>
                <div className="sta-col-list">
                  {columns[s].length === 0 && (
                    <div className="sta-col-empty">
                      <ListChecks size={18} />
                      <span>Aucune tâche</span>
                    </div>
                  )}
                  {columns[s].map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      today={today}
                      responsableNom={userLabel(t.responsable_id)}
                      projectLabel={projectLabel(t.project_id)}
                      dropBefore={Boolean(dragId) && dragId !== t.id && dropTarget?.beforeId === t.id}
                      onOpen={(task) => setDetailId(task.id)}
                      onMove={(id, statut) => handleMove(id, statut)}
                      onDragStart={setDragId}
                      onDragEnd={endDrag}
                      onDragOverCard={(id) => { if (dropTarget?.beforeId !== id) setDropTarget({ statut: s, beforeId: id }); }}
                      onDropOnCard={(id, beforeId) => {
                        const moved = id || dragId;
                        endDrag();
                        if (moved && moved !== beforeId) handleMove(moved, s, beforeId);
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {configured && !loading && (
        <button type="button" className="sta-fab" onClick={openCreate} aria-label="Nouvelle tâche">
          <Plus size={18} /> Nouvelle tâche
        </button>
      )}

      {formState && (
        <TaskFormModal
          task={formState.task}
          defaults={formState.defaults}
          assignees={assignees}
          projects={projects}
          societes={societes}
          saving={saving}
          onClose={() => setFormState(null)}
          onSubmit={handleSubmit}
        />
      )}

      {detailTask && !formState && (
        <TaskDetailModal
          task={detailTask}
          today={today}
          assignees={assignees}
          userLabel={userLabel}
          projectLabel={projectLabel}
          onClose={() => setDetailId(null)}
          onEdit={(task) => setFormState({ task, defaults: null })}
          onPatch={patch}
          onDelete={handleDelete}
          notify={notify}
        />
      )}

      <Toast msg={toast} onClose={closeToast} />
    </div>
  );
}

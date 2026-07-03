/**
 * ProjectPlanningGantt.jsx — Planning chantier type diagramme de Gantt (style MS Project / CITYMO)
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Plus, Edit2, Trash2, Download, Filter, X, Loader2, AlertCircle,
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
} from 'lucide-react';
import {
  listProjectPlanningTasks,
  createProjectPlanningTask,
  updateProjectPlanningTask,
  deleteProjectPlanningTask,
  shiftPlanningTaskDates,
  filterPlanningTasks,
  importPlanningWbsTemplate,
  planningTaskLabel,
  filterPlanningParentTasks,
  buildGanttTimeline,
  ganttScrollTargetLeft,
  buildGanttDisplayRows,
  taskBarPx,
  daysBetweenInclusive,
  endDateFromStartAndDuration,
  isoDateLocal,
  withDefaultPlanningDates,
} from '../../services/projects/projectPlanningTasks';
import { generateProjectPlanningPdfSynthesis, generateProjectPlanningPdfDetailed } from '../../services/projects/projectPlanningPdf';
import {
  PLANNING_LOTS,
  PLANNING_STATUTS,
  mergePlanningLots,
  planningStatutMeta,
  planningLotColor,
  planningTaskBarColor,
  planningGanttBarColor,
  PLANNING_TASK_PALETTE,
} from '../../constants/projectPlanning';
import { hasPlanningWbsTemplate, countPlanningWbsTemplateTasks } from '../../constants/projectPlanningWbsTemplates';
import { listActiveEmployees, employeeSelectLabel, filterPlanningResponsables } from '../../services/rh/employees';

const ROW_H = 34;
const HDR_H = 50;
const DAY_W = 28;
const LEFT_W = 560;

const IS = {
  padding: '8px 11px',
  border: '1.5px solid var(--border)',
  borderRadius: 6,
  fontSize: '0.86rem',
  background: '#fff',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

const EMPTY_TASK = {
  nom: '',
  lot: 'Gros œuvre',
  date_debut: '',
  date_fin: '',
  duree_jours: 7,
  responsable: '',
  avancement: 0,
  statut: 'a_faire',
  notes: '',
  predecessor_id: '',
  parent_id: '',
  wbs_code: '',
  couleur: '',
};

function defaultTaskForm() {
  const today = isoDateLocal(new Date());
  return {
    ...EMPTY_TASK,
    date_debut: today,
    date_fin: endDateFromStartAndDuration(today, 7),
    duree_jours: 7,
  };
}

const GANTT_HDR = {
  background: 'linear-gradient(135deg, var(--red-dark) 0%, var(--red) 100%)',
  color: '#fff',
  fontFamily: 'var(--font-head)',
  fontWeight: 700,
  fontSize: '0.68rem',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
};

function fmtDateTable(iso) {
  if (!iso) return '—';
  return new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function Toast({ msg, onClose }) {
  const t = useRef();
  useEffect(() => {
    t.current = setTimeout(onClose, 3000);
    return () => clearTimeout(t.current);
  }, [onClose]);
  if (!msg) return null;
  return (
    <div style={{
      position: 'fixed', bottom: 28, right: 28, background: 'var(--text)', color: '#fff',
      borderRadius: 8, padding: '12px 20px', fontSize: '0.875rem', fontWeight: 600, zIndex: 9999,
      boxShadow: '0 4px 16px rgba(0,0,0,0.18)', maxWidth: 340,
    }}
    >
      {msg}
    </div>
  );
}

function TaskColorPicker({ lot, value, onChange }) {
  const defaultColor = planningLotColor(lot);
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>
        Couleur de la tâche
      </span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        <button
          type="button"
          title="Couleur par défaut (lot)"
          onClick={() => onChange('')}
          style={{
            width: 28, height: 28, borderRadius: 6, cursor: 'pointer', padding: 0,
            background: defaultColor,
            border: !value ? '3px solid var(--red)' : '2px solid var(--border)',
            boxShadow: 'inset 0 0 0 2px #fff',
          }}
        />
        {PLANNING_TASK_PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            title={c}
            onClick={() => onChange(c)}
            style={{
              width: 28, height: 28, borderRadius: 6, cursor: 'pointer', padding: 0,
              background: c,
              border: value === c ? '3px solid var(--red)' : '2px solid #fff',
              boxShadow: '0 0 0 1px var(--border)',
            }}
          />
        ))}
      </div>
      <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>
        {value ? `Couleur sélectionnée : ${value}` : 'Couleur du lot utilisée par défaut'}
      </span>
    </label>
  );
}

function TaskModal({ open, task, tasks, employees, saving, importingTemplate, onClose, onSave, onImportTemplate, defaultParentId }) {
  const [form, setForm] = useState(EMPTY_TASK);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (open) {
      const base = task
        ? withDefaultPlanningDates({ ...EMPTY_TASK, ...task })
        : defaultTaskForm();
      if (defaultParentId && !task) base.parent_id = defaultParentId;
      setForm(base);
      setErr('');
    }
  }, [open, task, defaultParentId]);

  if (!open) return null;

  const parentOptions = filterPlanningParentTasks(tasks, form.lot, task?.id);
  const showWbsTemplate = !task && hasPlanningWbsTemplate(form.lot);

  function setField(key, val) {
    setForm((prev) => {
      const next = { ...prev, [key]: val };
      if (key === 'lot') {
        const parent = tasks.find((t) => t.id === prev.parent_id);
        if (parent && parent.lot !== val) next.parent_id = '';
      }
      if (key === 'date_debut' || key === 'date_fin' || key === 'duree_jours') {
        if (next.date_debut && next.date_fin) {
          next.duree_jours = daysBetweenInclusive(next.date_debut, next.date_fin);
        } else if (next.date_debut && key === 'duree_jours') {
          next.date_fin = endDateFromStartAndDuration(next.date_debut, next.duree_jours);
        } else if (next.date_debut && key === 'date_debut' && next.duree_jours) {
          next.date_fin = endDateFromStartAndDuration(next.date_debut, next.duree_jours);
        }
      }
      if (key === 'avancement') {
        const pct = Number(val);
        if (pct >= 100) next.statut = 'termine';
        else if (pct > 0 && next.statut === 'a_faire') next.statut = 'en_cours';
      }
      return next;
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.nom?.trim()) {
      setErr('Nom de la tâche requis.');
      return;
    }
    try {
      await onSave(form);
      onClose();
    } catch (ex) {
      setErr(ex.message || 'Erreur enregistrement.');
    }
  }

  const predecessors = tasks.filter((t) => t.id !== task?.id);

  async function handleImportTemplate() {
    if (!showWbsTemplate || !onImportTemplate) return;
    const n = countPlanningWbsTemplateTasks(form.lot);
    const ok = window.confirm(
      `Importer le modèle WBS pour « ${form.lot} » (${n} tâche(s) proposées) ?\n\nLes tâches existantes ne seront pas modifiées. Vous pourrez ensuite les ajuster librement.`,
    );
    if (!ok) return;
    try {
      await onImportTemplate(form.lot);
      onClose();
    } catch (ex) {
      setErr(ex.message || 'Erreur import modèle WBS.');
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 8000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}
    >
      <div style={{
        background: '#fff', borderRadius: 10, width: '100%', maxWidth: 520,
        maxHeight: '90vh', overflow: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px', borderBottom: '1px solid var(--border)',
        }}
        >
          <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1rem' }}>
            {task ? 'Modifier la tâche' : 'Ajouter une tâche planning'}
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {err && (
            <div style={{ padding: '8px 12px', background: 'var(--red-light)', color: 'var(--red)', borderRadius: 6, fontSize: '0.84rem' }}>
              {err}
            </div>
          )}

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>Lot / catégorie</span>
            <select value={form.lot} onChange={(e) => setField('lot', e.target.value)} style={{ ...IS, cursor: 'pointer' }}>
              {PLANNING_LOTS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>
          {showWbsTemplate && (
            <button
              type="button"
              disabled={importingTemplate || saving}
              onClick={handleImportTemplate}
              style={{
                padding: '8px 12px', borderRadius: 6, border: '1.5px solid var(--border)',
                background: '#fff', cursor: importingTemplate ? 'wait' : 'pointer',
                fontWeight: 600, fontSize: '0.8rem', textAlign: 'left',
              }}
            >
              {importingTemplate ? 'Import en cours…' : 'Créer depuis modèle WBS'}
            </button>
          )}

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>Lot de travaux (parent)</span>
            <select value={form.parent_id} onChange={(e) => setField('parent_id', e.target.value)} style={{ ...IS, cursor: 'pointer' }}>
              <option value="">— Racine —</option>
              {parentOptions.map((t) => (
                <option key={t.id} value={t.id}>{planningTaskLabel(t)}</option>
              ))}
            </select>
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 10 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>Code WBS</span>
              <input
                value={form.wbs_code || ''}
                onChange={(e) => setField('wbs_code', e.target.value)}
                placeholder="ex. 1.1"
                style={IS}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>Nom de la tâche *</span>
              <input value={form.nom} onChange={(e) => setField('nom', e.target.value)} style={IS} required />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>Statut</span>
              <select value={form.statut} onChange={(e) => setField('statut', e.target.value)} style={{ ...IS, cursor: 'pointer' }}>
                {PLANNING_STATUTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: 10 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>Date début</span>
              <input type="date" value={form.date_debut} onChange={(e) => setField('date_debut', e.target.value)} style={IS} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>Date fin</span>
              <input type="date" value={form.date_fin} onChange={(e) => setField('date_fin', e.target.value)} style={IS} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>Durée (j)</span>
              <input type="number" min={1} value={form.duree_jours} onChange={(e) => setField('duree_jours', e.target.value)} style={IS} />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>Responsable</span>
              <select value={form.responsable} onChange={(e) => setField('responsable', e.target.value)} style={{ ...IS, cursor: 'pointer' }}>
                <option value="">— Choisir —</option>
                {form.responsable && !employees.some((e) => employeeSelectLabel(e) === form.responsable) && (
                  <option value={form.responsable}>{form.responsable}</option>
                )}
                {employees.map((e) => (
                  <option key={e.id} value={employeeSelectLabel(e)}>{employeeSelectLabel(e)}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>Avancement %</span>
              <input type="number" min={0} max={100} value={form.avancement} onChange={(e) => setField('avancement', e.target.value)} style={IS} />
            </label>
          </div>

          <TaskColorPicker
            lot={form.lot}
            value={form.couleur || ''}
            onChange={(c) => setField('couleur', c)}
          />

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>Dépend de (tâche précédente)</span>
            <select value={form.predecessor_id} onChange={(e) => setField('predecessor_id', e.target.value)} style={{ ...IS, cursor: 'pointer' }}>
              <option value="">Aucune</option>
              {predecessors.map((t) => (
                <option key={t.id} value={t.id}>{planningTaskLabel(t)}</option>
              ))}
            </select>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>Notes</span>
            <textarea value={form.notes} onChange={(e) => setField('notes', e.target.value)} rows={3} style={{ ...IS, resize: 'vertical' }} />
          </label>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ padding: '9px 16px', borderRadius: 6, border: '1.5px solid var(--border)', background: '#fff', cursor: 'pointer', fontWeight: 600 }}>
              Annuler
            </button>
            <button type="submit" disabled={saving} style={{ padding: '9px 18px', borderRadius: 6, border: 'none', background: 'var(--red)', color: '#fff', cursor: saving ? 'wait' : 'pointer', fontWeight: 700 }}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function GanttBar({ row, minDate, dayWidth, onEdit, onShift, onBarChange }) {
  const bar = taskBarPx(row, minDate, dayWidth);
  const dragRef = useRef({ mode: null, startX: 0 });

  if (!bar || bar.width < 2) return null;

  const isSummary = row.type === 'summary';
  const color = planningGanttBarColor(row);
  const pct = Math.min(100, Math.max(0, Number(row.avancement) || 0));
  const h = isSummary ? 10 : 14;
  const top = isSummary ? 12 : 10;

  function startDrag(e, mode) {
    if (isSummary || !row.id) return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { mode, startX: e.clientX };
    const onMove = (ev) => {
      const delta = Math.round((ev.clientX - dragRef.current.startX) / dayWidth);
      if (delta !== 0) dragRef.current.pending = delta;
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      const delta = dragRef.current.pending || 0;
      if (delta && onBarChange) onBarChange(row, dragRef.current.mode, delta);
      dragRef.current = { mode: null, startX: 0 };
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        title={`${row.nom} — ${pct}% (glisser pour déplacer)`}
        onMouseDown={(e) => startDrag(e, 'move')}
        onClick={(e) => { if (!isSummary && !dragRef.current.pending) onEdit?.(row); }}
        style={{
          position: 'absolute',
          left: bar.left + 1,
          width: bar.width,
          top,
          height: h,
          zIndex: 3,
          background: color,
          borderRadius: isSummary ? 4 : 3,
          cursor: isSummary ? 'default' : 'grab',
          boxShadow: '0 1px 3px rgba(0,0,0,0.22)',
          overflow: 'hidden',
          opacity: row.statut === 'termine' ? 0.75 : 1,
          border: row.statut === 'bloque' ? '1.5px dashed #fff' : 'none',
        }}
      >
        {!isSummary && (
          <div style={{
            position: 'absolute', left: 0, bottom: 0, height: '45%',
            width: `${pct}%`, background: 'rgba(0,0,0,0.28)',
          }}
          />
        )}
        {isSummary && (
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0,
            width: `${pct}%`, background: 'rgba(255,255,255,0.22)',
          }}
          />
        )}
        {!isSummary && (
          <div
            onMouseDown={(e) => startDrag(e, 'resize')}
            style={{
              position: 'absolute', right: 0, top: 0, bottom: 0, width: 6,
              cursor: 'ew-resize', background: 'rgba(0,0,0,0.15)',
            }}
          />
        )}
      </div>
      {!isSummary && (
        <div style={{ position: 'absolute', right: 4, top: 4, display: 'flex', gap: 1, zIndex: 2 }}>
          <button type="button" onClick={() => onShift(row, -7)} title="-7 jours" style={{ padding: '0 3px', border: '1px solid var(--border)', borderRadius: 2, background: '#fff', cursor: 'pointer', lineHeight: 1 }}>
            <ChevronLeft size={9} />
          </button>
          <button type="button" onClick={() => onShift(row, 7)} title="+7 jours" style={{ padding: '0 3px', border: '1px solid var(--border)', borderRadius: 2, background: '#fff', cursor: 'pointer', lineHeight: 1 }}>
            <ChevronRight size={9} />
          </button>
        </div>
      )}
    </>
  );
}

function DependencyLayer({ rows, minDate, dayWidth, taskById }) {
  const paths = [];
  rows.forEach((row, rowIdx) => {
    if (row.type !== 'task' || !row.predecessor_id) return;
    const pred = taskById[row.predecessor_id];
    if (!pred) return;
    const predRowIdx = rows.findIndex((r) => r.type === 'task' && r.id === pred.id);
    if (predRowIdx < 0) return;
    const fromBar = taskBarPx(pred, minDate, dayWidth);
    const toBar = taskBarPx(row, minDate, dayWidth);
    if (!fromBar || !toBar) return;
    const x1 = fromBar.left + fromBar.width;
    const y1 = predRowIdx * ROW_H + ROW_H / 2;
    const x2 = toBar.left;
    const y2 = rowIdx * ROW_H + ROW_H / 2;
    const midX = x1 + 10;
    paths.push({ key: `${pred.id}-${row.id}`, d: `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}` });
  });

  if (!paths.length) return null;
  const h = rows.length * ROW_H;

  return (
    <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: h, pointerEvents: 'none', zIndex: 1 }} aria-hidden>
      <defs>
        <marker id="gantt-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="#1565C0" />
        </marker>
      </defs>
      {paths.map((p) => (
        <path key={p.key} d={p.d} fill="none" stroke="#1565C0" strokeWidth="1.5" markerEnd="url(#gantt-arrow)" />
      ))}
    </svg>
  );
}

function GanttChart({
  displayRows,
  days,
  monthGroups,
  minDate,
  timelineWidth,
  collapsedLots,
  onToggleLot,
  onEdit,
  onDelete,
  onShift,
  onBarChange,
  taskById,
}) {
  const leftBodyRef = useRef(null);
  const rightBodyRef = useRef(null);
  const rightHdrRef = useRef(null);
  const syncing = useRef(false);

  useEffect(() => {
    const body = rightBodyRef.current;
    const hdr = rightHdrRef.current;
    if (!body || !displayRows.length) return undefined;

    const frame = requestAnimationFrame(() => {
      const target = ganttScrollTargetLeft(displayRows, minDate, DAY_W);
      body.scrollLeft = target;
      if (hdr) hdr.scrollLeft = target;
    });

    return () => cancelAnimationFrame(frame);
  }, [displayRows, minDate, timelineWidth]);

  function syncScroll(source, target) {
    if (syncing.current) return;
    syncing.current = true;
    target.scrollTop = source.scrollTop;
    requestAnimationFrame(() => { syncing.current = false; });
  }

  function onRightBodyScroll(e) {
    syncScroll(e.target, leftBodyRef.current);
  }

  function onLeftBodyScroll(e) {
    syncScroll(e.target, rightBodyRef.current);
  }

  function onRightHScroll(e) {
    if (rightHdrRef.current) rightHdrRef.current.scrollLeft = e.target.scrollLeft;
  }

  const leftGrid = '36px 1fr 52px 76px 76px 44px';

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
      <div style={{ display: 'flex' }}>
        {/* ── Panneau gauche : tableau tâches ── */}
        <div style={{ width: LEFT_W, flexShrink: 0, borderRight: '2px solid var(--border)' }}>
          <div style={{
            ...GANTT_HDR, display: 'grid', gridTemplateColumns: leftGrid,
            alignItems: 'center', height: HDR_H, padding: '0 8px', gap: 4,
            borderBottom: '1px solid var(--border)',
          }}
          >
            <span>#</span>
            <span>Nom de la tâche</span>
            <span>Durée</span>
            <span>Début</span>
            <span>Fin</span>
            <span />
          </div>
          <div
            ref={leftBodyRef}
            onScroll={onLeftBodyScroll}
            style={{ maxHeight: 420, overflowY: 'auto', overflowX: 'hidden' }}
          >
            {displayRows.map((row, i) => {
              const isSummary = row.type === 'summary';
              const st = planningStatutMeta(row.statut);
              return (
                <div
                  key={row.id}
                  style={{
                    display: 'grid', gridTemplateColumns: leftGrid, gap: 4,
                    alignItems: 'center', height: ROW_H, padding: '0 8px',
                    borderBottom: '1px solid var(--border)',
                    background: i % 2 === 0 ? '#fff' : '#F7F8FA',
                    fontSize: '0.78rem',
                  }}
                >
                  <span style={{ fontWeight: 700, color: 'var(--text-3)', fontSize: '0.72rem' }}>{row.wbs_code || row.wbs}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, paddingLeft: isSummary ? 0 : 14 }}>
                    {isSummary ? (
                      <button
                        type="button"
                        onClick={() => onToggleLot(row.lot)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-2)', display: 'flex', alignItems: 'center' }}
                      >
                        {collapsedLots.has(row.lot) ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                      </button>
                    ) : (
                      <span style={{ width: 13 }} />
                    )}
                    <span style={{
                      fontWeight: isSummary ? 800 : 600,
                      color: isSummary ? 'var(--text)' : 'var(--text-2)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      fontFamily: isSummary ? 'var(--font-head)' : 'inherit',
                    }}
                    title={row.nom}
                    >
                      {row.nom}
                    </span>
                    {isSummary && (
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-3)', flexShrink: 0 }}>
                        ({row.childCount})
                      </span>
                    )}
                  </div>
                  <span style={{ color: 'var(--text-2)' }}>
                    {row.duree_jours ? `${row.duree_jours} j` : '—'}
                  </span>
                  <span style={{ color: 'var(--text-2)', fontSize: '0.72rem' }}>{fmtDateTable(row.date_debut)}</span>
                  <span style={{ color: 'var(--text-2)', fontSize: '0.72rem' }}>{fmtDateTable(row.date_fin)}</span>
                  <div style={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
                    {!isSummary && (
                      <>
                        <button type="button" onClick={() => onEdit(row)} title={`${row.responsable || ''} · ${st.label} · ${Math.round(row.avancement)}%`} style={{ padding: 2, border: '1px solid var(--border)', borderRadius: 3, background: '#fff', cursor: 'pointer' }}>
                          <Edit2 size={10} />
                        </button>
                        <button type="button" onClick={() => onDelete(row.id)} title="Supprimer" style={{ padding: 2, border: '1px solid var(--border)', borderRadius: 3, background: '#fff', cursor: 'pointer', color: 'var(--red)' }}>
                          <Trash2 size={10} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Panneau droit : timeline Gantt ── */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div ref={rightHdrRef} onScroll={(e) => { if (rightBodyRef.current) rightBodyRef.current.scrollLeft = e.target.scrollLeft; }} style={{ overflow: 'auto hidden', borderBottom: '1px solid var(--border)' }}>
            <div style={{ width: timelineWidth, minWidth: '100%' }}>
              <div style={{ display: 'flex', height: 24, ...GANTT_HDR, fontSize: '0.65rem' }}>
                {monthGroups.map((g) => (
                  <div
                    key={`${g.year}-${g.month}-${g.startIdx}`}
                    style={{
                      width: g.span * DAY_W, flexShrink: 0, textAlign: 'center',
                      lineHeight: '24px', borderRight: '1px solid rgba(255,255,255,0.25)',
                    }}
                  >
                    {g.label}
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', height: 26, background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                {days.map((d) => (
                  <div
                    key={d.key}
                    style={{
                      width: DAY_W, flexShrink: 0, textAlign: 'center', fontSize: '0.62rem',
                      borderRight: '1px solid var(--border)',
                      background: d.isWeekend ? '#E8EAEE' : 'var(--surface-2)',
                      color: d.isWeekend ? 'var(--text-3)' : 'var(--text-2)',
                      paddingTop: 2,
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>{d.letter}</div>
                    <div>{d.day}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div
            ref={rightBodyRef}
            onScroll={(e) => { onRightBodyScroll(e); onRightHScroll(e); }}
            style={{ maxHeight: 420, overflow: 'auto', position: 'relative' }}
          >
            <div style={{ width: timelineWidth, position: 'relative' }}>
              <DependencyLayer rows={displayRows} minDate={minDate} dayWidth={DAY_W} taskById={taskById} />
              {displayRows.map((row, i) => (
                <div
                  key={row.id}
                  style={{
                    position: 'relative', height: ROW_H,
                    borderBottom: '1px solid var(--border)',
                    background: i % 2 === 0 ? '#fff' : '#F7F8FA',
                  }}
                >
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', pointerEvents: 'none' }}>
                    {days.map((d) => (
                      <div
                        key={d.key}
                        style={{
                          width: DAY_W, flexShrink: 0,
                          borderRight: '1px solid var(--border)',
                          background: d.isWeekend ? 'rgba(232,234,238,0.55)' : 'transparent',
                        }}
                      />
                    ))}
                  </div>
                  <GanttBar
                    row={row}
                    minDate={minDate}
                    dayWidth={DAY_W}
                    onEdit={onEdit}
                    onShift={onShift}
                    onBarChange={onBarChange}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ProjectPlanningGantt({
  projet,
  tasks: externalTasks,
  setTasks: setExternalTasks,
  employees: externalEmployees,
  onReload,
  externalEdit,
  onExternalEditClear,
  addChildParent,
}) {
  const projectId = projet?.id;
  const embedded = externalTasks != null;
  const [internalTasks, setInternalTasks] = useState([]);
  const [internalEmployees, setInternalEmployees] = useState([]);
  const tasks = embedded ? externalTasks : internalTasks;
  const setTasks = embedded ? setExternalTasks : setInternalTasks;
  const employees = externalEmployees || internalEmployees;
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importingTemplate, setImportingTemplate] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [collapsedLots, setCollapsedLots] = useState(new Set());
  const [filters, setFilters] = useState({ lot: '', statut: '', responsable: '', periodStart: '', periodEnd: '' });

  const load = useCallback(async () => {
    if (!projectId || embedded) return;
    setLoading(true);
    setError('');
    try {
      const [rows, emps] = await Promise.all([
        listProjectPlanningTasks(projectId),
        listActiveEmployees().catch(() => []),
      ]);
      setInternalTasks(rows);
      setInternalEmployees(emps);
    } catch (err) {
      const msg = err.message || 'Impossible de charger le planning.';
      setError(msg.includes('project_planning_tasks') || err.code === '42P01'
        ? 'Table planning non configurée. Exécutez RUN_PROJECT_PLANNING_TASKS.sql dans Supabase.'
        : msg);
    } finally {
      setLoading(false);
    }
  }, [projectId, embedded]);

  useEffect(() => { if (!embedded) load(); }, [load, embedded]);

  useEffect(() => {
    if (externalEdit) {
      setEditTask(externalEdit);
      setModalOpen(true);
      onExternalEditClear?.();
    }
  }, [externalEdit, onExternalEditClear]);

  useEffect(() => {
    if (addChildParent) {
      setEditTask(null);
      setModalOpen(true);
    }
  }, [addChildParent]);

  const responsableEmployees = useMemo(
    () => filterPlanningResponsables(employees),
    [employees],
  );

  const lotOptions = useMemo(() => mergePlanningLots(tasks), [tasks]);

  const filtered = useMemo(
    () => filterPlanningTasks(tasks, filters).map(withDefaultPlanningDates),
    [tasks, filters],
  );

  const taskById = useMemo(() => {
    const m = {};
    tasks.forEach((t) => { m[t.id] = t; });
    return m;
  }, [tasks]);

  const displayRows = useMemo(
    () => buildGanttDisplayRows(filtered, collapsedLots),
    [filtered, collapsedLots],
  );

  const responsables = useMemo(() => {
    const s = new Set(tasks.map((t) => t.responsable).filter(Boolean));
    return [...s].sort();
  }, [tasks]);

  const timeline = useMemo(
    () => buildGanttTimeline(displayRows, projet, DAY_W),
    [displayRows, projet],
  );
  const { minDate, days, monthGroups, timelineWidth } = timeline;

  function toggleLot(lot) {
    setCollapsedLots((prev) => {
      const next = new Set(prev);
      if (next.has(lot)) next.delete(lot);
      else next.add(lot);
      return next;
    });
  }

  async function handleImportTemplate(lot) {
    if (!projectId) return;
    setImportingTemplate(true);
    try {
      const created = await importPlanningWbsTemplate(projectId, lot);
      setTasks((prev) => [...prev, ...created.map(withDefaultPlanningDates)]);
      setToast(`${created.length} tâche(s) importée(s) depuis le modèle WBS.`);
      onReload?.();
    } finally {
      setImportingTemplate(false);
    }
  }

  async function handleSave(form) {
    setSaving(true);
    try {
      if (editTask?.id) {
        const updated = await updateProjectPlanningTask(editTask.id, form);
        setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
        setToast('Tâche mise à jour.');
      } else {
        const formWithParent = addChildParent
          ? { ...form, parent_id: addChildParent.id, lot: form.lot || addChildParent.lot }
          : form;
        const created = await createProjectPlanningTask(projectId, formWithParent);
        setTasks((prev) => [...prev, withDefaultPlanningDates(created)]);
        setToast('Tâche ajoutée.');
      }
      onReload?.();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Supprimer cette tâche planning ?')) return;
    try {
      await deleteProjectPlanningTask(id);
      setTasks((prev) => prev.filter((t) => t.id !== id));
      setToast('Tâche supprimée.');
    } catch (err) {
      setError(err.message || 'Erreur suppression.');
    }
  }

  async function handleShift(task, deltaDays) {
    if (!task.date_debut) return;
    const start = new Date(`${task.date_debut}T12:00:00`);
    start.setDate(start.getDate() + deltaDays);
    const newStart = start.toISOString().slice(0, 10);
    const newEnd = endDateFromStartAndDuration(newStart, task.duree_jours);
    try {
      const updated = await shiftPlanningTaskDates(task.id, newStart, newEnd);
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setToast('Dates déplacées.');
      onReload?.();
    } catch (err) {
      setError(err.message || 'Erreur déplacement.');
    }
  }

  async function handleBarChange(task, mode, deltaDays) {
    if (!task.date_debut || !deltaDays) return;
    try {
      if (mode === 'move') {
        await handleShift(task, deltaDays);
        return;
      }
      if (mode === 'resize') {
        const newDur = Math.max(1, task.duree_jours + deltaDays);
        const newEnd = endDateFromStartAndDuration(task.date_debut, newDur);
        const updated = await shiftPlanningTaskDates(task.id, task.date_debut, newEnd);
        setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
        setToast('Durée mise à jour.');
        onReload?.();
      }
    } catch (err) {
      setError(err.message || 'Erreur modification barre.');
    }
  }

  async function handleExportPdf(mode) {
    try {
      if (mode === 'synthesis') {
        await generateProjectPlanningPdfSynthesis(projet, tasks);
        setToast('PDF synthèse exporté.');
      } else {
        await generateProjectPlanningPdfDetailed(projet, tasks);
        setToast('PDF détaillé exporté.');
      }
    } catch (err) {
      setError(err.message || 'Erreur export PDF.');
    }
  }

  if (!projectId) {
    return (
      <div style={{ padding: 24, background: 'var(--surface-2)', borderRadius: 8, color: 'var(--text-3)', fontSize: '0.84rem', textAlign: 'center' }}>
        Enregistrez le projet pour gérer le planning chantier.
      </div>
    );
  }

  return (
    <div>
      <Toast msg={toast} onClose={() => setToast('')} />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <Filter size={14} style={{ color: 'var(--text-3)' }} />
          <select value={filters.lot} onChange={(e) => setFilters((f) => ({ ...f, lot: e.target.value }))} style={{ ...IS, width: 'auto', minWidth: 130, cursor: 'pointer' }}>
            <option value="">Tous les lots</option>
            {lotOptions.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          <select value={filters.statut} onChange={(e) => setFilters((f) => ({ ...f, statut: e.target.value }))} style={{ ...IS, width: 'auto', minWidth: 120, cursor: 'pointer' }}>
            <option value="">Tous statuts</option>
            {PLANNING_STATUTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select value={filters.responsable} onChange={(e) => setFilters((f) => ({ ...f, responsable: e.target.value }))} style={{ ...IS, width: 'auto', minWidth: 140, cursor: 'pointer' }}>
            <option value="">Tous responsables</option>
            {responsables.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <input type="date" value={filters.periodStart} onChange={(e) => setFilters((f) => ({ ...f, periodStart: e.target.value }))} style={{ ...IS, width: 'auto' }} title="Période début" />
          <input type="date" value={filters.periodEnd} onChange={(e) => setFilters((f) => ({ ...f, periodEnd: e.target.value }))} style={{ ...IS, width: 'auto' }} title="Période fin" />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {!embedded && (
            <>
              <button type="button" onClick={() => handleExportPdf('synthesis')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 6, border: '1.5px solid var(--border)', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.84rem' }}>
                <Download size={15} /> PDF synthèse
              </button>
              <button type="button" onClick={() => handleExportPdf('detailed')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 6, border: '1.5px solid var(--red)', background: '#fff', color: 'var(--red)', cursor: 'pointer', fontWeight: 600, fontSize: '0.84rem' }}>
                <Download size={15} /> PDF détaillé
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => { setEditTask(null); setModalOpen(true); }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 6, border: 'none', background: 'var(--red)', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '0.84rem' }}
          >
            <Plus size={15} /> Ajouter une tâche planning
          </button>
        </div>
      </div>

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--red-light)', color: 'var(--red)', borderRadius: 8, marginBottom: 12, fontSize: '0.84rem' }}>
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {(!embedded && loading) ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>
          <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 10px' }} />
          Chargement du planning…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: '36px 24px', background: 'var(--surface-2)', borderRadius: 8, textAlign: 'center', color: 'var(--text-3)' }}>
          <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-2)', marginBottom: 6 }}>
            {tasks.length ? 'Aucune tâche pour ces filtres' : 'Aucune tâche planning'}
          </div>
          <div style={{ fontSize: '0.84rem', marginBottom: 14 }}>Ajoutez des tâches pour afficher le diagramme de Gantt.</div>
          <button type="button" onClick={() => { setEditTask(null); setModalOpen(true); }} style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: 'var(--red)', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>
            <Plus size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
            Ajouter une tâche
          </button>
        </div>
      ) : (
        <GanttChart
          displayRows={displayRows}
          days={days}
          monthGroups={monthGroups}
          minDate={minDate}
          timelineWidth={timelineWidth}
          collapsedLots={collapsedLots}
          onToggleLot={toggleLot}
          onEdit={(row) => { setEditTask(row); setModalOpen(true); }}
          onDelete={handleDelete}
          onShift={handleShift}
          onBarChange={handleBarChange}
          taskById={taskById}
        />
      )}

      <TaskModal
        open={modalOpen}
        task={editTask}
        tasks={tasks}
        employees={responsableEmployees}
        saving={saving}
        importingTemplate={importingTemplate}
        defaultParentId={addChildParent?.id}
        onClose={() => { setModalOpen(false); setEditTask(null); onExternalEditClear?.(); }}
        onSave={handleSave}
        onImportTemplate={handleImportTemplate}
      />
    </div>
  );
}

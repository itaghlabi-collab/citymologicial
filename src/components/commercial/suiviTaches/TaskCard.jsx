import { CalendarDays, Building2, FolderKanban } from 'lucide-react';
import {
  TASK_STATUTS,
  TASK_STATUT_LABEL,
  isTaskEnRetard,
} from '../../../services/commercial/suiviTaches';
import { PrioriteTag, TaskBadges, fmtDate, initials } from './ui';

export default function TaskCard({
  task,
  today,
  responsableNom,
  projectLabel,
  dropBefore,
  onOpen,
  onMove,
  onDragStart,
  onDragEnd,
  onDragOverCard,
  onDropOnCard,
}) {
  const retard = isTaskEnRetard(task, today);

  return (
    <div
      className={'sta-card' + (dropBefore ? ' sta-card--drop-before' : '') + (task.statut === 'termine' ? ' sta-card--done' : '')}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', task.id);
        e.dataTransfer.effectAllowed = 'move';
        onDragStart?.(task.id);
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); onDragOverCard?.(task.id); }}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onDropOnCard?.(e.dataTransfer.getData('text/plain'), task.id); }}
      onClick={() => onOpen(task)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(task); }}
    >
      <div className="sta-card-top">
        <div className="sta-card-title">{task.titre}</div>
        <PrioriteTag priorite={task.priorite} />
      </div>

      {(task.societe || projectLabel) && (
        <div className="sta-card-meta">
          {task.societe && <span><Building2 size={12} /> {task.societe}</span>}
          {projectLabel && <span><FolderKanban size={12} /> {projectLabel}</span>}
        </div>
      )}

      <TaskBadges task={task} today={today} />

      <div className="sta-card-foot">
        <span className="sta-resp" title={responsableNom}>
          <span className="sta-avatar">{initials(responsableNom)}</span>
          <span className="sta-resp-name">{responsableNom}</span>
        </span>
        {task.echeance && (
          <span className={'sta-due' + (retard ? ' sta-due--late' : '')}>
            <CalendarDays size={12} /> {fmtDate(task.echeance)}
          </span>
        )}
      </div>

      <select
        className="sta-card-move"
        value={task.statut}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => { e.stopPropagation(); onMove(task.id, e.target.value); }}
        aria-label="Changer le statut"
      >
        {TASK_STATUTS.map((s) => <option key={s} value={s}>→ {TASK_STATUT_LABEL[s]}</option>)}
      </select>
    </div>
  );
}

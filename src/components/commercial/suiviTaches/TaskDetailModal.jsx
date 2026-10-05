import { useCallback, useEffect, useState } from 'react';
import { CheckCircle, Edit2, Trash2, MessageSquare, History, Lock, Unlock, Loader2 } from 'lucide-react';
import {
  TASK_CATEGORIE_LABEL,
  TASK_PRIORITES,
  TASK_PRIORITE_META,
  TASK_STATUTS,
  TASK_STATUT_LABEL,
  listTaskComments,
  listTaskHistory,
  addTaskComment,
} from '../../../services/commercial/suiviTaches';
import { formatSupabaseError } from '../../../services/supabase/formatError';
import { ModalShell, PrioriteTag, TaskBadges, fmtDate, fmtDateTime, inputStyle } from './ui';

function historyText(h) {
  const statut = (v) => TASK_STATUT_LABEL[v] || v || '—';
  const prio = (v) => TASK_PRIORITE_META[v]?.label || v || '—';
  switch (h.event) {
    case 'creee': return 'Tâche créée';
    case 'terminee': return 'Tâche marquée terminée';
    case 'statut': return `Statut : ${statut(h.old_value)} → ${statut(h.new_value)}`;
    case 'responsable': return `Responsable : ${h.old_value || '—'} → ${h.new_value || '—'}`;
    case 'priorite': return `Priorité : ${prio(h.old_value)} → ${prio(h.new_value)}`;
    case 'echeance': return `Échéance : ${fmtDate(h.old_value) || '—'} → ${fmtDate(h.new_value) || '—'}`;
    case 'relance_dg': return `Relance DG programmée${h.new_value ? ` pour le ${fmtDate(h.new_value)}` : ''}`;
    case 'relance_dg_retiree': return 'Relance DG retirée';
    case 'bloquee': return `Tâche bloquée${h.new_value ? ` : ${h.new_value}` : ''}`;
    case 'debloquee': return 'Tâche débloquée';
    default: return h.event;
  }
}

function Info({ label, children }) {
  return (
    <div className="sta-info">
      <div className="sta-info-label">{label}</div>
      <div className="sta-info-value">{children || <span style={{ color: 'var(--text-3)' }}>—</span>}</div>
    </div>
  );
}

export default function TaskDetailModal({
  task,
  today,
  assignees,
  userLabel,
  projectLabel,
  onClose,
  onEdit,
  onPatch,
  onDelete,
  notify,
}) {
  const [tab, setTab] = useState('comments');
  const [comments, setComments] = useState([]);
  const [history, setHistory] = useState([]);
  const [loadingSide, setLoadingSide] = useState(true);
  const [comment, setComment] = useState('');
  const [posting, setPosting] = useState(false);

  const loadSide = useCallback(async () => {
    try {
      const [c, h] = await Promise.all([listTaskComments(task.id), listTaskHistory(task.id)]);
      setComments(c);
      setHistory(h);
    } catch (err) {
      notify(formatSupabaseError(err, 'Erreur de chargement des commentaires.'));
    } finally {
      setLoadingSide(false);
    }
  }, [task.id, notify]);

  useEffect(() => { loadSide(); }, [loadSide, task.updated_at]);

  async function quickPatch(changes, okMsg) {
    const res = await onPatch(task.id, changes);
    notify(res.success ? okMsg : res.error);
  }

  async function toggleBloque() {
    if (task.bloque) {
      await quickPatch({ bloque: false, bloque_motif: null }, 'Tâche débloquée.');
      return;
    }
    const motif = window.prompt('Motif du blocage (optionnel) :', '');
    if (motif === null) return;
    await quickPatch({ bloque: true, bloque_motif: motif.trim() || null }, 'Tâche marquée bloquée.');
  }

  async function postComment() {
    if (!comment.trim()) return;
    setPosting(true);
    try {
      const created = await addTaskComment(task.id, comment);
      setComments((prev) => [...prev, created]);
      setComment('');
    } catch (err) {
      notify(formatSupabaseError(err, 'Erreur ajout commentaire.'));
    } finally {
      setPosting(false);
    }
  }

  const responsableKnown = !task.responsable_id || assignees.some((u) => u.id === task.responsable_id);

  return (
    <ModalShell title={task.titre} onClose={onClose} wide>
      <div className="sta-detail-head">
        <PrioriteTag priorite={task.priorite} />
        <span className="badge badge-grey">{TASK_STATUT_LABEL[task.statut]}</span>
        <TaskBadges task={task} today={today} />
      </div>

      <div className="sta-quick-actions">
        <label className="sta-quick">
          <span>Statut</span>
          <select style={inputStyle(false)} value={task.statut} onChange={(e) => quickPatch({ statut: e.target.value }, 'Statut mis à jour.')}>
            {TASK_STATUTS.map((s) => <option key={s} value={s}>{TASK_STATUT_LABEL[s]}</option>)}
          </select>
        </label>
        <label className="sta-quick">
          <span>Responsable</span>
          <select style={inputStyle(false)} value={task.responsable_id} onChange={(e) => e.target.value && quickPatch({ responsable_id: e.target.value }, 'Responsable modifié.')}>
            {!responsableKnown && <option value={task.responsable_id}>Utilisateur inactif</option>}
            {!task.responsable_id && <option value="">— Choisir —</option>}
            {assignees.map((u) => <option key={u.id} value={u.id}>{u.nom}</option>)}
          </select>
        </label>
        <label className="sta-quick">
          <span>Priorité</span>
          <select style={inputStyle(false)} value={task.priorite} onChange={(e) => quickPatch({ priorite: e.target.value }, 'Priorité modifiée.')}>
            {TASK_PRIORITES.map((p) => <option key={p} value={p}>{TASK_PRIORITE_META[p].dot} {TASK_PRIORITE_META[p].label}</option>)}
          </select>
        </label>
      </div>

      <div className="sta-detail-actions">
        {task.statut !== 'termine' && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => quickPatch({ statut: 'termine' }, 'Tâche terminée.')}>
            <CheckCircle size={14} /> Marquer terminé
          </button>
        )}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onEdit(task)}><Edit2 size={14} /> Modifier</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={toggleBloque}>
          {task.bloque ? <><Unlock size={14} /> Débloquer</> : <><Lock size={14} /> Bloquer</>}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => onDelete(task)}><Trash2 size={14} /> Supprimer</button>
      </div>

      <div className="sta-info-grid">
        <Info label="Catégorie">{TASK_CATEGORIE_LABEL[task.categorie]}</Info>
        <Info label="Responsable">{userLabel(task.responsable_id)}</Info>
        <Info label="Société / Client">{task.societe}</Info>
        <Info label="Projet">{projectLabel(task.project_id)}</Info>
        <Info label="Échéance">{fmtDate(task.echeance)}</Info>
        <Info label="Créée le">{fmtDateTime(task.created_at)}</Info>
        {task.relance_dg && (
          <Info label="Relance DG">
            {fmtDate(task.relance_dg_date) || 'Sans date'}{task.relance_dg_objet ? ` — ${task.relance_dg_objet}` : ''}
          </Info>
        )}
        {task.bloque && <Info label="Motif du blocage">{task.bloque_motif}</Info>}
        {task.completed_at && <Info label="Terminée le">{fmtDateTime(task.completed_at)}</Info>}
      </div>

      {task.description && (
        <div className="sta-text-block">
          <div className="sta-info-label">Description</div>
          <p>{task.description}</p>
        </div>
      )}
      {task.notes && (
        <div className="sta-text-block">
          <div className="sta-info-label">Notes</div>
          <p>{task.notes}</p>
        </div>
      )}

      <div className="sta-tabs-inline">
        <button type="button" className={'sta-tab-inline' + (tab === 'comments' ? ' is-active' : '')} onClick={() => setTab('comments')}>
          <MessageSquare size={14} /> Commentaires ({comments.length})
        </button>
        <button type="button" className={'sta-tab-inline' + (tab === 'history' ? ' is-active' : '')} onClick={() => setTab('history')}>
          <History size={14} /> Historique ({history.length})
        </button>
      </div>

      {loadingSide && (
        <div className="sta-muted"><Loader2 size={14} className="spin" /> Chargement...</div>
      )}

      {!loadingSide && tab === 'comments' && (
        <div>
          {comments.length === 0 && <div className="sta-muted">Aucun commentaire.</div>}
          <div className="sta-comments">
            {comments.map((c) => (
              <div key={c.id} className="sta-comment">
                <div className="sta-comment-head">
                  <strong>{c.author_nom || '—'}</strong>
                  <span>{fmtDateTime(c.created_at)}</span>
                </div>
                <div className="sta-comment-body">{c.contenu}</div>
              </div>
            ))}
          </div>
          <div className="sta-comment-form">
            <textarea
              style={{ ...inputStyle(false), resize: 'vertical', minHeight: 56 }}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Ajouter un commentaire..."
            />
            <button type="button" className="btn btn-primary btn-sm" onClick={postComment} disabled={posting || !comment.trim()}>
              {posting ? 'Envoi...' : 'Ajouter'}
            </button>
          </div>
        </div>
      )}

      {!loadingSide && tab === 'history' && (
        <div className="sta-history">
          {history.length === 0 && <div className="sta-muted">Aucun historique.</div>}
          {history.map((h) => (
            <div key={h.id} className="sta-history-row">
              <span className="sta-history-dot" />
              <div>
                <div className="sta-history-text">{historyText(h)}</div>
                <div className="sta-history-meta">{h.actor_nom || '—'} · {fmtDateTime(h.created_at)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </ModalShell>
  );
}

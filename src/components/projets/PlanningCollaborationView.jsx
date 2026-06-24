/**
 * PlanningCollaborationView.jsx — Suivi équipe / commentaires planning
 */
import { useState } from 'react';
import { MessageSquare, Send, Trash2, User } from 'lucide-react';

const IS = {
  padding: '8px 11px', border: '1.5px solid var(--border)', borderRadius: 6,
  fontSize: '0.86rem', background: '#fff', width: '100%', boxSizing: 'border-box',
};

function fmtWhen(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function PlanningCollaborationView({ comments, tasks, onAdd, onDelete, saving }) {
  const [auteur, setAuteur] = useState('');
  const [message, setMessage] = useState('');
  const [taskId, setTaskId] = useState('');

  const taskById = {};
  tasks.forEach((t) => { taskById[t.id] = t; });

  async function handleSubmit(e) {
    e.preventDefault();
    if (!message.trim()) return;
    await onAdd({ auteur: auteur.trim() || 'Équipe', message: message.trim(), task_id: taskId || null });
    setMessage('');
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) minmax(260px, 340px)', gap: 16, alignItems: 'start' }}>
      <div>
        <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '0.9rem', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <MessageSquare size={16} color="var(--red)" /> Fil d'activité équipe
        </div>
        {!comments.length ? (
          <div style={{ padding: 28, background: 'var(--surface-2)', borderRadius: 8, textAlign: 'center', color: 'var(--text-3)', fontSize: '0.84rem' }}>
            Aucun message — partagez les points chantier avec l'équipe.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {comments.map((c) => (
              <div key={c.id} style={{ padding: '12px 14px', background: '#fff', border: '1px solid var(--border)', borderRadius: 8, borderLeft: '3px solid var(--red)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--red-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <User size={14} color="var(--red)" />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.82rem' }}>{c.auteur}</div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-3)' }}>{fmtWhen(c.created_at)}</div>
                    </div>
                  </div>
                  <button type="button" onClick={() => onDelete(c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}><Trash2 size={13} /></button>
                </div>
                {c.task_id && taskById[c.task_id] && (
                  <div style={{ fontSize: '0.7rem', color: 'var(--red)', fontWeight: 600, marginBottom: 4 }}>
                    Tâche : {taskById[c.task_id].nom}
                  </div>
                )}
                <div style={{ fontSize: '0.84rem', color: 'var(--text-2)', lineHeight: 1.45 }}>{c.message}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ padding: 16, background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--border)' }}>
        <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 12 }}>Nouveau message</div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input placeholder="Votre nom" value={auteur} onChange={(e) => setAuteur(e.target.value)} style={IS} />
          <select value={taskId} onChange={(e) => setTaskId(e.target.value)} style={IS}>
            <option value="">— Lier à une tâche (optionnel) —</option>
            {tasks.map((t) => <option key={t.id} value={t.id}>{t.nom}</option>)}
          </select>
          <textarea placeholder="Point chantier, blocage, décision…" value={message} onChange={(e) => setMessage(e.target.value)} rows={4} style={{ ...IS, resize: 'vertical' }} required />
          <button type="submit" disabled={saving} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 16px', borderRadius: 6, border: 'none', background: 'var(--red)', color: '#fff', fontWeight: 700, cursor: saving ? 'wait' : 'pointer' }}>
            <Send size={15} /> Publier
          </button>
        </form>

        <div style={{ marginTop: 16, padding: 12, background: '#fff', borderRadius: 6, fontSize: '0.75rem', color: 'var(--text-3)' }}>
          <strong style={{ color: 'var(--text-2)' }}>Équipe projet</strong>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            {[...new Set(tasks.map((t) => t.responsable).filter(Boolean))].map((r) => (
              <li key={r}>{r}</li>
            ))}
            {!tasks.some((t) => t.responsable) && <li>Affectez des responsables aux tâches</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}

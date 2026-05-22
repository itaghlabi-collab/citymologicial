import { Plus, CheckSquare, Calendar, Clock, Trash2, Edit2 } from 'lucide-react';
import { useState } from 'react';

const sampleTasks = [];
const agenda = [];

export default function Organisation() {
  const [tasks, setTasks] = useState([]);
  const [newTask, setNewTask] = useState('');

  function toggleTask(id) {
    setTasks(tasks.map(t => t.id === id ? { ...t, status: t.status === 'done' ? 'pending' : 'done' } : t));
  }

  function addTask() {
    if (!newTask.trim()) return;
    setTasks([...tasks, { id: Date.now(), title: newTask, date: '2026-06-30', status: 'pending', priority: 'normale' }]);
    setNewTask('');
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">Organisation Interne</h1>
        <p className="page-subtitle">Gestion des taches et du calendrier</p>
      </div>

      <div className="grid-2">
        {/* Taches */}
        <div className="card">
          <div className="card-title">
            <CheckSquare size={16} />
            Taches a faire
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input
              className="form-field input"
              style={{ flex: 1, padding: '9px 12px', border: '1.5px solid var(--border)', borderRadius: 'var(--radius)', fontFamily: 'var(--font-body)', fontSize: '0.9rem', outline: 'none' }}
              placeholder="Nouvelle tache..."
              value={newTask}
              onChange={e => setNewTask(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addTask()}
            />
            <button className="btn btn-primary btn-sm" onClick={addTask}>
              <Plus size={14} /> Ajouter
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tasks.map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: t.status === 'done' ? '#f8fffe' : 'var(--bg)', borderRadius: 6, border: '1px solid var(--border)' }}>
                <input
                  type="checkbox"
                  checked={t.status === 'done'}
                  onChange={() => toggleTask(t.id)}
                  style={{ accentColor: 'var(--red)', width: 16, height: 16, cursor: 'pointer' }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: 500, textDecoration: t.status === 'done' ? 'line-through' : 'none', color: t.status === 'done' ? 'var(--text-3)' : 'var(--text)' }}>{t.title}</div>
                  <div className="text-muted" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Clock size={11} /> {t.date}
                  </div>
                </div>
                <span className={'badge ' + (t.priority === 'haute' ? 'badge-red' : t.priority === 'normale' ? 'badge-blue' : 'badge-grey')}>{t.priority}</span>
                <button className="btn btn-ghost btn-sm" style={{ padding: '4px 6px' }} onClick={() => setTasks(tasks.filter(x => x.id !== t.id))}>
                  <Trash2 size={13} style={{ color: 'var(--text-3)' }} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Agenda */}
        <div className="card">
          <div className="card-title">
            <Calendar size={16} />
            Agenda du jour
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {agenda.map((a, i) => (
              <div key={i} style={{ display: 'flex', gap: 14, padding: '12px 0', borderBottom: i < agenda.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ width: 52, flexShrink: 0, fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '0.9rem', color: 'var(--red)' }}>{a.time}</div>
                <div style={{ width: 3, borderRadius: 2, background: 'var(--border)', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{a.title}</div>
                  <div className="text-muted">{a.lieu}</div>
                </div>
              </div>
            ))}
          </div>
          <button className="btn btn-secondary btn-sm mt-4" style={{ width: '100%', justifyContent: 'center' }}>
            <Plus size={14} /> Ajouter un rendez-vous
          </button>
        </div>
      </div>
    </div>
  );
}

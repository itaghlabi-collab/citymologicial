/**
 * PlanningMilestonesView.jsx — Ligne de temps / jalons projet
 */
import { useMemo, useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, X, Diamond } from 'lucide-react';
import { MILESTONE_STATUTS, milestoneStatutMeta } from '../../constants/projectPlanning';
import { computeTimelineBounds, buildDailyTimeline } from '../../services/projects/projectPlanningTasks';

const IS = {
  padding: '8px 11px', border: '1.5px solid var(--border)', borderRadius: 6,
  fontSize: '0.86rem', background: '#fff', width: '100%', boxSizing: 'border-box',
};

const EMPTY = { nom: '', date_jalon: '', statut: 'a_venir', notes: '' };
const DAY_W = 32;

function MilestoneModal({ open, item, saving, onClose, onSave }) {
  const [form, setForm] = useState(EMPTY);
  useEffect(() => { if (open) setForm(item ? { ...EMPTY, ...item } : { ...EMPTY }); }, [open, item]);
  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 8000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 10, width: '100%', maxWidth: 420, padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
          <strong>{item ? 'Modifier jalon' : 'Ajouter jalon'}</strong>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input placeholder="Nom du jalon *" value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} style={IS} required />
          <input type="date" value={form.date_jalon} onChange={(e) => setForm({ ...form, date_jalon: e.target.value })} style={IS} required />
          <select value={form.statut} onChange={(e) => setForm({ ...form, statut: e.target.value })} style={IS}>
            {MILESTONE_STATUTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <textarea placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} style={{ ...IS, resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid var(--border)', background: '#fff' }}>Annuler</button>
            <button type="submit" disabled={saving} style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: 'var(--red)', color: '#fff', fontWeight: 700 }}>Enregistrer</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function PlanningMilestonesView({ projet, milestones, tasks, onSave, onDelete, saving }) {
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState(null);

  const { minDate, maxDate } = useMemo(() => {
    const pseudo = milestones.map((m) => ({ date_debut: m.date_jalon, date_fin: m.date_jalon }));
    return computeTimelineBounds([...pseudo, ...tasks], projet);
  }, [milestones, tasks, projet]);

  const days = useMemo(() => buildDailyTimeline(minDate, maxDate), [minDate, maxDate]);
  const timelineWidth = days.length * DAY_W;

  function milestoneX(dateIso) {
    if (!dateIso) return 0;
    const t0 = new Date(`${minDate}T12:00:00`);
    const d = new Date(`${dateIso}T12:00:00`);
    return Math.max(0, Math.round((d - t0) / 86400000)) * DAY_W;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: '0.84rem', color: 'var(--text-2)' }}>Vue synthétique du plan projet avec jalons clés</div>
        <button type="button" onClick={() => { setEdit(null); setModal(true); }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 6, border: 'none', background: 'var(--red)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '0.84rem' }}>
          <Plus size={15} /> Ajouter jalon
        </button>
      </div>

      {/* Timeline visuelle */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'auto', background: '#fff', marginBottom: 16 }}>
        <div style={{ width: timelineWidth, minWidth: '100%', position: 'relative', height: 120 }}>
          <div style={{ display: 'flex', height: 28, background: 'linear-gradient(135deg, var(--red-dark), var(--red))', color: '#fff', fontSize: '0.65rem', fontFamily: 'var(--font-head)', fontWeight: 700 }}>
            {days.filter((_, i) => i === 0 || days[i].day === 1).map((d) => (
              <div key={d.key} style={{ position: 'absolute', left: milestoneX(d.key), padding: '6px 8px' }}>
                {d.date.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })}
              </div>
            ))}
          </div>
          <div style={{ position: 'absolute', top: 36, left: 0, right: 0, height: 2, background: 'var(--border)' }} />
          {milestones.map((m) => {
            const st = milestoneStatutMeta(m.statut);
            const x = milestoneX(m.date_jalon);
            return (
              <div key={m.id} style={{ position: 'absolute', left: x - 8, top: 44, textAlign: 'center', width: 120 }}>
                <Diamond size={16} fill={st.color} color={st.color} style={{ margin: '0 auto' }} />
                <div style={{ fontSize: '0.72rem', fontWeight: 700, marginTop: 4, color: 'var(--text)' }}>{m.nom}</div>
                <div style={{ fontSize: '0.65rem', color: st.color }}>{new Date(`${m.date_jalon}T12:00:00`).toLocaleDateString('fr-FR')}</div>
              </div>
            );
          })}
          {/* Barres phases (lots) simplifiées */}
          {tasks.filter((t) => t.date_debut).slice(0, 8).map((t, i) => {
            const left = milestoneX(t.date_debut);
            const right = milestoneX(t.date_fin || t.date_debut);
            return (
              <div
                key={t.id}
                title={t.nom}
                style={{
                  position: 'absolute', top: 88 + (i % 3) * 0,
                  left, width: Math.max(20, right - left + DAY_W),
                  height: 8, background: 'var(--red-mid)', opacity: 0.35, borderRadius: 4,
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Liste jalons */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        {!milestones.length ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)' }}>Aucun jalon défini.</div>
        ) : milestones.map((m, i) => {
          const st = milestoneStatutMeta(m.statut);
          return (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: '1px solid var(--border)', background: i % 2 ? '#F7F8FA' : '#fff' }}>
              <Diamond size={14} fill={st.color} color={st.color} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{m.nom}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>{new Date(`${m.date_jalon}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
              </div>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: st.bg, color: st.color }}>{st.label}</span>
              <button type="button" onClick={() => { setEdit(m); setModal(true); }} style={{ padding: 4, border: '1px solid var(--border)', borderRadius: 4, background: '#fff', cursor: 'pointer' }}><Edit2 size={12} /></button>
              <button type="button" onClick={() => onDelete(m.id)} style={{ padding: 4, border: '1px solid var(--border)', borderRadius: 4, background: '#fff', cursor: 'pointer', color: 'var(--red)' }}><Trash2 size={12} /></button>
            </div>
          );
        })}
      </div>

      <MilestoneModal open={modal} item={edit} saving={saving} onClose={() => { setModal(false); setEdit(null); }} onSave={async (f) => { await onSave(f, edit?.id); setModal(false); setEdit(null); }} />
    </div>
  );
}

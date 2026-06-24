/**
 * PlanningResourcesView.jsx — Gestion des ressources planning
 */
import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, X } from 'lucide-react';
import { RESOURCE_TYPES, resourceTypeLabel } from '../../constants/projectPlanning';

const IS = {
  padding: '8px 11px', border: '1.5px solid var(--border)', borderRadius: 6,
  fontSize: '0.86rem', background: '#fff', width: '100%', boxSizing: 'border-box',
};

const HDR = {
  background: 'linear-gradient(135deg, var(--red-dark) 0%, var(--red) 100%)',
  color: '#fff', fontFamily: 'var(--font-head)', fontWeight: 700,
  fontSize: '0.68rem', textTransform: 'uppercase',
};

const EMPTY = { nom: '', email: '', type_ressource: 'travail', taux_horaire: 0, heures_prevues: 0, task_id: '', notes: '' };

function ResourceModal({ open, resource, tasks, saving, onClose, onSave }) {
  const [form, setForm] = useState(EMPTY);
  useEffect(() => {
    if (open) setForm(resource ? { ...EMPTY, ...resource } : { ...EMPTY });
  }, [open, resource]);
  if (!open) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 8000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 10, width: '100%', maxWidth: 480, padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
          <strong>{resource ? 'Modifier ressource' : 'Ajouter ressource'}</strong>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); onSave(form); }} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input placeholder="Nom *" value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} style={IS} required />
          <input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={IS} />
          <select value={form.type_ressource} onChange={(e) => setForm({ ...form, type_ressource: e.target.value })} style={IS}>
            {RESOURCE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <input type="number" min={0} step={0.01} placeholder="Taux MAD/h" value={form.taux_horaire} onChange={(e) => setForm({ ...form, taux_horaire: e.target.value })} style={IS} />
            <input type="number" min={0} step={0.5} placeholder="Heures prévues" value={form.heures_prevues} onChange={(e) => setForm({ ...form, heures_prevues: e.target.value })} style={IS} />
          </div>
          <select value={form.task_id} onChange={(e) => setForm({ ...form, task_id: e.target.value })} style={IS}>
            <option value="">— Tâche liée (optionnel) —</option>
            {tasks.map((t) => <option key={t.id} value={t.id}>{t.nom}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid var(--border)', background: '#fff' }}>Annuler</button>
            <button type="submit" disabled={saving} style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: 'var(--red)', color: '#fff', fontWeight: 700 }}>Enregistrer</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function PlanningResourcesView({ resources, tasks, onSave, onDelete, saving }) {
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState(null);
  const total = resources.reduce((s, r) => s + (r.cout_total || 0), 0);
  const totalHeures = resources.reduce((s, r) => s + (Number(r.heures_prevues) || 0), 0);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: '0.84rem', color: 'var(--text-2)' }}>
          <strong>{resources.length}</strong> ressource(s) · <strong>{totalHeures.toLocaleString('fr-FR')} h</strong> · Coût total <strong style={{ color: 'var(--red)' }}>{total.toLocaleString('fr-FR')} MAD</strong>
        </div>
        <button type="button" onClick={() => { setEdit(null); setModal(true); }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 6, border: 'none', background: 'var(--red)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '0.84rem' }}>
          <Plus size={15} /> Ajouter ressource
        </button>
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'auto', background: '#fff' }}>
        <div style={{ ...HDR, display: 'grid', gridTemplateColumns: '1fr 140px 80px 90px 90px 100px 60px', padding: '10px 12px', gap: 8, minWidth: 720 }}>
          <span>Ressource</span><span>Email</span><span>Type</span><span>Taux</span><span>Heures</span><span>Coût total</span><span />
        </div>
        {!resources.length ? (
          <div style={{ padding: 28, textAlign: 'center', color: 'var(--text-3)' }}>Aucune ressource — affectez l'équipe chantier.</div>
        ) : resources.map((r, i) => (
          <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '1fr 140px 80px 90px 90px 100px 60px', padding: '10px 12px', gap: 8, alignItems: 'center', borderBottom: '1px solid var(--border)', background: i % 2 ? '#F7F8FA' : '#fff', fontSize: '0.8rem', minWidth: 720 }}>
            <span style={{ fontWeight: 600 }}>{r.nom}</span>
            <span style={{ color: 'var(--text-3)', fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.email || '—'}</span>
            <span>{resourceTypeLabel(r.type_ressource)}</span>
            <span>{Number(r.taux_horaire).toLocaleString('fr-FR')}</span>
            <span>{Number(r.heures_prevues).toLocaleString('fr-FR')}</span>
            <span style={{ fontWeight: 700 }}>{r.cout_total.toLocaleString('fr-FR')} MAD</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button type="button" onClick={() => { setEdit(r); setModal(true); }} style={{ padding: 3, border: '1px solid var(--border)', borderRadius: 4, background: '#fff', cursor: 'pointer' }}><Edit2 size={11} /></button>
              <button type="button" onClick={() => onDelete(r.id)} style={{ padding: 3, border: '1px solid var(--border)', borderRadius: 4, background: '#fff', cursor: 'pointer', color: 'var(--red)' }}><Trash2 size={11} /></button>
            </div>
          </div>
        ))}
      </div>

      <ResourceModal
        open={modal}
        resource={edit}
        tasks={tasks}
        saving={saving}
        onClose={() => { setModal(false); setEdit(null); }}
        onSave={async (form) => {
          await onSave(form, edit?.id);
          setModal(false);
          setEdit(null);
        }}
      />
    </div>
  );
}

import { useState } from 'react';
import {
  EMPTY_TASK_FORM,
  TASK_CATEGORIES,
  TASK_CATEGORIE_LABEL,
  TASK_PRIORITES,
  TASK_PRIORITE_META,
  TASK_STATUTS,
  TASK_STATUT_LABEL,
  todayIso,
} from '../../../services/commercial/suiviTaches';
import { Field, ModalShell, fmtDate, fmtDateTime, inputStyle } from './ui';

function initialForm(task, defaults) {
  if (!task) return { ...EMPTY_TASK_FORM, ...defaults };
  return {
    titre: task.titre,
    description: task.description,
    categorie: task.categorie,
    societe: task.societe,
    project_id: task.project_id,
    responsable_id: task.responsable_id,
    echeance: task.echeance,
    priorite: task.priorite,
    statut: task.statut,
    bloque: task.bloque,
    bloque_motif: task.bloque_motif,
    relance_dg: task.relance_dg,
    relance_dg_date: task.relance_dg_date,
    relance_dg_objet: task.relance_dg_objet,
    notes: task.notes,
  };
}

export default function TaskFormModal({
  task,
  defaults,
  assignees,
  projects,
  societes,
  saving,
  onClose,
  onSubmit,
}) {
  const [form, setForm] = useState(() => initialForm(task, defaults));
  const [errors, setErrors] = useState({});
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const responsableKnown = !form.responsable_id || assignees.some((u) => u.id === form.responsable_id);
  const projectKnown = !form.project_id || projects.some((p) => p.id === form.project_id);

  async function handleSubmit() {
    const e = {};
    if (!form.titre.trim()) e.titre = true;
    if (!form.responsable_id) e.responsable_id = true;
    if (Object.keys(e).length) { setErrors(e); return; }
    await onSubmit(form);
  }

  return (
    <ModalShell
      title={task ? 'Modifier la tâche' : 'Nouvelle tâche'}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Annuler</button>
          <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Enregistrement...' : task ? 'Mettre à jour' : 'Créer la tâche'}
          </button>
        </>
      )}
    >
      <div className="sta-form-grid">
        <Field label="Titre *" full>
          <input style={inputStyle(errors.titre)} value={form.titre} onChange={(e) => set('titre', e.target.value)} placeholder="Ex. Relancer le client pour le devis" autoFocus />
        </Field>

        <Field label="Description" full>
          <textarea style={{ ...inputStyle(false), resize: 'vertical', minHeight: 70 }} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Détails de la tâche..." />
        </Field>

        <Field label="Catégorie">
          <select style={inputStyle(false)} value={form.categorie} onChange={(e) => set('categorie', e.target.value)}>
            {TASK_CATEGORIES.map((c) => <option key={c} value={c}>{TASK_CATEGORIE_LABEL[c]}</option>)}
          </select>
        </Field>

        <Field label="Responsable *">
          <select style={inputStyle(errors.responsable_id)} value={form.responsable_id} onChange={(e) => set('responsable_id', e.target.value)}>
            <option value="">— Choisir —</option>
            {!responsableKnown && <option value={form.responsable_id}>Utilisateur inactif</option>}
            {assignees.map((u) => <option key={u.id} value={u.id}>{u.nom}</option>)}
          </select>
        </Field>

        <Field label="Société / Client">
          <input style={inputStyle(false)} value={form.societe} onChange={(e) => set('societe', e.target.value)} placeholder="Optionnel" list="sta-societes" />
          <datalist id="sta-societes">
            {societes.map((s) => <option key={s} value={s} />)}
          </datalist>
        </Field>

        <Field label="Projet">
          <select style={inputStyle(false)} value={form.project_id} onChange={(e) => set('project_id', e.target.value)}>
            <option value="">— Aucun —</option>
            {!projectKnown && <option value={form.project_id}>Projet lié</option>}
            {projects.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </Field>

        <Field label="Date de création">
          <input style={{ ...inputStyle(false), background: 'var(--surface-2)', color: 'var(--text-2)' }} value={task ? fmtDateTime(task.created_at) : fmtDate(todayIso())} readOnly tabIndex={-1} />
        </Field>

        <Field label="Échéance">
          <input type="date" style={inputStyle(false)} value={form.echeance} onChange={(e) => set('echeance', e.target.value)} />
        </Field>

        <Field label="Priorité">
          <select style={inputStyle(false)} value={form.priorite} onChange={(e) => set('priorite', e.target.value)}>
            {TASK_PRIORITES.map((p) => <option key={p} value={p}>{TASK_PRIORITE_META[p].dot} {TASK_PRIORITE_META[p].label}</option>)}
          </select>
        </Field>

        <Field label="Statut">
          <select style={inputStyle(false)} value={form.statut} onChange={(e) => set('statut', e.target.value)}>
            {TASK_STATUTS.map((s) => <option key={s} value={s}>{TASK_STATUT_LABEL[s]}</option>)}
          </select>
        </Field>

        <div className="sta-field sta-field--full sta-optbox">
          <label className="sta-check">
            <input type="checkbox" checked={form.relance_dg} onChange={(e) => set('relance_dg', e.target.checked)} />
            <span>🔔 Relance DG</span>
          </label>
          {form.relance_dg && (
            <div className="sta-form-grid sta-form-grid--inner">
              <Field label="Date de relance">
                <input type="date" style={inputStyle(false)} value={form.relance_dg_date} onChange={(e) => set('relance_dg_date', e.target.value)} />
              </Field>
              <Field label="Motif / objet">
                <input style={inputStyle(false)} value={form.relance_dg_objet} onChange={(e) => set('relance_dg_objet', e.target.value)} placeholder="Pourquoi relancer le DG ?" />
              </Field>
            </div>
          )}
        </div>

        <div className="sta-field sta-field--full sta-optbox">
          <label className="sta-check">
            <input type="checkbox" checked={form.bloque} onChange={(e) => set('bloque', e.target.checked)} />
            <span>Tâche bloquée</span>
          </label>
          {form.bloque && (
            <input style={{ ...inputStyle(false), marginTop: 8 }} value={form.bloque_motif} onChange={(e) => set('bloque_motif', e.target.value)} placeholder="Motif du blocage (optionnel)" />
          )}
        </div>

        <Field label="Notes" full>
          <textarea style={{ ...inputStyle(false), resize: 'vertical', minHeight: 60 }} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Notes internes..." />
        </Field>
      </div>
    </ModalShell>
  );
}

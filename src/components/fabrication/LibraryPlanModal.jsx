import { useEffect, useMemo, useState } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { FAB_ATELIERS, FAB_MACHINES, todayISO } from '../../constants/fabrication';
import { isAllowedPlanFile } from '../../services/fabrication/fabricationStorage';
import { FabModal, FabField, FAB_INPUT, FAB_SELECT, FAB_TEXTAREA, fmtDate } from './shared';
import FilePreviewList from './FilePreview';

const EMPTY = {
  nom: '', projectId: '', designation: '', atelier: '', machine: '', observations: '',
};

export default function LibraryPlanModal({ open, onClose, plan, projects, onSubmit, saving, currentUserName }) {
  const [form, setForm] = useState(EMPTY);
  const [newFiles, setNewFiles] = useState([]);
  const [removeIds, setRemoveIds] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm(plan ? {
      nom: plan.nom || '',
      projectId: plan.project_id || '',
      designation: plan.designation || '',
      atelier: plan.atelier || '',
      machine: plan.machine_type || '',
      observations: plan.observations || '',
    } : EMPTY);
    setNewFiles([]);
    setRemoveIds([]);
    setError('');
  }, [open, plan]);

  const project = useMemo(
    () => projects.find((p) => p.id === form.projectId) || null,
    [projects, form.projectId],
  );

  const keptFiles = (plan?.files || []).filter((f) => !removeIds.includes(f.id));
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function addFiles(list) {
    const files = Array.from(list || []);
    const bad = files.find((f) => !isAllowedPlanFile(f));
    if (bad) {
      setError(`« ${bad.name} » : seuls PDF, JPG et PNG (max 20 Mo) sont acceptés.`);
      return;
    }
    setError('');
    setNewFiles((prev) => [...prev, ...files]);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.nom.trim()) { setError('Le nom du plan est obligatoire.'); return; }
    if (!project) { setError('Le projet associé est obligatoire.'); return; }
    const payload = {
      nom: form.nom,
      project: { id: project.id, nom: project.nom, ref: project.ref, client_nom: project.client_nom },
      designation: form.designation,
      atelier: form.atelier,
      machine_type: form.machine,
      observations: form.observations,
    };
    const result = await onSubmit(plan?.id || null, plan
      ? { ...payload, newFiles, removeFileIds: removeIds }
      : { ...payload, files: newFiles });
    if (!result?.success) {
      setError(result?.error || 'Erreur enregistrement.');
      return;
    }
    onClose();
  }

  return (
    <FabModal open={open} onClose={onClose} title={plan ? `Modifier le plan ${plan.reference}` : 'Ajouter un plan'} width={720}>
      <form onSubmit={handleSubmit}>
        <div className="fab-form-grid">
          <FabField label="Référence">
            <input style={FAB_INPUT} value={plan?.reference || 'Attribuée automatiquement'} readOnly disabled />
          </FabField>
          <FabField label="Nom du plan" required>
            <input style={FAB_INPUT} value={form.nom} onChange={set('nom')} placeholder="Ex. Comptoir bar RDC" />
          </FabField>
          <FabField label="Projet associé" required>
            <select style={FAB_SELECT} value={form.projectId} onChange={set('projectId')}>
              <option value="">— Choisir un projet —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.ref ? `${p.ref} · ` : ''}{p.nom}</option>
              ))}
            </select>
          </FabField>
          <FabField label="Client">
            <input style={FAB_INPUT} value={project?.client_nom || plan?.client_nom || ''} readOnly disabled placeholder="Repris du projet" />
          </FabField>
          <div className="fab-span-2">
            <FabField label="Désignation générale">
              <input style={FAB_INPUT} value={form.designation} onChange={set('designation')} placeholder="Ex. Mobilier sur mesure espace accueil" />
            </FabField>
          </div>
          <FabField label="Atelier concerné">
            <select style={FAB_SELECT} value={form.atelier} onChange={set('atelier')}>
              <option value="">— Non défini —</option>
              {FAB_ATELIERS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </FabField>
          {form.atelier === 'machinerie' ? (
            <FabField label="Type de machine">
              <select style={FAB_SELECT} value={form.machine} onChange={set('machine')}>
                <option value="">— Choisir —</option>
                {FAB_MACHINES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </FabField>
          ) : <div />}
          <FabField label="Date d’ajout">
            <input style={FAB_INPUT} value={fmtDate(plan?.created_at || todayISO())} readOnly disabled />
          </FabField>
          <FabField label="Ajouté par">
            <input style={FAB_INPUT} value={plan?.created_by_nom || currentUserName || ''} readOnly disabled />
          </FabField>
          <div className="fab-span-2">
            <FabField label="Observations techniques">
              <textarea style={FAB_TEXTAREA} value={form.observations} onChange={set('observations')} />
            </FabField>
          </div>
          <div className="fab-span-2">
            <FabField label="Fichiers du plan (PDF, JPG, PNG)">
              {keptFiles.length ? (
                <FilePreviewList
                  files={keptFiles}
                  removable
                  compact
                  onRemove={(f) => setRemoveIds((ids) => [...ids, f.id])}
                />
              ) : null}
              <label className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', gap: 6, cursor: 'pointer', marginTop: 8 }}>
                <Upload size={14} /> Ajouter des fichiers
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                  multiple
                  hidden
                  onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
                />
              </label>
              {newFiles.length ? (
                <div className="fab-newfiles">
                  {newFiles.map((f, i) => (
                    <span key={`${f.name}-${i}`} className="fab-chip">
                      {f.name}
                      <button type="button" onClick={() => setNewFiles((prev) => prev.filter((_, j) => j !== i))} aria-label="Retirer">×</button>
                    </span>
                  ))}
                </div>
              ) : null}
            </FabField>
          </div>
        </div>
        {error ? <div style={{ color: 'var(--red)', fontSize: '0.84rem', marginTop: 10 }}>{error}</div> : null}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Annuler</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? <Loader2 size={14} /> : null} Enregistrer
          </button>
        </div>
      </form>
    </FabModal>
  );
}

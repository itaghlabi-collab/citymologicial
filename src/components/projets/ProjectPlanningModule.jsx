/**
 * ProjectPlanningModule.jsx — Module planning complet (Gantt, WBS, Ressources, Jalons, Collaboration)
 */
import { useState, useCallback, useEffect } from 'react';
import {
  LayoutGrid, GitBranch, Users, Milestone, MessageSquare, Download, FileSpreadsheet, FileText, Loader2, AlertCircle,
} from 'lucide-react';
import { PLANNING_VIEWS } from '../../constants/projectPlanning';
import { listProjectPlanningTasks } from '../../services/projects/projectPlanningTasks';
import { listProjectMilestones, createProjectMilestone, updateProjectMilestone, deleteProjectMilestone } from '../../services/projects/projectPlanningMilestones';
import { listProjectPlanningResources, createProjectPlanningResource, updateProjectPlanningResource, deleteProjectPlanningResource } from '../../services/projects/projectPlanningResources';
import { listProjectPlanningComments, addProjectPlanningComment, deleteProjectPlanningComment } from '../../services/projects/projectPlanningComments';
import { exportPlanningTasksCsv, exportPlanningResourcesCsv, exportPlanningMilestonesCsv } from '../../services/projects/projectPlanningExport';
import { generateProjectPlanningPdf } from '../../services/projects/projectPlanningPdf';
import { listActiveEmployees } from '../../services/rh/employees';
import ProjectPlanningGantt from './ProjectPlanningGantt';
import PlanningWbsView from './PlanningWbsView';
import PlanningResourcesView from './PlanningResourcesView';
import PlanningMilestonesView from './PlanningMilestonesView';
import PlanningCollaborationView from './PlanningCollaborationView';

const VIEW_ICONS = {
  gantt: LayoutGrid,
  wbs: GitBranch,
  ressources: Users,
  timeline: Milestone,
  collab: MessageSquare,
};

export default function ProjectPlanningModule({ projet }) {
  const projectId = projet?.id;
  const [view, setView] = useState('gantt');
  const [tasks, setTasks] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [resources, setResources] = useState([]);
  const [comments, setComments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [wbsEdit, setWbsEdit] = useState(null);
  const [addChildParent, setAddChildParent] = useState(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError('');
    try {
      const [t, m, r, c, e] = await Promise.all([
        listProjectPlanningTasks(projectId),
        listProjectMilestones(projectId).catch(() => []),
        listProjectPlanningResources(projectId).catch(() => []),
        listProjectPlanningComments(projectId).catch(() => []),
        listActiveEmployees().catch(() => []),
      ]);
      setTasks(t);
      setMilestones(m);
      setResources(r);
      setComments(c);
      setEmployees(e);
    } catch (err) {
      setError(err.message || 'Erreur chargement planning.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  if (!projectId) {
    return (
      <div style={{ padding: 24, background: 'var(--surface-2)', borderRadius: 8, color: 'var(--text-3)', fontSize: '0.84rem', textAlign: 'center' }}>
        Enregistrez le projet pour gérer le planning chantier.
      </div>
    );
  }

  return (
    <div>
      {toast && (
        <div style={{ position: 'fixed', bottom: 28, right: 28, background: 'var(--text)', color: '#fff', borderRadius: 8, padding: '12px 20px', fontSize: '0.875rem', fontWeight: 600, zIndex: 9999 }}>
          {toast}
        </div>
      )}

      {/* Navigation vues */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {PLANNING_VIEWS.map((v) => {
            const Icon = VIEW_ICONS[v.id] || LayoutGrid;
            const active = view === v.id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => setView(v.id)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem',
                  border: active ? 'none' : '1.5px solid var(--border)',
                  background: active ? 'var(--red)' : '#fff',
                  color: active ? '#fff' : 'var(--text-2)',
                }}
              >
                <Icon size={14} /> {v.label}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => { generateProjectPlanningPdf(projet, tasks); setToast('PDF exporté'); }} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 6, border: '1.5px solid var(--border)', background: '#fff', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
            <FileText size={14} /> PDF
          </button>
          <button type="button" onClick={() => { exportPlanningTasksCsv(projet, tasks); setToast('Excel (CSV) exporté'); }} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 6, border: '1.5px solid var(--border)', background: '#fff', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
            <FileSpreadsheet size={14} /> Excel
          </button>
          <button type="button" onClick={() => { exportPlanningResourcesCsv(projet, resources); setToast('Ressources exportées'); }} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 6, border: '1.5px solid var(--border)', background: '#fff', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
            <Download size={14} /> Ressources
          </button>
        </div>
      </div>

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--red-light)', color: 'var(--red)', borderRadius: 8, marginBottom: 12, fontSize: '0.84rem' }}>
          <AlertCircle size={16} /> {error}
          {error.includes('project_planning') && (
            <span style={{ fontSize: '0.75rem' }}> — Exécutez RUN_PROJECT_PLANNING_TASKS.sql puis RUN_PROJECT_PLANNING_FEATURES.sql</span>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>
          <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 10px' }} />
          Chargement…
        </div>
      ) : (
        <>
          {view === 'gantt' && (
            <ProjectPlanningGantt
              projet={projet}
              tasks={tasks}
              setTasks={setTasks}
              employees={employees}
              onReload={load}
              externalEdit={wbsEdit}
              onExternalEditClear={() => { setWbsEdit(null); setAddChildParent(null); }}
              addChildParent={addChildParent}
            />
          )}
          {view === 'wbs' && (
            <PlanningWbsView
              tasks={tasks}
              onEdit={(row) => { setWbsEdit(row); setView('gantt'); }}
              onAddChild={(row) => { setAddChildParent(row); setView('gantt'); }}
            />
          )}
          {view === 'ressources' && (
            <PlanningResourcesView
              resources={resources}
              tasks={tasks}
              saving={saving}
              onSave={async (form, id) => {
                setSaving(true);
                try {
                  if (id) await updateProjectPlanningResource(id, form);
                  else await createProjectPlanningResource(projectId, form);
                  await load();
                  setToast('Ressource enregistrée.');
                } finally { setSaving(false); }
              }}
              onDelete={async (id) => {
                if (!window.confirm('Supprimer cette ressource ?')) return;
                await deleteProjectPlanningResource(id);
                await load();
                setToast('Ressource supprimée.');
              }}
            />
          )}
          {view === 'timeline' && (
            <PlanningMilestonesView
              projet={projet}
              milestones={milestones}
              tasks={tasks}
              saving={saving}
              onSave={async (form, id) => {
                setSaving(true);
                try {
                  if (id) await updateProjectMilestone(id, form);
                  else await createProjectMilestone(projectId, form);
                  await load();
                  setToast('Jalon enregistré.');
                } finally { setSaving(false); }
              }}
              onDelete={async (id) => {
                if (!window.confirm('Supprimer ce jalon ?')) return;
                await deleteProjectMilestone(id);
                await load();
                setToast('Jalon supprimé.');
              }}
            />
          )}
          {view === 'collab' && (
            <PlanningCollaborationView
              comments={comments}
              tasks={tasks}
              saving={saving}
              onAdd={async (payload) => {
                setSaving(true);
                try {
                  await addProjectPlanningComment(projectId, payload);
                  await load();
                  setToast('Message publié.');
                } finally { setSaving(false); }
              }}
              onDelete={async (id) => {
                if (!window.confirm('Supprimer ce message ?')) return;
                await deleteProjectPlanningComment(id);
                await load();
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

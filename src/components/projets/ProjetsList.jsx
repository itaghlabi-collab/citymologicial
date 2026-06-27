/**
 * ProjetsList.jsx — Sous-module Projets ERP CITYMO
 * Gestion projets BTP / aménagement / chantier
 * Backend-ready / Database-ready
 */

import {
  FolderOpen, Plus, Edit2, Trash2, Eye, Download, Search, Filter,
  X, ChevronLeft, RefreshCw, AlertCircle, CheckCircle, FileText,
  User, Calendar, MapPin, TrendingUp, BarChart3, Clock,
  AlertTriangle, Settings, Archive, ChevronDown, DollarSign,
  HardHat, Users, ClipboardList, Layers, Gauge, Wrench
} from 'lucide-react';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { useProjects } from '../../hooks/useProjects';
import { listClients, clientDisplayName } from '../../services/crm/clients';
import { TYPE_PROJET_VALUES, TYPE_PROJET_LABEL } from '../../constants/commercial';
import { PROJECT_INTERVENTION_TYPES, normalizeTypesIntervention, formatTypesInterventionLabel } from '../../constants/projects';
import { isProjectLate } from '../../services/projects/projects';
import { generateProjectRecapPdf } from '../../services/projects/projectPdf';
import ProjectDocuments from './ProjectDocuments';
import ProjectPlanningModule from './ProjectPlanningModule';
import ProjectBesoinsModule from './ProjectBesoinsModule';
import {
  listProjectEquipeOverview,
} from '../../services/rh/resourceRequests';
import { recruitmentStatutBadge, recruitmentStatutLabel } from '../../constants/projectBesoins';
import { listAssignmentsByProject, listSubcontractors, saveProjectSubcontractorAssignments, removeSubcontractorFromProject, subcontractorFullName } from '../../services/rh/subcontractors';
import { listActiveEmployees, employeeSelectLabel, findEmployeeByStoredLabel, filterChefsProjet, filterChefsChantierEmployees, withSelectedEmployee } from '../../services/rh/employees';
import { listCrmDevis, crmDevisSelectLabel, findCrmDevisByReference } from '../../services/crm/crmDevis';

// ── Shared primitives ───────────────────────────────────────────────────────

const INPUT_STYLE = {
  width: '100%', padding: '8px 11px', border: '1.5px solid var(--border)',
  borderRadius: 6, fontSize: '0.86rem', background: '#fff', outline: 'none',
  fontFamily: 'var(--font-body)', color: 'var(--text)', boxSizing: 'border-box'
};
const SELECT_STYLE = { ...INPUT_STYLE, cursor: 'pointer' };
const TEXTAREA_STYLE = { ...INPUT_STYLE, minHeight: 80, resize: 'vertical' };

function Badge({ type, children }) {
  const map = {
    brouillon:  { cls: 'badge-grey',   label: 'Brouillon'  },
    en_cours:   { cls: 'badge-orange', label: 'En cours'   },
    en_pause:   { cls: 'badge-blue',   label: 'En pause'   },
    termine:    { cls: 'badge-green',  label: 'Terminé'    },
    annule:     { cls: 'badge-red',    label: 'Annulé'     },
    planifie:   { cls: 'badge-blue',   label: 'Planifié'   },
    suspendu:   { cls: 'badge-red',    label: 'Suspendu'   },
    en_retard:  { cls: 'badge-red',    label: 'En retard'  },
    haute:      { cls: 'badge-orange', label: 'Haute'      },
    normale:    { cls: 'badge-blue',   label: 'Normale'    },
    faible:     { cls: 'badge-grey',   label: 'Faible'     },
    urgente:    { cls: 'badge-red',    label: 'Urgente'    },
  };
  const cfg = map[type] || { cls: 'badge-grey', label: children || type };
  return <span className={`badge ${cfg.cls}`}>{children || cfg.label}</span>;
}

function KpiCard({ icon, label, value, sub, color }) {
  const colors = { red: 'var(--red)', blue: '#1565C0', green: '#2E7D32', orange: '#E65100', grey: 'var(--text-3)' };
  const bg     = { red: 'var(--red-light)', blue: '#E3F2FD', green: '#E8F5E9', orange: '#FFF3E0', grey: 'var(--surface-2)' };
  const c = color || 'grey';
  return (
    <div className="stat-card">
      <div className="stat-icon" style={{ background: bg[c], color: colors[c] }}>{icon}</div>
      <div className="stat-body">
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
        {sub && <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

function EmptyState({ icon, title, sub, action, onAction }) {
  return (
    <div style={{ textAlign: 'center', padding: '52px 24px', color: 'var(--text-3)' }}>
      <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
        {icon}
      </div>
      <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '1rem', color: 'var(--text-2)', marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: '0.84rem', marginBottom: action ? 20 : 0 }}>{sub}</div>
      {action && (
        <button className="btn btn-primary btn-sm" onClick={onAction} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Plus size={14} /> {action}
        </button>
      )}
    </div>
  );
}

function Modal({ open, onClose, title, children, width }) {
  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: width || 720, maxHeight: '92vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
          <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.05rem', letterSpacing: '0.04em' }}>{title}</div>
          <button className="btn btn-ghost btn-sm" style={{ padding: '4px 8px' }} onClick={onClose}><X size={16} /></button>
        </div>
        <div style={{ padding: '24px' }}>{children}</div>
      </div>
    </div>
  );
}

function SectionTitle({ children, icon }) {
  return (
    <div style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14, paddingBottom: 8, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 7 }}>
      {icon}{children}
    </div>
  );
}

function FRow({ children }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14, marginBottom: 14 }}>{children}</div>;
}

function FField({ label, required, children }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>
        {label}{required && <span style={{ color: 'var(--red)', marginLeft: 3 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

function ProgressBar({ value }) {
  const pct = Math.min(100, Math.max(0, Number(value) || 0));
  const color = pct >= 80 ? '#2E7D32' : pct >= 50 ? 'var(--red)' : '#E65100';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 7, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: pct + '%', background: color, borderRadius: 4, transition: 'width 0.4s' }} />
      </div>
      <span style={{ fontSize: '0.75rem', fontWeight: 700, fontFamily: 'var(--font-head)', color, minWidth: 30 }}>{pct}%</span>
    </div>
  );
}

// ── Constantes métier ────────────────────────────────────────────────────────

const STATUTS_PROJET = [
  { value: 'brouillon', label: 'Brouillon' },
  { value: 'en_cours',  label: 'En cours'  },
  { value: 'en_pause',  label: 'En pause'  },
  { value: 'termine',   label: 'Terminé'   },
  { value: 'annule',    label: 'Annulé'    },
];

const PRIORITES = [
  { value: 'faible',  label: 'Faible'  },
  { value: 'normale', label: 'Normale' },
  { value: 'haute',   label: 'Haute'   },
  { value: 'urgente', label: 'Urgente' },
];

const EMPTY_FORM = {
  nom: '', client_id: '', client: '', type_projet: '', types_intervention: [],
  chef_projet: '', chef_chantier: '', devis_lie: '',
  budget_approuve: '', date_debut: '', date_fin_prevue: '', description: '',
  ville: '', adresse_chantier: '', statut: 'brouillon', priorite: 'normale',
  avancement: 0, observations: '',
};

function InterventionTypePicker({ value = [], onChange, disabled = false }) {
  const selected = normalizeTypesIntervention(value);
  function toggle(type) {
    if (disabled) return;
    const next = selected.includes(type)
      ? selected.filter((t) => t !== type)
      : [...selected, type];
    onChange(next);
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, paddingTop: 2 }}>
      {PROJECT_INTERVENTION_TYPES.map((type) => {
        const checked = selected.includes(type);
        return (
          <label
            key={type}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 10px',
              borderRadius: 6,
              cursor: disabled ? 'not-allowed' : 'pointer',
              border: `1.5px solid ${checked ? 'var(--red)' : 'var(--border)'}`,
              background: checked ? '#FFF5F5' : '#fff',
              fontSize: '0.82rem',
              fontWeight: checked ? 700 : 500,
              color: checked ? 'var(--red)' : 'var(--text-2)',
              userSelect: 'none',
            }}
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={disabled}
              onChange={() => toggle(type)}
              style={{ width: 14, height: 14, accentColor: 'var(--red)', margin: 0 }}
            />
            {type}
          </label>
        );
      })}
    </div>
  );
}

function InterventionTypeBadges({ types }) {
  const list = normalizeTypesIntervention(types);
  if (!list.length) return <span style={{ color: 'var(--text-3)' }}>—</span>;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {list.map((type) => (
        <span key={type} className="badge badge-blue" style={{ fontSize: '0.68rem' }}>{type}</span>
      ))}
    </div>
  );
}

// ── Formulaire Projet ────────────────────────────────────────────────────────

function FormulaireProjet({ initial, onSave, onCancel, saving, clients = [] }) {
  const [form, setForm] = useState(() => {
    if (!initial) return { ...EMPTY_FORM };
    return {
      ...EMPTY_FORM,
      ...initial,
      client_id: initial.client_id || '',
      client: initial.client || initial.client_nom || '',
      types_intervention: normalizeTypesIntervention(initial.types_intervention),
    };
  });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const [errors, setErrors] = useState({});
  const [employees, setEmployees] = useState([]);
  const [crmDevisList, setCrmDevisList] = useState([]);
  const [chefProjetId, setChefProjetId] = useState('');
  const [chefChantierId, setChefChantierId] = useState('');
  const [devisId, setDevisId] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listActiveEmployees().catch(() => []),
      listCrmDevis().catch(() => []),
    ])
      .then(([rows, devisRows]) => {
        if (cancelled) return;
        setEmployees(rows);
        setCrmDevisList(devisRows);
        const cp = findEmployeeByStoredLabel(rows, initial?.chef_projet || initial?.responsable);
        const cc = findEmployeeByStoredLabel(rows, initial?.chef_chantier);
        setChefProjetId(cp?.id ? String(cp.id) : '');
        setChefChantierId(cc?.id ? String(cc.id) : '');
        const linkedDevis = initial?.devis_id
          ? devisRows.find((d) => String(d.id) === String(initial.devis_id))
          : findCrmDevisByReference(devisRows, initial?.devis_lie || initial?.devis_reference);
        setDevisId(linkedDevis?.id ? String(linkedDevis.id) : '');
      })
      .catch(() => {
        if (!cancelled) {
          setEmployees([]);
          setCrmDevisList([]);
        }
      });
    return () => { cancelled = true; };
  }, [initial?.id, initial?.chef_projet, initial?.responsable, initial?.chef_chantier, initial?.devis_lie, initial?.devis_reference, initial?.devis_id]);

  const chefsProjetOptions = useMemo(
    () => withSelectedEmployee(filterChefsProjet(employees), employees, chefProjetId),
    [employees, chefProjetId],
  );

  const chefsChantierOptions = useMemo(
    () => withSelectedEmployee(filterChefsChantierEmployees(employees), employees, chefChantierId),
    [employees, chefChantierId],
  );

  function onDevisChange(nextDevisId) {
    setDevisId(nextDevisId);
    const d = crmDevisList.find((x) => String(x.id) === String(nextDevisId));
    if (!d) {
      setForm((p) => ({ ...p, devis_lie: '' }));
      return;
    }
    setForm((p) => ({
      ...p,
      devis_lie: d.reference || '',
      budget_approuve: d.total_ttc != null ? d.total_ttc : p.budget_approuve,
      ...(d.client_id ? { client_id: d.client_id, client: d.client_nom || p.client } : {}),
    }));
  }

  function onClientChange(clientId) {
    const cl = clients.find(c => String(c.id) === String(clientId));
    setForm(p => ({
      ...p,
      client_id: clientId,
      client: cl ? clientDisplayName(cl) : '',
    }));
  }

  function validate() {
    const e = {};
    if (!form.nom.trim()) e.nom = 'Requis';
    if (!form.client_id && !form.client?.trim()) e.client_id = 'Requis';
    return e;
  }

  function handleSubmit(ev) {
    ev.preventDefault();
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    const cl = clients.find(c => String(c.id) === String(form.client_id));
    const cp = employees.find((e) => String(e.id) === String(chefProjetId));
    const cc = employees.find((e) => String(e.id) === String(chefChantierId));
    const selectedDevis = crmDevisList.find((d) => String(d.id) === String(devisId));
    onSave({
      ...form,
      chef_projet: cp ? employeeSelectLabel(cp) : '',
      chef_chantier: cc ? employeeSelectLabel(cc) : '',
      devis_lie: selectedDevis?.reference || form.devis_lie || '',
      devis_id: selectedDevis?.id || form.devis_id || '',
      client_nom: cl ? clientDisplayName(cl) : (form.client || '').trim(),
      avancement: Number(form.avancement) || 0,
      budget_approuve: Number(form.budget_approuve) || 0,
    });
  }

  const inp = (k, type, ph, req) => (
    <FField label={ph} required={req}>
      <input type={type || 'text'} placeholder={ph} value={form[k]} onChange={e => set(k, e.target.value)}
        style={{ ...INPUT_STYLE, borderColor: errors[k] ? 'var(--red)' : 'var(--border)' }} />
      {errors[k] && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors[k]}</div>}
    </FField>
  );

  return (
    <form onSubmit={handleSubmit}>
      <SectionTitle icon={<FileText size={12} />}>Informations générales</SectionTitle>
      <FRow>
        {inp('nom', 'text', 'Nom du projet', true)}
        <FField label="Client (CRM)" required>
          <select
            value={form.client_id}
            onChange={e => onClientChange(e.target.value)}
            style={{ ...SELECT_STYLE, borderColor: errors.client_id ? 'var(--red)' : 'var(--border)' }}
          >
            <option value="">Choisir un client...</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>{clientDisplayName(c) || c.nom}</option>
            ))}
          </select>
          {errors.client_id && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors.client_id}</div>}
        </FField>
      </FRow>
      <div style={{ marginBottom: 14 }}>
        <FField label="Type d'intervention">
          <InterventionTypePicker
            value={form.types_intervention}
            onChange={(types) => set('types_intervention', types)}
            disabled={saving}
          />
        </FField>
      </div>
      <FRow>
        <FField label="Type de projet">
          <select value={form.type_projet} onChange={e => set('type_projet', e.target.value)} style={SELECT_STYLE}>
            <option value="">—</option>
            {TYPE_PROJET_VALUES.map(t => (
              <option key={t} value={t}>{TYPE_PROJET_LABEL[t] || t}</option>
            ))}
          </select>
        </FField>
        <FField label="Chef de projet">
          <select
            value={chefProjetId}
            onChange={(e) => setChefProjetId(e.target.value)}
            style={SELECT_STYLE}
          >
            <option value="">Choisir un employé...</option>
            {chefsProjetOptions.map((e) => (
              <option key={e.id} value={e.id}>{employeeSelectLabel(e)}</option>
            ))}
          </select>
          {chefsProjetOptions.length === 0 && (
            <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', marginTop: 3 }}>
              Aucun employé avec un poste « Chef de projet », « Project manager » ou « Responsable projet ».
            </div>
          )}
        </FField>
        <FField label="Chef de chantier">
          <select
            value={chefChantierId}
            onChange={(e) => setChefChantierId(e.target.value)}
            style={SELECT_STYLE}
          >
            <option value="">Choisir un employé...</option>
            {chefsChantierOptions.map((e) => (
              <option key={e.id} value={e.id}>{employeeSelectLabel(e)}</option>
            ))}
          </select>
          {chefsChantierOptions.length === 0 && (
            <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', marginTop: 3 }}>
              Aucun employé avec un poste « Chef de chantier », « Conducteur de travaux » ou « Responsable chantier ».
            </div>
          )}
        </FField>
      </FRow>
      <FRow>
        <FField label="Référence devis lié">
          <select
            value={devisId}
            onChange={(e) => onDevisChange(e.target.value)}
            style={SELECT_STYLE}
          >
            <option value="">Choisir un devis CRM...</option>
            {crmDevisList.map((d) => (
              <option key={d.id} value={d.id}>{crmDevisSelectLabel(d)}</option>
            ))}
          </select>
          {form.devis_lie && !devisId && (
            <div style={{ fontSize: '0.7rem', color: '#E65100', marginTop: 3 }}>
              Référence actuelle : {form.devis_lie} (non trouvée dans le CRM)
            </div>
          )}
        </FField>
        {inp('budget_approuve', 'number', 'Budget approuvé (MAD)')}
      </FRow>
      <FRow>{inp('date_debut', 'date', 'Date début')}{inp('date_fin_prevue', 'date', 'Date fin prévue')}</FRow>
      <div style={{ marginBottom: 14 }}>
        <FField label="Description">
          <textarea value={form.description} onChange={e => set('description', e.target.value)} placeholder="Description du projet, objectifs, contexte..." style={TEXTAREA_STYLE} />
        </FField>
      </div>

      <SectionTitle icon={<MapPin size={12} />}>Localisation</SectionTitle>
      <FRow>{inp('ville', 'text', 'Ville')}{inp('adresse_chantier', 'text', 'Adresse du chantier')}</FRow>

      <SectionTitle icon={<Gauge size={12} />}>Suivi</SectionTitle>
      <FRow>
        <FField label="Statut projet">
          <select value={form.statut} onChange={e => set('statut', e.target.value)} style={SELECT_STYLE}>
            {STATUTS_PROJET.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </FField>
        <FField label="Priorité">
          <select value={form.priorite} onChange={e => set('priorite', e.target.value)} style={SELECT_STYLE}>
            {PRIORITES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </FField>
        <FField label="Avancement (%)">
          <input type="number" min="0" max="100" value={form.avancement} onChange={e => set('avancement', e.target.value)} style={INPUT_STYLE} />
        </FField>
      </FRow>
      <div style={{ marginBottom: 14 }}>
        <FField label="Observations">
          <textarea value={form.observations} onChange={e => set('observations', e.target.value)} placeholder="Notes, observations, points d'attention..." style={TEXTAREA_STYLE} />
        </FField>
      </div>

      {initial?.id && (
        <div style={{ marginBottom: 20 }}>
          <SectionTitle icon={<Users size={12} />}>Équipe — ouvriers affectés (RH)</SectionTitle>
          <ProjectEquipeTab projet={initial} compact />
        </div>
      )}

      <SectionTitle icon={<Archive size={12} />}>Documents</SectionTitle>
      <div style={{ marginBottom: 20 }}>
        <ProjectDocuments projectId={initial?.id} compact />
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Annuler</button>
        <button type="submit" className="btn btn-primary" disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={14} /> {saving ? 'Enregistrement...' : (initial?.id ? 'Enregistrer' : 'Créer le projet')}
        </button>
      </div>
    </form>
  );
}

// ── Onglet Équipe projet ─────────────────────────────────────────────────────

function ProjectEquipeTab({ projet, compact = false }) {
  const [workerAssignments, setWorkerAssignments] = useState([]);
  const [subAssignments, setSubAssignments] = useState([]);
  const [recruitments, setRecruitments] = useState([]);
  const [uncoveredPosts, setUncoveredPosts] = useState([]);
  const [allSubcontractors, setAllSubcontractors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [showSubModal, setShowSubModal] = useState(false);
  const [selectedSubIds, setSelectedSubIds] = useState(() => new Set());

  const load = useCallback(async () => {
    if (!projet?.id) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [overview, sa, subs] = await Promise.all([
        listProjectEquipeOverview(projet.id),
        listAssignmentsByProject(projet.id).catch(() => []),
        listSubcontractors().catch(() => []),
      ]);
      setWorkerAssignments(overview.workers || []);
      setUncoveredPosts(overview.uncoveredPosts || []);
      setRecruitments(overview.recruitments || []);
      setSubAssignments((sa || []).filter((s) => s.status === 'active'));
      setAllSubcontractors(subs);
    } catch (err) {
      console.error('[CITYMO] ProjectEquipeTab load', err);
      const msg = err?.message || '';
      if (/worker_project_assignments|42P01|does not exist/i.test(msg)) {
        setLoadError('Table worker_project_assignments absente — exécutez supabase/RUN_WORKER_PROJECT_ASSIGNMENTS.sql dans Supabase.');
      } else {
        setLoadError(err.message || 'Impossible de charger l\'équipe.');
      }
    } finally {
      setLoading(false);
    }
  }, [projet?.id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const handler = (e) => {
      const pid = e?.detail?.projectId;
      if (!pid || String(pid) === String(projet?.id)) load();
    };
    window.addEventListener('citymo:rh-assignments-updated', handler);
    return () => window.removeEventListener('citymo:rh-assignments-updated', handler);
  }, [load, projet?.id]);

  const assignableSubcontractors = useMemo(
    () => (allSubcontractors || []).filter((s) => s.statut === 'actif'),
    [allSubcontractors],
  );

  function openSubModal() {
    setSelectedSubIds(new Set(subAssignments.map((a) => String(a.subcontractorId))));
    setShowSubModal(true);
  }

  function toggleSub(id) {
    const sid = String(id);
    setSelectedSubIds((prev) => {
      const next = new Set(prev);
      if (next.has(sid)) next.delete(sid);
      else next.add(sid);
      return next;
    });
  }

  async function handleSaveSubAssignments() {
    setSaving(true);
    try {
      const updated = await saveProjectSubcontractorAssignments(
        projet.id,
        [...selectedSubIds],
        { nom: projet.nom, ref: projet.ref },
      );
      setSubAssignments((updated || []).filter((s) => s.status === 'active'));
      setShowSubModal(false);
    } catch (err) {
      alert(err.message || 'Erreur lors de l\'affectation.');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveSubcontractor(subcontractorId) {
    if (!window.confirm('Retirer ce sous-traitant du projet ?')) return;
    setSaving(true);
    try {
      await removeSubcontractorFromProject(projet.id, subcontractorId);
      await load();
    } catch (err) {
      alert(err.message || 'Erreur.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className={compact ? '' : 'card'} style={{ padding: compact ? '16px 0' : 32, textAlign: 'center', color: 'var(--text-3)' }}>
        Chargement de l&apos;équipe…
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{ padding: '12px 14px', background: '#FFF8E1', border: '1px solid #FFCC80', borderRadius: 8, color: '#E65100', fontSize: '0.84rem' }}>
        {loadError}
      </div>
    );
  }

  const wrapStyle = compact
    ? { marginBottom: 0, padding: '14px 16px', border: '1.5px solid var(--border)', borderRadius: 8, background: 'var(--bg)' }
    : { marginBottom: 16 };

  return (
    <>
      <div className={compact ? '' : 'card'} style={wrapStyle}>
        {!compact && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
            <SectionTitle icon={<Users size={13} />}>Équipe du projet</SectionTitle>
            <button type="button" className="btn btn-ghost btn-sm" onClick={load} disabled={loading || saving}>
              <RefreshCw size={13} /> Actualiser
            </button>
          </div>
        )}
        {compact && <SectionTitle icon={<Users size={13} />}>Équipe du projet</SectionTitle>}

        {/* A. Encadrement */}
        <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
          A. Encadrement
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, marginBottom: 24 }}>
          <div style={{ padding: '12px 14px', background: 'var(--surface-2)', borderRadius: 8 }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 4 }}>Chef de projet</div>
            <div style={{ fontWeight: 700 }}>{projet.responsable || projet.chef_projet || '—'}</div>
          </div>
          <div style={{ padding: '12px 14px', background: 'var(--surface-2)', borderRadius: 8 }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 4 }}>Chef de chantier</div>
            <div style={{ fontWeight: 700 }}>{projet.chef_chantier || '—'}</div>
          </div>
        </div>

        {/* B. Ouvriers affectés */}
        <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
          B. Ouvriers affectés
        </div>
        <div style={{ padding: '10px 12px', background: '#E8F5E9', borderRadius: 8, fontSize: '0.82rem', color: '#2E7D32', marginBottom: 12 }}>
          Affectation validée par le service RH — lecture seule.
        </div>

        {workerAssignments.length === 0 ? (
          <div style={{ padding: '20px 0', color: 'var(--text-3)', fontSize: '0.85rem', textAlign: 'center', marginBottom: 24 }}>
            Aucun ouvrier affecté pour le moment.
          </div>
        ) : (
          <div className="table-wrap" style={{ marginBottom: 24 }}>
            <table>
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Fonction</th>
                </tr>
              </thead>
              <tbody>
                {workerAssignments.map((a) => (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 700 }}>{a.workerName || '—'}</td>
                    <td>{a.workerFonction || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* C. Postes manquants / recrutement */}
        <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
          C. Postes manquants et recrutements en cours
        </div>
        {uncoveredPosts.length === 0 && recruitments.length === 0 ? (
          <div style={{ padding: '20px 0', color: 'var(--text-3)', fontSize: '0.85rem', textAlign: 'center', marginBottom: 24 }}>
            Tous les besoins RH sont couverts — aucun recrutement en cours.
          </div>
        ) : (
          <div className="table-wrap" style={{ marginBottom: 24 }}>
            <table>
              <thead>
                <tr>
                  <th>Demande RH</th>
                  <th>Fonction</th>
                  <th>Couverture</th>
                  <th>Manquant</th>
                  <th>Recrutement</th>
                  <th>Priorité</th>
                </tr>
              </thead>
              <tbody>
                {uncoveredPosts.map((p) => (
                  <tr key={p.requestId}>
                    <td style={{ fontWeight: 700, color: 'var(--red)' }}>{p.ref || '—'}</td>
                    <td style={{ fontWeight: 600 }}>{p.fonction}</td>
                    <td>{p.assigned}/{p.demanded}</td>
                    <td style={{ fontWeight: 700, color: 'var(--red)' }}>{p.manque}</td>
                    <td>
                      {p.hasRecruitment ? (
                        <span className={`badge ${recruitmentStatutBadge(p.recruitment?.recruitment_statut)}`}>
                          {recruitmentStatutLabel(p.recruitment?.recruitment_statut)}
                        </span>
                      ) : (
                        <span className="badge badge-orange">En attente recrutement</span>
                      )}
                    </td>
                    <td>{p.priorite || '—'}</td>
                  </tr>
                ))}
                {uncoveredPosts.length === 0 && recruitments.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 700, color: 'var(--red)' }}>{r.ref || '—'}</td>
                    <td style={{ fontWeight: 600 }}>{r.fonction}</td>
                    <td>—</td>
                    <td style={{ fontWeight: 700 }}>{r.quantite}</td>
                    <td>
                      <span className={`badge ${recruitmentStatutBadge(r.recruitment_statut)}`}>
                        {recruitmentStatutLabel(r.recruitment_statut)}
                      </span>
                    </td>
                    <td>{r.priorite || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
              <ClipboardList size={15} /> Sous-traitants affectés ({subAssignments.length})
            </div>
            <button type="button" className="btn btn-primary btn-sm" onClick={openSubModal} disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Plus size={14} /> Affecter des sous-traitants
            </button>
          </div>
          {subAssignments.length === 0 ? (
            <div style={{ padding: '20px 0', color: 'var(--text-3)', fontSize: '0.85rem', textAlign: 'center' }}>
              Aucun sous-traitant affecté — utilisez le bouton ci-dessus.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {subAssignments.map((s) => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{s.subcontractorName || '—'}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>
                      {s.subcontractorFonction || s.role || '—'}
                      {s.unitPrice > 0 ? ` · ${Number(s.unitPrice).toLocaleString('fr-MA')} MAD` : ''}
                    </div>
                  </div>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleRemoveSubcontractor(s.subcontractorId)} disabled={saving} title="Retirer">
                    <Trash2 size={13} style={{ color: 'var(--red)' }} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Modal open={showSubModal} onClose={() => !saving && setShowSubModal(false)} title="Affecter des sous-traitants" width={520}>
        <p style={{ fontSize: '0.84rem', color: 'var(--text-3)', marginBottom: 14 }}>
          Projet : <strong>{projet.nom}</strong> — cochez les sous-traitants actifs à affecter.
        </p>
        {assignableSubcontractors.length === 0 ? (
          <div style={{ color: 'var(--text-3)', padding: '16px 0' }}>Aucun sous-traitant actif disponible.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflowY: 'auto', marginBottom: 16 }}>
            {assignableSubcontractors.map((s) => {
              const checked = selectedSubIds.has(String(s.id));
              return (
                <label
                  key={s.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                    border: `1.5px solid ${checked ? 'var(--red)' : 'var(--border)'}`,
                    background: checked ? '#FFF5F5' : '#fff',
                  }}
                >
                  <input type="checkbox" checked={checked} onChange={() => toggleSub(s.id)} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700 }}>{subcontractorFullName(s)}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{s.fonction || '—'}</div>
                  </div>
                </label>
              );
            })}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={() => setShowSubModal(false)} disabled={saving}>Annuler</button>
          <button type="button" className="btn btn-primary" onClick={handleSaveSubAssignments} disabled={saving || assignableSubcontractors.length === 0}>
            {saving ? 'Enregistrement…' : 'Enregistrer l\'affectation'}
          </button>
        </div>
      </Modal>
    </>
  );
}

// ── Page Détail Projet ───────────────────────────────────────────────────────

function DetailProjet({ projet, onBack, onEdit, onCreateSAV, initialTab = 'general' }) {
  const [activeTab, setActiveTab] = useState(initialTab);

  const tabs = [
    { k: 'general',    label: 'Vue générale'     },
    { k: 'budget',     label: 'Budget'           },
    { k: 'planning',   label: 'Planning'         },
    { k: 'besoins',    label: 'Besoins'          },
    { k: 'documents',  label: 'Documents'        },
    { k: 'equipe',     label: 'Équipe'           },
    { k: 'historique', label: 'Historique'       },
  ];

  const budgetPct = projet.budget_approuve > 0
    ? Math.round((projet.budget_consomme || 0) / projet.budget_approuve * 100)
    : 0;

  return (
    <div className="animate-fade-in">
      {/* Header retour */}
      <div style={{ marginBottom: 20 }}>
        <button className="btn btn-ghost btn-sm" style={{ marginBottom: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={onBack}>
          <ChevronLeft size={15} /> Retour aux projets
        </button>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <span style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '0.75rem', letterSpacing: '0.12em', color: 'var(--text-3)' }}>
                {projet.ref}
              </span>
              <Badge type={projet.statut} />
              <Badge type={projet.priorite} />
            </div>
            <h1 className="page-title" style={{ marginBottom: 4 }}>{projet.nom}</h1>
            <p className="page-subtitle">{projet.client}{projet.ville ? ` — ${projet.ville}` : ''}</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={onEdit}>
              <Edit2 size={13} /> Modifier
            </button>
            <button className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => generateProjectRecapPdf(projet).catch((e) => alert(e.message || 'Erreur PDF'))}>
              <Download size={13} /> PDF récap
            </button>
            {onCreateSAV && (
              <button type="button" className="btn btn-primary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => onCreateSAV(projet)}>
                <Wrench size={13} /> Demande SAV
              </button>
            )}
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', marginBottom: 20 }}>
        <KpiCard icon={<Gauge size={17} />}      label="Avancement"        value={projet.avancement + '%'}                                  color="blue"  />
        <KpiCard icon={<DollarSign size={17} />} label="Budget approuvé"   value={(projet.budget_approuve || 0).toLocaleString('fr-MA') + ' MAD'} color="green" />
        <KpiCard icon={<TrendingUp size={17} />} label="Budget consommé"   value={(projet.budget_consomme || 0).toLocaleString('fr-MA') + ' MAD'} color={budgetPct > 80 ? 'red' : 'orange'} />
        <KpiCard icon={<Clock size={17} />}      label="Date fin prévue"   value={projet.date_fin_prevue || '—'}                            color="grey"  />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '2px solid var(--border)', overflowX: 'auto' }}>
        {tabs.map(t => (
          <button key={t.k} onClick={() => setActiveTab(t.k)} style={{
            padding: '9px 18px', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
            fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '0.875rem', background: 'none',
            color: activeTab === t.k ? 'var(--red)' : 'var(--text-2)',
            borderBottom: activeTab === t.k ? '2px solid var(--red)' : '2px solid transparent',
            marginBottom: -2, transition: 'color 0.15s'
          }}>{t.label}</button>
        ))}
      </div>

      {/* Tab: général */}
      {activeTab === 'general' && (
        <div className="card">
          <SectionTitle icon={<FileText size={13} />}>Informations générales</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 20 }}>
            {[
              ['Client', projet.client],
              ['Type d\'intervention', formatTypesInterventionLabel(projet.types_intervention)],
              ['Type', projet.type_projet ? (TYPE_PROJET_LABEL[projet.type_projet] || projet.type_projet) : '—'],
              ['Responsable', projet.chef_projet || projet.responsable || '—'],
              ['Chef de chantier', projet.chef_chantier || '—'],
              ['Devis lié', projet.devis_lie || '—'],
              ['Ville', projet.ville || '—'],
              ['Adresse chantier', projet.adresse_chantier || '—'],
              ['Date début', projet.date_debut || '—'],
              ['Date fin prévue', projet.date_fin_prevue || '—'],
              ['Priorité', projet.priorite || '—'],
            ].map(([lbl, val]) => (
              <div key={lbl}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>{lbl}</div>
                <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{val}</div>
              </div>
            ))}
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Avancement global</div>
            <ProgressBar value={projet.avancement} />
          </div>
          {projet.description && (
            <div>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Description</div>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-2)', lineHeight: 1.6 }}>{projet.description}</p>
            </div>
          )}
          {projet.observations && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Observations</div>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-2)', lineHeight: 1.6 }}>{projet.observations}</p>
            </div>
          )}
        </div>
      )}

      {/* Tab: budget */}
      {activeTab === 'budget' && (
        <div className="card">
          <SectionTitle icon={<DollarSign size={13} />}>Budget & Finances</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
            <div style={{ padding: 16, background: 'var(--surface-2)', borderRadius: 8 }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Budget approuvé</div>
              <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.3rem', color: '#2E7D32' }}>{(projet.budget_approuve || 0).toLocaleString('fr-MA')} <span style={{ fontSize: '0.75rem' }}>MAD</span></div>
            </div>
            <div style={{ padding: 16, background: budgetPct > 80 ? 'var(--red-light)' : 'var(--surface-2)', borderRadius: 8 }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Budget consommé</div>
              <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.3rem', color: budgetPct > 80 ? 'var(--red)' : 'var(--text)' }}>{(projet.budget_consomme || 0).toLocaleString('fr-MA')} <span style={{ fontSize: '0.75rem' }}>MAD</span></div>
            </div>
            <div style={{ padding: 16, background: 'var(--surface-2)', borderRadius: 8 }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Solde restant</div>
              <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.3rem', color: 'var(--text)' }}>{((projet.budget_approuve || 0) - (projet.budget_consomme || 0)).toLocaleString('fr-MA')} <span style={{ fontSize: '0.75rem' }}>MAD</span></div>
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-3)', marginBottom: 8 }}>Consommation budget</div>
            <ProgressBar value={budgetPct} />
          </div>
          <div style={{ marginTop: 24, padding: 16, background: 'var(--surface-2)', borderRadius: 8, color: 'var(--text-3)', fontSize: '0.84rem', textAlign: 'center' }}>
            <DollarSign size={18} style={{ margin: '0 auto 8px', display: 'block' }} />
            Devis et factures liés — Connexion au module CRM à activer
          </div>
        </div>
      )}

      {/* Tab: planning */}
      {activeTab === 'planning' && (
        <div className="card">
          <SectionTitle icon={<Calendar size={13} />}>Planning chantier</SectionTitle>
          <ProjectPlanningModule projet={projet} />
        </div>
      )}

      {/* Tab: besoins */}
      {activeTab === 'besoins' && (
        <div className="card">
          <SectionTitle icon={<ClipboardList size={13} />}>Besoins ressources humaines</SectionTitle>
          <ProjectBesoinsModule projet={projet} />
        </div>
      )}

      {/* Tab: documents */}
      {activeTab === 'documents' && (
        <div className="card">
          <SectionTitle icon={<Archive size={13} />}>Documents & Photos</SectionTitle>
          <ProjectDocuments projectId={projet.id} />
        </div>
      )}

      {/* Tab: équipe */}
      {activeTab === 'equipe' && (
        <ProjectEquipeTab projet={projet} />
      )}

      {/* Tab: historique */}
      {activeTab === 'historique' && (
        <div className="card">
          <SectionTitle icon={<Clock size={13} />}>Historique des actions</SectionTitle>
          <EmptyState icon={<Clock size={22} />} title="Aucune action enregistrée" sub="Les actions sur ce projet apparaîtront ici" />
        </div>
      )}
    </div>
  );
}

// ── Module principal ProjetsList ─────────────────────────────────────────────

export default function ProjetsList({ onCreateSAV }) {
  const {
    records: projets,
    loading,
    saving,
    error,
    configured,
    load,
    create,
    update,
    remove,
    fetchOne,
    filterProjects,
    computeProjectStats,
    generateProjectRef,
  } = useProjects();

  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [filterClient, setFilterClient] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterIntervention, setFilterIntervention] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editProjet, setEditProjet] = useState(null);
  const [detailProjet, setDetailProjet] = useState(null);
  const [detailInitialTab, setDetailInitialTab] = useState('general');
  const [showFilters, setShowFilters] = useState(false);
  const [pdfLoadingId, setPdfLoadingId] = useState(null);

  useEffect(() => {
    if (!configured) return;
    listClients().then(setClients).catch(() => {});
  }, [configured]);

  const handleSave = useCallback(async (data) => {
    const payload = editProjet?.id
      ? { ...data, id: editProjet.id, ref: editProjet.ref || data.ref }
      : { ...data, ref: data.ref || await generateProjectRef().catch(() => '') };
    const result = editProjet?.id
      ? await update(editProjet.id, payload)
      : await create(payload);
    if (!result.success) {
      alert(result.error || 'Erreur enregistrement.');
      return;
    }
    setShowModal(false);
    setEditProjet(null);
  }, [editProjet, create, update, generateProjectRef]);

  const handleDelete = useCallback(async (id) => {
    if (!window.confirm('Confirmer la suppression de ce projet ?')) return;
    const result = await remove(id);
    if (!result.success) alert(result.error || 'Erreur suppression.');
  }, [remove]);

  const openDetail = useCallback(async (p, tab = 'general') => {
    try {
      const full = await fetchOne(p.id);
      setDetailInitialTab(tab);
      setDetailProjet(full);
    } catch (err) {
      alert(err.message || 'Impossible de charger le projet.');
    }
  }, [fetchOne]);

  const handlePdf = useCallback(async (p) => {
    setPdfLoadingId(p.id);
    try {
      const full = await fetchOne(p.id);
      await generateProjectRecapPdf(full);
    } catch (err) {
      alert(err.message || 'Erreur génération PDF.');
    } finally {
      setPdfLoadingId(null);
    }
  }, [fetchOne]);

  const openEdit = useCallback(async (p) => {
    try {
      const full = await fetchOne(p.id);
      setEditProjet(full);
      setShowModal(true);
    } catch (err) {
      alert(err.message || 'Impossible de charger le projet.');
    }
  }, [fetchOne]);

  const filtered = filterProjects(projets, {
    search,
    statut: filterStatut,
    client_id: filterClient,
    type_projet: filterType,
    type_intervention: filterIntervention,
    date: filterDate,
  });

  const kpi = computeProjectStats(projets);
  const total = kpi.total;
  const enCours = kpi.enCours;
  const termines = kpi.termines;
  const enRetard = kpi.enRetard;
  const budgetTotal = kpi.budgetTotal;
  const budgetConso = kpi.budgetConso;

  if (detailProjet) {
    return (
      <DetailProjet
        projet={detailProjet}
        initialTab={detailInitialTab}
        onBack={() => { setDetailProjet(null); setDetailInitialTab('general'); }}
        onEdit={() => { openEdit(detailProjet); setDetailProjet(null); }}
        onCreateSAV={onCreateSAV}
      />
    );
  }

  return (
    <div className="projets-module animate-fade-in">
      {!configured && (
        <div style={{ background: '#FFF8E1', color: '#E65100', border: '1px solid rgba(230,81,0,0.25)', borderRadius: 8, padding: '10px 14px', fontSize: '0.85rem', marginBottom: 16 }}>
          Supabase non configuré — configurez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env
        </div>
      )}
      {error && (
        <div style={{ background: '#FFEBEE', color: 'var(--red)', border: '1px solid rgba(211,47,47,0.25)', borderRadius: 8, padding: '10px 14px', fontSize: '0.85rem', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertCircle size={15} /> {error}
          <button type="button" className="btn btn-ghost btn-sm" onClick={load} style={{ marginLeft: 'auto' }}>Réessayer</button>
        </div>
      )}

      {/* Header */}
      <div className="page-header flex-between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title">PROJETS</h1>
          <p className="page-subtitle">Gestion des projets, budgets et suivi chantier.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={load} title="Actualiser">
            <RefreshCw size={14} />
          </button>
          <button className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setShowFilters(f => !f)}>
            <Filter size={14} /> Filtres
          </button>
          <button className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Download size={14} /> Export
          </button>
          <button className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Calendar size={14} /> Planning
          </button>
          <button className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => { setEditProjet(null); setShowModal(true); }}>
            <Plus size={15} /> Ajouter projet
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', marginBottom: 20 }}>
        <KpiCard icon={<FolderOpen size={17} />}  label="Total projets"    value={total}                                           color="grey"  />
        <KpiCard icon={<Layers size={17} />}       label="En cours"         value={enCours}                                         color="blue"  />
        <KpiCard icon={<CheckCircle size={17} />}  label="Terminés"         value={termines}                                        color="green" />
        <KpiCard icon={<AlertTriangle size={17} />}label="En retard"        value={enRetard}                                        color="red"   />
        <KpiCard icon={<DollarSign size={17} />}   label="Budget total"     value={budgetTotal.toLocaleString('fr-MA') + ' MAD'}   color="green" />
        <KpiCard icon={<TrendingUp size={17} />}   label="Budget consommé"  value={budgetConso.toLocaleString('fr-MA') + ' MAD'}   color="orange"/>
      </div>

      {/* Filtres */}
      {showFilters && (
        <div className="card" style={{ marginBottom: 16, padding: '14px 20px' }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Référence, nom, client..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
            </div>
            <select value={filterStatut} onChange={e => setFilterStatut(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 200 }}>
              <option value="">Tous les statuts</option>
              {STATUTS_PROJET.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <select value={filterClient} onChange={e => setFilterClient(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 200 }}>
              <option value="">Tous les clients</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{clientDisplayName(c) || c.nom}</option>
              ))}
            </select>
            <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 180 }}>
              <option value="">Tous les types projet</option>
              {TYPE_PROJET_VALUES.map(t => (
                <option key={t} value={t}>{TYPE_PROJET_LABEL[t] || t}</option>
              ))}
            </select>
            <select value={filterIntervention} onChange={e => setFilterIntervention(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 200 }}>
              <option value="">Toutes interventions</option>
              {PROJECT_INTERVENTION_TYPES.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} style={{ ...INPUT_STYLE, maxWidth: 160 }} title="Date début" />
            <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFilterStatut(''); setFilterClient(''); setFilterType(''); setFilterIntervention(''); setFilterDate(''); }}>Réinitialiser</button>
          </div>
        </div>
      )}

      {/* Barre de recherche rapide */}
      {!showFilters && (
        <div className="card" style={{ marginBottom: 16, padding: '12px 16px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un projet..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
          </div>
        </div>
      )}

      {/* Tableau */}
      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-3)' }}>Chargement des projets...</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={<FolderOpen size={24} />} title="Aucun projet" sub="Créez votre premier projet chantier" action="Ajouter un projet" onAction={() => { setEditProjet(null); setShowModal(true); }} />
        ) : (
          <>
            <div className="projets-table-desktop table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Réf.</th>
                    <th>Nom projet</th>
                    <th>Client</th>
                    <th>Intervention</th>
                    <th>Chef projet</th>
                    <th>Budget</th>
                    <th>Avancement</th>
                    <th>Début</th>
                    <th>Fin prévue</th>
                    <th>Statut</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => (
                    <tr key={p.id}>
                      <td style={{ fontFamily: 'var(--font-head)', fontWeight: 700, color: 'var(--red)', whiteSpace: 'nowrap' }}>{p.ref}</td>
                      <td>
                        <button
                          type="button"
                          onClick={() => openDetail(p)}
                          style={{ fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)', padding: 0, textAlign: 'left' }}
                          title="Ouvrir la fiche projet"
                        >
                          {p.nom}
                        </button>
                      </td>
                      <td>{p.client || '—'}</td>
                      <td><InterventionTypeBadges types={p.types_intervention} /></td>
                      <td>{p.chef_projet || '—'}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{(p.budget_approuve || 0).toLocaleString('fr-MA')} MAD</td>
                      <td style={{ minWidth: 130 }}><ProgressBar value={p.avancement} /></td>
                      <td style={{ whiteSpace: 'nowrap' }}>{p.date_debut || '—'}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{p.date_fin_prevue || '—'}</td>
                      <td>
                        <Badge type={p.statut} />
                        {isProjectLate(p) && <span style={{ marginLeft: 6, fontSize: '0.68rem', color: 'var(--red)', fontWeight: 700 }}>Retard</span>}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'nowrap' }}>
                          <button className="btn btn-secondary btn-sm" title="Voir" onClick={() => openDetail(p)}><Eye size={13} /></button>
                          <button className="btn btn-ghost btn-sm" title="Équipe / affectation ouvriers" onClick={() => openDetail(p, 'equipe')} style={{ color: '#1565C0' }}><Users size={13} /></button>
                          <button className="btn btn-ghost btn-sm" title="Modifier" onClick={() => openEdit(p)}><Edit2 size={13} /></button>
                          <button className="btn btn-ghost btn-sm" title="PDF récap" disabled={pdfLoadingId === p.id} onClick={() => handlePdf(p)} style={{ color: 'var(--text-3)' }}><Download size={13} /></button>
                          <button className="btn btn-ghost btn-sm" title="Supprimer" onClick={() => handleDelete(p.id)} style={{ color: 'var(--red)' }}><Trash2 size={13} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="projets-mobile-list">
              {filtered.map((p) => (
                <div key={p.id} className="projet-mobile-card">
                  <div className="projet-mobile-card-head">
                    <div>
                      <div className="projet-mobile-ref">{p.ref}</div>
                      <div className="projet-mobile-nom">{p.nom}</div>
                      <div className="projet-mobile-client">{p.client || '—'}</div>
                      <div style={{ marginTop: 6 }}><InterventionTypeBadges types={p.types_intervention} /></div>
                    </div>
                    <div className="projet-mobile-badges">
                      <Badge type={p.statut} />
                      {isProjectLate(p) && <span className="projet-mobile-retard">Retard</span>}
                    </div>
                  </div>
                  <div className="projet-mobile-meta">
                    <div><span>Avancement</span><ProgressBar value={p.avancement} /></div>
                    <div><span>Budget</span><strong>{(p.budget_approuve || 0).toLocaleString('fr-MA')} MAD</strong></div>
                    <div><span>Début</span><span>{p.date_debut || '—'}</span></div>
                    <div><span>Fin prévue</span><span>{p.date_fin_prevue || '—'}</span></div>
                  </div>
                  <div className="projet-mobile-actions">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => openDetail(p)}><Eye size={13} /> Voir</button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => openDetail(p, 'equipe')} style={{ color: '#1565C0' }}><Users size={13} /> Équipe</button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => openEdit(p)}><Edit2 size={13} /> Modifier</button>
                    <button type="button" className="btn btn-ghost btn-sm" disabled={pdfLoadingId === p.id} onClick={() => handlePdf(p)}><Download size={13} /> PDF</button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleDelete(p.id)} style={{ color: 'var(--red)' }}><Trash2 size={13} /></button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Modal formulaire */}
      <Modal open={showModal} onClose={() => { setShowModal(false); setEditProjet(null); }} title={editProjet ? 'Modifier le projet' : 'Nouveau projet'} width={editProjet?.id ? 820 : 760}>
        <FormulaireProjet initial={editProjet} onSave={handleSave} onCancel={() => { setShowModal(false); setEditProjet(null); }} saving={saving} clients={clients} />
      </Modal>
    </div>
  );
}

/**
 * SAVModule.jsx — Sous-module SAV ERP CITYMO
 * Service Après-Vente chantier / client
 * Backend-ready / Database-ready
 */

import {
  MessageSquare, Plus, Edit2, Trash2, Eye, Download, Search, Filter,
  X, ChevronLeft, RefreshCw, AlertCircle, CheckCircle, FileText,
  User, Calendar, MapPin, Clock, AlertTriangle, Archive,
  Phone, Wrench, ClipboardList, ChevronDown
} from 'lucide-react';
import { useState, useCallback, useEffect } from 'react';
import { useSavRequests } from '../../hooks/useSavRequests';
import { listProjects } from '../../services/projects/projects';
import { listSavReportsBySavRequestId } from '../../services/projects/savReports';

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
    // statuts SAV
    nouvelle:    { cls: 'badge-blue',   label: 'Nouvelle demande' },
    en_attente:  { cls: 'badge-grey',   label: 'En attente'       },
    planifiee:   { cls: 'badge-orange', label: 'Planifiée'        },
    en_cours:    { cls: 'badge-blue',   label: 'En cours'         },
    terminee:    { cls: 'badge-green',  label: 'Terminée'         },
    cloturee:    { cls: 'badge-grey',   label: 'Clôturée'         },
    // priorités
    faible:      { cls: 'badge-grey',   label: 'Faible'           },
    normale:     { cls: 'badge-blue',   label: 'Normale'          },
    urgente:     { cls: 'badge-orange', label: 'Urgente'          },
    critique:    { cls: 'badge-red',    label: 'Critique'         },
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

// ── Constantes métier ────────────────────────────────────────────────────────

const STATUTS_SAV = [
  { value: 'nouvelle',   label: 'Nouvelle demande' },
  { value: 'en_attente', label: 'En attente'        },
  { value: 'planifiee',  label: 'Planifiée'         },
  { value: 'en_cours',   label: 'En cours'          },
  { value: 'terminee',   label: 'Terminée'          },
  { value: 'cloturee',   label: 'Clôturée'          },
];

const PRIORITES = [
  { value: 'faible',   label: 'Faible'   },
  { value: 'normale',  label: 'Normale'  },
  { value: 'urgente',  label: 'Urgente'  },
  { value: 'critique', label: 'Critique' },
];

const TYPES_SAV = [
  'Fissure / Fissuration', 'Infiltration / Étanchéité', 'Plomberie', 'Électricité',
  'Menuiserie', 'Carrelage / Revêtement', 'Peinture', 'Structure', 'Autre'
];

const CATEGORIES_SAV = [
  'Garantie décennale', 'SAV standard', 'Urgence', 'Réclamation client', 'Entretien'
];

const EMPTY_FORM = {
  project_id: '', client_id: '', client: '', projet_lie: '', ref_projet: '', contact_client: '',
  titre: '', type_sav: '', categorie: '', priorite: 'normale',
  description: '', date_demande: new Date().toISOString().slice(0, 10),
  localisation: '', technicien: '', responsable: '', departement: '', date_intervention: '',
  statut: 'nouvelle', observations: '', actions_prevues: '',
};

// ── Formulaire SAV ───────────────────────────────────────────────────────────

function FormulaireSAV({ initial, onSave, onCancel, saving, projects = [] }) {
  const [form, setForm] = useState(() => ({ ...EMPTY_FORM, ...(initial || {}) }));
  const [errors, setErrors] = useState({});
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  function onProjectChange(projectId) {
    const pr = projects.find(p => String(p.id) === String(projectId));
    if (!pr) {
      setForm(p => ({ ...p, project_id: '', ref_projet: '', projet_lie: '' }));
      return;
    }
    setForm(p => ({
      ...p,
      project_id: projectId,
      ref_projet: pr.ref || '',
      projet_lie: pr.nom || '',
      client: pr.client || pr.client_nom || p.client,
      client_id: pr.client_id || p.client_id,
    }));
  }

  function validate() {
    const e = {};
    if (!form.client?.trim() && !form.project_id) e.client = 'Client ou projet requis';
    if (!form.description?.trim()) e.description = 'Requis';
    return e;
  }

  function handleSubmit(ev) {
    ev.preventDefault();
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    onSave(form);
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
      <SectionTitle icon={<User size={12} />}>Informations client</SectionTitle>
      <FRow>
        <FField label="Projet lié">
          <select value={form.project_id} onChange={e => onProjectChange(e.target.value)} style={SELECT_STYLE}>
            <option value="">— Aucun projet —</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.ref} — {p.nom}</option>
            ))}
          </select>
        </FField>
        {inp('client', 'text', 'Client', true)}
      </FRow>
      <FRow>{inp('ref_projet', 'text', 'Référence projet')}{inp('contact_client', 'text', 'Contact client')}</FRow>

      <SectionTitle icon={<ClipboardList size={12} />}>Demande SAV</SectionTitle>
      <FRow>{inp('titre', 'text', 'Titre / Objet')}{inp('responsable', 'text', 'Responsable')}</FRow>
      <FRow>
        <FField label="Type SAV">
          <select value={form.type_sav} onChange={e => set('type_sav', e.target.value)} style={SELECT_STYLE}>
            <option value="">Sélectionner...</option>
            {TYPES_SAV.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </FField>
        <FField label="Catégorie">
          <select value={form.categorie} onChange={e => set('categorie', e.target.value)} style={SELECT_STYLE}>
            <option value="">Sélectionner...</option>
            {CATEGORIES_SAV.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </FField>
        <FField label="Priorité">
          <select value={form.priorite} onChange={e => set('priorite', e.target.value)} style={SELECT_STYLE}>
            {PRIORITES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </FField>
      </FRow>
      <FRow>{inp('date_demande', 'date', 'Date demande')}{inp('localisation', 'text', 'Localisation / Adresse')}</FRow>
      <div style={{ marginBottom: 14 }}>
        <FField label="Description du problème" required>
          <textarea value={form.description} onChange={e => set('description', e.target.value)}
            placeholder="Décrire précisément le problème constaté..."
            style={{ ...TEXTAREA_STYLE, borderColor: errors.description ? 'var(--red)' : 'var(--border)' }} />
          {errors.description && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors.description}</div>}
        </FField>
      </div>
      <div style={{ marginBottom: 14, padding: 14, background: 'var(--surface-2)', border: '2px dashed var(--border)', borderRadius: 8, color: 'var(--text-3)', fontSize: '0.83rem', textAlign: 'center' }}>
        <Archive size={16} style={{ margin: '0 auto 6px', display: 'block' }} />
        Pièces jointes, photos, vidéos — Liaison module Documents à connecter
      </div>

      <SectionTitle icon={<Wrench size={12} />}>Affectation</SectionTitle>
      <FRow>
        {inp('technicien', 'text', 'Technicien / Intervenant')}
        {inp('departement', 'text', 'Département')}
        {inp('date_intervention', 'date', 'Date intervention prévue')}
      </FRow>

      <SectionTitle icon={<CheckCircle size={12} />}>Suivi</SectionTitle>
      <FRow>
        <FField label="Statut">
          <select value={form.statut} onChange={e => set('statut', e.target.value)} style={SELECT_STYLE}>
            {STATUTS_SAV.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </FField>
      </FRow>
      <FRow>
        <div style={{ gridColumn: '1 / -1' }}>
          <FField label="Observations">
            <textarea value={form.observations} onChange={e => set('observations', e.target.value)}
              placeholder="Notes internes..." style={TEXTAREA_STYLE} />
          </FField>
        </div>
      </FRow>
      <FRow>
        <div style={{ gridColumn: '1 / -1' }}>
          <FField label="Actions prévues">
            <textarea value={form.actions_prevues} onChange={e => set('actions_prevues', e.target.value)}
              placeholder="Actions planifiées..." style={TEXTAREA_STYLE} />
          </FField>
        </div>
      </FRow>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Annuler</button>
        <button type="submit" className="btn btn-primary" disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={14} /> {saving ? 'Enregistrement...' : (initial?.id ? 'Enregistrer' : 'Créer la demande SAV')}
        </button>
      </div>
    </form>
  );
}

// ── Page Détail SAV ─────────────────────────────────────────────────────────

function DetailSAV({ sav, onBack, onEdit, onAddCR }) {
  const [tab, setTab] = useState('infos');
  const [crList, setCrList] = useState([]);
  const [crLoading, setCrLoading] = useState(false);

  useEffect(() => {
    if (!sav?.id) return;
    setCrLoading(true);
    listSavReportsBySavRequestId(sav.id)
      .then(setCrList)
      .catch(() => setCrList([]))
      .finally(() => setCrLoading(false));
  }, [sav?.id]);
  const tabs = [
    { k: 'infos',       label: 'Informations'     },
    { k: 'interventions', label: 'Interventions'  },
    { k: 'photos',      label: 'Photos'           },
    { k: 'documents',   label: 'Documents'        },
    { k: 'cr',          label: 'Compte rendu'     },
  ];

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: 20 }}>
        <button className="btn btn-ghost btn-sm" style={{ marginBottom: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={onBack}>
          <ChevronLeft size={15} /> Retour SAV
        </button>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <span style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '0.75rem', letterSpacing: '0.12em', color: 'var(--text-3)' }}>{sav.ref}</span>
              <Badge type={sav.statut} />
              <Badge type={sav.priorite} />
            </div>
            <h1 className="page-title" style={{ marginBottom: 4 }}>{sav.titre || sav.type_sav || 'Demande SAV'}</h1>
            <p className="page-subtitle">{sav.client}{sav.projet_lie ? ` — ${sav.projet_lie}` : ''}</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={onEdit}>
              <Edit2 size={13} /> Modifier
            </button>
            <button className="btn btn-primary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => onAddCR(sav)}>
              <FileText size={13} /> Compte rendu
            </button>
            <button className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Download size={13} /> Rapport
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '2px solid var(--border)', overflowX: 'auto' }}>
        {tabs.map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} style={{
            padding: '9px 18px', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
            fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '0.875rem', background: 'none',
            color: tab === t.k ? 'var(--red)' : 'var(--text-2)',
            borderBottom: tab === t.k ? '2px solid var(--red)' : '2px solid transparent',
            marginBottom: -2
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'infos' && (
        <div className="card">
          <SectionTitle icon={<User size={13} />}>Informations client</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 20 }}>
            {[
              ['Client', sav.client],
              ['Projet lié', sav.projet_lie || '—'],
              ['Réf. projet', sav.ref_projet || '—'],
              ['Contact client', sav.contact_client || '—'],
              ['Type SAV', sav.type_sav || '—'],
              ['Catégorie', sav.categorie || '—'],
              ['Date demande', sav.date_demande || '—'],
              ['Localisation', sav.localisation || '—'],
              ['Responsable', sav.responsable || sav.technicien || '—'],
              ['Titre', sav.titre || '—'],
              ['Département', sav.departement || '—'],
              ['Date intervention', sav.date_intervention || '—'],
            ].map(([lbl, val]) => (
              <div key={lbl}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>{lbl}</div>
                <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{val}</div>
              </div>
            ))}
          </div>
          {sav.description && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Description du problème</div>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-2)', lineHeight: 1.6, background: 'var(--surface-2)', padding: 12, borderRadius: 8 }}>{sav.description}</p>
            </div>
          )}
          {sav.observations && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Observations</div>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-2)', lineHeight: 1.6 }}>{sav.observations}</p>
            </div>
          )}
          {sav.actions_prevues && (
            <div>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Actions prévues</div>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-2)', lineHeight: 1.6 }}>{sav.actions_prevues}</p>
            </div>
          )}
        </div>
      )}

      {tab === 'interventions' && (
        <div className="card">
          <SectionTitle icon={<Wrench size={13} />}>Historique des interventions</SectionTitle>
          <EmptyState icon={<Wrench size={22} />} title="Aucune intervention" sub="Les interventions réalisées apparaîtront ici" />
        </div>
      )}

      {tab === 'photos' && (
        <div className="card">
          <SectionTitle icon={<Archive size={13} />}>Photos</SectionTitle>
          <EmptyState icon={<Archive size={22} />} title="Aucune photo" sub="Photos avant/après intervention — Backend-ready" />
        </div>
      )}

      {tab === 'documents' && (
        <div className="card">
          <SectionTitle icon={<FileText size={13} />}>Documents</SectionTitle>
          <EmptyState icon={<FileText size={22} />} title="Aucun document" sub="PV, rapports, pièces jointes — Backend-ready" />
        </div>
      )}

      {tab === 'cr' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <SectionTitle icon={<FileText size={13} />}>Comptes rendus SAV</SectionTitle>
            <button className="btn btn-primary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => onAddCR(sav)}>
              <Plus size={14} /> Nouveau CR
            </button>
          </div>
          {crLoading ? (
            <p style={{ fontSize: '0.84rem', color: 'var(--text-3)' }}>Chargement...</p>
          ) : crList.length === 0 ? (
            <EmptyState icon={<FileText size={22} />} title="Aucun compte rendu" sub="Créez un compte rendu d'intervention pour ce SAV" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {crList.map(c => (
                <div key={c.id} style={{ padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: '0.84rem' }}>
                  <strong style={{ color: 'var(--red)' }}>{c.ref}</strong> — {fmtDateCr(c.date_compte_rendu)} — {c.intervenant || '—'}
                  {c.resume_intervention && <p style={{ margin: '6px 0 0', color: 'var(--text-2)' }}>{c.resume_intervention}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function fmtDateCr(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('fr-FR'); } catch { return d; }
}

// ── Module principal SAVModule ───────────────────────────────────────────────

export default function SAVModule({ prefillProjet, onGoCompteRendu }) {
  const {
    records: savList, loading, saving, error, configured, load,
    create, update, remove, fetchOne, filterSavRequests, generateSavRef,
  } = useSavRequests();

  const [projects, setProjects] = useState([]);
  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [filterPriorite, setFilterPriorite] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editSAV, setEditSAV] = useState(null);
  const [detailSAV, setDetailSAV] = useState(null);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    if (!configured) return;
    listProjects().then(setProjects).catch(() => {});
  }, [configured]);

  useEffect(() => {
    if (!prefillProjet) return;
    setEditSAV({
      ...EMPTY_FORM,
      project_id: prefillProjet.id || '',
      projet_lie: prefillProjet.nom || '',
      ref_projet: prefillProjet.ref || '',
      client: prefillProjet.client || prefillProjet.client_nom || '',
      client_id: prefillProjet.client_id || '',
    });
    setShowModal(true);
  }, [prefillProjet]);

  const handleSave = useCallback(async (data) => {
    const payload = editSAV?.id
      ? { ...data, id: editSAV.id, ref: editSAV.ref }
      : { ...data, ref: data.ref || await generateSavRef().catch(() => '') };
    const result = editSAV?.id ? await update(editSAV.id, payload) : await create(payload);
    if (!result.success) {
      alert(result.error || 'Erreur enregistrement.');
      return;
    }
    setShowModal(false);
    setEditSAV(null);
  }, [editSAV, create, update, generateSavRef]);

  const handleDelete = useCallback(async (id) => {
    if (!window.confirm('Confirmer la suppression de cette demande SAV ?')) return;
    const result = await remove(id);
    if (!result.success) alert(result.error || 'Erreur suppression.');
  }, [remove]);

  const openDetail = useCallback(async (s) => {
    try {
      const full = await fetchOne(s.id);
      setDetailSAV(full);
    } catch (err) {
      alert(err.message || 'Impossible de charger le SAV.');
    }
  }, [fetchOne]);

  const openEdit = useCallback(async (s) => {
    try {
      const full = await fetchOne(s.id);
      setEditSAV(full);
      setShowModal(true);
    } catch (err) {
      alert(err.message || 'Impossible de charger le SAV.');
    }
  }, [fetchOne]);

  const filtered = filterSavRequests(savList, {
    search,
    statut: filterStatut,
    priorite: filterPriorite,
  });

  // KPIs
  const ouvertes = savList.filter(s => ['nouvelle', 'en_attente', 'planifiee', 'en_cours'].includes(s.statut)).length;
  const urgentes  = savList.filter(s => ['urgente', 'critique'].includes(s.priorite)).length;
  const terminees = savList.filter(s => s.statut === 'terminee').length;
  const attente   = savList.filter(s => s.statut === 'en_attente').length;
  const cloturees = savList.filter(s => s.statut === 'cloturee').length;

  // Détail SAV
  if (detailSAV) {
    return (
      <DetailSAV
        sav={detailSAV}
        onBack={() => setDetailSAV(null)}
        onEdit={() => { openEdit(detailSAV); setDetailSAV(null); }}
        onAddCR={onGoCompteRendu}
      />
    );
  }

  return (
    <div className="animate-fade-in">
      {!configured && (
        <div style={{ background: '#FFF8E1', color: '#E65100', borderRadius: 8, padding: '10px 14px', fontSize: '0.85rem', marginBottom: 16 }}>
          Supabase non configuré — exécutez le SQL SAV puis rechargez.
        </div>
      )}
      {error && (
        <div style={{ background: '#FFEBEE', color: 'var(--red)', borderRadius: 8, padding: '10px 14px', fontSize: '0.85rem', marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
          <AlertCircle size={15} /> {error}
          <button type="button" className="btn btn-ghost btn-sm" onClick={load} style={{ marginLeft: 'auto' }}>Réessayer</button>
        </div>
      )}
      {/* Header */}
      <div className="page-header flex-between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title">SERVICE APRÈS-VENTE</h1>
          <p className="page-subtitle">Gestion des demandes SAV clients et interventions.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={load} title="Actualiser">
            <RefreshCw size={14} />
          </button>
          <button type="button" className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setShowFilters(f => !f)}>
            <Filter size={14} /> Filtres
          </button>
          <button className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Download size={14} /> Export
          </button>
          <button className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => { setEditSAV(null); setShowModal(true); }}>
            <Plus size={15} /> Nouvelle demande SAV
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(165px, 1fr))', marginBottom: 20 }}>
        <KpiCard icon={<MessageSquare size={17} />}   label="Demandes ouvertes"  value={ouvertes}  color="blue"   />
        <KpiCard icon={<AlertTriangle size={17} />}   label="Urgentes / Critiques" value={urgentes} color="red"    />
        <KpiCard icon={<CheckCircle size={17} />}     label="Terminées"          value={terminees} color="green"  />
        <KpiCard icon={<Clock size={17} />}           label="En attente"         value={attente}   color="orange" />
        <KpiCard icon={<Archive size={17} />}         label="Clôturées"          value={cloturees} color="grey"   />
      </div>

      {/* Filtres */}
      {showFilters && (
        <div className="card" style={{ marginBottom: 16, padding: '14px 20px' }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Référence, client, projet..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
            </div>
            <select value={filterStatut} onChange={e => setFilterStatut(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 190 }}>
              <option value="">Tous les statuts</option>
              {STATUTS_SAV.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <select value={filterPriorite} onChange={e => setFilterPriorite(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 160 }}>
              <option value="">Toutes priorités</option>
              {PRIORITES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFilterStatut(''); setFilterPriorite(''); }}>Réinitialiser</button>
          </div>
        </div>
      )}

      {/* Barre recherche rapide */}
      {!showFilters && (
        <div className="card" style={{ marginBottom: 16, padding: '12px 16px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher une demande SAV..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
          </div>
        </div>
      )}

      {/* Tableau */}
      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-3)' }}>Chargement SAV...</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={<MessageSquare size={24} />} title="Aucune demande SAV" sub="Créez votre première demande de service après-vente" action="Nouvelle demande SAV" onAction={() => { setEditSAV(null); setShowModal(true); }} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Réf. SAV</th>
                  <th>Client</th>
                  <th>Projet</th>
                  <th>Titre</th>
                  <th>Type</th>
                  <th>Priorité</th>
                  <th>Date demande</th>
                  <th>Responsable</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => (
                  <tr key={s.id}>
                    <td style={{ fontFamily: 'var(--font-head)', fontWeight: 700, color: 'var(--red)', whiteSpace: 'nowrap' }}>{s.ref}</td>
                    <td style={{ fontWeight: 600 }}>{s.client}</td>
                    <td>{s.projet_lie || '—'}</td>
                    <td>{s.titre || '—'}</td>
                    <td>{s.type_sav || '—'}</td>
                    <td><Badge type={s.priorite} /></td>
                    <td style={{ whiteSpace: 'nowrap' }}>{s.date_demande || '—'}</td>
                    <td>{s.responsable || s.technicien || '—'}</td>
                    <td><Badge type={s.statut} /></td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button type="button" className="btn btn-secondary btn-sm" title="Voir" onClick={() => openDetail(s)}><Eye size={13} /></button>
                        <button type="button" className="btn btn-ghost btn-sm" title="Modifier" onClick={() => openEdit(s)}><Edit2 size={13} /></button>
                        <button className="btn btn-ghost btn-sm" title="Compte rendu" onClick={() => onGoCompteRendu && onGoCompteRendu(s)} style={{ color: 'var(--text-3)' }}><FileText size={13} /></button>
                        <button className="btn btn-ghost btn-sm" title="Supprimer" onClick={() => handleDelete(s.id)} style={{ color: 'var(--red)' }}><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal formulaire */}
      <Modal open={showModal} onClose={() => { setShowModal(false); setEditSAV(null); }} title={editSAV && editSAV.id ? 'Modifier la demande SAV' : 'Nouvelle demande SAV'} width={760}>
        <FormulaireSAV initial={editSAV} onSave={handleSave} onCancel={() => { setShowModal(false); setEditSAV(null); }} saving={saving} projects={projects} />
      </Modal>
    </div>
  );
}

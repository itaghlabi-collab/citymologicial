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
  HardHat, Users, ClipboardList, Layers, Gauge
} from 'lucide-react';
import { useState, useCallback } from 'react';

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
    planifie:   { cls: 'badge-blue',   label: 'Planifié'   },
    en_cours:   { cls: 'badge-orange', label: 'En cours'   },
    suspendu:   { cls: 'badge-red',    label: 'Suspendu'   },
    termine:    { cls: 'badge-green',  label: 'Terminé'    },
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
  { value: 'planifie',  label: 'Planifié'  },
  { value: 'en_cours',  label: 'En cours'  },
  { value: 'suspendu',  label: 'Suspendu'  },
  { value: 'termine',   label: 'Terminé'   },
  { value: 'en_retard', label: 'En retard' },
];

const PRIORITES = [
  { value: 'faible',  label: 'Faible'  },
  { value: 'normale', label: 'Normale' },
  { value: 'haute',   label: 'Haute'   },
  { value: 'urgente', label: 'Urgente' },
];

const EMPTY_FORM = {
  nom: '', client: '', chef_projet: '', chef_chantier: '', devis_lie: '',
  budget_approuve: '', date_debut: '', date_fin_prevue: '', description: '',
  ville: '', adresse_chantier: '', statut: 'planifie', priorite: 'normale',
  avancement: 0, observations: '',
};

function genRef() {
  return 'PRJ-' + new Date().getFullYear() + '-' + String(Math.floor(Math.random() * 900) + 100);
}

// ── Formulaire Projet ────────────────────────────────────────────────────────

function FormulaireProjet({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const [errors, setErrors] = useState({});

  function validate() {
    const e = {};
    if (!form.nom.trim()) e.nom = 'Requis';
    if (!form.client.trim()) e.client = 'Requis';
    return e;
  }

  function handleSubmit(ev) {
    ev.preventDefault();
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    onSave({ ...form, avancement: Number(form.avancement) || 0, budget_approuve: Number(form.budget_approuve) || 0 });
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
      <FRow>{inp('nom', 'text', 'Nom du projet', true)}{inp('client', 'text', 'Client (lié CRM)', true)}</FRow>
      <FRow>{inp('chef_projet', 'text', 'Chef de projet')}{inp('chef_chantier', 'text', 'Chef de chantier')}</FRow>
      <FRow>{inp('devis_lie', 'text', 'Référence devis lié')}{inp('budget_approuve', 'number', 'Budget approuvé (MAD)')}</FRow>
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

      <SectionTitle icon={<Archive size={12} />}>Documents</SectionTitle>
      <div style={{ background: 'var(--surface-2)', border: '2px dashed var(--border)', borderRadius: 8, padding: '18px 20px', marginBottom: 20, color: 'var(--text-3)', fontSize: '0.84rem', textAlign: 'center' }}>
        <Archive size={18} style={{ margin: '0 auto 8px', display: 'block' }} />
        Plans, devis, photos, documents chantier — Liaison avec le module Documents à connecter
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Annuler</button>
        <button type="submit" className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={14} /> {initial ? 'Enregistrer' : 'Créer le projet'}
        </button>
      </div>
    </form>
  );
}

// ── Page Détail Projet ───────────────────────────────────────────────────────

function DetailProjet({ projet, onBack, onEdit, onAddSAV }) {
  const [activeTab, setActiveTab] = useState('general');

  const tabs = [
    { k: 'general',    label: 'Vue générale'     },
    { k: 'budget',     label: 'Budget'           },
    { k: 'planning',   label: 'Planning'         },
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
            <button className="btn btn-primary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => onAddSAV(projet)}>
              <AlertCircle size={13} /> Nouveau SAV
            </button>
            <button className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Download size={13} /> Fiche projet
            </button>
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
              ['Chef de projet', projet.chef_projet || '—'],
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
          <div style={{ padding: '40px 24px', background: 'var(--surface-2)', borderRadius: 8, textAlign: 'center', color: 'var(--text-3)' }}>
            <Calendar size={32} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.4 }} />
            <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '1rem', color: 'var(--text-2)', marginBottom: 6 }}>Module Planning</div>
            <div style={{ fontSize: '0.84rem' }}>Diagramme de Gantt et jalons — Backend-ready</div>
          </div>
        </div>
      )}

      {/* Tab: documents */}
      {activeTab === 'documents' && (
        <div className="card">
          <SectionTitle icon={<Archive size={13} />}>Documents & Photos</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
            {['Plans', 'Devis', 'Photos chantier', 'Documents contractuels'].map(cat => (
              <div key={cat} style={{ border: '2px dashed var(--border)', borderRadius: 8, padding: 16, textAlign: 'center', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--red)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                <FileText size={20} style={{ color: 'var(--text-3)', margin: '0 auto 8px', display: 'block' }} />
                <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-2)' }}>{cat}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', marginTop: 4 }}>0 fichier</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab: équipe */}
      {activeTab === 'equipe' && (
        <div className="card">
          <SectionTitle icon={<Users size={13} />}>Équipe affectée</SectionTitle>
          <EmptyState icon={<Users size={22} />} title="Aucun membre affecté" sub="Affectez des collaborateurs à ce projet" action="Affecter un membre" onAction={() => {}} />
        </div>
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

export default function ProjetsList({ onGoSAV }) {
  const [projets, setProjets] = useState([]);
  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editProjet, setEditProjet] = useState(null);
  const [detailProjet, setDetailProjet] = useState(null);
  const [showFilters, setShowFilters] = useState(false);

  const handleSave = useCallback((data) => {
    if (editProjet) {
      setProjets(prev => prev.map(p => p.id === editProjet.id ? { ...p, ...data } : p));
    } else {
      setProjets(prev => [...prev, { ...data, id: Date.now(), ref: genRef(), budget_consomme: 0 }]);
    }
    setShowModal(false);
    setEditProjet(null);
  }, [editProjet]);

  const handleDelete = useCallback((id) => {
    if (window.confirm('Confirmer la suppression de ce projet ?')) {
      setProjets(prev => prev.filter(p => p.id !== id));
    }
  }, []);

  const filtered = projets.filter(p => {
    const q = search.toLowerCase();
    const matchQ = !q || p.nom.toLowerCase().includes(q) || (p.client || '').toLowerCase().includes(q) || p.ref.toLowerCase().includes(q);
    const matchS = !filterStatut || p.statut === filterStatut;
    return matchQ && matchS;
  });

  // KPIs
  const total     = projets.length;
  const enCours   = projets.filter(p => p.statut === 'en_cours').length;
  const termines  = projets.filter(p => p.statut === 'termine').length;
  const enRetard  = projets.filter(p => p.statut === 'en_retard').length;
  const budgetTotal = projets.reduce((s, p) => s + (p.budget_approuve || 0), 0);
  const budgetConso = projets.reduce((s, p) => s + (p.budget_consomme || 0), 0);

  // Détail projet
  if (detailProjet) {
    const p = projets.find(x => x.id === detailProjet);
    if (!p) { setDetailProjet(null); return null; }
    return (
      <DetailProjet
        projet={p}
        onBack={() => setDetailProjet(null)}
        onEdit={() => { setEditProjet(p); setShowModal(true); setDetailProjet(null); }}
        onAddSAV={onGoSAV}
      />
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="page-header flex-between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title">PROJETS</h1>
          <p className="page-subtitle">Gestion des projets, budgets et suivi chantier.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
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
            <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFilterStatut(''); }}>Réinitialiser</button>
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
        {filtered.length === 0 ? (
          <EmptyState icon={<FolderOpen size={24} />} title="Aucun projet" sub="Créez votre premier projet chantier" action="Ajouter un projet" onAction={() => { setEditProjet(null); setShowModal(true); }} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Réf.</th>
                  <th>Nom projet</th>
                  <th>Client</th>
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
                    <td style={{ fontWeight: 600 }}>{p.nom}</td>
                    <td>{p.client || '—'}</td>
                    <td>{p.chef_projet || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{(p.budget_approuve || 0).toLocaleString('fr-MA')} MAD</td>
                    <td style={{ minWidth: 130 }}><ProgressBar value={p.avancement} /></td>
                    <td style={{ whiteSpace: 'nowrap' }}>{p.date_debut || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{p.date_fin_prevue || '—'}</td>
                    <td><Badge type={p.statut} /></td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'nowrap' }}>
                        <button className="btn btn-secondary btn-sm" title="Voir" onClick={() => setDetailProjet(p.id)}><Eye size={13} /></button>
                        <button className="btn btn-ghost btn-sm" title="Modifier" onClick={() => { setEditProjet(p); setShowModal(true); }}><Edit2 size={13} /></button>
                        <button className="btn btn-ghost btn-sm" title="SAV" onClick={() => onGoSAV && onGoSAV(p)} style={{ color: 'var(--text-3)' }}><AlertCircle size={13} /></button>
                        <button className="btn btn-ghost btn-sm" title="Supprimer" onClick={() => handleDelete(p.id)} style={{ color: 'var(--red)' }}><Trash2 size={13} /></button>
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
      <Modal open={showModal} onClose={() => { setShowModal(false); setEditProjet(null); }} title={editProjet ? 'Modifier le projet' : 'Nouveau projet'} width={760}>
        <FormulaireProjet initial={editProjet} onSave={handleSave} onCancel={() => { setShowModal(false); setEditProjet(null); }} />
      </Modal>
    </div>
  );
}

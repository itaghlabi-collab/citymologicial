/**
 * ComptesRendusSAV.jsx — Sous-module Comptes Rendus SAV ERP CITYMO
 * Rapports d'interventions SAV
 * Backend-ready / Database-ready
 */

import {
  FileText, Plus, Edit2, Trash2, Eye, Download, Search, Filter,
  X, ChevronLeft, CheckCircle, Clock, AlertCircle, User,
  Calendar, DollarSign, Archive, Wrench, Send, Star
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
    brouillon: { cls: 'badge-grey',   label: 'Brouillon' },
    soumis:    { cls: 'badge-blue',   label: 'Soumis'    },
    valide:    { cls: 'badge-green',  label: 'Validé'    },
    refuse:    { cls: 'badge-red',    label: 'Refusé'    },
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

// ── Constantes ───────────────────────────────────────────────────────────────

const STATUTS_CR = [
  { value: 'brouillon', label: 'Brouillon' },
  { value: 'soumis',    label: 'Soumis'    },
  { value: 'valide',    label: 'Validé'    },
  { value: 'refuse',    label: 'Refusé'    },
];

const VALIDATION_CLIENT = ['En attente', 'Validé par client', 'Refusé par client'];

const EMPTY_FORM = {
  sav_lie: '', projet_lie: '', client: '', intervenant: '',
  date_intervention: new Date().toISOString().slice(0, 10),
  resume_intervention: '', actions_realisees: '', pieces_remplacees: '',
  cout_intervention: '', recommandations: '', validation_client: 'En attente',
  statut: 'brouillon', observations: '',
};

function genRefCR() {
  return 'CR-' + new Date().getFullYear() + '-' + String(Math.floor(Math.random() * 900) + 100);
}

// ── Formulaire Compte Rendu ──────────────────────────────────────────────────

function FormulaireCompteRendu({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  function validate() {
    const e = {};
    if (!form.client.trim()) e.client = 'Requis';
    if (!form.intervenant.trim()) e.intervenant = 'Requis';
    if (!form.resume_intervention.trim()) e.resume_intervention = 'Requis';
    return e;
  }

  function handleSubmit(ev) {
    ev.preventDefault();
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    onSave({ ...form, cout_intervention: Number(form.cout_intervention) || 0 });
  }

  const inp = (k, type, ph, req) => (
    <FField label={ph} required={req}>
      <input type={type || 'text'} placeholder={ph} value={form[k]} onChange={e => set(k, e.target.value)}
        style={{ ...INPUT_STYLE, borderColor: errors[k] ? 'var(--red)' : 'var(--border)' }} />
      {errors[k] && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors[k]}</div>}
    </FField>
  );

  const ta = (k, ph, req) => (
    <FField label={ph} required={req}>
      <textarea value={form[k]} onChange={e => set(k, e.target.value)} placeholder={ph}
        style={{ ...TEXTAREA_STYLE, borderColor: errors[k] ? 'var(--red)' : 'var(--border)' }} />
      {errors[k] && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginTop: 3 }}>{errors[k]}</div>}
    </FField>
  );

  return (
    <form onSubmit={handleSubmit}>
      <SectionTitle icon={<FileText size={12} />}>Référence</SectionTitle>
      <FRow>
        {inp('sav_lie', 'text', 'Demande SAV liée')}
        {inp('projet_lie', 'text', 'Projet lié')}
        {inp('client', 'text', 'Client', true)}
      </FRow>
      <FRow>
        {inp('intervenant', 'text', 'Intervenant', true)}
        {inp('date_intervention', 'date', 'Date intervention')}
      </FRow>

      <SectionTitle icon={<Wrench size={12} />}>Intervention</SectionTitle>
      <div style={{ marginBottom: 14 }}>
        {ta('resume_intervention', 'Résumé de l\'intervention', true)}
      </div>
      <div style={{ marginBottom: 14 }}>
        {ta('actions_realisees', 'Actions réalisées (liste des travaux)')}
      </div>
      <div style={{ marginBottom: 14 }}>
        {ta('pieces_remplacees', 'Pièces remplacées / matériaux utilisés')}
      </div>
      <FRow>
        {inp('cout_intervention', 'number', 'Coût intervention (MAD)')}
      </FRow>
      <div style={{ marginBottom: 14 }}>
        {ta('recommandations', 'Recommandations pour le client')}
      </div>

      <SectionTitle icon={<CheckCircle size={12} />}>Validation</SectionTitle>
      <FRow>
        <FField label="Validation client">
          <select value={form.validation_client} onChange={e => set('validation_client', e.target.value)} style={SELECT_STYLE}>
            {VALIDATION_CLIENT.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </FField>
        <FField label="Statut du compte rendu">
          <select value={form.statut} onChange={e => set('statut', e.target.value)} style={SELECT_STYLE}>
            {STATUTS_CR.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </FField>
      </FRow>

      <SectionTitle icon={<Archive size={12} />}>Photos & Signature</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
        <div style={{ border: '2px dashed var(--border)', borderRadius: 8, padding: 16, textAlign: 'center', color: 'var(--text-3)', fontSize: '0.83rem' }}>
          <Archive size={18} style={{ margin: '0 auto 8px', display: 'block' }} />
          Photos avant / après
        </div>
        <div style={{ border: '2px dashed var(--border)', borderRadius: 8, padding: 16, textAlign: 'center', color: 'var(--text-3)', fontSize: '0.83rem' }}>
          <User size={18} style={{ margin: '0 auto 8px', display: 'block' }} />
          Signature client
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Annuler</button>
        <button type="submit" className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={14} /> {initial && initial.id ? 'Enregistrer' : 'Créer le compte rendu'}
        </button>
      </div>
    </form>
  );
}

// ── Page Détail CR ───────────────────────────────────────────────────────────

function DetailCR({ cr, onBack, onEdit }) {
  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: 20 }}>
        <button className="btn btn-ghost btn-sm" style={{ marginBottom: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={onBack}>
          <ChevronLeft size={15} /> Retour
        </button>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <span style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '0.75rem', letterSpacing: '0.12em', color: 'var(--text-3)' }}>{cr.ref}</span>
              <Badge type={cr.statut} />
            </div>
            <h1 className="page-title" style={{ marginBottom: 4 }}>Compte rendu SAV</h1>
            <p className="page-subtitle">{cr.client}{cr.projet_lie ? ` — ${cr.projet_lie}` : ''}</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={onEdit}>
              <Edit2 size={13} /> Modifier
            </button>
            <button className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Download size={13} /> PDF
            </button>
            <button className="btn btn-primary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Send size={13} /> Envoyer client
            </button>
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', marginBottom: 20 }}>
        <KpiCard icon={<User size={17} />}        label="Intervenant"        value={cr.intervenant || '—'}                                  color="blue"   />
        <KpiCard icon={<Calendar size={17} />}    label="Date intervention"  value={cr.date_intervention || '—'}                            color="grey"   />
        <KpiCard icon={<DollarSign size={17} />}  label="Coût intervention"  value={(cr.cout_intervention || 0).toLocaleString('fr-MA') + ' MAD'} color="orange" />
        <KpiCard icon={<CheckCircle size={17} />} label="Validation client"  value={cr.validation_client || '—'}                            color={cr.validation_client === 'Validé par client' ? 'green' : 'grey'} />
      </div>

      {/* Contenu */}
      <div className="card">
        <SectionTitle icon={<FileText size={13} />}>Détail de l'intervention</SectionTitle>

        {cr.sav_lie && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>SAV lié</div>
            <span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, color: 'var(--red)' }}>{cr.sav_lie}</span>
          </div>
        )}

        {cr.resume_intervention && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Résumé de l'intervention</div>
            <p style={{ fontSize: '0.88rem', lineHeight: 1.6, color: 'var(--text-2)', background: 'var(--surface-2)', padding: '12px 14px', borderRadius: 8 }}>{cr.resume_intervention}</p>
          </div>
        )}

        {cr.actions_realisees && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Actions réalisées</div>
            <p style={{ fontSize: '0.88rem', lineHeight: 1.6, color: 'var(--text-2)' }}>{cr.actions_realisees}</p>
          </div>
        )}

        {cr.pieces_remplacees && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Pièces remplacées</div>
            <p style={{ fontSize: '0.88rem', lineHeight: 1.6, color: 'var(--text-2)' }}>{cr.pieces_remplacees}</p>
          </div>
        )}

        {cr.recommandations && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Recommandations</div>
            <p style={{ fontSize: '0.88rem', lineHeight: 1.6, color: 'var(--text-2)' }}>{cr.recommandations}</p>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 20 }}>
          <div style={{ border: '2px dashed var(--border)', borderRadius: 8, padding: 24, textAlign: 'center', color: 'var(--text-3)', fontSize: '0.83rem' }}>
            <Archive size={20} style={{ margin: '0 auto 8px', display: 'block' }} />
            Photos avant / après
          </div>
          <div style={{ border: '2px dashed var(--border)', borderRadius: 8, padding: 24, textAlign: 'center', color: 'var(--text-3)', fontSize: '0.83rem' }}>
            <User size={20} style={{ margin: '0 auto 8px', display: 'block' }} />
            Signature client — {cr.validation_client}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Module principal ComptesRendusSAV ────────────────────────────────────────

export default function ComptesRendusSAV({ prefillSAV }) {
  const [crList, setCrList] = useState([]);
  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editCR, setEditCR] = useState(null);
  const [detailCR, setDetailCR] = useState(null);
  const [showFilters, setShowFilters] = useState(false);

  const [usedPrefill, setUsedPrefill] = useState(false);
  if (prefillSAV && !usedPrefill) {
    setUsedPrefill(true);
    setEditCR({ ...EMPTY_FORM, sav_lie: prefillSAV.ref || '', client: prefillSAV.client || '', projet_lie: prefillSAV.projet_lie || '' });
    setShowModal(true);
  }

  const handleSave = useCallback((data) => {
    if (editCR && editCR.id) {
      setCrList(prev => prev.map(c => c.id === editCR.id ? { ...c, ...data } : c));
    } else {
      setCrList(prev => [...prev, { ...data, id: Date.now(), ref: genRefCR() }]);
    }
    setShowModal(false);
    setEditCR(null);
  }, [editCR]);

  const handleDelete = useCallback((id) => {
    if (window.confirm('Confirmer la suppression de ce compte rendu ?')) {
      setCrList(prev => prev.filter(c => c.id !== id));
    }
  }, []);

  const filtered = crList.filter(c => {
    const q = search.toLowerCase();
    const matchQ = !q || c.client.toLowerCase().includes(q) || c.ref.toLowerCase().includes(q) || (c.intervenant || '').toLowerCase().includes(q);
    const matchS = !filterStatut || c.statut === filterStatut;
    return matchQ && matchS;
  });

  // KPIs
  const total          = crList.length;
  const attentValidation = crList.filter(c => c.validation_client === 'En attente').length;
  const valides        = crList.filter(c => c.statut === 'valide').length;
  const satisfaits     = crList.filter(c => c.validation_client === 'Validé par client').length;

  // Détail
  if (detailCR) {
    const c = crList.find(x => x.id === detailCR);
    if (!c) { setDetailCR(null); return null; }
    return (
      <DetailCR
        cr={c}
        onBack={() => setDetailCR(null)}
        onEdit={() => { setEditCR(c); setShowModal(true); setDetailCR(null); }}
      />
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="page-header flex-between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title">COMPTES RENDUS SAV</h1>
          <p className="page-subtitle">Suivi et rapports des interventions SAV.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setShowFilters(f => !f)}>
            <Filter size={14} /> Filtres
          </button>
          <button className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Download size={14} /> Export
          </button>
          <button className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => { setEditCR(null); setShowModal(true); }}>
            <Plus size={15} /> Nouveau compte rendu
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))', marginBottom: 20 }}>
        <KpiCard icon={<FileText size={17} />}       label="Interventions réalisées"       value={total}             color="blue"   />
        <KpiCard icon={<Clock size={17} />}           label="En attente validation"         value={attentValidation}  color="orange" />
        <KpiCard icon={<CheckCircle size={17} />}     label="CRs validés"                  value={valides}           color="green"  />
        <KpiCard icon={<Star size={17} />}            label="Clients satisfaits"            value={satisfaits}        color="green"  />
      </div>

      {/* Filtres */}
      {showFilters && (
        <div className="card" style={{ marginBottom: 16, padding: '14px 20px' }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Référence, client, intervenant..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
            </div>
            <select value={filterStatut} onChange={e => setFilterStatut(e.target.value)} style={{ ...SELECT_STYLE, maxWidth: 190 }}>
              <option value="">Tous les statuts</option>
              {STATUTS_CR.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setFilterStatut(''); }}>Réinitialiser</button>
          </div>
        </div>
      )}

      {/* Barre recherche rapide */}
      {!showFilters && (
        <div className="card" style={{ marginBottom: 16, padding: '12px 16px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un compte rendu..." style={{ ...INPUT_STYLE, paddingLeft: 32 }} />
          </div>
        </div>
      )}

      {/* Tableau */}
      <div className="card" style={{ padding: 0 }}>
        {filtered.length === 0 ? (
          <EmptyState icon={<FileText size={24} />} title="Aucun compte rendu" sub="Créez votre premier compte rendu d'intervention SAV" action="Nouveau compte rendu" onAction={() => { setEditCR(null); setShowModal(true); }} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Référence</th>
                  <th>Client</th>
                  <th>Projet</th>
                  <th>Intervenant</th>
                  <th>Date</th>
                  <th>Validation</th>
                  <th>Coût (MAD)</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id}>
                    <td style={{ fontFamily: 'var(--font-head)', fontWeight: 700, color: 'var(--red)', whiteSpace: 'nowrap' }}>{c.ref}</td>
                    <td style={{ fontWeight: 600 }}>{c.client}</td>
                    <td>{c.projet_lie || '—'}</td>
                    <td>{c.intervenant || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{c.date_intervention || '—'}</td>
                    <td>
                      <span className={`badge ${c.validation_client === 'Validé par client' ? 'badge-green' : c.validation_client === 'Refusé par client' ? 'badge-red' : 'badge-grey'}`}>
                        {c.validation_client}
                      </span>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{(c.cout_intervention || 0).toLocaleString('fr-MA')}</td>
                    <td><Badge type={c.statut} /></td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-secondary btn-sm" title="Voir" onClick={() => setDetailCR(c.id)}><Eye size={13} /></button>
                        <button className="btn btn-ghost btn-sm" title="Modifier" onClick={() => { setEditCR(c); setShowModal(true); }}><Edit2 size={13} /></button>
                        <button className="btn btn-ghost btn-sm" title="PDF" style={{ color: 'var(--text-3)' }}><Download size={13} /></button>
                        <button className="btn btn-ghost btn-sm" title="Envoyer" style={{ color: '#1565C0' }}><Send size={13} /></button>
                        <button className="btn btn-ghost btn-sm" title="Supprimer" onClick={() => handleDelete(c.id)} style={{ color: 'var(--red)' }}><Trash2 size={13} /></button>
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
      <Modal open={showModal} onClose={() => { setShowModal(false); setEditCR(null); }} title={editCR && editCR.id ? 'Modifier le compte rendu' : 'Nouveau compte rendu SAV'} width={760}>
        <FormulaireCompteRendu initial={editCR} onSave={handleSave} onCancel={() => { setShowModal(false); setEditCR(null); }} />
      </Modal>
    </div>
  );
}

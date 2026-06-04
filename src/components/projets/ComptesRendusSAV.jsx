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
import { useState, useCallback, useEffect } from 'react';
import { useSavReports } from '../../hooks/useSavReports';
import { useSavRequests } from '../../hooks/useSavRequests';
import { listProjects } from '../../services/projects/projects';
import { getSavRequestById } from '../../services/projects/savRequests';
import { generateSavReportPdf } from '../../services/projects/savReportPdf';
import { persistSavReportMedia } from '../../services/projects/savReports';
import { resolveProjectFileUrl } from '../../services/projects/savReportStorage';
import { STATUT_APRES_INTERVENTION, statutApresInterventionLabel } from '../../constants/sav';
import SavReportMediaFields, { buildSavReportMediaDraft } from './SavReportMediaFields';

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

function SavDemandeRecap({ sav }) {
  if (!sav) return null;
  const rows = [
    ['Réf. SAV', sav.ref],
    ['Titre', sav.titre],
    ['Type', sav.type_sav || sav.type_probleme],
    ['Catégorie', sav.categorie],
    ['Priorité', sav.priorite],
    ['Statut demande', sav.statut_label || sav.statut],
    ['Date demande', sav.date_demande],
    ['Responsable', sav.responsable || sav.technicien],
    ['Localisation', sav.localisation],
    ['Contact', sav.contact_client],
    ['Date interv. prévue', sav.date_intervention],
  ].filter(([, v]) => v);

  return (
    <div style={{ marginBottom: 18, padding: '14px 16px', background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--border)' }}>
      <div style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
        Récapitulatif demande SAV
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: sav.description ? 12 : 0 }}>
        {rows.map(([lbl, val]) => (
          <div key={lbl}>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 2 }}>{lbl}</div>
            <div style={{ fontSize: '0.86rem', fontWeight: 600 }}>{val}</div>
          </div>
        ))}
      </div>
      {sav.description && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 4 }}>Description</div>
          <p style={{ fontSize: '0.84rem', lineHeight: 1.55, color: 'var(--text-2)', margin: 0 }}>{sav.description}</p>
        </div>
      )}
      {sav.observations && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 4 }}>Observations</div>
          <p style={{ fontSize: '0.84rem', lineHeight: 1.55, color: 'var(--text-2)', margin: 0 }}>{sav.observations}</p>
        </div>
      )}
      {sav.actions_prevues && (
        <div>
          <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 4 }}>Actions prévues</div>
          <p style={{ fontSize: '0.84rem', lineHeight: 1.55, color: 'var(--text-2)', margin: 0 }}>{sav.actions_prevues}</p>
        </div>
      )}
    </div>
  );
}

const EMPTY_FORM = {
  sav_request_id: '', project_id: '', sav_lie: '', projet_lie: '', client: '', intervenant: '',
  date_compte_rendu: new Date().toISOString().slice(0, 10),
  date_intervention: new Date().toISOString().slice(0, 10),
  resume_intervention: '', actions_realisees: '', actions_a_prevoir: '',
  statut_apres_intervention: '', pieces_remplacees: '',
  cout_intervention: '', recommandations: '', validation_client: 'En attente',
  statut: 'brouillon', observation: '', observations: '',
};

function CrMediaGallery({ cr }) {
  const [avantUrls, setAvantUrls] = useState([]);
  const [apresUrls, setApresUrls] = useState([]);
  const [sigUrl, setSigUrl] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const avant = (cr.photos_avant || []).map((p) => resolveProjectFileUrl(p.path));
      const apres = (cr.photos_apres || []).map((p) => resolveProjectFileUrl(p.path));
      const urlsA = await Promise.all(avant);
      const urlsP = await Promise.all(apres);
      const sig = cr.signature_path ? await resolveProjectFileUrl(cr.signature_path) : '';
      if (!cancelled) {
        setAvantUrls(urlsA.filter(Boolean));
        setApresUrls(urlsP.filter(Boolean));
        setSigUrl(sig || '');
      }
    })();
    return () => { cancelled = true; };
  }, [cr.id, cr.photos_avant, cr.photos_apres, cr.signature_path]);

  const hasMedia = avantUrls.length || apresUrls.length || sigUrl || cr.signature_client_nom;
  if (!hasMedia) {
    return (
      <p style={{ fontSize: '0.84rem', color: 'var(--text-3)', marginTop: 16 }}>Aucune photo ni signature enregistrée.</p>
    );
  }

  return (
    <div style={{ marginTop: 20 }}>
      <SectionTitle icon={<Archive size={13} />}>Photos & signature</SectionTitle>
      {avantUrls.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 8 }}>Avant intervention</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {avantUrls.map((url) => (
              <a key={url} href={url} target="_blank" rel="noreferrer">
                <img src={url} alt="Avant" style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
              </a>
            ))}
          </div>
        </div>
      )}
      {apresUrls.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 8 }}>Après intervention</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {apresUrls.map((url) => (
              <a key={url} href={url} target="_blank" rel="noreferrer">
                <img src={url} alt="Après" style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
              </a>
            ))}
          </div>
        </div>
      )}
      {(sigUrl || cr.signature_client_nom) && (
        <div>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 8 }}>
            Signature — {cr.signature_client_nom || cr.validation_client}
          </div>
          {sigUrl && <img src={sigUrl} alt="Signature" style={{ maxWidth: 280, maxHeight: 100, border: '1px solid var(--border)', borderRadius: 6, background: '#fff' }} />}
        </div>
      )}
    </div>
  );
}

// ── Formulaire Compte Rendu ──────────────────────────────────────────────────

function FormulaireCompteRendu({ initial, onSave, onCancel, saving, savRequests = [], projects = [] }) {
  const [form, setForm] = useState(() => ({ ...EMPTY_FORM, ...(initial || {}) }));
  const [mediaDraft, setMediaDraft] = useState(() => buildSavReportMediaDraft(initial));
  const [errors, setErrors] = useState({});
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const selectedSav = savRequests.find(s => String(s.id) === String(form.sav_request_id)) || null;

  function onSavChange(savId) {
    const sav = savRequests.find(s => String(s.id) === String(savId));
    if (!sav) {
      setForm(p => ({ ...p, sav_request_id: '', sav_lie: '' }));
      return;
    }
    setForm(p => ({
      ...p,
      sav_request_id: savId,
      sav_lie: sav.ref,
      project_id: sav.project_id || p.project_id,
      projet_lie: sav.projet_lie || sav.projet_nom || p.projet_lie,
      client: sav.client || p.client,
      intervenant: p.intervenant?.trim() ? p.intervenant : (sav.responsable || sav.technicien || ''),
    }));
  }

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
    onSave({
      ...form,
      cout_intervention: Number(form.cout_intervention) || 0,
      _media: mediaDraft,
    });
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
        <FField label="Demande SAV liée">
          <select value={form.sav_request_id} onChange={e => onSavChange(e.target.value)} style={SELECT_STYLE}>
            <option value="">— Choisir SAV —</option>
            {savRequests.map(s => (
              <option key={s.id} value={s.id}>{s.ref} — {s.titre || s.type_sav} ({s.projet_lie})</option>
            ))}
          </select>
        </FField>
        <FField label="Projet">
          <select value={form.project_id} onChange={e => {
            const pr = projects.find(p => String(p.id) === String(e.target.value));
            setForm(p => ({ ...p, project_id: e.target.value, projet_lie: pr?.nom || '' }));
          }} style={SELECT_STYLE}>
            <option value="">—</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.ref} — {p.nom}</option>)}
          </select>
        </FField>
        {inp('client', 'text', 'Client', true)}
      </FRow>
      <FRow>
        {inp('intervenant', 'text', 'Intervenant', true)}
        {inp('date_compte_rendu', 'date', 'Date compte rendu')}
      </FRow>

      {selectedSav && <SavDemandeRecap sav={selectedSav} />}

      <SectionTitle icon={<Wrench size={12} />}>Intervention</SectionTitle>
      <div style={{ marginBottom: 14 }}>
        {ta('resume_intervention', 'Résumé de l\'intervention', true)}
      </div>
      <div style={{ marginBottom: 14 }}>
        {ta('actions_realisees', 'Actions réalisées')}
      </div>
      <div style={{ marginBottom: 14 }}>
        {ta('actions_a_prevoir', 'Actions à prévoir')}
      </div>
      <FRow>
        <FField label="Statut après intervention">
          <select value={form.statut_apres_intervention} onChange={e => set('statut_apres_intervention', e.target.value)} style={SELECT_STYLE}>
            <option value="">— Choisir —</option>
            {STATUT_APRES_INTERVENTION.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </FField>
        {inp('pieces_remplacees', 'text', 'Pièces / matériaux')}
      </FRow>
      <FRow>
        {inp('cout_intervention', 'number', 'Coût intervention (MAD)')}
      </FRow>
      <div style={{ marginBottom: 14 }}>
        {ta('recommandations', 'Recommandations pour le client')}
      </div>
      <div style={{ marginBottom: 14 }}>
        {ta('observation', 'Observations')}
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
      <SavReportMediaFields
        initial={initial}
        mediaDraft={mediaDraft}
        onMediaChange={setMediaDraft}
        disabled={saving}
        onSignatureCaptured={() => {
          if (form.validation_client === 'En attente') set('validation_client', 'Validé par client');
        }}
      />

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Annuler</button>
        <button type="submit" className="btn btn-primary" disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={14} /> {saving ? 'Enregistrement...' : (initial?.id ? 'Enregistrer' : 'Créer le compte rendu')}
        </button>
      </div>
    </form>
  );
}

// ── Page Détail CR ───────────────────────────────────────────────────────────

function DetailCR({ cr, sav, onBack, onEdit, onPdf, pdfLoading }) {
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
            <button type="button" className="btn btn-ghost btn-sm" disabled={pdfLoading} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={onPdf}>
              <Download size={13} /> {pdfLoading ? 'PDF...' : 'PDF'}
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
        <KpiCard icon={<Calendar size={17} />}    label="Date compte rendu"  value={cr.date_compte_rendu || cr.date_intervention || '—'}     color="grey"   />
        <KpiCard icon={<DollarSign size={17} />}  label="Coût intervention"  value={(cr.cout_intervention || 0).toLocaleString('fr-MA') + ' MAD'} color="orange" />
        <KpiCard icon={<CheckCircle size={17} />} label="Statut après interv." value={statutApresInterventionLabel(cr.statut_apres_intervention)} color="blue" />
        <KpiCard icon={<CheckCircle size={17} />} label="Validation client"  value={cr.validation_client || '—'}                            color={cr.validation_client === 'Validé par client' ? 'green' : 'grey'} />
      </div>

      {sav && <SavDemandeRecap sav={sav} />}

      {/* Contenu */}
      <div className="card">
        <SectionTitle icon={<FileText size={13} />}>Détail de l'intervention</SectionTitle>

        {!sav && cr.sav_lie && (
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

        {cr.actions_a_prevoir && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Actions à prévoir</div>
            <p style={{ fontSize: '0.88rem', lineHeight: 1.6, color: 'var(--text-2)' }}>{cr.actions_a_prevoir}</p>
          </div>
        )}

        {cr.statut_apres_intervention && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Statut après intervention</div>
            <p style={{ fontSize: '0.88rem', lineHeight: 1.6, color: 'var(--text-2)' }}>{statutApresInterventionLabel(cr.statut_apres_intervention)}</p>
          </div>
        )}

        {cr.observation && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Observations</div>
            <p style={{ fontSize: '0.88rem', lineHeight: 1.6, color: 'var(--text-2)' }}>{cr.observation}</p>
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

        <CrMediaGallery cr={cr} />
      </div>
    </div>
  );
}

// ── Module principal ComptesRendusSAV ────────────────────────────────────────

export default function ComptesRendusSAV({ prefillSAV }) {
  const {
    records: crList, loading, saving, error, configured, load,
    create, update, remove, fetchOne, generateSavReportRef,
  } = useSavReports();
  const { records: savRequests } = useSavRequests();
  const [projects, setProjects] = useState([]);
  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editCR, setEditCR] = useState(null);
  const [detailCR, setDetailCR] = useState(null);
  const [detailSav, setDetailSav] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [pdfLoadingId, setPdfLoadingId] = useState(null);

  useEffect(() => {
    if (!configured) return;
    listProjects().then(setProjects).catch(() => {});
  }, [configured]);

  useEffect(() => {
    if (!prefillSAV) return;
    setEditCR({
      ...EMPTY_FORM,
      sav_request_id: prefillSAV.id || '',
      sav_lie: prefillSAV.ref || '',
      project_id: prefillSAV.project_id || '',
      client: prefillSAV.client || '',
      projet_lie: prefillSAV.projet_lie || '',
    });
    setShowModal(true);
  }, [prefillSAV]);

  const handleSave = useCallback(async (data) => {
    const { _media, ...formData } = data;
    const payload = {
      ...formData,
      date_compte_rendu: formData.date_compte_rendu || formData.date_intervention,
    };
    const result = editCR?.id
      ? await update(editCR.id, { ...payload, id: editCR.id, ref: editCR.ref })
      : await create({ ...payload, ref: payload.ref || await generateSavReportRef().catch(() => '') });
    if (!result.success) {
      alert(result.error || 'Erreur enregistrement.');
      return;
    }
    const reportId = result.data?.id || editCR?.id;
    if (reportId && _media) {
      try {
        await persistSavReportMedia(reportId, {
          ..._media,
          signature_client_nom: _media.signature_client_nom || formData.client,
        });
      } catch (err) {
        alert(err.message || 'Compte rendu enregistré, mais erreur upload photos/signature.');
      }
    }
    setShowModal(false);
    setEditCR(null);
    load();
  }, [editCR, create, update, generateSavReportRef, load]);

  const handlePdf = useCallback(async (cr) => {
    setPdfLoadingId(cr.id);
    try {
      const full = await fetchOne(cr.id);
      await generateSavReportPdf(full);
    } catch (err) {
      alert(err.message || 'Erreur génération PDF.');
    } finally {
      setPdfLoadingId(null);
    }
  }, [fetchOne]);

  const openDetail = useCallback(async (id) => {
    try {
      const full = await fetchOne(id);
      setDetailCR(full);
      if (full.sav_request_id) {
        const sav = await getSavRequestById(full.sav_request_id).catch(() => null);
        setDetailSav(sav);
      } else {
        setDetailSav(null);
      }
    } catch (e) {
      alert(e.message || 'Erreur chargement.');
    }
  }, [fetchOne]);

  const handleDelete = useCallback(async (id) => {
    if (!window.confirm('Confirmer la suppression de ce compte rendu ?')) return;
    const result = await remove(id);
    if (!result.success) alert(result.error || 'Erreur suppression.');
  }, [remove]);

  const filtered = crList.filter(c => {
    const q = search.toLowerCase();
    const matchQ = !q
      || (c.client || '').toLowerCase().includes(q)
      || (c.ref || '').toLowerCase().includes(q)
      || (c.intervenant || '').toLowerCase().includes(q);
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
    return (
      <DetailCR
        cr={detailCR}
        sav={detailSav}
        pdfLoading={pdfLoadingId === detailCR.id}
        onPdf={() => handlePdf(detailCR)}
        onBack={() => { setDetailCR(null); setDetailSav(null); }}
        onEdit={async () => {
          try {
            const full = await fetchOne(detailCR.id);
            setEditCR(full);
            setShowModal(true);
            setDetailCR(null);
            setDetailSav(null);
          } catch (err) {
            alert(err.message || 'Erreur chargement.');
          }
        }}
      />
    );
  }

  return (
    <div className="animate-fade-in">
      {error && (
        <div style={{ background: '#FFEBEE', color: 'var(--red)', borderRadius: 8, padding: '10px 14px', fontSize: '0.85rem', marginBottom: 16 }}>
          {error}
          <button type="button" className="btn btn-ghost btn-sm" onClick={load} style={{ marginLeft: 8 }}>Réessayer</button>
        </div>
      )}
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
        {loading ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-3)' }}>Chargement...</div>
        ) : filtered.length === 0 ? (
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
                  <th>Statut interv.</th>
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
                    <td style={{ whiteSpace: 'nowrap' }}>{c.date_compte_rendu || c.date_intervention || '—'}</td>
                    <td>
                      <span className={`badge ${c.validation_client === 'Validé par client' ? 'badge-green' : c.validation_client === 'Refusé par client' ? 'badge-red' : 'badge-grey'}`}>
                        {c.validation_client}
                      </span>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{(c.cout_intervention || 0).toLocaleString('fr-MA')}</td>
                    <td style={{ fontSize: '0.8rem' }}>{statutApresInterventionLabel(c.statut_apres_intervention)}</td>
                    <td><Badge type={c.statut} /></td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button type="button" className="btn btn-secondary btn-sm" title="Voir" onClick={() => openDetail(c.id)}><Eye size={13} /></button>
                        <button type="button" className="btn btn-ghost btn-sm" title="Modifier" onClick={async () => { try { setEditCR(await fetchOne(c.id)); setShowModal(true); } catch (e) { alert(e.message); } }}><Edit2 size={13} /></button>
                        <button type="button" className="btn btn-ghost btn-sm" title="PDF" disabled={pdfLoadingId === c.id} onClick={() => handlePdf(c)} style={{ color: 'var(--text-3)' }}><Download size={13} /></button>
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
        <FormulaireCompteRendu initial={editCR} onSave={handleSave} onCancel={() => { setShowModal(false); setEditCR(null); }} saving={saving} savRequests={savRequests} projects={projects} />
      </Modal>
    </div>
  );
}

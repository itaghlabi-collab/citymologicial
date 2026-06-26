/**
 * Logistique.jsx — Module ERP Logistique CITYMO
 * Gestion de flotte, demandes d'intervention, historique
 * Backend-ready / API-ready / Database-ready
 */

import {
  Truck, Plus, Edit2, Trash2, Wrench, Clock, Eye, Download,
  Search, Filter, X, ChevronLeft, RefreshCw, AlertCircle,
  CheckCircle, FileText, User, Calendar, MapPin, Fuel,
  Shield, Settings, Package, AlertTriangle, BarChart3,
  ClipboardList, Archive, Loader, ChevronDown, ExternalLink
} from 'lucide-react';
import { useState, useCallback, useEffect, Fragment } from 'react';
import { useVehicles } from '../hooks/useVehicles';
import { useInterventions } from '../hooks/useInterventions';
import VehicleDailyReportModal from './logistique/VehicleDailyReportModal';
import { listDailyReportsByVehicle } from '../services/logistique/vehicleDailyReports';

// ── Design tokens (cohérents avec App.css) ──────────────────────────────────

function Badge({ type, children }) {
  const map = {
    disponible:      { cls: 'badge-green',  label: children || 'Disponible'      },
    affecte:         { cls: 'badge-blue',   label: children || 'Affecté'         },
    intervention:    { cls: 'badge-orange', label: children || 'En intervention' },
    hors_service:    { cls: 'badge-red',    label: children || 'Hors service'    },
    maintenance:     { cls: 'badge-orange', label: children || 'Maintenance'     },
    // interventions
    en_attente:      { cls: 'badge-grey',   label: children || 'En attente'      },
    diagnostic:      { cls: 'badge-orange', label: children || 'Diagnostic'      },
    en_cours:        { cls: 'badge-blue',   label: children || 'En cours'        },
    termine:         { cls: 'badge-green',  label: children || 'Terminé'         },
    annule:          { cls: 'badge-red',    label: children || 'Annulé'          },
    // priorités
    faible:          { cls: 'badge-grey',   label: children || 'Faible'          },
    normale:         { cls: 'badge-blue',   label: children || 'Normale'         },
    urgente:         { cls: 'badge-orange', label: children || 'Urgente'         },
    critique:        { cls: 'badge-red',    label: children || 'Critique'        },
  };
  const cfg = map[type] || { cls: 'badge-grey', label: children || type };
  return <span className={`badge ${cfg.cls}`}>{cfg.label}</span>;
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
        <button className="btn btn-primary btn-sm" onClick={onAction}>
          <Plus size={14} /> {action}
        </button>
      )}
    </div>
  );
}

function Modal({ open, onClose, title, children, width }) {
  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: width || 640, maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)', animation: 'fadeIn 0.18s ease' }}>
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

const INPUT_STYLE = {
  width: '100%', padding: '8px 11px', border: '1.5px solid var(--border)',
  borderRadius: 6, fontSize: '0.86rem', background: '#fff', outline: 'none',
  fontFamily: 'var(--font-body)', color: 'var(--text)', boxSizing: 'border-box'
};
const SELECT_STYLE = { ...INPUT_STYLE, cursor: 'pointer' };
const TEXTAREA_STYLE = { ...INPUT_STYLE, minHeight: 80, resize: 'vertical' };

// ── Constantes métier ────────────────────────────────────────────────────────

const TYPES_VEHICULE  = ['Camionnette', 'Transport personnel', 'Voiture', 'Scooter', 'Camion', 'Engin BTP', 'Fourgon', 'Pick-up'];
const STATUTS_VEH     = ['disponible', 'affecte', 'intervention', 'hors_service', 'maintenance'];
const STATUTS_INT     = ['en_attente', 'diagnostic', 'en_cours', 'termine', 'annule'];
const PRIORITES       = ['faible', 'normale', 'urgente', 'critique'];
const TYPES_INT       = ['Vidange', 'Révision générale', 'Remplacement pneus', 'Réparation moteur', 'Carrosserie', 'Électricité', 'Freins', 'Climatisation', 'Contrôle technique', 'Autre'];
const CARBURANTS      = ['Diesel', 'Essence', 'Hybride', 'Électrique', 'GPL'];

const EMPTY_VEH = {
  vehicule: '', matricule_ww: '', matricule: '', type: '', marque: '', modele: '', annee: '', couleur: '',
  chauffeur: '', departement: '', responsable: '', statut: 'disponible',
  assurance: '', date_exp_assurance: '', visite_technique: '', date_exp_visite: '',
  carte_grise: '', km_actuel: '', carburant: '', consommation: '', observations: ''
};

const EMPTY_INT = {
  vehicule_id: '', matricule: '', type_intervention: '', priorite: 'normale',
  description: '', date_demande: '', chauffeur: '', departement: '',
  garage: '', cout_estime: '', statut: 'en_attente', notes: ''
};

// ── Composants de formulaires ────────────────────────────────────────────────

function FormulaireVehicule({ initial, onSave, onClose, saving }) {
  const [form, setForm] = useState(initial || EMPTY_VEH);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.matricule || !form.type) return;
    onSave(form);
  }

  return (
    <form onSubmit={handleSubmit}>
      <SectionTitle icon={<Truck size={13} />}>Informations générales</SectionTitle>
      <FRow>
        <FField label="Matricule" required>
          <input style={INPUT_STYLE} value={form.matricule} onChange={e => set('matricule', e.target.value)} placeholder="Ex : 12345-A-23" required />
        </FField>
        <FField label="Matricule WW">
          <input style={INPUT_STYLE} value={form.matricule_ww} onChange={e => set('matricule_ww', e.target.value)} placeholder="Ex : WW583662" />
        </FField>
        <FField label="Type de véhicule" required>
          <select style={SELECT_STYLE} value={form.type} onChange={e => set('type', e.target.value)} required>
            <option value="">Sélectionner...</option>
            {TYPES_VEHICULE.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </FField>
        <FField label="Marque">
          <input style={INPUT_STYLE} value={form.marque} onChange={e => set('marque', e.target.value)} placeholder="Ex : Renault" />
        </FField>
        <FField label="Modèle">
          <input style={INPUT_STYLE} value={form.modele} onChange={e => set('modele', e.target.value)} placeholder="Ex : Master" />
        </FField>
        <FField label="Année">
          <input style={INPUT_STYLE} type="number" value={form.annee} onChange={e => set('annee', e.target.value)} placeholder="2020" min="1990" max="2030" />
        </FField>
        <FField label="Couleur">
          <input style={INPUT_STYLE} value={form.couleur} onChange={e => set('couleur', e.target.value)} placeholder="Blanc" />
        </FField>
      </FRow>

      <SectionTitle icon={<User size={13} />}>Affectation</SectionTitle>
      <FRow>
        <FField label="Chauffeur assigné">
          <input style={INPUT_STYLE} value={form.chauffeur} onChange={e => set('chauffeur', e.target.value)} placeholder="Nom du chauffeur" />
        </FField>
        <FField label="Département">
          <input style={INPUT_STYLE} value={form.departement} onChange={e => set('departement', e.target.value)} placeholder="Ex : Chantier Nord" />
        </FField>
        <FField label="Responsable">
          <input style={INPUT_STYLE} value={form.responsable} onChange={e => set('responsable', e.target.value)} placeholder="Responsable véhicule" />
        </FField>
        <FField label="Statut">
          <select style={SELECT_STYLE} value={form.statut} onChange={e => set('statut', e.target.value)}>
            {STATUTS_VEH.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
        </FField>
      </FRow>

      <SectionTitle icon={<Shield size={13} />}>Administratif</SectionTitle>
      <FRow>
        <FField label="N° Assurance">
          <input style={INPUT_STYLE} value={form.assurance} onChange={e => set('assurance', e.target.value)} placeholder="Police d'assurance" />
        </FField>
        <FField label="Exp. assurance">
          <input style={INPUT_STYLE} type="date" value={form.date_exp_assurance} onChange={e => set('date_exp_assurance', e.target.value)} />
        </FField>
        <FField label="N° Visite technique">
          <input style={INPUT_STYLE} value={form.visite_technique} onChange={e => set('visite_technique', e.target.value)} placeholder="Référence visite" />
        </FField>
        <FField label="Exp. visite technique">
          <input style={INPUT_STYLE} type="date" value={form.date_exp_visite} onChange={e => set('date_exp_visite', e.target.value)} />
        </FField>
        <FField label="N° Carte grise">
          <input style={INPUT_STYLE} value={form.carte_grise} onChange={e => set('carte_grise', e.target.value)} placeholder="Numéro carte grise" />
        </FField>
      </FRow>

      <SectionTitle icon={<Settings size={13} />}>Technique</SectionTitle>
      <FRow>
        <FField label="Kilométrage actuel">
          <input style={INPUT_STYLE} type="number" value={form.km_actuel} onChange={e => set('km_actuel', e.target.value)} placeholder="0" min="0" />
        </FField>
        <FField label="Carburant">
          <select style={SELECT_STYLE} value={form.carburant} onChange={e => set('carburant', e.target.value)}>
            <option value="">Sélectionner...</option>
            {CARBURANTS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </FField>
        <FField label="Consommation (L/100km)">
          <input style={INPUT_STYLE} type="number" value={form.consommation} onChange={e => set('consommation', e.target.value)} placeholder="Ex : 8.5" step="0.1" />
        </FField>
      </FRow>
      <FField label="Observations">
        <textarea style={TEXTAREA_STYLE} value={form.observations} onChange={e => set('observations', e.target.value)} placeholder="Notes techniques, remarques..." />
      </FField>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
        <button type="button" className="btn btn-ghost" onClick={onClose}>Annuler</button>
        <button type="submit" className="btn btn-primary" disabled={saving}><CheckCircle size={14} /> {saving ? 'Enregistrement…' : 'Enregistrer'}</button>
      </div>
    </form>
  );
}

function FormulaireIntervention({ vehicules, initial, onSave, onClose, saving }) {
  const [form, setForm] = useState(initial || EMPTY_INT);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  function handleVehiculeChange(e) {
    const v = vehicules.find(veh => veh.id === e.target.value);
    if (!v) {
      set('vehicule_id', e.target.value);
      return;
    }
    setForm((p) => ({
      ...p,
      vehicule_id: e.target.value,
      matricule: v.matricule,
      chauffeur: p.chauffeur || v.chauffeur || '',
    }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.type_intervention || !form.description) return;
    onSave(form);
  }

  return (
    <form onSubmit={handleSubmit}>
      <SectionTitle icon={<Truck size={13} />}>Véhicule concerné</SectionTitle>
      <FRow>
        <FField label="Véhicule">
          <select style={SELECT_STYLE} value={form.vehicule_id} onChange={handleVehiculeChange}>
            <option value="">Sélectionner un véhicule...</option>
            {vehicules.map(v => <option key={v.id} value={v.id}>{v.matricule} — {v.marque} {v.modele}</option>)}
          </select>
        </FField>
        <FField label="Matricule">
          <input style={{ ...INPUT_STYLE, background: 'var(--surface-2)', color: 'var(--text-3)' }} value={form.matricule} readOnly placeholder="Auto-rempli" />
        </FField>
      </FRow>

      <SectionTitle icon={<Wrench size={13} />}>Intervention</SectionTitle>
      <FRow>
        <FField label="Type d'intervention" required>
          <select style={SELECT_STYLE} value={form.type_intervention} onChange={e => set('type_intervention', e.target.value)} required>
            <option value="">Sélectionner...</option>
            {TYPES_INT.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </FField>
        <FField label="Priorité">
          <select style={SELECT_STYLE} value={form.priorite} onChange={e => set('priorite', e.target.value)}>
            {PRIORITES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
          </select>
        </FField>
        <FField label="Date demande">
          <input style={INPUT_STYLE} type="date" value={form.date_demande} onChange={e => set('date_demande', e.target.value)} />
        </FField>
        <FField label="Statut">
          <select style={SELECT_STYLE} value={form.statut} onChange={e => set('statut', e.target.value)}>
            {STATUTS_INT.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
        </FField>
      </FRow>
      <FField label="Description de la panne / demande" required>
        <textarea style={TEXTAREA_STYLE} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Décrire précisément le problème ou l'intervention demandée..." required />
      </FField>

      <SectionTitle icon={<User size={13} />}>Demandeur & Prestataire</SectionTitle>
      <FRow>
        <FField label="Chauffeur / Demandeur">
          <input style={INPUT_STYLE} value={form.chauffeur} onChange={e => set('chauffeur', e.target.value)} placeholder="Nom du demandeur" />
        </FField>
        <FField label="Département">
          <input style={INPUT_STYLE} value={form.departement} onChange={e => set('departement', e.target.value)} placeholder="Département concerné" />
        </FField>
        <FField label="Garage / Prestataire">
          <input style={INPUT_STYLE} value={form.garage} onChange={e => set('garage', e.target.value)} placeholder="Nom du garage ou technicien" />
        </FField>
        <FField label="Coût estimé (MAD)">
          <input style={INPUT_STYLE} type="number" value={form.cout_estime} onChange={e => set('cout_estime', e.target.value)} placeholder="0" min="0" />
        </FField>
      </FRow>
      <FField label="Notes complémentaires">
        <textarea style={{ ...TEXTAREA_STYLE, minHeight: 60 }} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Informations supplémentaires..." />
      </FField>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
        <button type="button" className="btn btn-ghost" onClick={onClose}>Annuler</button>
        <button type="submit" className="btn btn-primary" disabled={saving}><CheckCircle size={14} /> {saving ? 'Enregistrement…' : 'Enregistrer'}</button>
      </div>
    </form>
  );
}

// ── Sous-module Véhicules ─────────────────────────────────────────────────────

function SousModuleVehicules({
  vehicules, onAdd, onEdit, onDelete, onViewDetail, onReportSaved,
  loading, saving, error, onImportSeed, configured,
}) {
  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [filterType, setFilterType] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [reportVehicle, setReportVehicle] = useState(null);

  const filtered = vehicules.filter(v => {
    const q = search.toLowerCase();
    const matchSearch = !q || [
      v.matricule,
      v.matricule_ww,
      v.vehicule,
      v.marque,
      v.modele,
      v.chauffeur,
    ].filter(Boolean).join(' ').toLowerCase().includes(q);
    const matchStatut = !filterStatut || v.statut === filterStatut;
    const matchType   = !filterType   || v.type === filterType;
    return matchSearch && matchStatut && matchType;
  });

  // KPIs
  const total        = vehicules.length;
  const actifs       = vehicules.filter(v => v.statut === 'disponible' || v.statut === 'affecte').length;
  const enIntervention = vehicules.filter(v => v.statut === 'intervention').length;
  const horsService  = vehicules.filter(v => v.statut === 'hors_service').length;
  const affectes     = vehicules.filter(v => v.statut === 'affecte').length;
  const maintenance  = vehicules.filter(v => v.statut === 'maintenance').length;

  async function handleSave(data) {
    const ok = editTarget
      ? await onEdit({ ...editTarget, ...data })
      : await onAdd(data);
    if (ok !== false) {
      setShowForm(false);
      setEditTarget(null);
    }
  }

  async function handleImportSeed() {
    if (!onImportSeed) return;
    if (!window.confirm('Importer les 18 véhicules de la liste CITYMO ? Les doublons (matricule / WW) seront mis à jour.')) return;
    await onImportSeed();
  }

  function openEdit(v) { setEditTarget(v); setShowForm(true); }

  return (
    <div>
      {error && (
        <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 8, background: 'var(--red-light)', color: 'var(--red)', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}
      {/* KPIs */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', marginBottom: 20 }}>
        <KpiCard icon={<Truck size={17} />}     label="Total véhicules"       value={total}           color="blue"   />
        <KpiCard icon={<CheckCircle size={17} />} label="Véhicules actifs"    value={actifs}          color="green"  />
        <KpiCard icon={<Wrench size={17} />}    label="En intervention"        value={enIntervention}  color="orange" />
        <KpiCard icon={<AlertTriangle size={17} />} label="Hors service"      value={horsService}     color="red"    />
        <KpiCard icon={<User size={17} />}      label="Affectés"               value={affectes}        color="blue"   />
        <KpiCard icon={<Settings size={17} />}  label="Maintenance prévue"    value={maintenance}     color="orange" />
      </div>

      {/* Toolbar */}
      <div className="card" style={{ marginBottom: 16, padding: '14px 20px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flex: 1 }}>
            <div style={{ position: 'relative', minWidth: 200 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un véhicule..." style={{ ...INPUT_STYLE, paddingLeft: 32, width: '100%' }} />
            </div>
            <select style={{ ...SELECT_STYLE, width: 160 }} value={filterStatut} onChange={e => setFilterStatut(e.target.value)}>
              <option value="">Tous les statuts</option>
              {STATUTS_VEH.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
            <select style={{ ...SELECT_STYLE, width: 160 }} value={filterType} onChange={e => setFilterType(e.target.value)}>
              <option value="">Tous les types</option>
              {TYPES_VEHICULE.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-sm"><Download size={14} /> Export</button>
            {onImportSeed && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={!configured || saving}
                onClick={handleImportSeed}
              >
                <Package size={14} /> Importer liste
              </button>
            )}
            <button className="btn btn-primary btn-sm" disabled={!configured || saving} onClick={() => { setEditTarget(null); setShowForm(true); }}>
              <Plus size={14} /> Ajouter véhicule
            </button>
          </div>
        </div>
      </div>

      {/* Tableau */}
      <div className="card">
        <div className="flex-between mb-4">
          <div className="card-title" style={{ marginBottom: 0 }}><Truck size={16} /> Flotte — {filtered.length} véhicule{filtered.length !== 1 ? 's' : ''}</div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-3)' }}>
            <Loader size={22} style={{ animation: 'spin 0.8s linear infinite', marginBottom: 8 }} />
            <div>Chargement de la flotte...</div>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Truck size={26} style={{ color: 'var(--text-3)' }} />}
            title={vehicules.length === 0 ? "Aucun véhicule enregistré" : "Aucun résultat"}
            sub={vehicules.length === 0 ? "Commencez par ajouter les véhicules de la flotte ou importez la liste CITYMO." : "Modifiez vos critères de recherche."}
            action={vehicules.length === 0 ? "Ajouter un véhicule" : null}
            onAction={() => setShowForm(true)}
          />
        ) : (
          <>
            <div className="log-desktop-table table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Matricule</th>
                    <th>Matricule WW</th>
                    <th>Type</th>
                    <th>Marque / Modèle</th>
                    <th>Chauffeur</th>
                    <th>Département</th>
                    <th>Statut</th>
                    <th>Kilométrage</th>
                    <th>Exp. Assurance</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(v => (
                    <tr key={v.id}>
                      <td>
                        <span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, color: 'var(--red)', fontSize: '0.92rem', letterSpacing: '0.04em' }}>{v.matricule}</span>
                      </td>
                      <td style={{ fontFamily: 'var(--font-head)', fontSize: '0.85rem' }}>{v.matricule_ww || '—'}</td>
                      <td>
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-2)', background: 'var(--surface-2)', padding: '2px 8px', borderRadius: 4 }}>{v.type || '—'}</span>
                      </td>
                      <td style={{ fontWeight: 600 }}>{v.marque}{v.modele ? ` ${v.modele}` : ''}</td>
                      <td style={{ color: v.chauffeur ? 'var(--text)' : 'var(--text-3)', fontSize: '0.875rem' }}>{v.chauffeur || '—'}</td>
                      <td style={{ color: 'var(--text-2)', fontSize: '0.875rem' }}>{v.departement || '—'}</td>
                      <td><Badge type={v.statut} /></td>
                      <td style={{ fontFamily: 'var(--font-head)', fontWeight: 600 }}>{v.km_actuel ? Number(v.km_actuel).toLocaleString('fr-MA') + ' km' : '—'}</td>
                      <td>
                        {v.date_exp_assurance ? (
                          <span style={{ fontSize: '0.82rem', color: isExpiringSoon(v.date_exp_assurance) ? '#E65100' : 'var(--text-2)' }}>
                            {isExpiringSoon(v.date_exp_assurance) && <AlertTriangle size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />}
                            {v.date_exp_assurance}
                          </span>
                        ) : '—'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 3 }}>
                          <button className="btn btn-ghost btn-sm" style={{ padding: '4px 7px' }} title="Voir fiche" onClick={() => onViewDetail(v)}>
                            <Eye size={13} />
                          </button>
                          <button className="btn btn-ghost btn-sm" style={{ padding: '4px 7px' }} title="Modifier" onClick={() => openEdit(v)}>
                            <Edit2 size={13} />
                          </button>
                          <button className="btn btn-ghost btn-sm" style={{ padding: '4px 7px' }} title="Compte rendu journée" onClick={() => setReportVehicle(v)}>
                            <ClipboardList size={13} />
                          </button>
                          <button className="btn btn-ghost btn-sm" style={{ padding: '4px 7px' }} title="Supprimer" disabled={saving} onClick={() => onDelete(v.id)}>
                            <Trash2 size={13} style={{ color: 'var(--red)' }} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="log-mobile-list">
              {filtered.map((v) => (
                <LogistiqueMobileCard
                  key={v.id}
                  title={v.matricule}
                  subtitle={[v.marque, v.modele].filter(Boolean).join(' ') || v.type}
                  badges={<Badge type={v.statut} />}
                  meta={[
                    ['Type', v.type],
                    ['Chauffeur', v.chauffeur],
                    ['Département', v.departement],
                    ['Kilométrage', v.km_actuel ? `${Number(v.km_actuel).toLocaleString('fr-MA')} km` : '—'],
                    ['WW', v.matricule_ww],
                  ]}
                  actions={(
                    <>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => onViewDetail(v)}><Eye size={13} /> Voir</button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => openEdit(v)}><Edit2 size={13} /> Modifier</button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setReportVehicle(v)}><ClipboardList size={13} /> Compte rendu</button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onDelete(v.id)} disabled={saving}><Trash2 size={13} /> Supprimer</button>
                    </>
                  )}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Modal formulaire */}
      <Modal open={showForm} onClose={() => { setShowForm(false); setEditTarget(null); }} title={editTarget ? "Modifier le véhicule" : "Ajouter un véhicule"} width={780}>
        <FormulaireVehicule initial={editTarget} onSave={handleSave} saving={saving} onClose={() => { setShowForm(false); setEditTarget(null); }} />
      </Modal>

      <VehicleDailyReportModal
        open={!!reportVehicle}
        vehicle={reportVehicle}
        onClose={() => setReportVehicle(null)}
        onSaved={() => {
          setReportVehicle(null);
          onReportSaved?.();
          window.dispatchEvent(new Event('citymo:vehicle-reports-updated'));
        }}
      />
    </div>
  );
}

// ── Sous-module Demandes d'intervention ──────────────────────────────────────

function SousModuleInterventions({
  interventions, vehicules, onAdd, onEdit, onDelete,
  loading, saving, error, configured, filterFn,
}) {
  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [filterPriorite, setFilterPriorite] = useState('');
  const [filterMatricule, setFilterMatricule] = useState('');
  const [filterChauffeur, setFilterChauffeur] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState(null);

  const matricules = [...new Set(vehicules.map((v) => v.matricule).filter(Boolean))];
  const chauffeurs = [...new Set(interventions.map((i) => i.chauffeur).filter(Boolean))];

  const filtered = filterFn(interventions, {
    search,
    statut: filterStatut,
    priorite: filterPriorite,
    matricule: filterMatricule,
    chauffeur: filterChauffeur,
    dateFrom: filterDateFrom,
  });

  const ouvertes    = interventions.filter(i => ['en_attente','diagnostic','en_cours'].includes(i.statut)).length;
  const urgentes    = interventions.filter(i => i.priorite === 'urgente' || i.priorite === 'critique').length;
  const terminees   = interventions.filter(i => i.statut === 'termine').length;
  const immobilises = interventions.filter(i => i.statut === 'en_cours' || i.statut === 'diagnostic').length;

  async function handleSave(data) {
    const ok = editTarget
      ? await onEdit({ ...editTarget, ...data })
      : await onAdd(data);
    if (ok !== false) {
      setShowForm(false);
      setEditTarget(null);
    }
  }

  return (
    <div>
      {error && (
        <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 8, background: 'var(--red-light)', color: 'var(--red)', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', marginBottom: 20 }}>
        <KpiCard icon={<ClipboardList size={17} />} label="Interventions ouvertes"   value={ouvertes}    color="blue"   />
        <KpiCard icon={<AlertTriangle size={17} />} label="Urgentes / Critiques"     value={urgentes}    color="red"    />
        <KpiCard icon={<CheckCircle size={17} />}   label="Terminées"                value={terminees}   color="green"  />
        <KpiCard icon={<Truck size={17} />}         label="Véhicules immobilisés"    value={immobilises} color="orange" />
      </div>

      <div className="card" style={{ marginBottom: 16, padding: '14px 20px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flex: 1 }}>
            <div style={{ position: 'relative', minWidth: 200 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..." style={{ ...INPUT_STYLE, paddingLeft: 32, width: '100%' }} />
            </div>
            <select style={{ ...SELECT_STYLE, width: 160 }} value={filterStatut} onChange={e => setFilterStatut(e.target.value)}>
              <option value="">Tous les statuts</option>
              {STATUTS_INT.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
            <select style={{ ...SELECT_STYLE, width: 140 }} value={filterPriorite} onChange={e => setFilterPriorite(e.target.value)}>
              <option value="">Toutes priorités</option>
              {PRIORITES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
            </select>
            <select style={{ ...SELECT_STYLE, width: 130 }} value={filterMatricule} onChange={e => setFilterMatricule(e.target.value)}>
              <option value="">Tous véhicules</option>
              {matricules.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <select style={{ ...SELECT_STYLE, width: 150 }} value={filterChauffeur} onChange={e => setFilterChauffeur(e.target.value)}>
              <option value="">Tous conducteurs</option>
              {chauffeurs.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input type="date" style={{ ...SELECT_STYLE, width: 150 }} value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} title="Date demande à partir de" />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-sm"><Download size={14} /> Export</button>
            <button className="btn btn-primary btn-sm" disabled={!configured || saving} onClick={() => { setEditTarget(null); setShowForm(true); }}>
              <Plus size={14} /> Nouvelle demande
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="flex-between mb-4">
          <div className="card-title" style={{ marginBottom: 0 }}><Wrench size={16} /> Demandes d'intervention — {filtered.length}</div>
        </div>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-3)' }}>
            <Loader size={22} style={{ animation: 'spin 0.8s linear infinite', marginBottom: 8 }} />
            <div>Chargement des demandes...</div>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Wrench size={26} style={{ color: 'var(--text-3)' }} />}
            title={interventions.length === 0 ? "Aucune demande enregistrée" : "Aucun résultat"}
            sub={interventions.length === 0 ? "Créez la première demande d'intervention." : "Modifiez vos critères."}
            action={interventions.length === 0 ? "Nouvelle demande" : null}
            onAction={() => setShowForm(true)}
          />
        ) : (
          <>
            <div className="log-desktop-table table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Référence</th>
                    <th>Véhicule</th>
                    <th>Type</th>
                    <th>Priorité</th>
                    <th>Demandeur</th>
                    <th>Date</th>
                    <th>Statut</th>
                    <th>Coût estimé</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(i => (
                    <tr key={i.id || i.ref}>
                      <td>
                        <span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, color: 'var(--red)', fontSize: '0.9rem' }}>{i.ref}</span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{i.matricule || '—'}</div>
                      </td>
                      <td style={{ fontSize: '0.875rem' }}>{i.type_intervention || '—'}</td>
                      <td><Badge type={i.priorite} /></td>
                      <td style={{ fontSize: '0.875rem', color: 'var(--text-2)' }}>{i.chauffeur || '—'}</td>
                      <td style={{ fontSize: '0.82rem', color: 'var(--text-3)' }}>{i.date_demande || '—'}</td>
                      <td><Badge type={i.statut} /></td>
                      <td style={{ fontFamily: 'var(--font-head)', fontWeight: 600, fontSize: '0.9rem' }}>
                        {i.cout_estime ? Number(i.cout_estime).toLocaleString('fr-MA') + ' MAD' : '—'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 3 }}>
                          <button className="btn btn-ghost btn-sm" style={{ padding: '4px 7px' }} title="Modifier" onClick={() => { setEditTarget(i); setShowForm(true); }}>
                            <Edit2 size={13} />
                          </button>
                          <button className="btn btn-ghost btn-sm" style={{ padding: '4px 7px' }} title="Supprimer" disabled={saving} onClick={() => onDelete(i.id)}>
                            <Trash2 size={13} style={{ color: 'var(--red)' }} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="log-mobile-list">
              {filtered.map((i) => (
                <LogistiqueMobileCard
                  key={i.id || i.ref}
                  title={i.matricule || 'Véhicule'}
                  subtitle={i.ref}
                  badges={(
                    <>
                      <Badge type={i.priorite} />
                      <Badge type={i.statut} />
                    </>
                  )}
                  meta={[
                    ['Conducteur', i.chauffeur],
                    ['Intervention', i.type_intervention],
                    ['Date', i.date_demande],
                    ['Coût est.', i.cout_estime ? `${Number(i.cout_estime).toLocaleString('fr-MA')} MAD` : '—'],
                  ]}
                  actions={(
                    <>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setEditTarget(i); setShowForm(true); }}><Eye size={13} /> Voir</button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setEditTarget(i); setShowForm(true); }}><Edit2 size={13} /> Modifier</button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onDelete(i.id)} disabled={saving}><Trash2 size={13} /> Supprimer</button>
                    </>
                  )}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <Modal open={showForm} onClose={() => { setShowForm(false); setEditTarget(null); }} title={editTarget ? "Modifier la demande" : "Nouvelle demande d'intervention"} width={720}>
        <FormulaireIntervention vehicules={vehicules} initial={editTarget} onSave={handleSave} saving={saving} onClose={() => { setShowForm(false); setEditTarget(null); }} />
      </Modal>
    </div>
  );
}

// ── Sous-module Historique ────────────────────────────────────────────────────

function SousModuleHistorique({ historique, loading, error, filterFn }) {
  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [filterPriorite, setFilterPriorite] = useState('');
  const [filterMatricule, setFilterMatricule] = useState('');
  const [filterChauffeur, setFilterChauffeur] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [detail, setDetail] = useState(null);

  const matricules = [...new Set(historique.map((i) => i.matricule).filter(Boolean))];
  const chauffeurs = [...new Set(historique.map((i) => i.chauffeur).filter(Boolean))];
  const types = [...new Set(historique.map((i) => i.type_intervention).filter(Boolean))];

  const filtered = filterFn(historique, {
    search,
    statut: filterStatut,
    priorite: filterPriorite,
    matricule: filterMatricule,
    chauffeur: filterChauffeur,
    typeIntervention: filterType,
    dateFrom: filterDateFrom,
    dateTo: filterDateTo,
  });

  const totalCout = historique.reduce((s, i) => s + (Number(i.cout_final || i.cout_estime) || 0), 0);

  return (
    <div>
      {error && (
        <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 8, background: 'var(--red-light)', color: 'var(--red)', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', marginBottom: 20 }}>
        <KpiCard icon={<Clock size={17} />}     label="Total interventions"      value={historique.length}                             color="blue"  />
        <KpiCard icon={<BarChart3 size={17} />} label="Coût total maintenance"   value={totalCout.toLocaleString('fr-MA') + ' MAD'}   color="red"   sub="Interventions clôturées" />
        <KpiCard icon={<CheckCircle size={17} />} label="Terminées"              value={historique.filter(i => i.statut === 'termine').length} color="green" />
        <KpiCard icon={<X size={17} />}         label="Annulées"                 value={historique.filter(i => i.statut === 'annule').length}  color="grey"  />
      </div>

      <div className="card" style={{ marginBottom: 16, padding: '14px 20px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <div style={{ position: 'relative', minWidth: 220, flex: 1 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Référence, véhicule, type..." style={{ ...INPUT_STYLE, paddingLeft: 32, width: '100%' }} />
          </div>
          <select style={{ ...SELECT_STYLE, width: 150 }} value={filterStatut} onChange={e => setFilterStatut(e.target.value)}>
            <option value="">Tous les statuts</option>
            <option value="termine">Terminé</option>
            <option value="annule">Annulé</option>
          </select>
          <select style={{ ...SELECT_STYLE, width: 150 }} value={filterPriorite} onChange={e => setFilterPriorite(e.target.value)}>
            <option value="">Toutes priorités</option>
            {PRIORITES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
          </select>
          <select style={{ ...SELECT_STYLE, width: 130 }} value={filterMatricule} onChange={e => setFilterMatricule(e.target.value)}>
            <option value="">Tous véhicules</option>
            {matricules.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select style={{ ...SELECT_STYLE, width: 140 }} value={filterChauffeur} onChange={e => setFilterChauffeur(e.target.value)}>
            <option value="">Tous conducteurs</option>
            {chauffeurs.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select style={{ ...SELECT_STYLE, width: 150 }} value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="">Tous types</option>
            {types.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input type="date" style={{ ...SELECT_STYLE, width: 140 }} value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} title="Du" />
          <input type="date" style={{ ...SELECT_STYLE, width: 140 }} value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} title="Au" />
          <button className="btn btn-ghost btn-sm"><Download size={14} /> Exporter</button>
        </div>
      </div>

      <div className="card">
        <div className="flex-between mb-4">
          <div className="card-title" style={{ marginBottom: 0 }}><Clock size={16} /> Historique — {filtered.length} intervention{filtered.length !== 1 ? 's' : ''}</div>
        </div>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-3)' }}>
            <Loader size={22} style={{ animation: 'spin 0.8s linear infinite', marginBottom: 8 }} />
            <div>Chargement de l'historique...</div>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Clock size={26} style={{ color: 'var(--text-3)' }} />}
            title="Aucun historique disponible"
            sub="Les interventions clôturées (statut Terminé ou Annulé) apparaîtront ici."
          />
        ) : (
          <>
            <div className="log-desktop-table table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Référence</th>
                    <th>Date</th>
                    <th>Véhicule</th>
                    <th>Intervention</th>
                    <th>Garage</th>
                    <th>Priorité</th>
                    <th>Coût (MAD)</th>
                    <th>Statut final</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(i => (
                    <tr key={i.id || i.ref}>
                      <td style={{ fontFamily: 'var(--font-head)', fontWeight: 700, color: 'var(--red)', fontSize: '0.9rem' }}>{i.ref}</td>
                      <td style={{ fontSize: '0.82rem', color: 'var(--text-3)' }}>{i.date_fin || i.date_demande || '—'}</td>
                      <td style={{ fontWeight: 600, fontSize: '0.875rem' }}>{i.matricule || '—'}</td>
                      <td style={{ fontSize: '0.875rem' }}>{i.type_intervention || '—'}</td>
                      <td style={{ fontSize: '0.875rem', color: 'var(--text-2)' }}>{i.prestataire || i.garage || '—'}</td>
                      <td><Badge type={i.priorite} /></td>
                      <td style={{ fontFamily: 'var(--font-head)', fontWeight: 700 }}>
                        {(i.cout_final || i.cout_estime) ? Number(i.cout_final || i.cout_estime).toLocaleString('fr-MA') : '—'}
                      </td>
                      <td><Badge type={i.statut} /></td>
                      <td>
                        <div style={{ display: 'flex', gap: 3 }}>
                          <button className="btn btn-ghost btn-sm" style={{ padding: '4px 7px' }} title="Voir détail" onClick={() => setDetail(i)}>
                            <Eye size={13} />
                          </button>
                          <button className="btn btn-ghost btn-sm" style={{ padding: '4px 7px' }} title="Télécharger rapport">
                            <Download size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="log-mobile-list">
              {filtered.map((i) => (
                <LogistiqueMobileCard
                  key={i.id || i.ref}
                  title={i.matricule || 'Véhicule'}
                  subtitle={i.ref}
                  badges={(
                    <>
                      <Badge type={i.priorite} />
                      <Badge type={i.statut} />
                    </>
                  )}
                  meta={[
                    ['Intervention', i.type_intervention],
                    ['Date', i.date_fin || i.date_demande],
                    ['Garage', i.prestataire || i.garage],
                    ['Coût', (i.cout_final || i.cout_estime) ? `${Number(i.cout_final || i.cout_estime).toLocaleString('fr-MA')} MAD` : '—'],
                  ]}
                  actions={(
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDetail(i)}><Eye size={13} /> Voir détail</button>
                  )}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={`Intervention ${detail?.ref || ''}`} width={640}>
        {detail && (
          <div style={{ fontSize: '0.875rem' }}>
            {[
              ['Véhicule', detail.matricule],
              ['Conducteur', detail.chauffeur],
              ['Type', detail.type_intervention],
              ['Date demande', detail.date_demande],
              ['Date intervention', detail.date_intervention],
              ['Date fin', detail.date_fin],
              ['Prestataire', detail.prestataire || detail.garage],
              ['Coût final', (detail.cout_final || detail.cout_estime) ? `${Number(detail.cout_final || detail.cout_estime).toLocaleString('fr-MA')} MAD` : '—'],
              ['Statut', detail.statut],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--text-3)' }}>{k}</span>
                <span style={{ fontWeight: 600 }}>{v || '—'}</span>
              </div>
            ))}
            {detail.description && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 6 }}>Description</div>
                <p style={{ color: 'var(--text-2)', lineHeight: 1.5 }}>{detail.description}</p>
              </div>
            )}
            {detail.observation_finale && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 6 }}>Observation finale</div>
                <p style={{ color: 'var(--text-2)', lineHeight: 1.5 }}>{detail.observation_finale}</p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

// ── Page détail véhicule ──────────────────────────────────────────────────────

function fmtDateFr(d) {
  if (!d) return '—';
  try {
    return new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR');
  } catch {
    return d;
  }
}

function DetailVehicule({ vehicule, interventions, onBack, onEdit, onOpenReport }) {
  const vehInterventions = interventions.filter((i) => i.matricule === vehicule.matricule);
  const [reports, setReports] = useState([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [expandedReportId, setExpandedReportId] = useState(null);

  const loadReports = useCallback(async () => {
    if (!vehicule?.id && !vehicule?.matricule) {
      setReports([]);
      setReportsLoading(false);
      return;
    }
    setReportsLoading(true);
    try {
      setReports(await listDailyReportsByVehicle(vehicule.id, { matricule: vehicule.matricule }));
    } catch (err) {
      console.warn('[CITYMO] load vehicle reports', err);
      setReports([]);
    } finally {
      setReportsLoading(false);
    }
  }, [vehicule?.id, vehicule?.matricule]);

  useEffect(() => { loadReports(); }, [loadReports]);

  useEffect(() => {
    const handler = () => loadReports();
    window.addEventListener('citymo:vehicle-reports-updated', handler);
    return () => window.removeEventListener('citymo:vehicle-reports-updated', handler);
  }, [loadReports]);

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button className="btn btn-ghost btn-sm" onClick={onBack}><ChevronLeft size={16} /> Retour</button>
        <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.1rem', letterSpacing: '0.04em', flex: 1 }}>
          <span style={{ color: 'var(--red)' }}>{vehicule.matricule}</span>
          {vehicule.marque && <span style={{ color: 'var(--text-2)', fontWeight: 500, marginLeft: 10, fontSize: '0.95rem' }}>{vehicule.marque} {vehicule.modele}</span>}
        </div>
        <Badge type={vehicule.statut} />
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenReport?.()}><ClipboardList size={14} /> Compte rendu</button>
        <button className="btn btn-primary btn-sm" onClick={() => onEdit(vehicule)}><Edit2 size={14} /> Modifier</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
        {/* Infos générales */}
        <div className="card">
          <SectionTitle icon={<Truck size={13} />}>Informations générales</SectionTitle>
          {[
            ['Matricule',    vehicule.matricule],
            ['Matricule WW', vehicule.matricule_ww],
            ['Type',         vehicule.type],
            ['Marque',       vehicule.marque],
            ['Modèle',       vehicule.modele],
            ['Année',        vehicule.annee],
            ['Couleur',      vehicule.couleur],
            ['Kilométrage',  vehicule.km_actuel ? Number(vehicule.km_actuel).toLocaleString('fr-MA') + ' km' : null],
            ['Carburant',    vehicule.carburant],
          ].filter(([, v]) => v).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: '0.875rem' }}>
              <span style={{ color: 'var(--text-3)', fontWeight: 500 }}>{k}</span>
              <span style={{ fontWeight: 600, color: 'var(--text)' }}>{v}</span>
            </div>
          ))}
        </div>

        {/* Affectation */}
        <div className="card">
          <SectionTitle icon={<User size={13} />}>Affectation</SectionTitle>
          {[
            ['Chauffeur',      vehicule.chauffeur],
            ['Département',    vehicule.departement],
            ['Responsable',    vehicule.responsable],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: '0.875rem' }}>
              <span style={{ color: 'var(--text-3)', fontWeight: 500 }}>{k}</span>
              <span style={{ fontWeight: 600, color: v ? 'var(--text)' : 'var(--text-3)' }}>{v || '—'}</span>
            </div>
          ))}
        </div>

        {/* Administratif */}
        <div className="card">
          <SectionTitle icon={<Shield size={13} />}>Administratif</SectionTitle>
          {[
            ['N° Assurance',      vehicule.assurance],
            ['Exp. Assurance',    vehicule.date_exp_assurance],
            ['Visite technique',  vehicule.visite_technique],
            ['Exp. Visite',       vehicule.date_exp_visite],
            ['Carte grise',       vehicule.carte_grise],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: '0.875rem' }}>
              <span style={{ color: 'var(--text-3)', fontWeight: 500 }}>{k}</span>
              <span style={{ fontWeight: 600, color: v ? 'var(--text)' : 'var(--text-3)' }}>{v || '—'}</span>
            </div>
          ))}
        </div>

        {/* Comptes rendus journaliers */}
        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
            <SectionTitle icon={<ClipboardList size={13} />}>Comptes rendus journaliers ({reports.length})</SectionTitle>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenReport?.()}>
              <Plus size={13} /> Nouveau compte rendu
            </button>
          </div>
          {reportsLoading ? (
            <div style={{ color: 'var(--text-3)', fontSize: '0.875rem', padding: '12px 0' }}>Chargement des comptes rendus…</div>
          ) : reports.length === 0 ? (
            <div style={{ color: 'var(--text-3)', fontSize: '0.875rem', padding: '12px 0' }}>
              Aucun compte rendu enregistré — utilisez le bouton ci-dessus pour saisir les déplacements du jour.
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Référence</th>
                    <th>Date</th>
                    <th>Chauffeur</th>
                    <th>Km parcourus</th>
                    <th>Trajets</th>
                    <th>Carburant</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r) => (
                    <Fragment key={r.id}>
                      <tr>
                        <td style={{ fontFamily: 'var(--font-head)', fontWeight: 700, color: 'var(--red)' }}>{r.ref}</td>
                        <td>{fmtDateFr(r.date_rapport)}</td>
                        <td>{r.chauffeur || '—'}</td>
                        <td style={{ fontWeight: 600 }}>
                          {r.km_parcourus ? `${Number(r.km_parcourus).toLocaleString('fr-MA')} km` : '—'}
                        </td>
                        <td>{r.trips?.length || 0}</td>
                        <td>{r.carburant_litres ? `${r.carburant_litres} L` : '—'}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button type="button" className="btn btn-ghost btn-sm" title="Voir détail" onClick={() => setExpandedReportId((id) => (id === r.id ? null : r.id))}>
                              <Eye size={13} />
                            </button>
                            <button type="button" className="btn btn-ghost btn-sm" title="Modifier" onClick={() => onOpenReport?.(r.date_rapport)}>
                              <Edit2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expandedReportId === r.id && (
                        <tr>
                          <td colSpan={7} style={{ background: 'var(--surface-2)', padding: 16 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 12, fontSize: '0.84rem' }}>
                              <div><span style={{ color: 'var(--text-3)', fontSize: '0.68rem', fontWeight: 700 }}>KM DÉPART</span><div style={{ fontWeight: 600 }}>{r.km_depart || '—'}</div></div>
                              <div><span style={{ color: 'var(--text-3)', fontSize: '0.68rem', fontWeight: 700 }}>KM ARRIVÉE</span><div style={{ fontWeight: 600 }}>{r.km_arrivee || '—'}</div></div>
                              <div><span style={{ color: 'var(--text-3)', fontSize: '0.68rem', fontWeight: 700 }}>OBSERVATIONS</span><div>{r.observations || '—'}</div></div>
                            </div>
                            {(r.trips || []).length === 0 ? (
                              <div style={{ color: 'var(--text-3)', fontSize: '0.82rem' }}>Aucun trajet détaillé.</div>
                            ) : (
                              <div className="table-wrap">
                                <table style={{ fontSize: '0.82rem' }}>
                                  <thead>
                                    <tr>
                                      <th>#</th>
                                      <th>Horaires</th>
                                      <th>Trajet</th>
                                      <th>Objet</th>
                                      <th>Projet</th>
                                      <th>Km</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {r.trips.map((t, idx) => (
                                      <tr key={t.id || idx}>
                                        <td>{idx + 1}</td>
                                        <td>{[t.heure_depart, t.heure_arrivee].filter(Boolean).join(' → ') || '—'}</td>
                                        <td>{[t.lieu_depart, t.lieu_arrivee].filter(Boolean).join(' → ') || '—'}</td>
                                        <td>{t.objet_mission || '—'}</td>
                                        <td>{t.projet_nom || t.projet_ref || '—'}</td>
                                        <td>{t.km_parcourus || '—'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Interventions liées */}
        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <SectionTitle icon={<Wrench size={13} />}>Interventions liées ({vehInterventions.length})</SectionTitle>
          {vehInterventions.length === 0 ? (
            <div style={{ color: 'var(--text-3)', fontSize: '0.875rem', padding: '12px 0' }}>Aucune intervention pour ce véhicule.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Référence</th><th>Type</th><th>Priorité</th><th>Date</th><th>Statut</th><th>Coût</th></tr></thead>
                <tbody>
                  {vehInterventions.map(i => (
                    <tr key={i.id || i.ref}>
                      <td style={{ fontFamily: 'var(--font-head)', fontWeight: 700, color: 'var(--red)' }}>{i.ref}</td>
                      <td>{i.type_intervention}</td>
                      <td><Badge type={i.priorite} /></td>
                      <td style={{ fontSize: '0.82rem', color: 'var(--text-3)' }}>{i.date_demande || '—'}</td>
                      <td><Badge type={i.statut} /></td>
                      <td style={{ fontFamily: 'var(--font-head)', fontWeight: 600 }}>{i.cout_estime ? Number(i.cout_estime).toLocaleString('fr-MA') + ' MAD' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Observations */}
        {vehicule.observations && (
          <div className="card" style={{ gridColumn: '1 / -1' }}>
            <SectionTitle icon={<FileText size={13} />}>Observations</SectionTitle>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-2)', lineHeight: 1.6 }}>{vehicule.observations}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Utilitaire ───────────────────────────────────────────────────────────────

function isExpiringSoon(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  const diff = (d - now) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff < 60;
}

const LOGISTIQUE_TAB_FROM_NAV = {
  vehicules: 'vehicules',
  interventions: 'interventions',
  'historique-interv': 'historique',
};

function resolveLogistiqueTab(activeTabProp) {
  return LOGISTIQUE_TAB_FROM_NAV[activeTabProp] || activeTabProp || 'vehicules';
}

function LogistiqueMobileCard({ title, subtitle, badges, meta = [], actions }) {
  return (
    <div className="log-mobile-card">
      <div className="log-mobile-card-head">
        <div className="log-mobile-card-identity">
          <div className="log-mobile-card-title">{title}</div>
          {subtitle && <div className="log-mobile-card-sub">{subtitle}</div>}
        </div>
        {badges && <div className="log-mobile-card-badges">{badges}</div>}
      </div>
      {meta.length > 0 && (
        <div className="log-mobile-card-meta">
          {meta.map(([k, v]) => (
            <div key={k} className="log-mobile-meta-row">
              <span>{k}</span>
              <span>{v ?? '—'}</span>
            </div>
          ))}
        </div>
      )}
      {actions && <div className="log-mobile-card-actions">{actions}</div>}
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function Logistique({ activeTab: activeTabProp }) {
  const resolvedTab = resolveLogistiqueTab(activeTabProp);
  const [tab, setTab] = useState(resolvedTab);
  const [detailVehicule, setDetailVehicule] = useState(null);
  const [editVehicule, setEditVehicule] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [detailReportOpen, setDetailReportOpen] = useState(false);
  const [detailReportDate, setDetailReportDate] = useState(null);
  const [vehToast, setVehToast] = useState(null);
  const [intToast, setIntToast] = useState(null);

  useEffect(() => {
    setTab(resolvedTab);
    if (resolvedTab !== 'vehicules') setDetailVehicule(null);
  }, [resolvedTab]);

  const logistiqueTabActive = ['vehicules', 'interventions', 'historique'].includes(tab);
  const intDataEnabled = tab === 'interventions' || tab === 'historique' || !!detailVehicule;

  const {
    vehicles: vehicules,
    loading: vehiculesLoading,
    saving: vehiculesSaving,
    error: vehiculesError,
    configured: vehiculesConfigured,
    load: loadVehicules,
    create: createVehicule,
    update: updateVehicule,
    remove: removeVehicule,
    importSeed: importVehiculesSeed,
  } = useVehicles({ enabled: logistiqueTabActive });

  const {
    openRequests: demandesInterventions,
    history: historiqueInterventions,
    allForVehicleDetail: interventionsVehicule,
    loading: intLoading,
    saving: intSaving,
    error: intError,
    configured: intConfigured,
    create: createIntervention,
    update: updateIntervention,
    remove: removeIntervention,
    filterInterventionRequests,
    filterInterventionHistory,
  } = useInterventions({ enabled: intDataEnabled });

  useEffect(() => {
    if (!detailVehicule?.id) return;
    const fresh = vehicules.find((v) => v.id === detailVehicule.id);
    if (fresh) setDetailVehicule(fresh);
  }, [vehicules, detailVehicule?.id]);

  function showVehToast(type, msg) {
    setVehToast({ type, msg });
    setTimeout(() => setVehToast(null), 3500);
  }

  function showIntToast(type, msg) {
    setIntToast({ type, msg });
    setTimeout(() => setIntToast(null), 3500);
  }

  const addVehicule = useCallback(async (data) => {
    const result = await createVehicule(data);
    if (result.success) {
      showVehToast('success', 'Véhicule ajouté.');
      return true;
    }
    showVehToast('error', result.error || 'Erreur enregistrement.');
    return false;
  }, [createVehicule]);

  const editVehiculeHandler = useCallback(async (data) => {
    const result = await updateVehicule(data.id, data);
    if (result.success) {
      setDetailVehicule((prev) => (prev && prev.id === data.id ? (result.data || data) : prev));
      setShowEditModal(false);
      setEditVehicule(null);
      showVehToast('success', 'Véhicule modifié.');
      return true;
    }
    showVehToast('error', result.error || 'Erreur enregistrement.');
    return false;
  }, [updateVehicule]);

  const deleteVehicule = useCallback(async (id) => {
    if (!window.confirm('Supprimer ce véhicule ?')) return;
    const result = await removeVehicule(id);
    if (result.success) {
      if (detailVehicule && detailVehicule.id === id) setDetailVehicule(null);
      showVehToast('success', 'Véhicule supprimé.');
    } else {
      showVehToast('error', result.error || 'Erreur suppression.');
    }
  }, [removeVehicule, detailVehicule]);

  const handleImportVehicules = useCallback(async () => {
    const result = await importVehiculesSeed();
    if (result.success) {
      const errPart = result.errors?.length ? ` (${result.errors.length} erreur(s))` : '';
      showVehToast('success', `Import : ${result.imported} ajouté(s), ${result.updated} mis à jour${errPart}.`);
    } else {
      showVehToast('error', result.error || 'Erreur import.');
    }
  }, [importVehiculesSeed]);

  const addIntervention = useCallback(async (data) => {
    const result = await createIntervention(data, vehicules);
    if (result.success) {
      showIntToast('success', 'Demande enregistrée.');
      return true;
    }
    showIntToast('error', result.error || 'Erreur enregistrement.');
    return false;
  }, [createIntervention, vehicules]);

  const editInterventionHandler = useCallback(async (data) => {
    const result = await updateIntervention(data.id, data, vehicules);
    if (result.success) {
      const closed = data.statut === 'termine' || data.statut === 'annule';
      showIntToast('success', closed ? 'Demande clôturée — visible dans Historique.' : 'Demande modifiée.');
      return true;
    }
    showIntToast('error', result.error || 'Erreur enregistrement.');
    return false;
  }, [updateIntervention, vehicules]);

  const deleteInterventionHandler = useCallback(async (id) => {
    if (!window.confirm('Supprimer cette demande ?')) return;
    const result = await removeIntervention(id);
    if (result.success) showIntToast('success', 'Demande supprimée.');
    else showIntToast('error', result.error || 'Erreur suppression.');
  }, [removeIntervention]);

  // Afficher le détail d'un véhicule
  if (detailVehicule) {
    return (
      <div className="animate-fade-in">
        <DetailVehicule
          vehicule={detailVehicule}
          interventions={interventionsVehicule}
          onBack={() => setDetailVehicule(null)}
          onEdit={(v) => { setEditVehicule(v); setShowEditModal(true); }}
          onOpenReport={(date) => {
            setDetailReportDate(date || null);
            setDetailReportOpen(true);
          }}
        />
        <VehicleDailyReportModal
          open={detailReportOpen}
          vehicle={detailVehicule}
          initialDate={detailReportDate}
          onClose={() => { setDetailReportOpen(false); setDetailReportDate(null); }}
          onSaved={async () => {
            setDetailReportOpen(false);
            setDetailReportDate(null);
            await loadVehicules();
            window.dispatchEvent(new Event('citymo:vehicle-reports-updated'));
            showVehToast('success', 'Compte rendu enregistré — kilométrage mis à jour.');
          }}
        />
        <Modal open={showEditModal} onClose={() => { setShowEditModal(false); setEditVehicule(null); }} title="Modifier le véhicule" width={780}>
          <FormulaireVehicule
            initial={editVehicule}
            onSave={editVehiculeHandler}
            saving={vehiculesSaving}
            onClose={() => { setShowEditModal(false); setEditVehicule(null); }}
          />
        </Modal>
      </div>
    );
  }

  return (
    <div className="logistique-module animate-fade-in">
      {/* Header */}
      <div className="page-header flex-between">
        <div>
          <h1 className="page-title">Logistique</h1>
          <p className="page-subtitle">Gestion de la flotte, interventions et maintenance véhicules</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm"><Download size={14} /> Export</button>
        </div>
      </div>

      {/* Onglets internes (sync sidebar via activeTab) */}
      <div className="logistique-tabs" role="tablist">
        {[
          ['vehicules',     <Truck size={14} />,         'Véhicules'],
          ['interventions', <Wrench size={14} />,        "Demandes d'intervention"],
          ['historique',    <Clock size={14} />,         'Historique'],
        ].map(([k, icon, label]) => {
          const isActive = tab === k;
          return (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setTab(k)}
              className={`logistique-tab${isActive ? ' logistique-tab--active' : ''}`}
            >
              {icon}{label}
            </button>
          );
        })}
      </div>

      {/* Contenu */}
      {vehToast && tab === 'vehicules' && (
        <div style={{
          marginBottom: 12, padding: '10px 14px', borderRadius: 8, fontSize: '0.85rem',
          background: vehToast.type === 'success' ? '#E8F5E9' : 'var(--red-light)',
          color: vehToast.type === 'success' ? '#2E7D32' : 'var(--red)',
        }}>
          {vehToast.msg}
        </div>
      )}

      {intToast && (tab === 'interventions' || tab === 'historique') && (
        <div style={{
          marginBottom: 12, padding: '10px 14px', borderRadius: 8, fontSize: '0.85rem',
          background: intToast.type === 'success' ? '#E8F5E9' : 'var(--red-light)',
          color: intToast.type === 'success' ? '#2E7D32' : 'var(--red)',
        }}>
          {intToast.msg}
        </div>
      )}

      {tab === 'vehicules' && (
        <SousModuleVehicules
          vehicules={vehicules}
          onAdd={addVehicule}
          onEdit={editVehiculeHandler}
          onDelete={deleteVehicule}
          onViewDetail={setDetailVehicule}
          onReportSaved={() => {
            loadVehicules();
            showVehToast('success', 'Compte rendu enregistré — kilométrage mis à jour.');
          }}
          loading={vehiculesLoading}
          saving={vehiculesSaving}
          error={vehiculesError}
          configured={vehiculesConfigured}
          onImportSeed={handleImportVehicules}
        />
      )}
      {tab === 'interventions' && (
        <SousModuleInterventions
          interventions={demandesInterventions}
          vehicules={vehicules}
          onAdd={addIntervention}
          onEdit={editInterventionHandler}
          onDelete={deleteInterventionHandler}
          loading={intLoading}
          saving={intSaving}
          error={intError}
          configured={intConfigured}
          filterFn={filterInterventionRequests}
        />
      )}
      {tab === 'historique' && (
        <SousModuleHistorique
          historique={historiqueInterventions}
          loading={intLoading}
          error={intError}
          filterFn={filterInterventionHistory}
        />
      )}
    </div>
  );
}

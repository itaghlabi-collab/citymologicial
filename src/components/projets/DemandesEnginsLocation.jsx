/**
 * DemandesEnginsLocation.jsx — Demande d'engin de location (sous Projets)
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus, Search, Eye, Pencil, Send, CheckCircle, XCircle, Archive,
  Loader2, X, Truck, Clock, Ban, Play,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { can } from '../../services/admin/permissions';
import { listProjectsForSelect } from '../../services/projects/projects';
import { formatSupabaseError } from '../../services/supabase/formatError';
import { isSupabaseConfigured } from '../../lib/supabase';
import {
  EQUIPMENT_TYPES,
  EQUIPMENT_DURATION_UNITS,
  EQUIPMENT_URGENCY,
  EQUIPMENT_RENTAL_STATUTS,
  EQUIPMENT_STATUS_TRANSITIONS,
  equipmentStatutMeta,
  equipmentUrgencyMeta,
  equipmentDurationLabel,
} from '../../constants/equipmentRentalRequests';
import {
  listEquipmentRentalRequests,
  getEquipmentRentalRequest,
  createEquipmentRentalRequest,
  updateEquipmentRentalRequest,
  changeEquipmentRentalStatus,
  submitEquipmentRentalRequest,
  validateEquipmentRentalForm,
} from '../../services/projects/equipmentRentalRequests';

const INPUT = {
  width: '100%', padding: '8px 11px', border: '1.5px solid var(--border)',
  borderRadius: 6, fontSize: '0.86rem', background: '#fff', outline: 'none',
  fontFamily: 'var(--font-body)', color: 'var(--text)', boxSizing: 'border-box',
};
const SELECT = { ...INPUT, cursor: 'pointer' };
const TEXTAREA = { ...INPUT, minHeight: 88, resize: 'vertical' };

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('fr-MA'); } catch { return iso; }
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('fr-MA'); } catch { return iso; }
}

function emptyForm(user) {
  const name = [user?.prenom, user?.nom].filter(Boolean).join(' ')
    || user?.fullName || user?.email || '';
  return {
    projetId: '',
    projetNom: '',
    projetLieId: '',
    projetLieNom: '',
    demandeurId: user?.id || '',
    demandeurNom: name,
    demandeurFonction: user?.fonction || user?.role || '',
    typeEngin: '',
    typeEnginAutre: '',
    dateDemande: todayISO(),
    dateDebutSouhaitee: todayISO(),
    dureePrevue: '1',
    uniteDuree: 'journee',
    quantite: '1',
    motifTravaux: '',
    niveauUrgence: 'normal',
    avecChauffeur: false,
    observation: '',
  };
}

function Modal({ open, onClose, title, children, width }) {
  if (!open) return null;
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: '#fff', borderRadius: 12, width: '100%', maxWidth: width || 760,
        maxHeight: '92vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
          position: 'sticky', top: 0, background: '#fff', zIndex: 1,
        }}>
          <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.05rem' }}>{title}</div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}><X size={16} /></button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  );
}

function Field({ label, required, error, children }) {
  return (
    <div>
      <label style={{
        display: 'block', fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-3)',
        textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5,
      }}>
        {label}{required ? <span style={{ color: 'var(--red)' }}> *</span> : null}
      </label>
      {children}
      {error ? <div style={{ color: 'var(--red)', fontSize: '0.75rem', marginTop: 4 }}>{error}</div> : null}
    </div>
  );
}

function Toast({ toast }) {
  if (!toast) return null;
  const bg = toast.type === 'success' ? '#2E7D32' : '#C62828';
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 3000, background: bg, color: '#fff',
      padding: '12px 18px', borderRadius: 10, fontWeight: 600, fontSize: '0.88rem',
      boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
    }}>
      {toast.msg}
    </div>
  );
}

export default function DemandesEnginsLocation() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [projects, setProjects] = useState([]);
  const [toast, setToast] = useState(null);
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState({
    projetId: '', typeEngin: '', demandeur: '', statut: '', urgence: '', dateFrom: '', dateTo: '',
  });
  const [perms, setPerms] = useState({
    voir: true, creer: false, modifier: false, valider: false, supprimer: false,
  });
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(() => emptyForm(user));
  const [formErr, setFormErr] = useState({});
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [motifModal, setMotifModal] = useState(null); // { id, statut, label }

  function notify(type, msg) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3200);
  }

  const load = useCallback(async () => {
    if (!isSupabaseConfigured()) { setLoading(false); return; }
    setLoading(true);
    try {
      const [list, projs, voir, creer, modifier, valider, supprimer] = await Promise.all([
        listEquipmentRentalRequests(),
        listProjectsForSelect().catch(() => []),
        can(user, 'demandes-engins', 'voir').catch(() => true),
        can(user, 'demandes-engins', 'creer').catch(() => false),
        can(user, 'demandes-engins', 'modifier').catch(() => false),
        can(user, 'demandes-engins', 'valider').catch(() => false),
        can(user, 'demandes-engins', 'supprimer').catch(() => false),
      ]);
      setRows(list || []);
      setProjects(projs || []);
      setPerms({ voir, creer, modifier, valider, supprimer });
    } catch (err) {
      notify('error', formatSupabaseError(err, 'Erreur chargement des demandes.'));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const search = q.trim().toLowerCase();
    return (rows || []).filter((r) => {
      if (filters.projetId && String(r.projetId) !== String(filters.projetId)) return false;
      if (filters.typeEngin && r.typeEngin !== filters.typeEngin) return false;
      if (filters.statut && r.statut !== filters.statut) return false;
      if (filters.urgence && r.niveauUrgence !== filters.urgence) return false;
      if (filters.demandeur && !(r.demandeurNom || '').toLowerCase().includes(filters.demandeur.toLowerCase())) return false;
      if (filters.dateFrom && r.dateDemande && r.dateDemande < filters.dateFrom) return false;
      if (filters.dateTo && r.dateDemande && r.dateDemande > filters.dateTo) return false;
      if (!search) return true;
      const hay = [
        r.reference, r.projetNom, r.typeEnginLabel, r.demandeurNom, r.statutLabel,
      ].join(' ').toLowerCase();
      return hay.includes(search);
    });
  }, [rows, q, filters]);

  async function openCreate() {
    setEditId(null);
    const base = emptyForm(user);
    try {
      const { data } = await (await import('../../lib/supabase')).getSupabase()
        .from('profiles')
        .select('nom, prenom, email, role, fonction')
        .eq('id', user?.id)
        .maybeSingle();
      if (data) {
        const { formatProfileDisplayName } = await import('../../services/admin/users');
        base.demandeurNom = formatProfileDisplayName(data) || data.email || base.demandeurNom;
        base.demandeurFonction = data.fonction || data.role || '';
        base.demandeurId = user?.id || '';
      }
    } catch { /* ignore */ }
    setForm(base);
    setFormErr({});
    setFormOpen(true);
  }

  async function openEdit(row) {
    if (row.statut !== 'brouillon') return;
    setEditId(row.id);
    setForm({
      projetId: row.projetId,
      projetNom: row.projetNom,
      projetLieId: row.projetLieId || row.projetId,
      projetLieNom: row.projetLieNom || row.projetNom,
      demandeurId: row.demandeurId,
      demandeurNom: row.demandeurNom,
      demandeurFonction: row.demandeurFonction,
      typeEngin: row.typeEngin,
      typeEnginAutre: row.typeEnginAutre || '',
      dateDemande: row.dateDemande,
      dateDebutSouhaitee: row.dateDebutSouhaitee,
      dureePrevue: String(row.dureePrevue),
      uniteDuree: row.uniteDuree,
      quantite: String(row.quantite),
      motifTravaux: row.motifTravaux,
      niveauUrgence: row.niveauUrgence,
      avecChauffeur: row.avecChauffeur,
      observation: row.observation,
    });
    setFormErr({});
    setFormOpen(true);
  }

  function setProjectField(which, projectId) {
    const p = projects.find((x) => String(x.id) === String(projectId));
    const nom = p ? (p.ref ? `${p.ref} — ${p.nom}` : p.nom) : '';
    if (which === 'main') {
      setForm((prev) => ({
        ...prev,
        projetId: projectId,
        projetNom: p?.nom || '',
        // Si projet lié vide, aligner sur le chantier principal (même source)
        projetLieId: prev.projetLieId || projectId,
        projetLieNom: prev.projetLieNom || p?.nom || '',
      }));
    } else {
      setForm((prev) => ({
        ...prev,
        projetLieId: projectId,
        projetLieNom: p?.nom || '',
      }));
    }
    return nom;
  }

  async function handleSave(e) {
    e.preventDefault();
    const payload = {
      ...form,
      projetLieId: form.projetLieId || form.projetId,
      avecChauffeur: !!form.avecChauffeur,
    };
    const errs = validateEquipmentRentalForm(payload);
    setFormErr(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      if (editId) {
        await updateEquipmentRentalRequest(editId, payload);
        notify('success', 'Brouillon mis à jour.');
      } else {
        await createEquipmentRentalRequest(payload);
        notify('success', 'Demande créée (brouillon).');
      }
      setFormOpen(false);
      await load();
    } catch (err) {
      notify('error', formatSupabaseError(err, 'Enregistrement impossible.'));
      if (err.fields) setFormErr(err.fields);
    } finally {
      setSaving(false);
    }
  }

  async function openDetail(id) {
    setDetailLoading(true);
    try {
      const d = await getEquipmentRentalRequest(id);
      setDetail(d);
    } catch (err) {
      notify('error', formatSupabaseError(err, 'Impossible de charger le détail.'));
    } finally {
      setDetailLoading(false);
    }
  }

  async function runStatus(id, statut, extra = {}) {
    try {
      await changeEquipmentRentalStatus(id, { statut, ...extra });
      notify('success', `Statut : ${equipmentStatutMeta(statut).label}`);
      setMotifModal(null);
      await load();
      if (detail?.id === id) await openDetail(id);
    } catch (err) {
      notify('error', formatSupabaseError(err, 'Action impossible.'));
    }
  }

  async function handleSend(row) {
    if (!window.confirm(`Envoyer la demande ${row.reference} ?`)) return;
    try {
      await submitEquipmentRentalRequest(row.id);
      notify('success', 'Demande envoyée.');
      await load();
      if (detail?.id === row.id) await openDetail(row.id);
    } catch (err) {
      notify('error', formatSupabaseError(err, 'Envoi impossible.'));
    }
  }

  function canActOn(row, action) {
    const transitions = EQUIPMENT_STATUS_TRANSITIONS[row.statut] || [];
    if (action === 'envoyer') {
      return row.statut === 'brouillon' && (perms.creer || perms.modifier || row.createdBy === user?.id);
    }
    if (action === 'modifier') {
      return row.statut === 'brouillon' && (perms.modifier || row.createdBy === user?.id);
    }
    if (['en_cours', 'validee', 'refusee', 'traitee'].includes(action)) {
      return perms.valider && transitions.includes(action);
    }
    if (action === 'annulee') {
      return transitions.includes('annulee') && (perms.modifier || perms.valider || row.createdBy === user?.id);
    }
    if (action === 'archivee') {
      return transitions.includes('archivee') && (perms.supprimer || perms.valider);
    }
    return false;
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-3)' }}>
        <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
        Chargement…
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <Toast toast={toast} />

      <div className="page-header flex-between" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Truck size={22} /> Demande d’engin de location
          </h1>
          <p className="page-subtitle" style={{ margin: 0 }}>
            Demander un engin pour un chantier — suivi simple (magasin, achats, direction)
          </p>
        </div>
        {perms.creer && (
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            <Plus size={16} /> Nouvelle demande
          </button>
        )}
      </div>

      <div className="card" style={{ marginBottom: 14, padding: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 10 }}>
          <div style={{ position: 'relative', gridColumn: 'span 2' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--text-3)' }} />
            <input
              style={{ ...INPUT, paddingLeft: 32 }}
              placeholder="Rechercher (réf., projet, engín, demandeur)…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <select style={SELECT} value={filters.projetId} onChange={(e) => setFilters((p) => ({ ...p, projetId: e.target.value }))}>
            <option value="">Tous les projets</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.ref ? `${p.ref} — ${p.nom}` : p.nom}</option>)}
          </select>
          <select style={SELECT} value={filters.typeEngin} onChange={(e) => setFilters((p) => ({ ...p, typeEngin: e.target.value }))}>
            <option value="">Tous les engins</option>
            {EQUIPMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select style={SELECT} value={filters.statut} onChange={(e) => setFilters((p) => ({ ...p, statut: e.target.value }))}>
            <option value="">Tous les statuts</option>
            {EQUIPMENT_RENTAL_STATUTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select style={SELECT} value={filters.urgence} onChange={(e) => setFilters((p) => ({ ...p, urgence: e.target.value }))}>
            <option value="">Toutes urgences</option>
            {EQUIPMENT_URGENCY.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
          </select>
          <input style={SELECT} placeholder="Demandeur" value={filters.demandeur} onChange={(e) => setFilters((p) => ({ ...p, demandeur: e.target.value }))} />
          <input type="date" style={SELECT} value={filters.dateFrom} onChange={(e) => setFilters((p) => ({ ...p, dateFrom: e.target.value }))} title="Du" />
          <input type="date" style={SELECT} value={filters.dateTo} onChange={(e) => setFilters((p) => ({ ...p, dateTo: e.target.value }))} title="Au" />
        </div>
      </div>

      <div className="card rh-ext-table-card">
        <div className="table-wrap" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Référence</th>
                <th>Projet / chantier</th>
                <th>Type d’engin</th>
                <th>Qté</th>
                <th>Demandeur</th>
                <th>Date demande</th>
                <th>Début souhaité</th>
                <th>Durée</th>
                <th>Urgence</th>
                <th>Chauffeur</th>
                <th>Statut</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={12} style={{ color: 'var(--text-3)', textAlign: 'center', padding: 28 }}>Aucune demande.</td></tr>
              ) : filtered.map((r) => {
                const urg = equipmentUrgencyMeta(r.niveauUrgence);
                const st = equipmentStatutMeta(r.statut);
                return (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 700 }}>{r.reference}</td>
                    <td>{r.projetNom || '—'}</td>
                    <td>{r.typeEnginLabel}</td>
                    <td>{r.quantite}</td>
                    <td>{r.demandeurNom || '—'}</td>
                    <td>{fmtDate(r.dateDemande)}</td>
                    <td>{fmtDate(r.dateDebutSouhaitee)}</td>
                    <td>{r.dureePrevue} {equipmentDurationLabel(r.uniteDuree)}</td>
                    <td><span className={`badge ${urg.badge}`}>{urg.label}</span></td>
                    <td>{r.avecChauffeur ? 'Avec' : 'Sans'}</td>
                    <td><span className={`badge ${st.badge}`}>{st.label}</span></td>
                    <td>
                      <div className="payment-row-actions" style={{ flexWrap: 'wrap' }}>
                        <button type="button" className="btn btn-secondary btn-sm" title="Voir" onClick={() => openDetail(r.id)}>
                          <Eye size={12} />
                        </button>
                        {canActOn(r, 'modifier') && (
                          <button type="button" className="btn btn-secondary btn-sm" title="Modifier" onClick={() => openEdit(r)}>
                            <Pencil size={12} />
                          </button>
                        )}
                        {canActOn(r, 'envoyer') && (
                          <button type="button" className="btn btn-secondary btn-sm" title="Envoyer" onClick={() => handleSend(r)}>
                            <Send size={12} />
                          </button>
                        )}
                        {canActOn(r, 'en_cours') && (
                          <button type="button" className="btn btn-secondary btn-sm" title="Prendre en charge" onClick={() => {
                            if (window.confirm('Prendre en charge cette demande ?')) runStatus(r.id, 'en_cours');
                          }}>
                            <Play size={12} />
                          </button>
                        )}
                        {canActOn(r, 'validee') && (
                          <button type="button" className="btn btn-secondary btn-sm" title="Valider" onClick={() => {
                            if (window.confirm('Valider cette demande ?')) runStatus(r.id, 'validee');
                          }}>
                            <CheckCircle size={12} />
                          </button>
                        )}
                        {canActOn(r, 'refusee') && (
                          <button type="button" className="btn btn-secondary btn-sm" title="Refuser" onClick={() => setMotifModal({ id: r.id, statut: 'refusee', label: 'Motif du refus' })}>
                            <XCircle size={12} />
                          </button>
                        )}
                        {canActOn(r, 'traitee') && (
                          <button type="button" className="btn btn-secondary btn-sm" title="Marquer traitée" onClick={() => {
                            if (window.confirm('Marquer comme traitée ?')) runStatus(r.id, 'traitee');
                          }}>
                            <CheckCircle size={12} />
                          </button>
                        )}
                        {canActOn(r, 'annulee') && (
                          <button type="button" className="btn btn-secondary btn-sm" title="Annuler" onClick={() => setMotifModal({ id: r.id, statut: 'annulee', label: 'Motif de l’annulation' })}>
                            <Ban size={12} />
                          </button>
                        )}
                        {canActOn(r, 'archivee') && (
                          <button type="button" className="btn btn-secondary btn-sm" title="Archiver" onClick={() => {
                            if (window.confirm('Archiver cette demande ?')) runStatus(r.id, 'archivee');
                          }}>
                            <Archive size={12} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Formulaire */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editId ? 'Modifier la demande' : 'Nouvelle demande d’engin de location'}
        width={820}
      >
        <form onSubmit={handleSave}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))', gap: 12 }}>
            <Field label="Projet / chantier" required error={formErr.projetId}>
              <select
                style={SELECT}
                value={form.projetId}
                onChange={(e) => setProjectField('main', e.target.value)}
                required
              >
                <option value="">— Sélectionner —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.ref ? `${p.ref} — ${p.nom}` : p.nom}</option>
                ))}
              </select>
            </Field>
            <Field
              label="Projet lié"
              required
              error={formErr.projetLieId}
            >
              <select
                style={SELECT}
                value={form.projetLieId || form.projetId}
                onChange={(e) => setProjectField('lie', e.target.value)}
              >
                <option value="">— Même que le chantier —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.ref ? `${p.ref} — ${p.nom}` : p.nom}</option>
                ))}
              </select>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 4 }}>
                Même liste projets. Si identique, une seule relation est stockée.
              </div>
            </Field>
            <Field label="Demandeur" required>
              <input style={{ ...INPUT, background: 'var(--surface-2)' }} value={form.demandeurNom} readOnly />
            </Field>
            <Field label="Fonction">
              <input style={{ ...INPUT, background: 'var(--surface-2)' }} value={form.demandeurFonction} readOnly />
            </Field>
            <Field label="Type d’engin" required error={formErr.typeEngin}>
              <select
                style={SELECT}
                value={form.typeEngin}
                onChange={(e) => setForm((p) => ({ ...p, typeEngin: e.target.value }))}
                required
              >
                <option value="">—</option>
                {EQUIPMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            {form.typeEngin === 'Autre' && (
              <Field label="Préciser le type d’engin" required error={formErr.typeEnginAutre}>
                <input
                  style={INPUT}
                  value={form.typeEnginAutre}
                  onChange={(e) => setForm((p) => ({ ...p, typeEnginAutre: e.target.value }))}
                  required
                />
              </Field>
            )}
            <Field label="Date de la demande" required error={formErr.dateDemande}>
              <input
                type="date"
                style={INPUT}
                value={form.dateDemande}
                onChange={(e) => setForm((p) => ({ ...p, dateDemande: e.target.value }))}
                required
              />
            </Field>
            <Field label="Date de début souhaitée" required error={formErr.dateDebutSouhaitee}>
              <input
                type="date"
                style={INPUT}
                value={form.dateDebutSouhaitee}
                onChange={(e) => setForm((p) => ({ ...p, dateDebutSouhaitee: e.target.value }))}
                required
              />
            </Field>
            <Field label="Durée prévue" required error={formErr.dureePrevue}>
              <input
                type="number"
                min="0.5"
                step="0.5"
                style={INPUT}
                value={form.dureePrevue}
                onChange={(e) => setForm((p) => ({ ...p, dureePrevue: e.target.value }))}
                required
              />
            </Field>
            <Field label="Unité de durée" required error={formErr.uniteDuree}>
              <select
                style={SELECT}
                value={form.uniteDuree}
                onChange={(e) => setForm((p) => ({ ...p, uniteDuree: e.target.value }))}
              >
                {EQUIPMENT_DURATION_UNITS.map((u) => (
                  <option key={u.value} value={u.value}>{u.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Quantité" required error={formErr.quantite}>
              <input
                type="number"
                min="1"
                step="1"
                style={INPUT}
                value={form.quantite}
                onChange={(e) => setForm((p) => ({ ...p, quantite: e.target.value }))}
                required
              />
            </Field>
            <Field label="Niveau d’urgence" required error={formErr.niveauUrgence}>
              <select
                style={SELECT}
                value={form.niveauUrgence}
                onChange={(e) => setForm((p) => ({ ...p, niveauUrgence: e.target.value }))}
              >
                {EQUIPMENT_URGENCY.map((u) => (
                  <option key={u.value} value={u.value}>{u.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Chauffeur" required error={formErr.avecChauffeur}>
              <div style={{ display: 'flex', gap: 16, paddingTop: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.86rem' }}>
                  <input
                    type="radio"
                    name="chauffeur"
                    checked={form.avecChauffeur === true}
                    onChange={() => setForm((p) => ({ ...p, avecChauffeur: true }))}
                  />
                  Avec chauffeur
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.86rem' }}>
                  <input
                    type="radio"
                    name="chauffeur"
                    checked={form.avecChauffeur === false}
                    onChange={() => setForm((p) => ({ ...p, avecChauffeur: false }))}
                  />
                  Sans chauffeur
                </label>
              </div>
            </Field>
          </div>
          <div style={{ marginTop: 12 }}>
            <Field label="Motif / travaux à réaliser" required error={formErr.motifTravaux}>
              <textarea
                style={TEXTAREA}
                value={form.motifTravaux}
                onChange={(e) => setForm((p) => ({ ...p, motifTravaux: e.target.value }))}
                placeholder="Ex. Terrassement, levage, compactage…"
                required
              />
            </Field>
          </div>
          <div style={{ marginTop: 12 }}>
            <Field label="Observation" required error={formErr.observation}>
              <textarea
                style={TEXTAREA}
                value={form.observation}
                onChange={(e) => setForm((p) => ({ ...p, observation: e.target.value }))}
                placeholder="Accès, horaires, contraintes chantier…"
                required
              />
            </Field>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <button type="button" className="btn btn-secondary" onClick={() => setFormOpen(false)}>Annuler</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? '…' : (editId ? 'Enregistrer' : 'Enregistrer le brouillon')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Détail */}
      <Modal open={!!detail || detailLoading} onClose={() => setDetail(null)} title={detail ? `Demande ${detail.reference}` : 'Détail'} width={780}>
        {detailLoading && !detail ? (
          <div style={{ textAlign: 'center', padding: 24 }}><Loader2 className="spin" /></div>
        ) : detail ? (
          <div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
              <span className={`badge ${equipmentStatutMeta(detail.statut).badge}`}>{detail.statutLabel}</span>
              <span className={`badge ${equipmentUrgencyMeta(detail.niveauUrgence).badge}`}>
                {equipmentUrgencyMeta(detail.niveauUrgence).label}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 12, fontSize: '0.88rem' }}>
              <div><strong>Projet / chantier</strong><div>{detail.projetNom || '—'}</div></div>
              <div><strong>Projet lié</strong><div>{detail.projetLieNom || detail.projetNom || '—'}</div></div>
              <div><strong>Demandeur</strong><div>{detail.demandeurNom}{detail.demandeurFonction ? ` — ${detail.demandeurFonction}` : ''}</div></div>
              <div><strong>Type d’engin</strong><div>{detail.typeEnginLabel}</div></div>
              <div><strong>Quantité</strong><div>{detail.quantite}</div></div>
              <div><strong>Date demande</strong><div>{fmtDate(detail.dateDemande)}</div></div>
              <div><strong>Début souhaité</strong><div>{fmtDate(detail.dateDebutSouhaitee)}</div></div>
              <div><strong>Durée</strong><div>{detail.dureePrevue} {equipmentDurationLabel(detail.uniteDuree)}</div></div>
              <div><strong>Chauffeur</strong><div>{detail.avecChauffeur ? 'Avec chauffeur' : 'Sans chauffeur'}</div></div>
              <div><strong>Créée le</strong><div>{fmtDateTime(detail.createdAt)}</div></div>
              <div><strong>Modifiée le</strong><div>{fmtDateTime(detail.updatedAt)}</div></div>
            </div>
            <div style={{ marginTop: 14 }}>
              <strong>Motif / travaux</strong>
              <p style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>{detail.motifTravaux}</p>
            </div>
            <div style={{ marginTop: 12 }}>
              <strong>Observation</strong>
              <p style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>{detail.observation}</p>
            </div>
            {detail.motifRefus ? (
              <div style={{ marginTop: 12, color: '#C62828' }}><strong>Motif refus :</strong> {detail.motifRefus}</div>
            ) : null}
            {detail.motifAnnulation ? (
              <div style={{ marginTop: 12, color: '#C62828' }}><strong>Motif annulation :</strong> {detail.motifAnnulation}</div>
            ) : null}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
              {canActOn(detail, 'modifier') && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setDetail(null); openEdit(detail); }}>
                  <Pencil size={13} /> Modifier
                </button>
              )}
              {canActOn(detail, 'envoyer') && (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => handleSend(detail)}>
                  <Send size={13} /> Envoyer
                </button>
              )}
              {canActOn(detail, 'en_cours') && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => runStatus(detail.id, 'en_cours')}>Prendre en charge</button>
              )}
              {canActOn(detail, 'validee') && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => runStatus(detail.id, 'validee')}>Valider</button>
              )}
              {canActOn(detail, 'refusee') && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMotifModal({ id: detail.id, statut: 'refusee', label: 'Motif du refus' })}>Refuser</button>
              )}
              {canActOn(detail, 'traitee') && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => runStatus(detail.id, 'traitee')}>Marquer traitée</button>
              )}
              {canActOn(detail, 'annulee') && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMotifModal({ id: detail.id, statut: 'annulee', label: 'Motif de l’annulation' })}>Annuler</button>
              )}
              {canActOn(detail, 'archivee') && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => runStatus(detail.id, 'archivee')}>Archiver</button>
              )}
            </div>

            <div style={{ marginTop: 22 }}>
              <div style={{ fontWeight: 800, fontSize: '0.78rem', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Clock size={14} /> Historique
              </div>
              {(detail.history || []).length === 0 ? (
                <p style={{ color: 'var(--text-3)', fontSize: '0.85rem' }}>Aucun événement.</p>
              ) : (
                <div className="table-wrap" style={{ padding: 0 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th><th>Utilisateur</th><th>Action</th><th>Ancien</th><th>Nouveau</th><th>Commentaire</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.history.map((h) => (
                        <tr key={h.id}>
                          <td>{fmtDateTime(h.createdAt)}</td>
                          <td>{h.utilisateurNom || '—'}</td>
                          <td>{h.action}</td>
                          <td>{h.ancienStatut ? equipmentStatutMeta(h.ancienStatut).label : '—'}</td>
                          <td>{h.nouveauStatut ? equipmentStatutMeta(h.nouveauStatut).label : '—'}</td>
                          <td>{h.commentaire || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Motif refus / annulation */}
      <Modal
        open={!!motifModal}
        onClose={() => setMotifModal(null)}
        title={motifModal?.label || 'Motif'}
        width={480}
      >
        {motifModal && (
          <MotifForm
            label={motifModal.label}
            onCancel={() => setMotifModal(null)}
            onConfirm={(motif) => {
              if (motifModal.statut === 'refusee') {
                runStatus(motifModal.id, 'refusee', { motifRefus: motif });
              } else {
                runStatus(motifModal.id, 'annulee', { motifAnnulation: motif });
              }
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function MotifForm({ label, onCancel, onConfirm }) {
  const [motif, setMotif] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!motif.trim()) return;
        onConfirm(motif.trim());
      }}
    >
      <Field label={label} required>
        <textarea style={TEXTAREA} value={motif} onChange={(e) => setMotif(e.target.value)} required />
      </Field>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Annuler</button>
        <button type="submit" className="btn btn-primary">Confirmer</button>
      </div>
    </form>
  );
}

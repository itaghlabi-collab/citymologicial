/**
 * DemandesLogistique.jsx — Récupération de matériel, outils et consommables.
 * Lecture seule des bons de préparation. Aucune écriture stock / achat / chantier.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Plus, Search, RefreshCw, Eye, Package, User, Calendar, Truck,
  Loader2, X, Link2, AlertTriangle, CheckCircle, MapPin,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { usePickupRequests } from '../../hooks/usePickupRequests';
import { can, canAccessRoute } from '../../services/admin/permissions';
import { listVehicles } from '../../services/logistique/vehicles';
import { listEmployees, employeeFullName } from '../../services/rh/employees';
import { listProjectsForSelect, projectDisplayLabel } from '../../services/projects/projects';
import {
  canLookupPreparationBons,
  searchPreparationBons,
  pickupFormFromBon,
} from '../../services/logistique/preparationBonLookup';
import {
  PICKUP_STATUTS,
  PICKUP_PRIORITES,
  PICKUP_ACTIVE_STATUTS,
  pickupStatutMeta,
  remainingQty,
  isPickupLocked,
  findActiveLinkedToBon,
  filterPickupRequests,
} from '../../services/logistique/pickupRequests';

const INPUT = {
  width: '100%', padding: '8px 11px', border: '1.5px solid var(--border)',
  borderRadius: 6, fontSize: '0.86rem', background: '#fff', outline: 'none',
  fontFamily: 'var(--font-body)', color: 'var(--text)', boxSizing: 'border-box',
};
const SELECT = { ...INPUT, cursor: 'pointer' };
const TEXTAREA = { ...INPUT, minHeight: 72, resize: 'vertical' };

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR'); } catch { return d; }
}

function userDisplayName(user) {
  return [user?.prenom, user?.nom].filter(Boolean).join(' ').trim()
    || user?.fullName || user?.email || '';
}

function emptyLine() {
  return { id: `new-${Math.random().toString(36).slice(2, 8)}`, designation: '', unite: 'U', qty_to_recover: '' };
}

function emptyForm(user) {
  return {
    demandeur_id: user?.id || '',
    demandeur_nom: userDisplayName(user),
    date_creation: todayISO(),
    bon_id: '',
    bon_ref: '',
    bon_snapshot: null,
    lieu_recuperation: '',
    destination: '',
    project_id: '',
    project_name: '',
    date_souhaitee: '',
    priorite: 'normale',
    observations: '',
    assignee_id: '',
    assignee_name: '',
    vehicle_id: '',
    vehicle_label: '',
    lines: [emptyLine()],
  };
}

function StatBadge({ statut }) {
  const m = pickupStatutMeta(statut);
  return <span className={`badge ${m.cls}`}>{m.label}</span>;
}

export default function DemandesLogistique() {
  const { user } = useAuth();
  const { records, loading, saving, error, reload, create, assign, confirm, cancel, start } = usePickupRequests({ user });

  const [canCreate, setCanCreate] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [canBonLookup, setCanBonLookup] = useState(false);

  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [view, setView] = useState('list');
  const [form, setForm] = useState(() => emptyForm(user));
  const [formError, setFormError] = useState('');
  const [detail, setDetail] = useState(null);
  const [toast, setToast] = useState('');

  const [bonQuery, setBonQuery] = useState('');
  const [bonResults, setBonResults] = useState([]);
  const [bonSearching, setBonSearching] = useState(false);
  const [duplicateBons, setDuplicateBons] = useState([]);
  const [ackDuplicate, setAckDuplicate] = useState(false);

  const [employees, setEmployees] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [projects, setProjects] = useState([]);

  const [assignPatch, setAssignPatch] = useState({ assignee_id: '', assignee_name: '', vehicle_id: '', vehicle_label: '' });
  const [recovery, setRecovery] = useState({ dateEffective: todayISO(), notes: '', actorName: '', qtys: {} });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [c, e, b] = await Promise.all([
        can(user, 'interventions', 'creer').catch(() => false),
        can(user, 'interventions', 'modifier').catch(() => false),
        canLookupPreparationBons(user),
      ]);
      if (!cancelled) {
        setCanCreate(c);
        setCanEdit(e);
        setCanBonLookup(b);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    listEmployees().then((rows) => setEmployees(rows || [])).catch(() => setEmployees([]));
    listVehicles().then((rows) => setVehicles(rows || [])).catch(() => setVehicles([]));
    canAccessRoute(user, 'projets')
      .then((ok) => (ok ? listProjectsForSelect() : []))
      .then((rows) => setProjects(rows || []))
      .catch(() => setProjects([]));
  }, [user]);

  const filtered = useMemo(
    () => filterPickupRequests(records, { search, statut: filterStatut }),
    [records, search, filterStatut],
  );

  function notify(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  }

  function openCreate() {
    setForm(emptyForm(user));
    setFormError('');
    setBonQuery('');
    setBonResults([]);
    setDuplicateBons([]);
    setAckDuplicate(false);
    setView('form');
  }

  function set(k, v) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  function setLine(id, patch) {
    setForm((p) => ({
      ...p,
      lines: p.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    }));
  }

  async function onSearchBon() {
    if (!canBonLookup) return;
    setBonSearching(true);
    try {
      const rows = await searchPreparationBons(bonQuery);
      setBonResults(rows);
    } catch {
      setBonResults([]);
      setFormError('Lecture des bons indisponible (droits ou connexion).');
    } finally {
      setBonSearching(false);
    }
  }

  function selectBon(snapshot) {
    const mapped = pickupFormFromBon(snapshot);
    const dupes = findActiveLinkedToBon(records, snapshot.id);
    setDuplicateBons(dupes);
    setAckDuplicate(dupes.length === 0);
    setForm((p) => ({
      ...p,
      ...mapped,
      demandeur_id: p.demandeur_id,
      demandeur_nom: p.demandeur_nom,
      date_creation: p.date_creation,
      priorite: p.priorite,
      observations: p.observations,
      assignee_id: p.assignee_id,
      assignee_name: p.assignee_name,
      vehicle_id: p.vehicle_id,
      vehicle_label: p.vehicle_label,
    }));
    setBonResults([]);
  }

  function clearBon() {
    setForm((p) => ({
      ...p,
      bon_id: '',
      bon_ref: '',
      bon_snapshot: null,
      lines: [emptyLine()],
    }));
    setDuplicateBons([]);
    setAckDuplicate(false);
  }

  async function handleCreate(e) {
    e.preventDefault();
    setFormError('');
    if (duplicateBons.length && !ackDuplicate) {
      setFormError('Une demande active est déjà liée à ce bon. Cochez la confirmation pour continuer.');
      return;
    }
    const payload = {
      ...form,
      lines: form.bon_id
        ? form.lines
        : form.lines.filter((l) => String(l.designation || '').trim()),
    };
    const res = await create(payload);
    if (res.success) {
      notify(`Demande ${res.data.ref} créée.`);
      setDetail(res.data);
      setView('detail');
    } else {
      setFormError(res.error || 'Création impossible.');
    }
  }

  function openDetail(row) {
    setDetail(row);
    setAssignPatch({
      assignee_id: row.assignee_id || '',
      assignee_name: row.assignee_name || '',
      vehicle_id: row.vehicle_id || '',
      vehicle_label: row.vehicle_label || '',
    });
    const qtys = {};
    (row.lines || []).forEach((l) => { qtys[l.id] = remainingQty(l) || ''; });
    setRecovery({
      dateEffective: todayISO(),
      notes: '',
      actorName: row.assignee_name || userDisplayName(user),
      qtys,
    });
    setView('detail');
  }

  useEffect(() => {
    if (!detail) return;
    const fresh = records.find((r) => r.id === detail.id);
    if (fresh) setDetail(fresh);
  }, [records, detail?.id]);

  async function handleAssign() {
    const veh = vehicles.find((v) => v.id === assignPatch.vehicle_id);
    const emp = employees.find((e) => e.id === assignPatch.assignee_id);
    const res = await assign(detail.id, {
      assignee_id: assignPatch.assignee_id || null,
      assignee_name: emp ? employeeFullName(emp) : assignPatch.assignee_name,
      vehicle_id: assignPatch.vehicle_id || null,
      vehicle_label: veh ? (veh.matricule || veh.vehicule) : assignPatch.vehicle_label,
    });
    if (res.success) notify('Affectation enregistrée.');
  }

  async function handleConfirmRecovery(e) {
    e.preventDefault();
    const res = await confirm(detail.id, {
      quantities: recovery.qtys,
      actorName: recovery.actorName || userDisplayName(user),
      actorId: user?.id,
      dateEffective: recovery.dateEffective,
      notes: recovery.notes,
    });
    if (res.success) {
      notify(res.data.statut === 'recuperee' ? 'Récupération complète enregistrée.' : 'Récupération partielle enregistrée.');
      const qtys = {};
      (res.data.lines || []).forEach((l) => { qtys[l.id] = remainingQty(l) || ''; });
      setRecovery((p) => ({ ...p, qtys, notes: '' }));
    }
  }

  const liveDetail = detail && records.find((r) => r.id === detail.id) ? records.find((r) => r.id === detail.id) : detail;

  return (
    <div className="logistique-module animate-fade-in">
      <div className="page-header flex-between">
        <div>
          <h1 className="page-title">Logistique</h1>
          <p className="page-subtitle">Demandes de récupération de matériel, outils et consommables</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={reload} disabled={loading}>
            <RefreshCw size={14} /> Actualiser
          </button>
          {canCreate && view === 'list' && (
            <button type="button" className="btn btn-primary" onClick={openCreate}>
              <Plus size={15} /> Nouvelle demande logistique
            </button>
          )}
        </div>
      </div>

      {toast && (
        <div className="card" style={{ marginBottom: 12, padding: '10px 14px', background: '#E8F5E9', color: '#2E7D32', fontSize: '0.85rem' }}>
          {toast}
        </div>
      )}
      {error && (
        <div className="card" style={{ marginBottom: 12, padding: '10px 14px', background: 'var(--red-light)', color: 'var(--red)', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}

      {view === 'list' && (
        <>
          <div className="card" style={{ marginBottom: 16, padding: '14px 20px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              <div style={{ position: 'relative', minWidth: 220, flex: 1 }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Réf., demandeur, chantier…" style={{ ...INPUT, paddingLeft: 32 }} />
              </div>
              <select value={filterStatut} onChange={(e) => setFilterStatut(e.target.value)} style={{ ...SELECT, maxWidth: 180 }}>
                <option value="">Tous les statuts</option>
                {PICKUP_STATUTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 40 }}><Loader2 size={24} className="spin" /></div>
          ) : filtered.length === 0 ? (
            <div className="card">
              <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-3)' }}>
                <Package size={28} style={{ marginBottom: 10, opacity: 0.5 }} />
                <div style={{ fontWeight: 700, color: 'var(--text-2)', marginBottom: 6 }}>Aucune demande logistique</div>
                <div style={{ fontSize: '0.85rem' }}>Les demandes de récupération apparaissent ici. Les interventions véhicules restent dans Parc automobile.</div>
                {canCreate && (
                  <button type="button" className="btn btn-primary btn-sm" style={{ marginTop: 16 }} onClick={openCreate}>
                    <Plus size={14} /> Nouvelle demande logistique
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="card" style={{ padding: 0 }}>
              <div className="table-wrap log-desktop-table">
                <table>
                  <thead>
                    <tr>
                      <th>Référence</th>
                      <th>Demandeur</th>
                      <th>Chantier / destination</th>
                      <th>Date souhaitée</th>
                      <th>Récupération</th>
                      <th>Statut</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => (
                      <tr key={r.id}>
                        <td style={{ fontWeight: 700 }}>{r.ref}</td>
                        <td>{r.demandeur_nom || '—'}</td>
                        <td>{r.destination || r.project_name || '—'}</td>
                        <td>{fmtDate(r.date_souhaitee)}</td>
                        <td>{r.assignee_name || '—'}</td>
                        <td><StatBadge statut={r.statut} /></td>
                        <td>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => openDetail(r)}><Eye size={13} /> Détail</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="log-mobile-list">
                {filtered.map((r) => (
                  <div key={r.id} className="log-mobile-card" onClick={() => openDetail(r)} style={{ cursor: 'pointer' }}>
                    <div className="log-mobile-card-head">
                      <div>
                        <div className="log-mobile-card-title">{r.ref}</div>
                        <div className="log-mobile-card-sub">{r.destination || r.project_name || '—'}</div>
                      </div>
                      <StatBadge statut={r.statut} />
                    </div>
                    <div className="log-mobile-card-meta">
                      <div className="log-mobile-meta-row"><span>Demandeur</span><span>{r.demandeur_nom || '—'}</span></div>
                      <div className="log-mobile-meta-row"><span>Souhaitée</span><span>{fmtDate(r.date_souhaitee)}</span></div>
                      <div className="log-mobile-meta-row"><span>Récupération</span><span>{r.assignee_name || '—'}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {view === 'form' && (
        <form className="card" onSubmit={handleCreate} style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <strong>Nouvelle demande logistique</strong>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setView('list')}><X size={14} /> Annuler</button>
          </div>
          {formError && <div style={{ marginBottom: 12, color: 'var(--red)', fontSize: '0.85rem' }}>{formError}</div>}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <label style={{ fontSize: '0.82rem' }}>Demandeur
              <input value={form.demandeur_nom} readOnly style={{ ...INPUT, marginTop: 4, background: 'var(--surface-2)' }} />
            </label>
            <label style={{ fontSize: '0.82rem' }}>Date de création
              <input type="date" value={form.date_creation} readOnly style={{ ...INPUT, marginTop: 4, background: 'var(--surface-2)' }} />
            </label>
          </div>

          {canBonLookup && (
            <div style={{ marginBottom: 16, padding: 12, border: '1px dashed var(--border)', borderRadius: 8 }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase' }}>Bon de préparation (lecture seule)</div>
              {form.bon_ref ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className="badge badge-blue"><Link2 size={12} /> {form.bon_ref}</span>
                  <span style={{ fontSize: '0.84rem' }}>{form.project_name}</span>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={clearBon}>Retirer le lien</button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input value={bonQuery} onChange={(e) => setBonQuery(e.target.value)} placeholder="Référence ou chantier" style={{ ...INPUT, flex: 1, minWidth: 180 }} />
                  <button type="button" className="btn btn-secondary btn-sm" onClick={onSearchBon} disabled={bonSearching}>
                    {bonSearching ? 'Recherche…' : 'Rechercher'}
                  </button>
                </div>
              )}
              {bonResults.length > 0 && (
                <div style={{ marginTop: 8, maxHeight: 180, overflow: 'auto' }}>
                  {bonResults.map((b) => (
                    <button key={b.id} type="button" className="btn btn-ghost btn-sm" style={{ display: 'block', width: '100%', textAlign: 'left' }} onClick={() => selectBon(b)}>
                      <strong>{b.ref}</strong> — {b.project_name || b.project_ref || 'Sans chantier'} · {b.depot_source || 'dépôt n/c'}
                    </button>
                  ))}
                </div>
              )}
              {duplicateBons.length > 0 && (
                <div style={{ marginTop: 10, padding: 10, background: '#FFF8E1', borderRadius: 6, fontSize: '0.84rem', color: '#E65100' }}>
                  <AlertTriangle size={14} /> Demande active déjà liée à ce bon : {duplicateBons.map((d) => d.ref).join(', ')}.
                  <label style={{ display: 'flex', gap: 8, marginTop: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={ackDuplicate} onChange={(e) => setAckDuplicate(e.target.checked)} />
                    Créer quand même
                  </label>
                </div>
              )}
              <p style={{ margin: '8px 0 0', fontSize: '0.75rem', color: 'var(--text-3)' }}>
                Le bon n’est pas modifié. Sans bon, décrivez les éléments ci-dessous (aucun article catalogue ni demande d’achat).
              </p>
            </div>
          )}

          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase' }}>Articles à récupérer</div>
          {(form.lines || []).map((l) => (
            <div key={l.id} style={{ display: 'grid', gridTemplateColumns: form.bon_id ? '2fr 80px 90px 90px 90px' : '2fr 80px 110px 32px', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <input
                value={l.designation}
                onChange={(e) => setLine(l.id, { designation: e.target.value })}
                placeholder="Désignation"
                style={INPUT}
                readOnly={Boolean(form.bon_id)}
                required={!form.bon_id}
              />
              <input value={l.unite} onChange={(e) => setLine(l.id, { unite: e.target.value })} placeholder="Unité" style={INPUT} readOnly={Boolean(form.bon_id)} />
              {form.bon_id && (
                <>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>Dem. {l.qty_demandee_bon ?? '—'}</span>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>Prép. {l.qty_preparee_bon ?? '—'}</span>
                </>
              )}
              <input
                type="number"
                min="0"
                step="0.01"
                value={l.qty_to_recover}
                onChange={(e) => setLine(l.id, { qty_to_recover: e.target.value })}
                placeholder="Qté"
                style={INPUT}
                readOnly={Boolean(form.bon_id)}
              />
              {!form.bon_id && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm((p) => ({ ...p, lines: p.lines.filter((x) => x.id !== l.id).concat(p.lines.length === 1 ? [emptyLine()] : []) }))}>
                  <X size={13} />
                </button>
              )}
            </div>
          ))}
          {!form.bon_id && (
            <button type="button" className="btn btn-ghost btn-sm" style={{ marginBottom: 14 }} onClick={() => setForm((p) => ({ ...p, lines: [...p.lines, emptyLine()] }))}>
              <Plus size={13} /> Ligne
            </button>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <label style={{ fontSize: '0.82rem' }}>Lieu de récupération
              <input value={form.lieu_recuperation} onChange={(e) => set('lieu_recuperation', e.target.value)} style={{ ...INPUT, marginTop: 4 }} />
            </label>
            <label style={{ fontSize: '0.82rem' }}>Destination / chantier
              {projects.length ? (
                <select
                  value={form.project_id}
                  onChange={(e) => {
                    const p = projects.find((x) => x.id === e.target.value);
                    setForm((prev) => ({
                      ...prev,
                      project_id: e.target.value,
                      project_name: p ? projectDisplayLabel(p) : '',
                      destination: p ? projectDisplayLabel(p) : prev.destination,
                    }));
                  }}
                  style={{ ...SELECT, marginTop: 4 }}
                >
                  <option value="">— Saisie libre ci-dessous —</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{projectDisplayLabel(p)}</option>)}
                </select>
              ) : (
                <input value={form.destination} onChange={(e) => set('destination', e.target.value)} style={{ ...INPUT, marginTop: 4 }} />
              )}
            </label>
          </div>
          {projects.length > 0 && (
            <label style={{ fontSize: '0.82rem', display: 'block', marginBottom: 12 }}>Destination (libellé)
              <input value={form.destination} onChange={(e) => set('destination', e.target.value)} style={{ ...INPUT, marginTop: 4 }} />
            </label>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <label style={{ fontSize: '0.82rem' }}>Date souhaitée
              <input type="date" value={form.date_souhaitee} onChange={(e) => set('date_souhaitee', e.target.value)} style={{ ...INPUT, marginTop: 4 }} />
            </label>
            <label style={{ fontSize: '0.82rem' }}>Priorité
              <select value={form.priorite} onChange={(e) => set('priorite', e.target.value)} style={{ ...SELECT, marginTop: 4 }}>
                {PICKUP_PRIORITES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </label>
            <label style={{ fontSize: '0.82rem' }}>Véhicule (facultatif)
              <select
                value={form.vehicle_id}
                onChange={(e) => {
                  const v = vehicles.find((x) => x.id === e.target.value);
                  setForm((prev) => ({ ...prev, vehicle_id: e.target.value, vehicle_label: v ? (v.matricule || v.vehicule) : '' }));
                }}
                style={{ ...SELECT, marginTop: 4 }}
              >
                <option value="">— Aucun —</option>
                {vehicles.map((v) => <option key={v.id} value={v.id}>{v.matricule || v.vehicule}</option>)}
              </select>
            </label>
          </div>

          <label style={{ fontSize: '0.82rem', display: 'block', marginBottom: 12 }}>Personne chargée de la récupération
            <select
              value={form.assignee_id}
              onChange={(e) => {
                const emp = employees.find((x) => x.id === e.target.value);
                setForm((prev) => ({ ...prev, assignee_id: e.target.value, assignee_name: emp ? employeeFullName(emp) : '' }));
              }}
              style={{ ...SELECT, marginTop: 4 }}
            >
              <option value="">— À affecter plus tard —</option>
              {employees.map((emp) => <option key={emp.id} value={emp.id}>{employeeFullName(emp)}</option>)}
            </select>
          </label>

          <label style={{ fontSize: '0.82rem', display: 'block', marginBottom: 16 }}>Observations
            <textarea value={form.observations} onChange={(e) => set('observations', e.target.value)} style={{ ...TEXTAREA, marginTop: 4 }} />
          </label>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={() => setView('list')}>Annuler</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Enregistrement…' : 'Créer la demande'}</button>
          </div>
        </form>
      )}

      {view === 'detail' && liveDetail && (
        <DetailPickup
          request={liveDetail}
          canEdit={canEdit}
          saving={saving}
          employees={employees}
          vehicles={vehicles}
          assignPatch={assignPatch}
          setAssignPatch={setAssignPatch}
          onAssign={handleAssign}
          onStart={() => start(liveDetail.id)}
          onCancel={() => {
            const reason = window.prompt('Motif d’annulation ?') || '';
            cancel(liveDetail.id, reason);
          }}
          recovery={recovery}
          setRecovery={setRecovery}
          onConfirm={handleConfirmRecovery}
          userName={userDisplayName(user)}
          onBack={() => { setView('list'); setDetail(null); }}
        />
      )}
    </div>
  );
}

function DetailPickup({
  request, canEdit, saving, employees, vehicles,
  assignPatch, setAssignPatch, onAssign, onStart, onCancel,
  recovery, setRecovery, onConfirm, userName, onBack,
}) {
  const locked = isPickupLocked(request);
  const snapshot = request.bon_snapshot;
  const [showBon, setShowBon] = useState(false);

  return (
    <div>
      <button type="button" className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginBottom: 12 }}>← Retour à la liste</button>
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.1rem' }}>{request.ref}</div>
            <div style={{ fontSize: '0.84rem', color: 'var(--text-3)', marginTop: 4 }}>
              {request.demandeur_nom} · créée le {fmtDate(request.date_creation || request.created_at)}
            </div>
          </div>
          <StatBadge statut={request.statut} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginTop: 16, fontSize: '0.84rem' }}>
          <div><MapPin size={13} /> {request.lieu_recuperation || '—'}</div>
          <div>→ {request.destination || request.project_name || '—'}</div>
          <div><Calendar size={13} /> {fmtDate(request.date_souhaitee)}</div>
          <div><User size={13} /> {request.assignee_name || 'Non affecté'}</div>
          <div><Truck size={13} /> {request.vehicle_label || '—'}</div>
        </div>
        {request.bon_ref && (
          <div style={{ marginTop: 14 }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowBon(true)}>
              <Link2 size={13} /> Consulter le bon {request.bon_ref}
            </button>
            <span style={{ marginLeft: 8, fontSize: '0.75rem', color: 'var(--text-3)' }}>Lecture seule — le bon n’est pas modifié</span>
          </div>
        )}
        {request.observations && <p style={{ marginTop: 12, fontSize: '0.86rem' }}>{request.observations}</p>}
      </div>

      <div className="card" style={{ padding: 0, marginBottom: 16 }}>
        <div style={{ padding: '12px 16px', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>Quantités</div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Désignation</th>
                <th>Unité</th>
                {request.bon_id && <th>Demandée (bon)</th>}
                {request.bon_id && <th>Préparée (bon)</th>}
                <th>À récupérer</th>
                <th>Récupéré</th>
                <th>Restant</th>
              </tr>
            </thead>
            <tbody>
              {(request.lines || []).map((l) => (
                <tr key={l.id}>
                  <td>{l.designation}{l.emplacement_source ? <span style={{ color: 'var(--text-3)', fontSize: '0.75rem' }}> · {l.emplacement_source}</span> : null}</td>
                  <td>{l.unite}</td>
                  {request.bon_id && <td>{l.qty_demandee_bon ?? '—'}</td>}
                  {request.bon_id && <td>{l.qty_preparee_bon ?? '—'}</td>}
                  <td>{l.qty_to_recover}</td>
                  <td style={{ color: '#2E7D32', fontWeight: 600 }}>{l.qty_recovered || 0}</td>
                  <td style={{ fontWeight: 700 }}>{remainingQty(l)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {canEdit && !locked && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-3)', marginBottom: 10, textTransform: 'uppercase' }}>Affectation</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <select
              value={assignPatch.assignee_id}
              onChange={(e) => {
                const emp = employees.find((x) => x.id === e.target.value);
                setAssignPatch((p) => ({ ...p, assignee_id: e.target.value, assignee_name: emp ? employeeFullName(emp) : '' }));
              }}
              style={SELECT}
            >
              <option value="">Personne chargée…</option>
              {employees.map((emp) => <option key={emp.id} value={emp.id}>{employeeFullName(emp)}</option>)}
            </select>
            <select
              value={assignPatch.vehicle_id}
              onChange={(e) => {
                const v = vehicles.find((x) => x.id === e.target.value);
                setAssignPatch((p) => ({ ...p, vehicle_id: e.target.value, vehicle_label: v ? (v.matricule || v.vehicule) : '' }));
              }}
              style={SELECT}
            >
              <option value="">Véhicule (facultatif)</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.matricule || v.vehicule}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onAssign} disabled={saving}>Enregistrer l’affectation</button>
            {request.statut !== 'en_cours' && PICKUP_ACTIVE_STATUTS.includes(request.statut) && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={onStart} disabled={saving}>Passer en cours</button>
            )}
            <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={onCancel} disabled={saving}>Annuler la demande</button>
          </div>
        </div>
      )}

      {canEdit && !locked && (
        <form className="card" onSubmit={onConfirm} style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-3)', marginBottom: 10, textTransform: 'uppercase' }}>Confirmer une récupération</div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-3)', margin: '0 0 10px' }}>
            N’enregistre que le suivi logistique. Aucune sortie de stock ni livraison.
          </p>
          {(request.lines || []).map((l) => (
            <label key={l.id} style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: 8, marginBottom: 8, fontSize: '0.84rem', alignItems: 'center' }}>
              <span>{l.designation} <span style={{ color: 'var(--text-3)' }}>(restant {remainingQty(l)} {l.unite})</span></span>
              <input
                type="number"
                min="0"
                max={remainingQty(l)}
                step="0.01"
                value={recovery.qtys[l.id] ?? ''}
                onChange={(e) => setRecovery((p) => ({ ...p, qtys: { ...p.qtys, [l.id]: e.target.value } }))}
                style={INPUT}
                disabled={remainingQty(l) <= 0}
              />
            </label>
          ))}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
            <input value={recovery.actorName || userName} onChange={(e) => setRecovery((p) => ({ ...p, actorName: e.target.value }))} placeholder="Personne ayant récupéré" style={INPUT} />
            <input type="date" value={recovery.dateEffective} onChange={(e) => setRecovery((p) => ({ ...p, dateEffective: e.target.value }))} style={INPUT} />
          </div>
          <textarea value={recovery.notes} onChange={(e) => setRecovery((p) => ({ ...p, notes: e.target.value }))} placeholder="Observations" style={{ ...TEXTAREA, marginTop: 8 }} />
          <button type="submit" className="btn btn-primary" style={{ marginTop: 10 }} disabled={saving}>
            <CheckCircle size={14} /> Enregistrer la récupération
          </button>
        </form>
      )}

      {(request.recoveries || []).length > 0 && (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-3)', marginBottom: 10, textTransform: 'uppercase' }}>Récupérations déjà enregistrées</div>
          {(request.recoveries || []).map((ev) => (
            <div key={ev.id} style={{ fontSize: '0.84rem', marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
              <strong>{fmtDate(ev.date_effective)}</strong> — {ev.by_name || '—'}
              {ev.notes ? ` · ${ev.notes}` : ''}
              <div style={{ color: 'var(--text-3)', fontSize: '0.78rem' }}>
                {(ev.lines || []).map((x) => `${x.qty}`).join(' + ')} unité(s) confirmée(s)
              </div>
            </div>
          ))}
        </div>
      )}

      {showBon && snapshot && (
        <div className="modal-overlay" onClick={() => setShowBon(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="card" style={{ maxWidth: 640, width: '100%', maxHeight: '80vh', overflow: 'auto', padding: 20 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong>Bon {snapshot.ref} — lecture seule</strong>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowBon(false)}><X size={14} /></button>
            </div>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-3)' }}>
              {snapshot.project_name} · dépôt {snapshot.depot_source || '—'} · {snapshot.statutLabel || snapshot.statut}
            </p>
            <table style={{ width: '100%', fontSize: '0.84rem' }}>
              <thead>
                <tr><th>Article</th><th>U</th><th>Dem.</th><th>Prép.</th><th>Source</th></tr>
              </thead>
              <tbody>
                {(snapshot.lines || []).map((l, i) => (
                  <tr key={l.id || i}>
                    <td>{l.article_name || l.designation}</td>
                    <td>{l.unite}</td>
                    <td>{l.quantite_demandee}</td>
                    <td>{l.quantite_preparee}</td>
                    <td>{l.emplacement_source || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

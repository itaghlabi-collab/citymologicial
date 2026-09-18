/**
 * DemandesLogistique.jsx — Formulaire unique : bon, départ, destination, chauffeur, réceptionnaire.
 * Lecture seule du bon. Aucune écriture stock / livraison / bon d’origine.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Plus, Search, RefreshCw, Eye, Package, Loader2, X, Pencil, Trash2,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { usePickupRequests } from '../../hooks/usePickupRequests';
import { can } from '../../services/admin/permissions';
import { listEmployees, employeeFullName } from '../../services/rh/employees';
import { listProjectsForSelect, projectDisplayLabel } from '../../services/projects/projects';
import {
  searchPreparationBons,
  pickupFormFromBon,
} from '../../services/logistique/preparationBonLookup';
import {
  filterPickupRequests,
  filterPickupDriverEmployees,
  pickupDepartureLabel,
  pickupDestinationLabel,
} from '../../services/logistique/pickupRequests';

const INPUT = {
  width: '100%', padding: '8px 11px', border: '1.5px solid var(--border)',
  borderRadius: 6, fontSize: '0.86rem', background: '#fff', outline: 'none',
  fontFamily: 'var(--font-body)', color: 'var(--text)', boxSizing: 'border-box',
};
const SELECT = { ...INPUT, cursor: 'pointer' };

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

function emptyForm(user) {
  return {
    id: '',
    demandeur_id: user?.id || '',
    demandeur_nom: userDisplayName(user),
    date_creation: todayISO(),
    bon_id: '',
    bon_ref: '',
    bon_snapshot: null,
    lines: [],
    departure_project_id: '',
    departure_project_name: '',
    destination_project_id: '',
    destination_project_name: '',
    assignee_id: '',
    assignee_name: '',
    receptionnaire_id: '',
    receptionnaire_name: '',
  };
}

function formFromRecord(row, user) {
  return {
    ...emptyForm(user),
    id: row.id,
    ref: row.ref,
    demandeur_id: row.demandeur_id,
    demandeur_nom: row.demandeur_nom,
    date_creation: row.date_creation || String(row.created_at || '').slice(0, 10),
    bon_id: row.bon_id || '',
    bon_ref: row.bon_ref || '',
    bon_snapshot: row.bon_snapshot || null,
    lines: row.lines || [],
    departure_project_id: row.departure_project_id || '',
    departure_project_name: pickupDepartureLabel(row) === '—' ? '' : pickupDepartureLabel(row),
    destination_project_id: row.destination_project_id || row.project_id || '',
    destination_project_name: pickupDestinationLabel(row) === '—' ? '' : pickupDestinationLabel(row),
    assignee_id: row.assignee_id || '',
    assignee_name: row.assignee_name || '',
    receptionnaire_id: row.receptionnaire_id || '',
    receptionnaire_name: row.receptionnaire_name || '',
  };
}

function empLabel(emp) {
  const name = employeeFullName(emp);
  return emp.poste ? `${name} — ${emp.poste}` : name;
}

function PickupRowActions({ row, canEdit, canDelete, saving, onView, onEdit, onDelete }) {
  return (
    <div className="log-pickup-actions">
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => onView(row)} disabled={saving}>
        <Eye size={13} /> Voir
      </button>
      {canEdit && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onEdit(row)} disabled={saving}>
          <Pencil size={13} /> Modifier
        </button>
      )}
      {canDelete && (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          style={{ color: 'var(--red)' }}
          onClick={() => onDelete(row)}
          disabled={saving}
        >
          <Trash2 size={13} /> Supprimer
        </button>
      )}
    </div>
  );
}

export default function DemandesLogistique() {
  const { user } = useAuth();
  const { records, loading, saving, error, reload, save, remove } = usePickupRequests({ user });

  const [canCreate, setCanCreate] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [canDelete, setCanDelete] = useState(false);

  const [search, setSearch] = useState('');
  const [view, setView] = useState('list');
  const [form, setForm] = useState(() => emptyForm(user));
  const [formError, setFormError] = useState('');
  const [detail, setDetail] = useState(null);
  const [toast, setToast] = useState('');

  const [employees, setEmployees] = useState([]);
  const [projects, setProjects] = useState([]);
  const [bons, setBons] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [c, e, d] = await Promise.all([
        can(user, 'interventions', 'creer').catch(() => false),
        can(user, 'interventions', 'modifier').catch(() => false),
        can(user, 'interventions', 'supprimer').catch(() => false),
      ]);
      if (!cancelled) {
        setCanCreate(c);
        setCanEdit(e);
        setCanDelete(d);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    listEmployees().then((rows) => setEmployees(rows || [])).catch(() => setEmployees([]));
    listProjectsForSelect().then((rows) => setProjects(rows || [])).catch(() => setProjects([]));
    searchPreparationBons('').then((rows) => setBons(rows || [])).catch(() => setBons([]));
  }, []);

  const driverEmployees = useMemo(
    () => filterPickupDriverEmployees(employees, { keepId: form.assignee_id }),
    [employees, form.assignee_id],
  );

  const filtered = useMemo(
    () => filterPickupRequests(records, { search }),
    [records, search],
  );

  function notify(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  }

  function openCreate() {
    setForm(emptyForm(user));
    setFormError('');
    setDetail(null);
    setView('form');
  }

  function openEdit(row) {
    setForm(formFromRecord(row, user));
    setFormError('');
    setDetail(row);
    setView('form');
  }

  function openView(row) {
    setDetail(row);
    setView('detail');
  }

  function onSelectBon(bonId) {
    const snapshot = bons.find((b) => String(b.id) === String(bonId));
    if (!snapshot) {
      setForm((p) => ({ ...p, bon_id: '', bon_ref: '', bon_snapshot: null, lines: [] }));
      return;
    }
    const mapped = pickupFormFromBon(snapshot);
    setForm((p) => ({ ...p, ...mapped }));
  }

  function onSelectProject(fieldId, fieldName, projectId) {
    const p = projects.find((x) => String(x.id) === String(projectId));
    setForm((prev) => ({
      ...prev,
      [fieldId]: projectId,
      [fieldName]: p ? projectDisplayLabel(p) : '',
    }));
  }

  async function handleSave(e) {
    e.preventDefault();
    setFormError('');
    const previous = form.id ? records.find((r) => r.id === form.id) : null;
    const res = await save(form, { employees, previous });
    if (res.success) {
      notify(previous ? `Demande ${res.data.ref} modifiée.` : `Demande ${res.data.ref} enregistrée.`);
      setDetail(res.data);
      setView('detail');
    } else {
      setFormError(res.error || 'Enregistrement impossible.');
    }
  }

  async function handleDelete(row) {
    if (!window.confirm(`Supprimer la demande ${row.ref} ? Le bon de préparation d’origine ne sera pas modifié.`)) return;
    const res = await remove(row.id);
    if (res.success) {
      notify(`Demande ${row.ref} supprimée.`);
      if (detail?.id === row.id || form.id === row.id) {
        setDetail(null);
        setForm(emptyForm(user));
        setView('list');
      }
    }
  }

  const rowActionProps = {
    canEdit,
    canDelete,
    saving,
    onView: openView,
    onEdit: openEdit,
    onDelete: handleDelete,
  };

  const liveDetail = detail && (records.find((r) => r.id === detail.id) || detail);

  return (
    <div className="logistique-module log-pickup-page animate-fade-in">
      <div className="page-header flex-between">
        <div>
          <h1 className="page-title">Logistique</h1>
          <p className="page-subtitle">Demandes de récupération liées à un bon de préparation</p>
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
            <div style={{ position: 'relative', minWidth: 220 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Bon, départ, destination…" style={{ ...INPUT, paddingLeft: 32 }} />
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 40 }}><Loader2 size={24} className="spin" /></div>
          ) : filtered.length === 0 ? (
            <div className="card">
              <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-3)' }}>
                <Package size={28} style={{ marginBottom: 10, opacity: 0.5 }} />
                <div style={{ fontWeight: 700, color: 'var(--text-2)', marginBottom: 6 }}>Aucune demande logistique</div>
                <div style={{ fontSize: '0.85rem' }}>Enregistrez une récupération à partir d’un bon de préparation.</div>
                {canCreate && (
                  <button type="button" className="btn btn-primary btn-sm" style={{ marginTop: 16 }} onClick={openCreate}>
                    <Plus size={14} /> Nouvelle demande logistique
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="card" style={{ padding: 0 }}>
              <div className="table-wrap table-wrap--wide log-desktop-table">
                <table>
                  <thead>
                    <tr>
                      <th>Bon</th>
                      <th>Départ</th>
                      <th>Destination</th>
                      <th>Chauffeur / Coursier</th>
                      <th>Réceptionnaire</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => (
                      <tr key={r.id}>
                        <td data-label="Bon" style={{ fontWeight: 700 }}>{r.bon_ref || r.ref || '—'}</td>
                        <td data-label="Départ">{pickupDepartureLabel(r)}</td>
                        <td data-label="Destination">{pickupDestinationLabel(r)}</td>
                        <td data-label="Chauffeur / Coursier">{r.assignee_name || '—'}</td>
                        <td data-label="Réceptionnaire">{r.receptionnaire_name || '—'}</td>
                        <td data-label="Actions" className="log-pickup-actions-cell">
                          <PickupRowActions row={r} {...rowActionProps} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="log-mobile-list" aria-label="Liste des demandes logistiques">
                {filtered.map((r) => (
                  <div key={r.id} className="log-mobile-card">
                    <div className="log-mobile-card-head">
                      <div>
                        <div className="log-mobile-card-title">{r.bon_ref || r.ref}</div>
                        <div className="log-mobile-card-sub">{pickupDestinationLabel(r)}</div>
                      </div>
                    </div>
                    <div className="log-mobile-card-meta">
                      <div className="log-mobile-meta-row"><span>Départ</span><span>{pickupDepartureLabel(r)}</span></div>
                      <div className="log-mobile-meta-row"><span>Chauffeur</span><span>{r.assignee_name || '—'}</span></div>
                      <div className="log-mobile-meta-row"><span>Réceptionnaire</span><span>{r.receptionnaire_name || '—'}</span></div>
                    </div>
                    <div className="log-mobile-card-actions">
                      <PickupRowActions row={r} {...rowActionProps} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {view === 'form' && (
        <form className="card" onSubmit={handleSave} style={{ padding: 20, maxWidth: 720 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <strong>{form.id ? 'Modifier la demande' : 'Nouvelle demande logistique'}</strong>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setView('list')}><X size={14} /> Annuler</button>
          </div>
          {formError && <div style={{ marginBottom: 12, color: 'var(--red)', fontSize: '0.85rem' }}>{formError}</div>}

          <label style={{ fontSize: '0.82rem', display: 'block', marginBottom: 14 }}>Bon de préparation
            <select value={form.bon_id} onChange={(e) => onSelectBon(e.target.value)} style={{ ...SELECT, marginTop: 4 }} required>
              <option value="">— Sélectionner —</option>
              {form.bon_id && !bons.some((b) => String(b.id) === String(form.bon_id)) && (
                <option value={form.bon_id}>{form.bon_ref || form.bon_id}</option>
              )}
              {bons.map((b) => (
                <option key={b.id} value={b.id}>{b.ref}{b.project_name ? ` — ${b.project_name}` : ''}</option>
              ))}
            </select>
          </label>

          {(form.lines || []).length > 0 && (
            <div style={{ marginBottom: 16, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ padding: '8px 12px', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', background: 'var(--surface-2)' }}>
                Articles du bon (lecture seule)
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Désignation</th>
                      <th>Unité</th>
                      <th>Demandée</th>
                      <th>Préparée</th>
                    </tr>
                  </thead>
                  <tbody>
                    {form.lines.map((l) => (
                      <tr key={l.id}>
                        <td>{l.designation}</td>
                        <td>{l.unite}</td>
                        <td>{l.qty_demandee_bon ?? '—'}</td>
                        <td>{l.qty_preparee_bon ?? l.qty_to_recover}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <label style={{ fontSize: '0.82rem', display: 'block', marginBottom: 14 }}>Lieu de départ
            <select
              value={form.departure_project_id}
              onChange={(e) => onSelectProject('departure_project_id', 'departure_project_name', e.target.value)}
              style={{ ...SELECT, marginTop: 4 }}
              required
            >
              <option value="">— Sélectionner —</option>
              {form.departure_project_name && !projects.some((p) => String(p.id) === String(form.departure_project_id)) && (
                <option value={form.departure_project_id || '__kept_dep__'}>{form.departure_project_name}</option>
              )}
              {projects.map((p) => <option key={p.id} value={p.id}>{projectDisplayLabel(p)}</option>)}
            </select>
          </label>

          <label style={{ fontSize: '0.82rem', display: 'block', marginBottom: 14 }}>Destination
            <select
              value={form.destination_project_id}
              onChange={(e) => onSelectProject('destination_project_id', 'destination_project_name', e.target.value)}
              style={{ ...SELECT, marginTop: 4 }}
              required
            >
              <option value="">— Sélectionner —</option>
              {form.destination_project_name && !projects.some((p) => String(p.id) === String(form.destination_project_id)) && (
                <option value={form.destination_project_id || '__kept_dest__'}>{form.destination_project_name}</option>
              )}
              {projects.map((p) => <option key={p.id} value={p.id}>{projectDisplayLabel(p)}</option>)}
            </select>
          </label>

          <label style={{ fontSize: '0.82rem', display: 'block', marginBottom: 14 }}>Chauffeur / Coursier
            <select
              value={form.assignee_id}
              onChange={(e) => {
                const emp = employees.find((x) => String(x.id) === String(e.target.value));
                setForm((prev) => ({
                  ...prev,
                  assignee_id: e.target.value,
                  assignee_name: emp ? employeeFullName(emp) : '',
                }));
              }}
              style={{ ...SELECT, marginTop: 4 }}
              required
            >
              <option value="">— Sélectionner —</option>
              {driverEmployees.map((emp) => <option key={emp.id} value={emp.id}>{empLabel(emp)}</option>)}
            </select>
          </label>

          <label style={{ fontSize: '0.82rem', display: 'block', marginBottom: 18 }}>Réceptionnaire
            <select
              value={form.receptionnaire_id}
              onChange={(e) => {
                const emp = employees.find((x) => String(x.id) === String(e.target.value));
                setForm((prev) => ({
                  ...prev,
                  receptionnaire_id: e.target.value,
                  receptionnaire_name: emp ? employeeFullName(emp) : '',
                }));
              }}
              style={{ ...SELECT, marginTop: 4 }}
              required
            >
              <option value="">— Sélectionner —</option>
              {form.receptionnaire_id && !employees.some((e) => String(e.id) === String(form.receptionnaire_id)) && (
                <option value={form.receptionnaire_id}>{form.receptionnaire_name || form.receptionnaire_id}</option>
              )}
              {employees.map((emp) => <option key={emp.id} value={emp.id}>{empLabel(emp)}</option>)}
            </select>
          </label>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={() => setView('list')}>Annuler</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
          </div>
        </form>
      )}

      {view === 'detail' && liveDetail && (
        <div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setView('list')} style={{ marginBottom: 12 }}>← Retour à la liste</button>
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800 }}>{liveDetail.ref}</div>
                <div style={{ fontSize: '0.84rem', color: 'var(--text-3)', marginTop: 4 }}>
                  {liveDetail.demandeur_nom} · {fmtDate(liveDetail.date_creation || liveDetail.created_at)}
                </div>
              </div>
              <PickupRowActions row={liveDetail} {...rowActionProps} />
            </div>
            <div style={{ display: 'grid', gap: 8, marginTop: 16, fontSize: '0.88rem' }}>
              <div><strong>Bon</strong> — {liveDetail.bon_ref || '—'}</div>
              <div><strong>Départ</strong> — {pickupDepartureLabel(liveDetail)}</div>
              <div><strong>Destination</strong> — {pickupDestinationLabel(liveDetail)}</div>
              <div><strong>Chauffeur / Coursier</strong> — {liveDetail.assignee_name || '—'}</div>
              <div><strong>Réceptionnaire</strong> — {liveDetail.receptionnaire_name || '—'}</div>
            </div>
            {(liveDetail.lines || []).length > 0 && (
              <div className="table-wrap" style={{ marginTop: 16 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Désignation</th>
                      <th>Unité</th>
                      <th>Demandée</th>
                      <th>Préparée</th>
                    </tr>
                  </thead>
                  <tbody>
                    {liveDetail.lines.map((l) => (
                      <tr key={l.id}>
                        <td>{l.designation}</td>
                        <td>{l.unite}</td>
                        <td>{l.qty_demandee_bon ?? '—'}</td>
                        <td>{l.qty_preparee_bon ?? l.qty_to_recover}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * DemandesLogistique.jsx — Suivi des déplacements logistiques.
 * Formulaire unique + historique. Lecture seule du parc et des bons.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, RefreshCw, Eye, Package, Loader2, Pencil, Trash2, Clock,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { usePickupRequests } from '../../hooks/usePickupRequests';
import { can } from '../../services/admin/permissions';
import { listEmployees, employeeFullName } from '../../services/rh/employees';
import { listAdminUsers } from '../../services/admin/users';
import { listProjectsForSelect, projectDisplayLabel } from '../../services/projects/projects';
import { listVehicles } from '../../services/logistique/vehicles';
import { searchPreparationBons } from '../../services/logistique/preparationBonLookup';
import {
  filterPickupRequests,
  pickupDepartureLabel,
  pickupDestinationLabel,
  TRIP_MOTIFS,
  TRIP_STATUTS,
  motifLabel,
  tripStatutMeta,
  collectLocationSuggestions,
  normalizeTimeHM,
} from '../../services/logistique/pickupRequests';

const INPUT = {
  width: '100%', padding: '11px 14px', border: '1.5px solid var(--border)',
  borderRadius: 8, fontSize: '1rem', background: '#fff', outline: 'none',
  fontFamily: 'var(--font-body)', color: 'var(--text)', boxSizing: 'border-box',
  minHeight: 46,
};
const SELECT = { ...INPUT, cursor: 'pointer' };

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
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
    date_deplacement: todayISO(),
    heure_depart: nowHHMM(),
    heure_retour: '',
    vehicle_id: '',
    vehicle_label: '',
    assignee_id: '',
    assignee_name: '',
    departure_project_id: '',
    departure_project_name: '',
    destination_project_id: '',
    destination_project_name: '',
    motif: '',
    bon_id: '',
    bon_ref: '',
    bon_snapshot: null,
    lines: [],
    observations: '',
  };
}

function formFromRecord(row, user) {
  return {
    ...emptyForm(user),
    id: row.id,
    ref: row.ref,
    demandeur_id: row.demandeur_id,
    demandeur_nom: row.demandeur_nom,
    date_deplacement: row.date_deplacement || todayISO(),
    heure_depart: row.heure_depart || nowHHMM(),
    heure_retour: row.heure_retour || '',
    vehicle_id: row.vehicle_id || '',
    vehicle_label: row.vehicle_label || '',
    assignee_id: row.assignee_id || '',
    assignee_name: row.assignee_name || '',
    departure_project_id: row.departure_project_id || '',
    departure_project_name: pickupDepartureLabel(row) === '—' ? '' : pickupDepartureLabel(row),
    destination_project_id: row.destination_project_id || '',
    destination_project_name: pickupDestinationLabel(row) === '—' ? '' : pickupDestinationLabel(row),
    motif: row.motif || '',
    bon_id: row.bon_id || '',
    bon_ref: row.bon_ref || '',
    bon_snapshot: row.bon_snapshot || null,
    lines: row.lines || [],
    observations: row.observations || '',
  };
}

function vehicleOptionLabel(v) {
  if (!v) return '';
  const name = [v.marque, v.modele].filter(Boolean).join(' ') || v.vehicule || '';
  const mat = v.matricule || v.matricule_ww || '';
  if (mat && name) return `${mat} — ${name}`;
  return mat || name || v.id || '';
}

function bonOptionLabel(b) {
  if (!b) return '';
  return b.project_name ? `${b.ref} — ${b.project_name}` : (b.ref || b.id || '');
}

function personLabel(p) {
  return p.label || p.name || '';
}

function mergePeople(employees = [], users = []) {
  const byKey = new Map();
  (employees || []).forEach((emp) => {
    const name = employeeFullName(emp);
    if (!name) return;
    byKey.set(`emp:${emp.id}`, {
      id: String(emp.id),
      name,
      label: emp.poste ? `${name} — ${emp.poste}` : name,
    });
  });
  (users || []).forEach((u) => {
    const name = [u.prenom, u.nom].filter(Boolean).join(' ').trim() || u.email || '';
    if (!name) return;
    if (u.employee_id && byKey.has(`emp:${u.employee_id}`)) return;
    const id = String(u.employee_id || u.id);
    if (byKey.has(`emp:${id}`) || [...byKey.values()].some((p) => String(p.id) === id)) return;
    byKey.set(`user:${u.id}`, { id, name, label: name });
  });
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

function normQuery(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function PickupSearchSelect({
  value,
  options,
  getLabel,
  getId = (o) => o.id,
  onChange,
  placeholder = 'Rechercher…',
  disabled = false,
  emptyLabel = 'Aucun résultat',
}) {
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = options.find((o) => String(getId(o)) === String(value));
  const selectedLabel = selected ? getLabel(selected) : '';

  useEffect(() => {
    if (!open) setQuery(selectedLabel);
  }, [open, selectedLabel]);

  useEffect(() => {
    function onDocClick(e) {
      if (wrapRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const q = normQuery(query);
  const browsing = open && (!q || query === selectedLabel);
  const filtered = browsing
    ? options
    : options.filter((o) => normQuery(getLabel(o)).includes(q));

  return (
    <div className="log-pickup-search" ref={wrapRef}>
      <input
        className="log-pickup-search-input"
        value={open ? query : selectedLabel}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={() => {
          if (disabled) return;
          setQuery('');
          setOpen(true);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          if (!e.target.value && value) onChange('');
        }}
      />
      {open && !disabled && (
        <div className="log-pickup-search-menu" role="listbox">
          {filtered.length === 0 ? (
            <div className="log-pickup-search-option" style={{ color: 'var(--text-3)', cursor: 'default' }}>
              {emptyLabel}
            </div>
          ) : filtered.slice(0, 60).map((opt) => {
            const id = String(getId(opt));
            const active = id === String(value);
            return (
              <button
                key={id}
                type="button"
                role="option"
                aria-selected={active}
                className={`log-pickup-search-option${active ? ' is-active' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(id);
                  setQuery(getLabel(opt));
                  setOpen(false);
                }}
              >
                {getLabel(opt)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LocationInput({ id, value, onChange, suggestions, disabled, required }) {
  return (
    <>
      <input
        list={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={INPUT}
        required={required}
        disabled={disabled}
        autoComplete="off"
        placeholder="Saisir ou choisir un lieu…"
      />
      <datalist id={id}>
        {suggestions.map((s) => <option key={s} value={s} />)}
      </datalist>
    </>
  );
}

function TripRowActions({
  row, canEdit, canDelete, saving, onView, onEdit, onReturn, onDelete,
}) {
  const canReturn = canEdit && tripStatutMeta(row).value === 'en_deplacement';
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
      {canReturn && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onReturn(row)} disabled={saving}>
          <Clock size={13} /> Renseigner le retour
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
  const { records, loading, saving, error, reload, save, recordReturn, remove } = usePickupRequests({ user });

  const [canCreate, setCanCreate] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [canDelete, setCanDelete] = useState(false);

  const [formMode, setFormMode] = useState('create');
  const [form, setForm] = useState(() => emptyForm(user));
  const [formError, setFormError] = useState('');
  const [toast, setToast] = useState('');

  const [employees, setEmployees] = useState([]);
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [bons, setBons] = useState([]);

  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterVehicle, setFilterVehicle] = useState('');
  const [filterChauffeur, setFilterChauffeur] = useState('');
  const [filterMotif, setFilterMotif] = useState('');
  const [filterStatut, setFilterStatut] = useState('');

  const readOnly = formMode === 'view';
  const returnOnly = formMode === 'return';
  const fieldsLocked = readOnly || returnOnly;

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
    listAdminUsers().then((rows) => setUsers(rows || [])).catch(() => setUsers([]));
    listProjectsForSelect().then((rows) => setProjects(rows || [])).catch(() => setProjects([]));
    listVehicles().then((rows) => setVehicles(rows || [])).catch(() => setVehicles([]));
    searchPreparationBons('').then((rows) => setBons(rows || [])).catch(() => setBons([]));
  }, []);

  const people = useMemo(
    () => mergePeople(employees, users),
    [employees, users],
  );

  const bonOptions = useMemo(() => {
    const list = [...bons];
    if (form.bon_id && !list.some((b) => String(b.id) === String(form.bon_id))) {
      list.unshift({ id: form.bon_id, ref: form.bon_ref || form.bon_id, project_name: '' });
    }
    return list;
  }, [bons, form.bon_id, form.bon_ref]);

  const locationSuggestions = useMemo(() => {
    const projectNames = (projects || []).map((p) => projectDisplayLabel(p)).filter(Boolean);
    return collectLocationSuggestions(records, projectNames);
  }, [records, projects]);

  const filtered = useMemo(
    () => filterPickupRequests(records, {
      dateFrom: filterDateFrom,
      dateTo: filterDateTo,
      vehicle: filterVehicle,
      chauffeur: filterChauffeur,
      motif: filterMotif,
      statut: filterStatut,
    }).slice().sort((a, b) => {
      const da = `${a.date_deplacement || ''}T${a.heure_depart || '00:00'}`;
      const db = `${b.date_deplacement || ''}T${b.heure_depart || '00:00'}`;
      return db.localeCompare(da);
    }),
    [records, filterDateFrom, filterDateTo, filterVehicle, filterChauffeur, filterMotif, filterStatut],
  );

  const chauffeurFilterOptions = useMemo(() => {
    const seen = new Set();
    const out = [];
    records.forEach((r) => {
      const name = String(r.assignee_name || '').trim();
      if (!name) return;
      const key = name.toUpperCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ id: String(r.assignee_id || name), name });
    });
    people.forEach((p) => {
      const key = p.name.toUpperCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ id: p.id, name: p.name });
    });
    return out.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [records, people]);

  function notify(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  }

  function resetForm() {
    setForm(emptyForm(user));
    setFormError('');
    setFormMode('create');
  }

  function openEdit(row) {
    setForm(formFromRecord(row, user));
    setFormError('');
    setFormMode('edit');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openView(row) {
    setForm(formFromRecord(row, user));
    setFormError('');
    setFormMode('view');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openReturn(row) {
    setForm({
      ...formFromRecord(row, user),
      heure_retour: row.heure_retour || nowHHMM(),
    });
    setFormError('');
    setFormMode('return');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function onSelectBon(bonId) {
    if (!bonId) {
      setForm((p) => ({ ...p, bon_id: '', bon_ref: '', bon_snapshot: null, lines: [] }));
      return;
    }
    const snapshot = bons.find((b) => String(b.id) === String(bonId));
    setForm((p) => ({
      ...p,
      bon_id: bonId,
      bon_ref: snapshot?.ref || p.bon_ref,
      bon_snapshot: snapshot || p.bon_snapshot,
    }));
  }

  function onSelectPerson(id) {
    const p = people.find((x) => String(x.id) === String(id));
    setForm((prev) => ({
      ...prev,
      assignee_id: id,
      assignee_name: p?.name || '',
    }));
  }

  function onMotifChange(motif) {
    setForm((prev) => ({
      ...prev,
      motif,
      bon_id: motif === 'bon_preparation' ? prev.bon_id : '',
      bon_ref: motif === 'bon_preparation' ? prev.bon_ref : '',
      bon_snapshot: motif === 'bon_preparation' ? prev.bon_snapshot : null,
    }));
  }

  async function handleSave(e) {
    e.preventDefault();
    if (readOnly) return;
    setFormError('');
    if (returnOnly) {
      const res = await recordReturn(form.id, form.heure_retour);
      if (res.success) {
        notify(`Retour enregistré pour ${res.data.ref}.`);
        resetForm();
      } else {
        setFormError(res.error || 'Enregistrement du retour impossible.');
      }
      return;
    }
    const previous = form.id ? records.find((r) => r.id === form.id) : null;
    const res = await save(form, { employees, previous });
    if (res.success) {
      notify(previous ? `Déplacement ${res.data.ref} modifié.` : `Déplacement ${res.data.ref} enregistré.`);
      resetForm();
    } else {
      setFormError(res.error || 'Enregistrement impossible.');
    }
  }

  async function handleDelete(row) {
    if (!window.confirm(`Supprimer le déplacement ${row.ref} ?`)) return;
    const res = await remove(row.id);
    if (res.success) {
      notify(`Déplacement ${row.ref} supprimé.`);
      if (form.id === row.id) resetForm();
    }
  }

  const rowActionProps = {
    canEdit,
    canDelete,
    saving,
    onView: openView,
    onEdit: openEdit,
    onReturn: openReturn,
    onDelete: handleDelete,
  };

  const formTitle = formMode === 'edit'
    ? `Modifier ${form.ref || 'le déplacement'}`
    : formMode === 'view'
      ? (form.ref || 'Déplacement')
      : formMode === 'return'
        ? `Retour — ${form.ref || 'déplacement'}`
        : 'Nouveau déplacement';

  const showForm = canCreate || canEdit || formMode !== 'create';
  const canSubmit = (formMode === 'create' && canCreate) || (formMode === 'edit' && canEdit) || (formMode === 'return' && canEdit);

  return (
    <div className="logistique-module log-pickup-page animate-fade-in">
      <div className="page-header flex-between">
        <div>
          <h1 className="page-title">Suivi des déplacements logistiques</h1>
          <p className="page-subtitle">Enregistrement des départs, destinations et motifs de déplacement des véhicules</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={reload} disabled={loading}>
            <RefreshCw size={14} /> Actualiser
          </button>
          {(canCreate || formMode !== 'create') && (
            <button type="button" className="btn btn-primary" onClick={resetForm}>
              <Plus size={15} /> Nouveau déplacement
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

      {showForm && (
        <form className="card log-pickup-form" onSubmit={handleSave} style={{ marginBottom: 16, maxWidth: '100%' }}>
          <div className="log-pickup-form-head">
            <strong className="log-pickup-form-title">{formTitle}</strong>
          </div>
          {formError && <div style={{ marginBottom: 10, color: 'var(--red)', fontSize: '0.85rem' }}>{formError}</div>}

          <div className="log-pickup-form-grid">
            <label>Date du déplacement
              <input
                type="date"
                value={form.date_deplacement}
                onChange={(e) => setForm((p) => ({ ...p, date_deplacement: e.target.value }))}
                style={INPUT}
                required={!fieldsLocked}
                disabled={fieldsLocked}
              />
            </label>

            <label>Heure de départ
              <input
                type="time"
                value={form.heure_depart}
                onChange={(e) => setForm((p) => ({ ...p, heure_depart: e.target.value }))}
                style={INPUT}
                required={!fieldsLocked}
                disabled={fieldsLocked}
              />
            </label>

            <label>Véhicule
              <select
                value={form.vehicle_id}
                onChange={(e) => {
                  const veh = vehicles.find((x) => String(x.id) === String(e.target.value));
                  setForm((prev) => ({
                    ...prev,
                    vehicle_id: e.target.value,
                    vehicle_label: veh ? vehicleOptionLabel(veh) : '',
                  }));
                }}
                style={SELECT}
                required={!fieldsLocked}
                disabled={fieldsLocked}
              >
                <option value="">— Sélectionner —</option>
                {form.vehicle_label && !vehicles.some((v) => String(v.id) === String(form.vehicle_id)) && (
                  <option value={form.vehicle_id || '__kept_veh__'}>{form.vehicle_label}</option>
                )}
                {vehicles.map((v) => <option key={v.id} value={v.id}>{vehicleOptionLabel(v)}</option>)}
              </select>
            </label>

            <label>Chauffeur / Coursier
              <PickupSearchSelect
                value={form.assignee_id}
                options={form.assignee_id && !people.some((p) => String(p.id) === String(form.assignee_id))
                  ? [{ id: form.assignee_id, name: form.assignee_name, label: form.assignee_name }, ...people]
                  : people}
                getLabel={personLabel}
                onChange={onSelectPerson}
                placeholder="Rechercher un utilisateur ou un employé…"
                disabled={fieldsLocked}
                emptyLabel="Aucun chauffeur"
              />
            </label>

            <label>Départ – De
              <LocationInput
                id="log-trip-from"
                value={form.departure_project_name}
                onChange={(v) => setForm((p) => ({ ...p, departure_project_name: v, departure_project_id: '' }))}
                suggestions={locationSuggestions}
                disabled={fieldsLocked}
                required={!fieldsLocked}
              />
            </label>

            <label>Destination – À
              <LocationInput
                id="log-trip-to"
                value={form.destination_project_name}
                onChange={(v) => setForm((p) => ({ ...p, destination_project_name: v, destination_project_id: '' }))}
                suggestions={locationSuggestions}
                disabled={fieldsLocked}
                required={!fieldsLocked}
              />
            </label>

            <label>Motif du déplacement
              <select
                value={form.motif}
                onChange={(e) => onMotifChange(e.target.value)}
                style={SELECT}
                required={!fieldsLocked}
                disabled={fieldsLocked}
              >
                <option value="">— Sélectionner —</option>
                {TRIP_MOTIFS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </label>

            {form.motif === 'bon_preparation' && (
              <label>Bon de préparation
                <PickupSearchSelect
                  value={form.bon_id}
                  options={bonOptions}
                  getLabel={bonOptionLabel}
                  onChange={onSelectBon}
                  placeholder="Rechercher un bon de préparation…"
                  disabled={fieldsLocked}
                  emptyLabel="Aucun bon"
                />
              </label>
            )}

            <label className="log-pickup-form-span">Détails / Observation
              <textarea
                value={form.observations}
                onChange={(e) => setForm((p) => ({ ...p, observations: e.target.value }))}
                style={{ ...INPUT, minHeight: 88, height: 'auto', resize: 'vertical' }}
                required={!fieldsLocked && form.motif === 'autre'}
                disabled={fieldsLocked}
                placeholder={form.motif === 'autre' ? 'Précisez le motif…' : 'Facultatif'}
              />
            </label>

            <label>Heure de retour
              <input
                type="time"
                value={form.heure_retour}
                onChange={(e) => setForm((p) => ({ ...p, heure_retour: e.target.value }))}
                style={INPUT}
                required={returnOnly}
                disabled={readOnly}
              />
            </label>

            <div className="log-pickup-form-span" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
              {readOnly ? (
                canEdit && (
                  <button type="button" className="btn btn-secondary" onClick={() => setFormMode('edit')}>
                    <Pencil size={14} /> Modifier
                  </button>
                )
              ) : canSubmit && (
                <button type="submit" className="btn btn-primary log-pickup-save" disabled={saving}>
                  {saving ? 'Enregistrement…' : 'Enregistrer le déplacement'}
                </button>
              )}
            </div>
          </div>
        </form>
      )}

      <div className="card log-trip-filters" style={{ marginBottom: 16, padding: '14px 20px' }}>
        <div className="log-trip-filter-grid">
          <label>Période — du
            <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} style={INPUT} />
          </label>
          <label>Période — au
            <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} style={INPUT} />
          </label>
          <label>Véhicule
            <select value={filterVehicle} onChange={(e) => setFilterVehicle(e.target.value)} style={SELECT}>
              <option value="">Tous</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{vehicleOptionLabel(v)}</option>)}
              {records
                .filter((r) => r.vehicle_label && !vehicles.some((v) => String(v.id) === String(r.vehicle_id)))
                .filter((r, i, arr) => arr.findIndex((x) => x.vehicle_label === r.vehicle_label) === i)
                .map((r) => (
                  <option key={`kept-${r.vehicle_id || r.vehicle_label}`} value={r.vehicle_label}>{r.vehicle_label}</option>
                ))}
            </select>
          </label>
          <label>Chauffeur
            <select value={filterChauffeur} onChange={(e) => setFilterChauffeur(e.target.value)} style={SELECT}>
              <option value="">Tous</option>
              {chauffeurFilterOptions.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </label>
          <label>Motif
            <select value={filterMotif} onChange={(e) => setFilterMotif(e.target.value)} style={SELECT}>
              <option value="">Tous</option>
              {TRIP_MOTIFS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </label>
          <label>Statut
            <select value={filterStatut} onChange={(e) => setFilterStatut(e.target.value)} style={SELECT}>
              <option value="">Tous</option>
              {TRIP_STATUTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><Loader2 size={24} className="spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-3)' }}>
            <Package size={28} style={{ marginBottom: 10, opacity: 0.5 }} />
            <div style={{ fontWeight: 700, color: 'var(--text-2)', marginBottom: 6 }}>Aucun déplacement</div>
            <div style={{ fontSize: '0.85rem' }}>Enregistrez un départ, une destination et le motif du véhicule.</div>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap table-wrap--wide log-desktop-table log-trip-table">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Heure de départ</th>
                  <th>Véhicule</th>
                  <th>Chauffeur</th>
                  <th>De</th>
                  <th>À</th>
                  <th>Motif</th>
                  <th>Bon de préparation</th>
                  <th>Heure de retour</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const st = tripStatutMeta(r);
                  return (
                    <tr key={r.id}>
                      <td data-label="Date">{fmtDate(r.date_deplacement)}</td>
                      <td data-label="Heure de départ">{normalizeTimeHM(r.heure_depart) || '—'}</td>
                      <td data-label="Véhicule">{r.vehicle_label || '—'}</td>
                      <td data-label="Chauffeur">{r.assignee_name || '—'}</td>
                      <td data-label="De">{pickupDepartureLabel(r)}</td>
                      <td data-label="À">{pickupDestinationLabel(r)}</td>
                      <td data-label="Motif">{motifLabel(r.motif)}</td>
                      <td data-label="Bon de préparation">{r.bon_ref || '—'}</td>
                      <td data-label="Heure de retour">{normalizeTimeHM(r.heure_retour) || '—'}</td>
                      <td data-label="Statut"><span className={`badge ${st.cls}`}>{st.label}</span></td>
                      <td data-label="Actions" className="log-pickup-actions-cell">
                        <TripRowActions row={r} {...rowActionProps} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="log-mobile-list" aria-label="Liste des déplacements logistiques">
            {filtered.map((r) => {
              const st = tripStatutMeta(r);
              return (
                <div key={r.id} className="log-mobile-card">
                  <div className="log-mobile-card-head">
                    <div>
                      <div className="log-mobile-card-title">{r.vehicle_label || r.ref}</div>
                      <div className="log-mobile-card-sub">{fmtDate(r.date_deplacement)} · {normalizeTimeHM(r.heure_depart) || '—'}</div>
                    </div>
                    <div className="log-mobile-card-badges">
                      <span className={`badge ${st.cls}`}>{st.label}</span>
                    </div>
                  </div>
                  <div className="log-mobile-card-meta">
                    <div className="log-mobile-meta-row"><span>Chauffeur</span><span>{r.assignee_name || '—'}</span></div>
                    <div className="log-mobile-meta-row"><span>De</span><span>{pickupDepartureLabel(r)}</span></div>
                    <div className="log-mobile-meta-row"><span>À</span><span>{pickupDestinationLabel(r)}</span></div>
                    <div className="log-mobile-meta-row"><span>Motif</span><span>{motifLabel(r.motif)}</span></div>
                    <div className="log-mobile-meta-row"><span>Bon</span><span>{r.bon_ref || '—'}</span></div>
                    <div className="log-mobile-meta-row"><span>Retour</span><span>{normalizeTimeHM(r.heure_retour) || '—'}</span></div>
                  </div>
                  <div className="log-mobile-card-actions">
                    <TripRowActions row={r} {...rowActionProps} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * pickupRequests.js — Demandes de récupération logistique (matériel / outils / consommables).
 * Ne touche ni le stock, ni les bons de préparation, ni les achats.
 * Les statuts décrivent uniquement le suivi logistique.
 */

export const PICKUP_STATUTS = [
  { value: 'a_organiser', label: 'À organiser' },
  { value: 'planifiee', label: 'Planifiée' },
  { value: 'en_cours', label: 'En cours' },
  { value: 'recuperee', label: 'Récupérée' },
  { value: 'annulee', label: 'Annulée' },
];

export const PICKUP_PRIORITES = [
  { value: 'faible', label: 'Faible' },
  { value: 'normale', label: 'Normale' },
  { value: 'urgente', label: 'Urgente' },
];

export const PICKUP_ACTIVE_STATUTS = ['a_organiser', 'planifiee', 'en_cours'];

export const TRIP_MOTIFS = [
  { value: 'bon_preparation', label: 'Bon de préparation' },
  { value: 'recuperation_marchandise', label: 'Récupération de marchandise' },
  { value: 'transfert_materiel', label: 'Transfert de matériel' },
  { value: 'autre', label: 'Autre' },
];

export const TRIP_STATUTS = [
  { value: 'en_deplacement', label: 'En déplacement', cls: 'badge-orange' },
  { value: 'retourne', label: 'Retourné', cls: 'badge-green' },
];

export const DEFAULT_TRIP_LOCATIONS = [
  'Dépôt Khyayta',
  'DEPOT LAKHYAYTA',
  'Siège',
  'Chantier',
];

function normPickupPoste(poste) {
  return String(poste || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Poste réellement enregistré : Chauffeur ou Coursier (mot entier, accents ignorés). */
export function isPickupDriverPoste(poste) {
  const tokens = normPickupPoste(poste).split(' ').filter(Boolean);
  return tokens.includes('chauffeur') || tokens.includes('coursier');
}

export function filterPickupDriverEmployees(employees, { keepId } = {}) {
  const list = employees || [];
  const filtered = list.filter((e) => isPickupDriverPoste(e.poste));
  if (!keepId) return filtered;
  const sid = String(keepId);
  if (filtered.some((e) => String(e.id) === sid)) return filtered;
  const extra = list.find((e) => String(e.id) === sid);
  return extra ? [extra, ...filtered] : filtered;
}

export function assertPickupAssigneeAllowed(employee, { allowEmpty = true, keepId } = {}) {
  if (!employee) {
    if (allowEmpty) return;
    throw new Error('Sélectionnez un chauffeur ou un coursier.');
  }
  if (keepId && String(employee.id) === String(keepId)) return;
}

export function normalizeTimeHM(v) {
  const s = String(v || '').trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return '';
  const h = Math.min(23, Math.max(0, Number(m[1])));
  const min = Math.min(59, Math.max(0, Number(m[2])));
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

export function timeFromIso(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return '';
  }
}

export function motifLabel(value) {
  return TRIP_MOTIFS.find((m) => m.value === value)?.label || value || '—';
}

export function tripStatutValue(request) {
  return String(request?.heure_retour || '').trim() ? 'retourne' : 'en_deplacement';
}

export function tripStatutMeta(request) {
  const value = tripStatutValue(request);
  const found = TRIP_STATUTS.find((s) => s.value === value);
  return { value, label: found?.label || value, cls: found?.cls || 'badge-grey' };
}

function inferLegacyMotif(row) {
  if (row?.motif && TRIP_MOTIFS.some((m) => m.value === row.motif)) return row.motif;
  if (row?.bon_id || row?.bon_ref) return 'bon_preparation';
  return 'recuperation_marchandise';
}

/** Mappe les anciennes demandes de récupération vers un déplacement, sans perdre les champs. */
export function normalizeTripRecord(row) {
  if (!row) return null;
  const date_deplacement = String(row.date_deplacement || row.date_creation || row.created_at || '').slice(0, 10);
  const heure_depart = normalizeTimeHM(row.heure_depart) || timeFromIso(row.created_at);
  const heure_retour = normalizeTimeHM(row.heure_retour);
  const motif = inferLegacyMotif(row);
  const from = pickupDepartureLabel(row);
  const to = pickupDestinationLabel(row);
  return {
    ...row,
    date_deplacement,
    heure_depart,
    heure_retour,
    motif,
    observations: row.observations || '',
    departure_project_name: from === '—' ? (row.departure_project_name || '') : from,
    destination_project_name: to === '—' ? (row.destination_project_name || '') : to,
  };
}

export function collectLocationSuggestions(records = [], extra = []) {
  const seen = new Set();
  const out = [];
  [...DEFAULT_TRIP_LOCATIONS, ...extra, ...(records || []).flatMap((r) => [
    r.departure_project_name,
    r.destination_project_name,
    pickupDepartureLabel(r),
    pickupDestinationLabel(r),
  ])].forEach((name) => {
    const n = String(name || '').trim();
    if (!n || n === '—') return;
    const key = n.toUpperCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(n);
  });
  return out;
}

const TABLE = 'logistics_pickup_requests';
const LOCAL_KEY = 'citymo.logisticsPickupRequests.v1';

export function pickupStatutMeta(statut) {
  const found = PICKUP_STATUTS.find((s) => s.value === statut);
  const map = {
    a_organiser: 'badge-grey',
    planifiee: 'badge-blue',
    en_cours: 'badge-orange',
    recuperee: 'badge-green',
    annulee: 'badge-red',
  };
  return {
    value: statut || 'a_organiser',
    label: found?.label || statut || 'À organiser',
    cls: map[statut] || 'badge-grey',
  };
}

export function remainingQty(line) {
  const toRecover = Math.max(0, Number(line?.qty_to_recover) || 0);
  const recovered = Math.max(0, Number(line?.qty_recovered) || 0);
  return Math.max(0, toRecover - recovered);
}

export function isPickupFullyRecovered(request) {
  const lines = request?.lines || [];
  if (!lines.length) return false;
  return lines.every((line) => remainingQty(line) <= 0);
}

export function isPickupLocked(request) {
  return request?.statut === 'recuperee' || request?.statut === 'annulee';
}

export function findActiveLinkedToBon(requests, bonId, exceptId) {
  if (!bonId) return [];
  return (requests || []).filter((r) => (
    String(r.bon_id || '') === String(bonId)
    && PICKUP_ACTIVE_STATUTS.includes(r.statut)
    && String(r.id) !== String(exceptId || '')
  ));
}

function newId(prefix = 'pk') {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function nextPickupRef(existing = []) {
  const year = new Date().getFullYear();
  const prefix = `DL-${year}-`;
  let max = 0;
  (existing || []).forEach((r) => {
    const m = String(r.ref || '').match(/^DL-(\d{4})-(\d+)$/i);
    if (m && Number(m[1]) === year) max = Math.max(max, Number(m[2]) || 0);
  });
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
}

export function normalizePickupLine(line, index = 0) {
  const designation = String(line?.designation || line?.article_name || '').trim();
  const unite = String(line?.unite || 'U').trim() || 'U';
  const qtyTo = Math.max(0, Number(line?.qty_to_recover ?? line?.quantite ?? 0) || 0);
  return {
    id: line?.id || `line-${index}-${newId('ln')}`,
    designation,
    unite,
    qty_to_recover: qtyTo,
    qty_recovered: Math.max(0, Number(line?.qty_recovered) || 0),
    qty_demandee_bon: line?.qty_demandee_bon != null ? Number(line.qty_demandee_bon) || 0 : null,
    qty_preparee_bon: line?.qty_preparee_bon != null ? Number(line.qty_preparee_bon) || 0 : null,
    article_id: line?.article_id || null,
    reference: line?.reference || '',
    emplacement_source: line?.emplacement_source || '',
    from_bon: Boolean(line?.from_bon),
  };
}

export function linesFromBonSnapshot(bon) {
  return (bon?.lines || []).map((line, index) => {
    const demanded = Math.max(0, Number(line.quantite_demandee) || 0);
    const prepared = Math.max(0, Number(line.quantite_preparee) || 0);
    const qtyTo = prepared > 0 ? prepared : demanded;
    return normalizePickupLine({
      designation: line.article_name || line.designation || line.reference || `Ligne ${index + 1}`,
      unite: line.unite || 'U',
      qty_to_recover: qtyTo,
      qty_recovered: 0,
      qty_demandee_bon: demanded,
      qty_preparee_bon: prepared,
      article_id: line.article_id || null,
      reference: line.reference || '',
      emplacement_source: line.emplacement_source || '',
      from_bon: true,
    }, index);
  }).filter((l) => l.designation && l.qty_to_recover > 0);
}

export function validatePickupCreate(form) {
  const errors = [];
  if (!String(form?.date_deplacement || '').trim()) errors.push('Indiquez la date du déplacement.');
  if (!normalizeTimeHM(form?.heure_depart)) errors.push('Indiquez l’heure de départ.');
  if (!form?.vehicle_id && !String(form?.vehicle_label || '').trim()) {
    errors.push('Sélectionnez un véhicule.');
  }
  if (!form?.assignee_id && !String(form?.assignee_name || '').trim()) {
    errors.push('Sélectionnez un chauffeur ou un coursier.');
  }
  if (!String(form?.departure_project_name || form?.lieu_recuperation || '').trim()) {
    errors.push('Indiquez le lieu de départ.');
  }
  if (!String(form?.destination_project_name || form?.destination || '').trim()) {
    errors.push('Indiquez la destination.');
  }
  const motif = String(form?.motif || '').trim();
  if (!TRIP_MOTIFS.some((m) => m.value === motif)) {
    errors.push('Sélectionnez le motif du déplacement.');
  }
  if (motif === 'bon_preparation' && !form?.bon_id && !String(form?.bon_ref || '').trim()) {
    errors.push('Sélectionnez un bon de préparation.');
  }
  if (motif === 'autre' && !String(form?.observations || '').trim()) {
    errors.push('Précisez les détails du déplacement.');
  }
  const heureRetour = normalizeTimeHM(form?.heure_retour);
  if (form?.heure_retour && !heureRetour) {
    errors.push('L’heure de retour est invalide.');
  }
  return { ok: errors.length === 0, errors };
}

export function pickupDepartureLabel(request) {
  return request?.departure_project_name || request?.lieu_recuperation || '—';
}

export function pickupDestinationLabel(request) {
  return request?.destination_project_name || request?.destination || request?.project_name || '—';
}

export function buildPickupRequest(form, { existing = [], user, employees = [], previous } = {}) {
  const prev = previous ? normalizeTripRecord(previous) : previous;
  const { ok, errors } = validatePickupCreate(form);
  if (!ok) {
    const err = new Error(errors[0]);
    err.details = errors;
    throw err;
  }
  const emp = (employees || []).find((e) => String(e.id) === String(form.assignee_id));
  const now = new Date().toISOString();
  const demandeurNom = String(form.demandeur_nom || prev?.demandeur_nom || '').trim()
    || [user?.prenom, user?.nom].filter(Boolean).join(' ').trim()
    || user?.email
    || '';
  const assigneeName = String(form.assignee_name || emp && [emp.firstname, emp.lastname].filter(Boolean).join(' ') || '').trim();
  const depKept = !form.departure_project_id || String(form.departure_project_id).startsWith('__kept_');
  const destKept = !form.destination_project_id || String(form.destination_project_id).startsWith('__kept_');
  const departureProjectId = depKept ? (prev?.departure_project_id || null) : form.departure_project_id;
  const destinationProjectId = destKept ? (prev?.destination_project_id || prev?.project_id || null) : form.destination_project_id;
  const departureProjectName = String(form.departure_project_name || prev?.departure_project_name || '').trim();
  const destinationProjectName = String(form.destination_project_name || prev?.destination_project_name || '').trim();
  const vehKept = !form.vehicle_id || String(form.vehicle_id).startsWith('__kept_');
  const vehicleId = vehKept ? (prev?.vehicle_id || null) : form.vehicle_id;
  const vehicleLabel = String(form.vehicle_label || prev?.vehicle_label || '').trim();
  const motif = String(form.motif || '').trim();
  const keepBon = motif === 'bon_preparation';
  const lines = keepBon
    ? (form.lines || prev?.lines || []).map((l, i) => normalizePickupLine(l, i)).filter((l) => l.designation)
    : (prev?.lines || []);
  const base = {
    ...prev,
    id: prev?.id || form.id || newId('dl'),
    ref: prev?.ref || form.ref || nextPickupRef(existing),
    statut: prev?.statut || 'a_organiser',
    demandeur_id: prev?.demandeur_id || form.demandeur_id || user?.id || null,
    demandeur_nom: prev?.demandeur_nom || demandeurNom,
    created_at: prev?.created_at || form.created_at || now,
    updated_at: now,
    date_creation: prev?.date_creation || form.date_deplacement || form.date_creation || now.slice(0, 10),
    date_deplacement: String(form.date_deplacement || prev?.date_deplacement || now).slice(0, 10),
    heure_depart: normalizeTimeHM(form.heure_depart),
    heure_retour: normalizeTimeHM(form.heure_retour),
    motif,
    bon_id: keepBon ? (form.bon_id || null) : null,
    bon_ref: keepBon ? (form.bon_ref || '') : '',
    bon_snapshot: keepBon ? (form.bon_snapshot || null) : null,
    departure_project_id: departureProjectId,
    departure_project_name: departureProjectName,
    destination_project_id: destinationProjectId,
    destination_project_name: destinationProjectName,
    lieu_recuperation: departureProjectName,
    destination: destinationProjectName,
    project_id: destinationProjectId,
    project_name: destinationProjectName,
    date_souhaitee: prev?.date_souhaitee || form.date_souhaitee || '',
    priorite: prev?.priorite || form.priorite || 'normale',
    observations: String(form.observations ?? prev?.observations ?? '').trim(),
    assignee_id: form.assignee_id || null,
    assignee_name: assigneeName,
    receptionnaire_id: form.receptionnaire_id !== undefined ? (form.receptionnaire_id || null) : (prev?.receptionnaire_id || null),
    receptionnaire_name: form.receptionnaire_name !== undefined
      ? String(form.receptionnaire_name || '').trim()
      : (prev?.receptionnaire_name || ''),
    vehicle_id: vehicleId,
    vehicle_label: vehicleLabel,
    lines,
    recoveries: prev?.recoveries || [],
    recovered_at: prev?.recovered_at || null,
    recovered_by_name: prev?.recovered_by_name || '',
    recovered_by_id: prev?.recovered_by_id || null,
  };
  return normalizeTripRecord(base);
}

export function applyTripReturn(request, heureRetour) {
  if (!request) throw new Error('Déplacement introuvable.');
  const heure = normalizeTimeHM(heureRetour);
  if (!heure) throw new Error('Indiquez l’heure de retour.');
  return normalizeTripRecord({
    ...request,
    heure_retour: heure,
    updated_at: new Date().toISOString(),
  });
}

export function assignPickup(request, patch, { employees = [] } = {}) {
  if (!request) throw new Error('Demande introuvable.');
  if (isPickupLocked(request)) throw new Error('Demande clôturée — affectation impossible.');
  const nextId = patch.assignee_id !== undefined ? patch.assignee_id : request.assignee_id;
  if (nextId) {
    const emp = (employees || []).find((e) => String(e.id) === String(nextId));
    const sameAsCurrent = String(nextId) === String(request.assignee_id || '');
    if (!sameAsCurrent && emp) assertPickupAssigneeAllowed(emp, { allowEmpty: false, keepId: request.assignee_id });
  }
  const assigneeName = patch.assignee_name != null ? String(patch.assignee_name).trim() : request.assignee_name;
  const vehicleLabel = patch.vehicle_label != null ? String(patch.vehicle_label).trim() : request.vehicle_label;
  let statut = request.statut;
  if (statut === 'a_organiser' && assigneeName) statut = 'planifiee';
  return {
    ...request,
    assignee_id: patch.assignee_id !== undefined ? patch.assignee_id : request.assignee_id,
    assignee_name: assigneeName,
    vehicle_id: patch.vehicle_id !== undefined ? patch.vehicle_id : request.vehicle_id,
    vehicle_label: vehicleLabel,
    date_souhaitee: patch.date_souhaitee !== undefined ? patch.date_souhaitee : request.date_souhaitee,
    statut,
    updated_at: new Date().toISOString(),
  };
}

export function startPickup(request) {
  if (!request) throw new Error('Demande introuvable.');
  if (isPickupLocked(request)) throw new Error('Demande clôturée.');
  if (request.statut === 'en_cours') return request;
  return { ...request, statut: 'en_cours', updated_at: new Date().toISOString() };
}

export function cancelPickup(request, { reason } = {}) {
  if (!request) throw new Error('Demande introuvable.');
  if (request.statut === 'recuperee') throw new Error('Une demande déjà récupérée ne peut pas être annulée.');
  if (request.statut === 'annulee') return request;
  return {
    ...request,
    statut: 'annulee',
    observations: [request.observations, reason ? `Annulation : ${reason}` : ''].filter(Boolean).join('\n'),
    updated_at: new Date().toISOString(),
  };
}

/**
 * Enregistre une récupération (éventuellement partielle) dans la demande uniquement.
 * N'écrit rien dans le stock, les bons, ni les livraisons.
 */
export function confirmPickupRecovery(request, {
  quantities = {},
  actorName,
  actorId,
  dateEffective,
  notes,
} = {}) {
  if (!request) throw new Error('Demande introuvable.');
  if (request.statut === 'annulee') throw new Error('Demande annulée — confirmation impossible.');
  if (request.statut === 'recuperee') throw new Error('Récupération déjà clôturée — double confirmation refusée.');

  const applied = [];
  const lines = (request.lines || []).map((line) => {
    const add = Math.max(0, Number(quantities[line.id]) || 0);
    if (add <= 0) return line;
    const rest = remainingQty(line);
    if (add > rest) {
      throw new Error(`« ${line.designation} » : ${add} dépasse le restant (${rest}).`);
    }
    applied.push({ line_id: line.id, qty: add });
    return { ...line, qty_recovered: Math.max(0, Number(line.qty_recovered) || 0) + add };
  });

  if (!applied.length) throw new Error('Indiquez au moins une quantité réellement récupérée.');

  const event = {
    id: newId('rec'),
    at: new Date().toISOString(),
    date_effective: (dateEffective || new Date().toISOString()).slice(0, 10),
    by_name: String(actorName || '').trim(),
    by_id: actorId || null,
    notes: String(notes || '').trim(),
    lines: applied,
  };

  const next = {
    ...request,
    lines,
    recoveries: [...(request.recoveries || []), event],
    updated_at: new Date().toISOString(),
  };

  if (isPickupFullyRecovered(next)) {
    next.statut = 'recuperee';
    next.recovered_at = event.date_effective;
    next.recovered_by_name = event.by_name;
    next.recovered_by_id = event.by_id;
  } else {
    next.statut = 'en_cours';
  }
  return next;
}

export function filterPickupRequests(list, {
  search = '',
  dateFrom = '',
  dateTo = '',
  vehicle = '',
  chauffeur = '',
  motif = '',
  statut = '',
} = {}) {
  const q = String(search || '').trim().toLowerCase();
  const from = String(dateFrom || '').slice(0, 10);
  const to = String(dateTo || '').slice(0, 10);
  const veh = String(vehicle || '').trim().toLowerCase();
  const ch = String(chauffeur || '').trim().toLowerCase();
  const mot = String(motif || '').trim();
  const st = String(statut || '').trim();
  return (list || []).map(normalizeTripRecord).filter((r) => {
    if (!r) return false;
    const date = String(r.date_deplacement || '').slice(0, 10);
    if (from && date && date < from) return false;
    if (to && date && date > to) return false;
    if (veh) {
      const hayVeh = `${r.vehicle_id || ''} ${r.vehicle_label || ''}`.toLowerCase();
      if (!hayVeh.includes(veh)) return false;
    }
    if (ch) {
      const hayCh = `${r.assignee_id || ''} ${r.assignee_name || ''}`.toLowerCase();
      if (!hayCh.includes(ch)) return false;
    }
    if (mot && r.motif !== mot) return false;
    if (st && tripStatutValue(r) !== st) return false;
    if (!q) return true;
    const hay = [
      r.ref, r.bon_ref, r.demandeur_nom, motifLabel(r.motif),
      pickupDepartureLabel(r), pickupDestinationLabel(r),
      r.assignee_name, r.vehicle_label, r.observations,
    ].join(' ').toLowerCase();
    return hay.includes(q);
  });
}

function minutesFromHm(hm) {
  const t = normalizeTimeHM(hm);
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function tripDurationLabel(trip) {
  if (!normalizeTimeHM(trip?.heure_retour)) return 'En cours';
  const start = minutesFromHm(trip?.heure_depart);
  const end = minutesFromHm(trip?.heure_retour);
  if (start == null || end == null) return '—';
  let mins = end - start;
  if (mins < 0) mins += 24 * 60;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m} min`;
  return `${h} h ${String(m).padStart(2, '0')}`;
}

export function tripKmDelta(trip) {
  const rawA = trip?.km_depart;
  const rawB = trip?.km_retour;
  if (rawA == null || rawB == null || String(rawA).trim() === '' || String(rawB).trim() === '') return null;
  const a = Number(rawA);
  const b = Number(rawB);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return b - a;
}

export function vehicleTripKey(trip) {
  const id = String(trip?.vehicle_id || '').trim();
  if (id && !id.startsWith('__kept_')) return `id:${id}`;
  const label = String(trip?.vehicle_label || '').trim().toUpperCase();
  return label ? `label:${label}` : 'label:inconnu';
}

export function parseVehicleDisplay(trip, vehicles = []) {
  const v = (vehicles || []).find((x) => String(x.id) === String(trip?.vehicle_id || ''));
  if (v) {
    const matricule = v.matricule || v.matricule_ww || '';
    const modele = [v.marque, v.modele].filter(Boolean).join(' ') || v.vehicule || '';
    return { matricule: matricule || '—', modele: modele || '—' };
  }
  const s = String(trip?.vehicle_label || '').trim();
  const parts = s.split(/\s+[—–]\s+/);
  if (parts.length >= 2) return { matricule: parts[0] || '—', modele: parts.slice(1).join(' — ') || '—' };
  return { matricule: s || '—', modele: '—' };
}

function tripStamp(trip) {
  return `${String(trip?.date_deplacement || '').slice(0, 10)}T${normalizeTimeHM(trip?.heure_depart) || '00:00'}`;
}

function latestTrip(list, predicate = () => true) {
  return (list || [])
    .filter(predicate)
    .slice()
    .sort((a, b) => tripStamp(b).localeCompare(tripStamp(a)))[0] || null;
}

function uniqueById(list) {
  const seen = new Set();
  return (list || []).filter((t) => {
    const id = String(t?.id || '');
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function emptyVehicleRow(key, identity) {
  return {
    key,
    vehicle_id: identity.vehicle_id || '',
    matricule: identity.matricule || '—',
    modele: identity.modele || '—',
    total: 0,
    today: 0,
    period: 0,
    enCours: 0,
    termines: 0,
    lastDepart: '',
    lastRetour: '',
    lastDestination: '',
    kmTotal: null,
    trips: [],
  };
}

/**
 * Récapitulatif par véhicule à partir des déplacements réellement enregistrés.
 * `periodTrips` = ensemble filtré (période + véhicule + chauffeur + motif + statut).
 * Total / aujourd’hui / en cours s’appuient sur les mêmes filtres hors dates, sans double comptage.
 */
export function buildVehicleTripRecap(records, {
  vehicles = [],
  includeIdleVehicles = false,
  today = '',
  dateFrom = '',
  dateTo = '',
  vehicle = '',
  chauffeur = '',
  motif = '',
  statut = '',
} = {}) {
  const scoped = uniqueById(filterPickupRequests(records, { vehicle, chauffeur, motif, statut }));
  const period = uniqueById(filterPickupRequests(records, {
    vehicle, chauffeur, motif, statut, dateFrom, dateTo,
  }));
  const todayDate = String(today || '').slice(0, 10);
  const todayList = todayDate
    ? uniqueById(filterPickupRequests(records, {
      vehicle, chauffeur, motif, statut, dateFrom: todayDate, dateTo: todayDate,
    }))
    : [];

  const rowsMap = new Map();

  function ensureRow(trip) {
    const key = vehicleTripKey(trip);
    if (!rowsMap.has(key)) {
      const display = parseVehicleDisplay(trip, vehicles);
      rowsMap.set(key, emptyVehicleRow(key, {
        vehicle_id: trip.vehicle_id || '',
        ...display,
      }));
    }
    return rowsMap.get(key);
  }

  scoped.forEach((trip) => {
    const row = ensureRow(trip);
    row.total += 1;
    if (tripStatutValue(trip) === 'en_deplacement') row.enCours += 1;
    if (tripStatutValue(trip) === 'retourne') row.termines += 1;
  });

  todayList.forEach((trip) => {
    ensureRow(trip).today += 1;
  });

  period.forEach((trip) => {
    const row = ensureRow(trip);
    row.period += 1;
    const km = tripKmDelta(trip);
    if (km != null) row.kmTotal = (row.kmTotal || 0) + km;
  });

  rowsMap.forEach((row) => {
    const allForVehicle = scoped.filter((t) => vehicleTripKey(t) === row.key)
      .slice()
      .sort((a, b) => tripStamp(a).localeCompare(tripStamp(b)));
    const periodForVehicle = allForVehicle.filter((t) => period.some((p) => p.id === t.id));
    const lastPool = periodForVehicle.length ? periodForVehicle : allForVehicle;
    const last = latestTrip(lastPool);
    row.lastDepart = last ? (normalizeTimeHM(last.heure_depart) || '') : '';
    row.lastDestination = last ? pickupDestinationLabel(last) : '';
    const lastBack = latestTrip(lastPool, (t) => Boolean(normalizeTimeHM(t.heure_retour)));
    row.lastRetour = lastBack ? normalizeTimeHM(lastBack.heure_retour) : '';
    row.trips = allForVehicle;
  });

  if (includeIdleVehicles) {
    const vehFilter = String(vehicle || '').trim().toLowerCase();
    (vehicles || []).forEach((v) => {
      const key = `id:${v.id}`;
      if (rowsMap.has(key)) return;
      if (vehFilter) {
        const hay = `${v.id} ${v.matricule || ''} ${v.matricule_ww || ''} ${v.marque || ''} ${v.modele || ''} ${v.vehicule || ''}`.toLowerCase();
        if (!hay.includes(vehFilter)) return;
      }
      const matricule = v.matricule || v.matricule_ww || '';
      const modele = [v.marque, v.modele].filter(Boolean).join(' ') || v.vehicule || '';
      rowsMap.set(key, emptyVehicleRow(key, {
        vehicle_id: v.id,
        matricule: matricule || '—',
        modele: modele || '—',
      }));
    });
  }

  const rows = [...rowsMap.values()].sort((a, b) => (
    b.period - a.period || b.total - a.total || String(a.matricule).localeCompare(String(b.matricule), 'fr')
  ));

  const activeRows = rows.filter((r) => r.total > 0 || r.period > 0);
  const enDeplacementVeh = new Set(
    scoped.filter((t) => tripStatutValue(t) === 'en_deplacement').map(vehicleTripKey),
  );
  const mostUsed = period.reduce((best, trip) => {
    const key = vehicleTripKey(trip);
    const count = (best.counts.get(key) || 0) + 1;
    best.counts.set(key, count);
    if (count > best.max) {
      best.max = count;
      best.key = key;
    }
    return best;
  }, { counts: new Map(), max: 0, key: '' });
  const mostUsedRow = rows.find((r) => r.key === mostUsed.key) || null;

  return {
    rows,
    cards: {
      totalMouvements: period.length,
      vehiculesEnDeplacement: enDeplacementVeh.size,
      mouvementsTermines: period.filter((t) => tripStatutValue(t) === 'retourne').length,
      vehiculePlusUtilise: mostUsedRow
        ? `${mostUsedRow.matricule}${mostUsedRow.modele && mostUsedRow.modele !== '—' ? ` — ${mostUsedRow.modele}` : ''}`
        : '—',
    },
    activeVehicleCount: activeRows.length,
  };
}

function readLocal() {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(LOCAL_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocal(list) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
}

function isMissingTable(err) {
  const msg = String(err?.message || err?.code || '').toLowerCase();
  return err?.code === '42P01' || err?.code === 'PGRST205' || msg.includes('does not exist') || msg.includes('schema cache');
}

function rowToRequest(row) {
  if (!row) return null;
  if (row.payload && typeof row.payload === 'object') {
    return { ...row.payload, id: row.id || row.payload.id, ref: row.ref || row.payload.ref, statut: row.statut || row.payload.statut };
  }
  return row;
}

async function trySupabase(fn) {
  try {
    const { getSupabase, isSupabaseConfigured } = await import('../../lib/supabase');
    if (!isSupabaseConfigured()) return { missing: true };
    return await fn(getSupabase());
  } catch (err) {
    if (isMissingTable(err)) return { missing: true };
    throw err;
  }
}

export async function listPickupRequests() {
  const remote = await trySupabase(async (sb) => {
    const { data, error } = await sb.from(TABLE).select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return { rows: (data || []).map(rowToRequest).map(normalizeTripRecord).filter(Boolean) };
  });
  if (remote?.rows) return remote.rows;
  return readLocal().map(normalizeTripRecord).filter(Boolean);
}

export async function savePickupRequest(request) {
  const remote = await trySupabase(async (sb) => {
    const row = {
      id: request.id,
      ref: request.ref,
      statut: request.statut,
      bon_id: request.bon_id || null,
      payload: request,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await sb.from(TABLE).upsert(row, { onConflict: 'id' }).select().single();
    if (error) throw error;
    return { row: rowToRequest(data) || request };
  });
  if (remote?.row) return remote.row;
  const list = readLocal();
  const idx = list.findIndex((r) => r.id === request.id);
  if (idx >= 0) list[idx] = request;
  else list.unshift(request);
  writeLocal(list);
  return request;
}

export async function deletePickupRequest(id) {
  const remote = await trySupabase(async (sb) => {
    const { error } = await sb.from(TABLE).delete().eq('id', id);
    if (error) throw error;
    return { ok: true };
  });
  writeLocal(readLocal().filter((r) => String(r.id) !== String(id)));
  if (remote?.ok || remote?.missing) return true;
  throw new Error('Suppression impossible.');
}

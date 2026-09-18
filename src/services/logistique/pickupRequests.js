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
    throw new Error('La personne chargée de la récupération est invalide.');
  }
  if (keepId && String(employee.id) === String(keepId)) return;
  if (!isPickupDriverPoste(employee.poste)) {
    throw new Error('La personne chargée de la récupération doit avoir le poste Chauffeur ou Coursier.');
  }
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
  if (!form?.bon_id) errors.push('Sélectionnez un bon de préparation.');
  const lines = (form?.lines || []).map((l, i) => normalizePickupLine(l, i)).filter((l) => l.designation);
  if (form?.bon_id && !lines.length) errors.push('Ce bon de préparation n’a pas d’articles à reprendre.');
  if (!form?.departure_project_id && !String(form?.departure_project_name || '').trim()) {
    errors.push('Sélectionnez le lieu de départ.');
  }
  if (!form?.destination_project_id && !String(form?.destination_project_name || '').trim()) {
    errors.push('Sélectionnez la destination.');
  }
  if (!form?.assignee_id) errors.push('Sélectionnez un chauffeur ou un coursier.');
  if (!form?.receptionnaire_id && !String(form?.receptionnaire_name || '').trim()) {
    errors.push('Indiquez le réceptionnaire.');
  }
  if (!form?.vehicle_id && !String(form?.vehicle_label || '').trim()) {
    errors.push('Sélectionnez un véhicule.');
  }
  return { ok: errors.length === 0, errors, lines };
}

export function pickupDepartureLabel(request) {
  return request?.departure_project_name || request?.lieu_recuperation || '—';
}

export function pickupDestinationLabel(request) {
  return request?.destination_project_name || request?.destination || request?.project_name || '—';
}

export function buildPickupRequest(form, { existing = [], user, employees = [], previous } = {}) {
  const { ok, errors, lines } = validatePickupCreate(form);
  if (!ok) {
    const err = new Error(errors[0]);
    err.details = errors;
    throw err;
  }
  const emp = (employees || []).find((e) => String(e.id) === String(form.assignee_id));
  assertPickupAssigneeAllowed(emp, { allowEmpty: false, keepId: previous?.assignee_id });
  const now = new Date().toISOString();
  const demandeurNom = String(form.demandeur_nom || previous?.demandeur_nom || '').trim()
    || [user?.prenom, user?.nom].filter(Boolean).join(' ').trim()
    || user?.email
    || '';
  const assigneeName = String(form.assignee_name || emp && [emp.firstname, emp.lastname].filter(Boolean).join(' ') || '').trim();
  const receptionnaireName = String(form.receptionnaire_name || '').trim();
  const depKept = !form.departure_project_id || String(form.departure_project_id).startsWith('__kept_');
  const destKept = !form.destination_project_id || String(form.destination_project_id).startsWith('__kept_');
  const departureProjectId = depKept ? (previous?.departure_project_id || null) : form.departure_project_id;
  const destinationProjectId = destKept ? (previous?.destination_project_id || previous?.project_id || null) : form.destination_project_id;
  const departureProjectName = String(form.departure_project_name || previous?.departure_project_name || '').trim();
  const destinationProjectName = String(form.destination_project_name || previous?.destination_project_name || '').trim();
  const vehKept = !form.vehicle_id || String(form.vehicle_id).startsWith('__kept_');
  const vehicleId = vehKept ? (previous?.vehicle_id || null) : form.vehicle_id;
  const vehicleLabel = String(form.vehicle_label || previous?.vehicle_label || '').trim();
  const base = {
    id: previous?.id || form.id || newId('dl'),
    ref: previous?.ref || form.ref || nextPickupRef(existing),
    statut: previous?.statut || 'a_organiser',
    demandeur_id: previous?.demandeur_id || form.demandeur_id || user?.id || null,
    demandeur_nom: previous?.demandeur_nom || demandeurNom,
    created_at: previous?.created_at || form.created_at || now,
    updated_at: now,
    date_creation: previous?.date_creation || form.date_creation || now.slice(0, 10),
    bon_id: form.bon_id || null,
    bon_ref: form.bon_ref || '',
    bon_snapshot: form.bon_snapshot || null,
    departure_project_id: departureProjectId,
    departure_project_name: departureProjectName,
    destination_project_id: destinationProjectId,
    destination_project_name: destinationProjectName,
    lieu_recuperation: departureProjectName,
    destination: destinationProjectName,
    project_id: destinationProjectId,
    project_name: destinationProjectName,
    date_souhaitee: previous?.date_souhaitee || form.date_souhaitee || '',
    priorite: previous?.priorite || form.priorite || 'normale',
    observations: previous?.observations || form.observations || '',
    assignee_id: form.assignee_id || null,
    assignee_name: assigneeName,
    receptionnaire_id: form.receptionnaire_id || null,
    receptionnaire_name: receptionnaireName,
    vehicle_id: vehicleId,
    vehicle_label: vehicleLabel,
    lines,
    recoveries: previous?.recoveries || [],
    recovered_at: previous?.recovered_at || null,
    recovered_by_name: previous?.recovered_by_name || '',
    recovered_by_id: previous?.recovered_by_id || null,
  };
  return base;
}

export function assignPickup(request, patch, { employees = [] } = {}) {
  if (!request) throw new Error('Demande introuvable.');
  if (isPickupLocked(request)) throw new Error('Demande clôturée — affectation impossible.');
  const nextId = patch.assignee_id !== undefined ? patch.assignee_id : request.assignee_id;
  if (nextId) {
    const emp = (employees || []).find((e) => String(e.id) === String(nextId));
    const sameAsCurrent = String(nextId) === String(request.assignee_id || '');
    if (!sameAsCurrent) assertPickupAssigneeAllowed(emp, { allowEmpty: false, keepId: request.assignee_id });
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

export function filterPickupRequests(list, { search = '' } = {}) {
  const q = String(search || '').trim().toLowerCase();
  return (list || []).filter((r) => {
    if (!q) return true;
    const hay = [
      r.ref, r.bon_ref, r.demandeur_nom,
      pickupDepartureLabel(r), pickupDestinationLabel(r),
      r.assignee_name, r.receptionnaire_name, r.vehicle_label,
    ].join(' ').toLowerCase();
    return hay.includes(q);
  });
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
    return { rows: (data || []).map(rowToRequest) };
  });
  if (remote?.rows) return remote.rows;
  return readLocal();
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

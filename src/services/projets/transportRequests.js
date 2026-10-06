/**
 * transportRequests.js — Projets › Demande de transport.
 * Chef de projet crée (évacuation chantier → dépôt / transfert chantier → chantier)
 * → « En attente de traitement » + notif magasiniers.
 * Magasinier « Traiter » (chauffeur + véhicule) → « En cours de transport » → « Traitée ».
 */
import { getSupabase } from '../../lib/supabase';
import {
  notifyUser,
  notifyInventaireUsers,
  NOTIFICATION_TYPES,
  NOTIFICATION_PRIORITIES,
  moduleActionUrl,
} from '../notifications/notifications';

const TABLE = 'project_transport_requests';
const SUBMODULE = 'demandes-transport';

export const DEPOT_KHYAYTA = 'Dépôt Khyayta';
export const DEPOT_VALUE = '__depot_khyayta__';

export const TRANSPORT_STATUTS = {
  EN_ATTENTE: 'en_attente_traitement',
  EN_TRANSPORT: 'en_transport',
  TRAITEE: 'traitee',
  ANNULEE: 'annulee',
};

export const TRANSPORT_STATUT_LABEL = {
  en_attente_traitement: 'En attente de traitement',
  en_transport: 'En cours de transport',
  traitee: 'Traitée',
  annulee: 'Annulée',
};

export const TRANSPORT_STATUT_BADGE = {
  en_attente_traitement: 'badge-orange',
  en_transport: 'badge-purple',
  traitee: 'badge-green',
  annulee: 'badge-grey',
};

export const TRANSPORT_TYPES = [
  { value: 'evacuation', label: 'Évacuation (chantier → dépôt)' },
  { value: 'transfert', label: 'Transfert (chantier → chantier)' },
];

export const TRANSPORT_TYPE_SHORT = { evacuation: 'Évacuation', transfert: 'Transfert' };

export const EMPTY_TRANSPORT_FORM = {
  type: 'evacuation',
  depart: '',
  destination: DEPOT_VALUE,
  materiel: '',
  quantite: '',
  date_souhaitee: '',
  priorite: 'normale',
  remarque: '',
};

async function getAuthUser() {
  const { data: { user }, error } = await getSupabase().auth.getUser();
  if (error || !user) {
    const err = new Error('Session requise.');
    err.code = 'AUTH';
    throw err;
  }
  return user;
}

function validationError(message) {
  const err = new Error(message);
  err.code = 'VALIDATION';
  return err;
}

/** Nom affiché depuis la session. */
export function sessionUserName(user) {
  const meta = user?.user_metadata || {};
  const fromParts = [meta.prenom, meta.nom].filter(Boolean).join(' ');
  return String(meta.full_name || meta.name || fromParts || user?.email?.split('@')[0] || '').trim();
}

export function normalizeTransportRequest(row) {
  if (!row) return null;
  return {
    id: row.id,
    ref: row.ref || '',
    type: row.type || 'evacuation',
    depart: row.depart || '',
    depart_project_id: row.depart_project_id || '',
    destination: row.destination || '',
    destination_project_id: row.destination_project_id || '',
    materiel: row.materiel || '',
    quantite: row.quantite || '',
    date_souhaitee: row.date_souhaitee || '',
    priorite: row.priorite || 'normale',
    remarque: row.remarque || '',
    statut: row.statut || TRANSPORT_STATUTS.EN_ATTENTE,
    statut_label: TRANSPORT_STATUT_LABEL[row.statut] || row.statut || '—',
    chauffeur: row.chauffeur || '',
    vehicule: row.vehicule || '',
    date_transport: row.date_transport || '',
    demandeur_nom: row.demandeur_nom || '',
    traite_par_nom: row.traite_par_nom || '',
    created_by: row.created_by || '',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function listTransportRequests() {
  await getAuthUser();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) throw error;
  return (data || []).map(normalizeTransportRequest);
}

export async function listProjectsForTransport() {
  await getAuthUser();
  const { data, error } = await getSupabase().rpc('list_projects_for_transport');
  if (error) throw error;
  return (data || []).map((p) => ({
    id: p.id,
    label: [p.ref, p.nom].filter(Boolean).join(' — ') || p.nom || p.ref || '—',
  }));
}

function resolvePlace(value, projects) {
  if (value === DEPOT_VALUE) return { label: DEPOT_KHYAYTA, projectId: null };
  const p = (projects || []).find((x) => x.id === value);
  return p ? { label: p.label, projectId: p.id } : { label: '', projectId: null };
}

export async function createTransportRequest(form, projects) {
  const user = await getAuthUser();
  const dep = resolvePlace(form.depart, projects);
  const dest = resolvePlace(form.destination, projects);
  if (!dep.label) throw validationError('Choisissez le départ.');
  if (!dest.label) throw validationError('Choisissez la destination.');
  if (form.depart === form.destination) throw validationError('Le départ et la destination doivent être différents.');
  const materiel = String(form.materiel || '').trim();
  if (!materiel) throw validationError('Décrivez le matériel à transporter.');

  const row = {
    type: form.type === 'transfert' ? 'transfert' : 'evacuation',
    depart: dep.label,
    depart_project_id: dep.projectId,
    destination: dest.label,
    destination_project_id: dest.projectId,
    materiel,
    quantite: String(form.quantite || '').trim() || null,
    date_souhaitee: form.date_souhaitee || null,
    priorite: form.priorite === 'urgente' ? 'urgente' : 'normale',
    remarque: String(form.remarque || '').trim() || null,
    statut: TRANSPORT_STATUTS.EN_ATTENTE,
    demandeur_nom: sessionUserName(user) || null,
    created_by: user.id,
  };

  const { data, error } = await getSupabase().from(TABLE).insert([row]).select('*').single();
  if (error) throw error;
  const req = normalizeTransportRequest(data);

  notifyInventaireUsers({
    title: req.priorite === 'urgente' ? 'Demande de transport URGENTE' : 'Nouvelle demande de transport',
    message: `${req.ref} — ${TRANSPORT_TYPE_SHORT[req.type]} : ${req.depart} → ${req.destination}. ${req.materiel}${req.demandeur_nom ? ` (par ${req.demandeur_nom})` : ''}. À traiter.`,
    type: NOTIFICATION_TYPES.SYSTEM,
    priority: req.priorite === 'urgente' ? NOTIFICATION_PRIORITIES.HIGH : NOTIFICATION_PRIORITIES.NORMAL,
    entityType: 'project_transport_request',
    entityId: req.id,
    actionUrl: moduleActionUrl(SUBMODULE),
    submoduleCode: SUBMODULE,
  }).catch((err) => console.warn('[CITYMO] notif magasinier transport', err));

  return req;
}

function notifyDemandeur(req, title, message) {
  if (!req?.created_by) return;
  notifyUser(req.created_by, {
    title,
    message,
    type: NOTIFICATION_TYPES.SYSTEM,
    priority: NOTIFICATION_PRIORITIES.NORMAL,
    entityType: 'project_transport_request',
    entityId: req.id,
    actionUrl: moduleActionUrl(SUBMODULE),
    submoduleCode: SUBMODULE,
  }).catch((err) => console.warn('[CITYMO] notif demandeur transport', err));
}

async function transition(id, fromStatuts, patch) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(patch)
    .eq('id', id)
    .in('statut', fromStatuts)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw validationError('Cette demande a déjà changé de statut — actualisez la page.');
  return normalizeTransportRequest(data);
}

/** Magasinier : En attente → En cours de transport. */
export async function startTransportRequest(id, { chauffeur, vehicule, date_transport } = {}) {
  const user = await getAuthUser();
  if (!String(chauffeur || '').trim()) throw validationError('Choisissez le chauffeur / coursier.');
  if (!String(vehicule || '').trim()) throw validationError('Choisissez le véhicule.');
  const req = await transition(id, [TRANSPORT_STATUTS.EN_ATTENTE], {
    statut: TRANSPORT_STATUTS.EN_TRANSPORT,
    chauffeur: String(chauffeur).trim(),
    vehicule: String(vehicule).trim(),
    date_transport: date_transport || null,
    traite_par: user.id,
    traite_par_nom: sessionUserName(user) || null,
  });
  if (req.created_by !== user.id) {
    notifyDemandeur(req, 'Transport en cours', `${req.ref} — ${req.depart} → ${req.destination} : ${req.chauffeur} (${req.vehicule}).`);
  }
  return req;
}

/** En cours de transport → Traitée. */
export async function finishTransportRequest(id) {
  const user = await getAuthUser();
  const req = await transition(id, [TRANSPORT_STATUTS.EN_TRANSPORT], { statut: TRANSPORT_STATUTS.TRAITEE });
  if (req.created_by !== user.id) {
    notifyDemandeur(req, 'Demande de transport traitée', `${req.ref} — ${req.depart} → ${req.destination} : transport terminé.`);
  }
  return req;
}

/** Demandeur : annulation tant que la demande est en attente. */
export async function cancelTransportRequest(id) {
  await getAuthUser();
  return transition(id, [TRANSPORT_STATUTS.EN_ATTENTE], { statut: TRANSPORT_STATUTS.ANNULEE });
}

export function filterTransportRequests(rows, { search = '', statut = '', type = '' } = {}) {
  const q = search.trim().toLowerCase();
  return (rows || []).filter((r) => {
    if (statut && r.statut !== statut) return false;
    if (type && r.type !== type) return false;
    if (!q) return true;
    const hay = `${r.ref} ${r.depart} ${r.destination} ${r.materiel} ${r.demandeur_nom} ${r.chauffeur} ${r.vehicule}`.toLowerCase();
    return hay.includes(q);
  });
}

export function computeTransportKpis(rows) {
  const list = rows || [];
  const count = (s) => list.filter((r) => r.statut === s).length;
  return {
    total: list.length,
    enAttente: count(TRANSPORT_STATUTS.EN_ATTENTE),
    enTransport: count(TRANSPORT_STATUTS.EN_TRANSPORT),
    traitees: count(TRANSPORT_STATUTS.TRAITEE),
  };
}

/**
 * workers.js — Ouvriers CRUD (Supabase + Storage).
 */
import { getSupabase } from '../../lib/supabase';
import {
  deleteWorkerMedia,
  isDataUrl,
  isHttpUrl,
  resolveStorageUrl,
  uploadWorkerMedia,
} from './workerStorage';

const TABLE = 'workers';
const DOCS_TABLE = 'worker_documents';

const WORKER_SELECT = `
  *,
  projects ( id, nom, ref )
`;

const MEDIA_FIELDS = [
  { formKey: 'photo', dbKey: 'photo_url', docType: 'photo' },
  { formKey: 'cin_recto', dbKey: 'cin_recto_url', docType: 'cin_recto' },
  { formKey: 'cin_verso', dbKey: 'cin_verso_url', docType: 'cin_verso' },
];

function emptyToNull(v) {
  if (v === '' || v === undefined) return null;
  return v;
}

/** Libellé chantier / projet pour affichage */
export function workerChantierLabel(row) {
  if (!row) return '';
  const p = row.projects;
  if (p?.nom) return p.nom;
  return row.chantier || '';
}

/** DB row → UI (OuvriersListe EMPTY_FORM shape) */
export function normalizeWorker(row) {
  if (!row) return null;
  const projetNom = row.projects?.nom || '';
  return {
    id: row.id,
    prenom: row.prenom || '',
    nom: row.nom || '',
    telephone: row.telephone || '',
    cin: row.numero_cin || '',
    fonction: row.fonction || '',
    tarif: Number(row.tarif) || 0,
    date_naissance: row.date_naissance || '',
    ville_naissance: row.lieu_naissance || '',
    adresse: row.adresse || '',
    nationalite: row.nationalite || 'Marocaine',
    etat_civil: row.etat_civil || '',
    groupe_sanguin: row.groupe_sanguin || '',
    sexe: row.sexe || '',
    date_expiration: row.date_expiration || '',
    specialite: row.specialite || '',
    experience: row.experience || 'intermediaire',
    date_recrutement: row.date_recrutement || '',
    statut: row.statut || 'actif',
    disponibilite: row.disponibilite || 'oui',
    project_id: row.project_id ? String(row.project_id) : '',
    projet_nom: projetNom,
    projet_ref: row.projects?.ref || '',
    chantier: projetNom || row.chantier || '',
    chantier_legacy: row.chantier || '',
    badge: row.badge || '',
    contact_urgence: row.contact_urgence || '',
    tel_urgence: row.tel_urgence || '',
    relation_urgence: row.relation_urgence || '',
    pointure: row.pointure || '',
    taille_vetement: row.taille_vetement || '',
    taille_gants: row.taille_gants || '',
    casque: row.casque || '',
    photo: row.photo_url || '',
    cin_recto: row.cin_recto_url || '',
    cin_verso: row.cin_verso_url || '',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Enrichit photo/CIN avec signed URLs (affichage UI) */
export async function enrichWorkerMedia(worker) {
  if (!worker) return worker;
  const [photo, cin_recto, cin_verso] = await Promise.all([
    resolveStorageUrl(worker.photo),
    resolveStorageUrl(worker.cin_recto),
    resolveStorageUrl(worker.cin_verso),
  ]);
  return { ...worker, photo, cin_recto, cin_verso };
}

/** Form UI → DB row (sans médias — upload séparé) */
export function toWorkerRow(form, meta = {}) {
  return {
    numero_cin: emptyToNull(form.cin?.trim()?.toUpperCase()),
    prenom: form.prenom?.trim(),
    nom: form.nom?.trim(),
    telephone: emptyToNull(form.telephone?.trim()),
    fonction: emptyToNull(form.fonction),
    specialite: emptyToNull(form.specialite),
    tarif: Number(form.tarif) || 0,
    experience: form.experience || 'intermediaire',
    date_naissance: emptyToNull(form.date_naissance),
    lieu_naissance: emptyToNull(form.ville_naissance?.trim()),
    adresse: emptyToNull(form.adresse?.trim()),
    nationalite: emptyToNull(form.nationalite?.trim()) || 'Marocaine',
    etat_civil: emptyToNull(form.etat_civil),
    groupe_sanguin: emptyToNull(form.groupe_sanguin),
    sexe: emptyToNull(form.sexe),
    date_expiration: emptyToNull(form.date_expiration),
    date_recrutement: emptyToNull(form.date_recrutement),
    statut: form.statut || 'actif',
    disponibilite: form.disponibilite || 'oui',
    project_id: form.project_id || null,
    chantier: emptyToNull(
      form.project_id
        ? (form.projet_nom || form.chantier || '').trim()
        : (form.chantier_legacy || form.chantier || '').trim(),
    ),
    badge: emptyToNull(form.badge?.trim()),
    contact_urgence: emptyToNull(form.contact_urgence?.trim()),
    tel_urgence: emptyToNull(form.tel_urgence?.trim()),
    relation_urgence: emptyToNull(form.relation_urgence),
    pointure: emptyToNull(form.pointure),
    taille_vetement: emptyToNull(form.taille_vetement),
    taille_gants: emptyToNull(form.taille_gants),
    casque: emptyToNull(form.casque),
    ...meta,
  };
}

async function getAuthUserId() {
  const { data: { user }, error } = await getSupabase().auth.getUser();
  if (error || !user) {
    const err = new Error('Session requise.');
    err.code = 'AUTH';
    throw err;
  }
  return user.id;
}

async function upsertWorkerDocument(workerId, docType, storagePath, mimeType) {
  const { data: existing } = await getSupabase()
    .from(DOCS_TABLE)
    .select('id, storage_path')
    .eq('worker_id', workerId)
    .eq('doc_type', docType)
    .maybeSingle();

  if (existing?.storage_path && existing.storage_path !== storagePath) {
    await deleteWorkerMedia([existing.storage_path]);
  }

  const payload = {
    worker_id: workerId,
    doc_type: docType,
    storage_path: storagePath,
    file_name: storagePath.split('/').pop(),
    mime_type: mimeType || null,
  };

  if (existing?.id) {
    await getSupabase().from(DOCS_TABLE).update(payload).eq('id', existing.id);
  } else {
    await getSupabase().from(DOCS_TABLE).insert([payload]);
  }
}

async function syncWorkerMedia(workerId, form, existingRow = {}) {
  const mediaUpdates = {};

  for (const { formKey, dbKey, docType } of MEDIA_FIELDS) {
    const value = form[formKey];
    if (!value) {
      mediaUpdates[dbKey] = existingRow[dbKey] || null;
      continue;
    }
    if (isDataUrl(value)) {
      const path = await uploadWorkerMedia(workerId, formKey, value);
      mediaUpdates[dbKey] = path;
      await upsertWorkerDocument(workerId, docType, path, value.match(/data:([^;]+)/)?.[1]);
    } else if (isHttpUrl(value)) {
      mediaUpdates[dbKey] = existingRow[dbKey] || null;
    } else {
      mediaUpdates[dbKey] = value;
    }
  }

  if (Object.keys(mediaUpdates).length) {
    const { error } = await getSupabase()
      .from(TABLE)
      .update(mediaUpdates)
      .eq('id', workerId);
    if (error) throw error;
  }

  return mediaUpdates;
}

export async function listWorkers() {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select(WORKER_SELECT)
    .order('created_at', { ascending: false });

  if (error) throw error;

  const normalized = (data || []).map(normalizeWorker);
  return Promise.all(normalized.map(enrichWorkerMedia));
}

export async function createWorker(form) {
  const userId = await getAuthUserId();
  const row = toWorkerRow(form, { created_by: userId });

  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([row])
    .select()
    .single();

  if (error) throw error;

  await syncWorkerMedia(data.id, form);
  const { data: fresh, error: reloadErr } = await getSupabase()
    .from(TABLE)
    .select(WORKER_SELECT)
    .eq('id', data.id)
    .single();

  if (reloadErr) throw reloadErr;
  return enrichWorkerMedia(normalizeWorker(fresh));
}

export async function updateWorker(id, form) {
  await getAuthUserId();

  const { data: existing, error: fetchErr } = await getSupabase()
    .from(TABLE)
    .select(WORKER_SELECT)
    .eq('id', id)
    .single();

  if (fetchErr) throw fetchErr;

  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(toWorkerRow(form))
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;

  await syncWorkerMedia(id, form, existing);
  const { data: fresh, error: reloadErr } = await getSupabase()
    .from(TABLE)
    .select(WORKER_SELECT)
    .eq('id', id)
    .single();

  if (reloadErr) throw reloadErr;
  return enrichWorkerMedia(normalizeWorker(fresh));
}

export async function deleteWorker(id) {
  await getAuthUserId();

  const { data: docs } = await getSupabase()
    .from(DOCS_TABLE)
    .select('storage_path')
    .eq('worker_id', id);

  const paths = (docs || []).map((d) => d.storage_path).filter(Boolean);
  const { data: worker } = await getSupabase()
    .from(TABLE)
    .select('photo_url, cin_recto_url, cin_verso_url')
    .eq('id', id)
    .maybeSingle();

  if (worker) {
    paths.push(worker.photo_url, worker.cin_recto_url, worker.cin_verso_url);
  }

  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) throw error;

  await deleteWorkerMedia([...new Set(paths.filter(Boolean))]);
}

export function computeWorkerStats(workers) {
  const list = workers || [];
  return {
    total: list.length,
    enChantier: list.filter((w) => w.statut === 'en_chantier').length,
    disponibles: list.filter((w) => w.statut === 'disponible' || (w.statut === 'actif' && w.disponibilite === 'oui')).length,
    tarifMoyen: list.length
      ? Math.round(list.reduce((s, w) => s + Number(w.tarif || 0), 0) / list.length)
      : 0,
  };
}

export function filterWorkers(workers, { search = '', statut = '', fonction = '' } = {}) {
  const q = search.toLowerCase().trim();
  return (workers || []).filter((w) => {
    if (statut && w.statut !== statut) return false;
    if (fonction && w.fonction !== fonction) return false;
    if (!q) return true;
    return (
      `${w.prenom} ${w.nom}`.toLowerCase().includes(q)
      || (w.cin || '').toLowerCase().includes(q)
      || (w.fonction || '').toLowerCase().includes(q)
      || (w.chantier || '').toLowerCase().includes(q)
      || (w.projet_nom || '').toLowerCase().includes(q)
    );
  });
}

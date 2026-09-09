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
import {
  listActiveWorkerProjectAssignments,
  buildWorkerProjectIdsMap,
  enrichWorkersWithProjectIds,
} from './workerProjectAssignments';

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

/** UI stars (1–5) → valeurs DB historiques (contrainte CHECK éventuelle). */
function experienceToDb(value) {
  const raw = String(value ?? '').trim();
  if (['debutant', 'intermediaire', 'confirme', 'expert'].includes(raw)) return raw;
  const n = Number(raw);
  if (n <= 1) return 'debutant';
  if (n === 2) return 'intermediaire';
  if (n === 3) return 'confirme';
  if (n >= 4) return 'expert';
  return 'intermediaire';
}

function isMissingProjectIdColumnError(error) {
  const msg = error?.message || '';
  return /project_id/i.test(msg)
    && (/workers/i.test(msg) || /schema cache/i.test(msg) || error?.code === 'PGRST204' || error?.code === '42703');
}

export const WORKER_HOURS_PER_DAY = 8;

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

/** Tarif horaire affiché / stocké (unité heure) */
export function workerTarifHoraire(worker) {
  const tarif = Number(worker?.tarif) || 0;
  const unite = worker?.tarif_unite || 'heure';
  switch (unite) {
    case 'heure': return tarif;
    case 'jour': return round2(tarif / WORKER_HOURS_PER_DAY);
    case 'semaine': return round2(tarif / (5 * WORKER_HOURS_PER_DAY));
    case 'mois': return round2(tarif / (26 * WORKER_HOURS_PER_DAY));
    default: return tarif;
  }
}

/** Équivalent journalier pour paie (8 h) */
export function workerTarifJournalier(worker) {
  const tarif = Number(worker?.tarif) || 0;
  const unite = worker?.tarif_unite || 'heure';
  switch (unite) {
    case 'heure': return round2(tarif * WORKER_HOURS_PER_DAY);
    case 'jour': return tarif;
    case 'semaine': return round2(tarif / 5);
    case 'mois': return round2(tarif / 26);
    default: return tarif;
  }
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
    tarif_unite: row.tarif_unite || 'heure',
    date_naissance: row.date_naissance || '',
    ville_naissance: row.lieu_naissance || '',
    adresse: row.adresse || '',
    nationalite: row.nationalite || 'Marocaine',
    etat_civil: row.etat_civil || '',
    groupe_sanguin: row.groupe_sanguin || '',
    sexe: row.sexe || '',
    date_expiration: row.date_expiration || '',
    experience: (() => {
      const exp = row.experience || '3';
      const n = Number(exp);
      if (n >= 1 && n <= 5) return String(n);
      const map = { debutant: '1', intermediaire: '2', confirme: '3', expert: '4' };
      return map[exp] || '3';
    })(),
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
    tarif: Number(form.tarif) || 0,
    tarif_unite: form.tarif_unite || 'jour',
    experience: experienceToDb(form.experience),
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
    badge: emptyToNull(form.badge?.trim()),
    contact_urgence: emptyToNull(form.contact_urgence?.trim()),
    tel_urgence: emptyToNull(form.tel_urgence?.trim()),
    relation_urgence: emptyToNull(form.relation_urgence),
    pointure: emptyToNull(form.pointure),
    taille_vetement: emptyToNull(form.taille_vetement),
    taille_gants: emptyToNull(form.taille_gants),
    casque: emptyToNull(form.casque),
    project_id: form.project_id || null,
    chantier: emptyToNull(
      (form.projet_nom || form.chantier || '').trim()
      || null,
    ),
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

/** Âge autorisé ouvriers externes : 18–60 ans inclus. */
function assertWorkerAgeAllowed(dateNaissance) {
  if (!dateNaissance) {
    const err = new Error('La date de naissance est obligatoire (âge entre 18 et 60 ans).');
    err.code = 'AGE_REQUIRED';
    throw err;
  }
  const raw = String(dateNaissance).slice(0, 10);
  const born = new Date(`${raw}T12:00:00`);
  if (Number.isNaN(born.getTime())) {
    const err = new Error('Date de naissance invalide.');
    err.code = 'AGE_INVALID';
    throw err;
  }
  const today = new Date();
  let age = today.getFullYear() - born.getFullYear();
  const m = today.getMonth() - born.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < born.getDate())) age -= 1;
  if (age < 18 || age > 60) {
    const err = new Error(
      age < 18
        ? `Âge refusé (${age} ans) : moins de 18 ans non accepté.`
        : `Âge refusé (${age} ans) : plus de 60 ans non accepté.`,
    );
    err.code = 'AGE_REJECTED';
    err.age = age;
    throw err;
  }
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
  let { data, error } = await getSupabase()
    .from(TABLE)
    .select(WORKER_SELECT)
    .order('created_at', { ascending: false });

  if (error && /projects|project_id|relationship/i.test(error.message || '')) {
    ({ data, error } = await getSupabase()
      .from(TABLE)
      .select('*')
      .order('created_at', { ascending: false }));
  }

  if (error) throw error;

  let assignmentMap = new Map();
  try {
    const assignments = await listActiveWorkerProjectAssignments();
    assignmentMap = buildWorkerProjectIdsMap(assignments);
  } catch (assignErr) {
    console.warn('[CITYMO] worker assignments load', assignErr);
  }

  const normalized = enrichWorkersWithProjectIds(
    (data || []).map(normalizeWorker),
    assignmentMap,
  );
  return Promise.all(normalized.map(enrichWorkerMedia));
}

async function insertWorkerRow(row) {
  let { data, error } = await getSupabase()
    .from(TABLE)
    .insert([row])
    .select()
    .single();

  if (error && isMissingProjectIdColumnError(error) && row.project_id != null) {
    const fallback = { ...row };
    delete fallback.project_id;
    ({ data, error } = await getSupabase()
      .from(TABLE)
      .insert([fallback])
      .select()
      .single());
  }
  if (error) throw error;
  return data;
}

async function updateWorkerRow(id, row) {
  let { data, error } = await getSupabase()
    .from(TABLE)
    .update(row)
    .eq('id', id)
    .select()
    .single();

  if (error && isMissingProjectIdColumnError(error) && row.project_id != null) {
    const fallback = { ...row };
    delete fallback.project_id;
    ({ data, error } = await getSupabase()
      .from(TABLE)
      .update(fallback)
      .eq('id', id)
      .select()
      .single());
  }
  if (error) throw error;
  return data;
}

async function reloadWorker(id) {
  let { data, error } = await getSupabase()
    .from(TABLE)
    .select(WORKER_SELECT)
    .eq('id', id)
    .single();

  if (error && /projects|project_id|relationship/i.test(error.message || '')) {
    ({ data, error } = await getSupabase()
      .from(TABLE)
      .select('*')
      .eq('id', id)
      .single());
  }
  if (error) throw error;
  return data;
}

export async function createWorker(form) {
  const userId = await getAuthUserId();
  assertWorkerAgeAllowed(form.date_naissance);
  const row = toWorkerRow(form, { created_by: userId });
  const data = await insertWorkerRow(row);

  await syncWorkerMedia(data.id, form);
  if (form.project_id) {
    try {
      const { ensureWorkerAssignedToProject } = await import('./workerProjectAssignments');
      await ensureWorkerAssignedToProject(form.project_id, data.id);
    } catch (assignErr) {
      console.warn('[CITYMO] affectation projet à la création ouvrier', assignErr);
    }
  }
  const fresh = await reloadWorker(data.id);
  return enrichWorkerMedia(normalizeWorker(fresh));
}

export async function updateWorker(id, form) {
  await getAuthUserId();
  assertWorkerAgeAllowed(form.date_naissance);

  const { data: existing, error: fetchErr } = await getSupabase()
    .from(TABLE)
    .select('*')
    .eq('id', id)
    .single();

  if (fetchErr) throw fetchErr;

  await updateWorkerRow(id, toWorkerRow(form));
  await syncWorkerMedia(id, form, existing);
  if (form.project_id) {
    try {
      const { ensureWorkerAssignedToProject } = await import('./workerProjectAssignments');
      await ensureWorkerAssignedToProject(form.project_id, id);
    } catch (assignErr) {
      console.warn('[CITYMO] affectation projet à la MAJ ouvrier', assignErr);
    }
  }
  const fresh = await reloadWorker(id);
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

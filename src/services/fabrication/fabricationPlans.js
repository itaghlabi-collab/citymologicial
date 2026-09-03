/**
 * fabricationPlans.js — CRUD plans de fabrication (Supabase)
 */
import { getSupabase } from '../../lib/supabase';
import { formatProfileDisplayName } from '../admin/users';
import { formatSupabaseError } from '../supabase/formatError';
import { todayISO } from '../../constants/fabrication';
import {
  uploadFabricationFile,
  resolveProjectFileUrl,
} from './fabricationStorage';

const TABLE = 'fabrication_plans';
const ATT = 'fabrication_attachments';
const HIST = 'fabrication_history';

const SCHEMA_HINT = 'Table Fabrication absente — exécutez supabase/RUN_FABRICATION.sql dans Supabase (SQL Editor).';

function schemaError(error) {
  const msg = String(error?.message || '');
  if (error?.code === '42P01' || msg.includes('fabrication_')) {
    const err = new Error(SCHEMA_HINT);
    err.code = 'SCHEMA';
    return err;
  }
  return new Error(formatSupabaseError(error, 'Erreur Fabrication.'));
}

async function requireUser() {
  const { data: { user }, error } = await getSupabase().auth.getUser();
  if (error || !user) {
    const err = new Error('Session requise.');
    err.code = 'AUTH';
    throw err;
  }
  return user;
}

async function getProfileName(userId) {
  if (!userId) return '';
  const { data } = await getSupabase()
    .from('profiles')
    .select('nom, prenom, email')
    .eq('id', userId)
    .maybeSingle();
  if (!data) return '';
  return formatProfileDisplayName(data) || data.email || '';
}

function normalizeAttachment(row, url = '') {
  if (!row) return null;
  return {
    id: row.id,
    plan_id: row.plan_id,
    kind: row.kind || 'plan',
    storage_path: row.storage_path,
    file_name: row.file_name || '',
    mime_type: row.mime_type || '',
    file_size: Number(row.file_size || 0),
    project_document_id: row.project_document_id || null,
    created_at: row.created_at,
    url,
  };
}

function normalizeHistory(row) {
  if (!row) return null;
  return {
    id: row.id,
    plan_id: row.plan_id,
    utilisateur_id: row.utilisateur_id,
    utilisateur_nom: row.utilisateur_nom || '',
    ancien_statut: row.ancien_statut || '',
    nouveau_statut: row.nouveau_statut || '',
    avancement: row.avancement == null ? null : Number(row.avancement),
    commentaire: row.commentaire || '',
    created_at: row.created_at,
  };
}

export function normalizePlan(row, attachments = [], history = []) {
  if (!row) return null;
  return {
    id: row.id,
    reference: row.reference || '',
    project_id: row.project_id || null,
    projet_nom: row.projet_nom || '',
    projet_ref: row.projet_ref || '',
    designation: row.designation || '',
    commentaire_transmission: row.commentaire_transmission || '',
    statut: row.statut || 'plan_recu',
    atelier: row.atelier || '',
    chef_atelier_user_id: row.chef_atelier_user_id || null,
    chef_atelier_nom: row.chef_atelier_nom || '',
    priorite: row.priorite || 'normale',
    date_transmission: row.date_transmission || null,
    date_debut_prevue: row.date_debut_prevue || '',
    date_fin_prevue: row.date_fin_prevue || '',
    date_debut_reelle: row.date_debut_reelle || '',
    date_fin_reelle: row.date_fin_reelle || '',
    avancement: Number(row.avancement || 0),
    consigne: row.consigne || '',
    motif_blocage: row.motif_blocage || '',
    transmetteur_id: row.transmetteur_id || null,
    transmetteur_nom: row.transmetteur_nom || '',
    affecte_par_id: row.affecte_par_id || null,
    affecte_par_nom: row.affecte_par_nom || '',
    date_affectation: row.date_affectation || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    attachments,
    history,
  };
}

async function withUrls(rows) {
  return Promise.all((rows || []).map(async (row) => {
    const url = await resolveProjectFileUrl(row.storage_path);
    return normalizeAttachment(row, url);
  }));
}

async function loadAttachments(planIds) {
  if (!planIds.length) return {};
  const { data, error } = await getSupabase()
    .from(ATT)
    .select('*')
    .in('plan_id', planIds)
    .order('created_at', { ascending: true });
  if (error) throw schemaError(error);
  const mapped = await withUrls(data || []);
  const byPlan = {};
  mapped.forEach((att) => {
    if (!byPlan[att.plan_id]) byPlan[att.plan_id] = [];
    byPlan[att.plan_id].push(att);
  });
  return byPlan;
}

export async function generateFabricationRef() {
  await requireUser();
  const year = new Date().getFullYear();
  const prefix = `FAB-${year}-`;
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('reference')
    .like('reference', `${prefix}%`)
    .order('reference', { ascending: false })
    .limit(50);
  if (error) throw schemaError(error);
  let max = 0;
  (data || []).forEach((r) => {
    const m = String(r.reference || '').match(/FAB-\d{4}-(\d+)/i);
    if (m) max = Math.max(max, Number(m[1]));
  });
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
}

export async function listFabricationPlans() {
  await requireUser();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .order('date_transmission', { ascending: false });
  if (error) throw schemaError(error);
  const rows = data || [];
  const byPlan = await loadAttachments(rows.map((r) => r.id));
  return rows.map((row) => normalizePlan(row, byPlan[row.id] || []));
}

export async function getFabricationPlan(id) {
  await requireUser();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw schemaError(error);
  if (!data) return null;
  const [{ data: atts, error: attErr }, { data: hist, error: histErr }] = await Promise.all([
    getSupabase().from(ATT).select('*').eq('plan_id', id).order('created_at', { ascending: true }),
    getSupabase().from(HIST).select('*').eq('plan_id', id).order('created_at', { ascending: false }),
  ]);
  if (attErr) throw schemaError(attErr);
  if (histErr) throw schemaError(histErr);
  return normalizePlan(data, await withUrls(atts || []), (hist || []).map(normalizeHistory));
}

async function insertHistory({ planId, userId, userName, ancien, nouveau, avancement, commentaire }) {
  const { error } = await getSupabase().from(HIST).insert([{
    plan_id: planId,
    utilisateur_id: userId,
    utilisateur_nom: userName,
    ancien_statut: ancien || null,
    nouveau_statut: nouveau || null,
    avancement: avancement == null ? null : avancement,
    commentaire: commentaire || '',
  }]);
  if (error) throw schemaError(error);
}

async function insertAttachmentRow({ planId, userId, kind, storage_path, file_name, mime_type, file_size, project_document_id }) {
  const { data, error } = await getSupabase()
    .from(ATT)
    .insert([{
      plan_id: planId,
      kind,
      storage_path,
      file_name: file_name || '',
      mime_type: mime_type || null,
      file_size: file_size || null,
      project_document_id: project_document_id || null,
      created_by: userId,
    }])
    .select('*')
    .single();
  if (error) throw schemaError(error);
  return data;
}

export async function transmitFabricationPlan({
  project,
  designation,
  commentaire,
  file,
  existingDocument,
}) {
  const user = await requireUser();
  const name = await getProfileName(user.id);
  const designationClean = String(designation || '').trim();
  if (!project?.id) throw new Error('Projet obligatoire.');
  if (!designationClean) throw new Error('L’objet / désignation est obligatoire.');
  if (!file && !existingDocument?.storage_path) throw new Error('Joignez ou sélectionnez un plan.');

  const reference = await generateFabricationRef();
  const payload = {
    reference,
    project_id: project.id,
    projet_nom: project.nom || '',
    projet_ref: project.ref || '',
    designation: designationClean,
    commentaire_transmission: String(commentaire || '').trim(),
    statut: 'plan_recu',
    transmetteur_id: user.id,
    transmetteur_nom: name,
    created_by: user.id,
    updated_by: user.id,
  };

  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([payload])
    .select('*')
    .single();
  if (error) throw schemaError(error);

  try {
    if (existingDocument?.storage_path) {
      await insertAttachmentRow({
        planId: data.id,
        userId: user.id,
        kind: 'plan',
        storage_path: existingDocument.storage_path,
        file_name: existingDocument.file_name,
        mime_type: existingDocument.mime_type,
        file_size: existingDocument.file_size,
        project_document_id: existingDocument.id,
      });
    } else if (file) {
      const storage_path = await uploadFabricationFile(data.id, file);
      await insertAttachmentRow({
        planId: data.id,
        userId: user.id,
        kind: 'plan',
        storage_path,
        file_name: file.name,
        mime_type: file.type,
        file_size: file.size,
      });
    }
    await insertHistory({
      planId: data.id,
      userId: user.id,
      userName: name,
      ancien: '',
      nouveau: 'plan_recu',
      avancement: 0,
      commentaire: String(commentaire || '').trim() || 'Transmission du plan',
    });
  } catch (err) {
    console.error('[CITYMO] fabrication transmit attachment', err);
    throw err;
  }

  return getFabricationPlan(data.id);
}

export async function assignFabricationPlan(id, {
  atelier,
  chef_atelier_user_id,
  chef_atelier_nom,
  date_debut_prevue,
  date_fin_prevue,
  priorite,
  consigne,
}) {
  const user = await requireUser();
  const name = await getProfileName(user.id);
  if (!atelier) throw new Error('L’atelier est obligatoire.');
  if (!chef_atelier_user_id && !String(chef_atelier_nom || '').trim()) {
    throw new Error('Le chef d’atelier est obligatoire.');
  }
  if (!date_fin_prevue) throw new Error('La date prévue de fin est obligatoire.');

  const current = await getFabricationPlan(id);
  if (!current) throw new Error('Plan introuvable.');

  const { data, error } = await getSupabase()
    .from(TABLE)
    .update({
      atelier,
      chef_atelier_user_id: chef_atelier_user_id || null,
      chef_atelier_nom: String(chef_atelier_nom || '').trim(),
      date_debut_prevue: date_debut_prevue || null,
      date_fin_prevue,
      priorite: priorite || 'normale',
      consigne: String(consigne || '').trim(),
      statut: 'a_lancer',
      affecte_par_id: user.id,
      affecte_par_nom: name,
      date_affectation: new Date().toISOString(),
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw schemaError(error);

  await insertHistory({
    planId: id,
    userId: user.id,
    userName: name,
    ancien: current.statut,
    nouveau: 'a_lancer',
    avancement: current.avancement,
    commentaire: String(consigne || '').trim() || 'Affectation à l’atelier',
  });

  return normalizePlan(data, current.attachments, current.history);
}

export async function updateFabricationProduction(id, {
  avancement,
  statut,
  commentaire,
  motif_blocage,
  photos = [],
}) {
  const user = await requireUser();
  const name = await getProfileName(user.id);
  const current = await getFabricationPlan(id);
  if (!current) throw new Error('Plan introuvable.');

  let nextStatut = statut || current.statut;
  let nextAvancement = avancement == null ? current.avancement : Number(avancement);
  if (Number.isNaN(nextAvancement)) nextAvancement = current.avancement;
  nextAvancement = Math.max(0, Math.min(100, Math.round(nextAvancement)));

  if (nextAvancement === 100) nextStatut = 'termine';
  if (nextStatut === 'termine') nextAvancement = 100;

  if (nextStatut === 'bloque' && !String(motif_blocage || current.motif_blocage || '').trim()) {
    throw new Error('Le motif du blocage est obligatoire.');
  }

  const patch = {
    avancement: nextAvancement,
    statut: nextStatut,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  };

  if (nextStatut === 'bloque') {
    patch.motif_blocage = String(motif_blocage || current.motif_blocage || '').trim();
  } else if (current.statut === 'bloque' && nextStatut !== 'bloque') {
    patch.motif_blocage = null;
  }

  if (nextStatut === 'en_fabrication' && !current.date_debut_reelle) {
    patch.date_debut_reelle = todayISO();
  }
  if (nextStatut === 'termine' && !current.date_fin_reelle) {
    patch.date_fin_reelle = todayISO();
    if (!current.date_debut_reelle) patch.date_debut_reelle = todayISO();
  }

  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw schemaError(error);

  for (const file of photos) {
    if (!file) continue;
    const storage_path = await uploadFabricationFile(id, file);
    await insertAttachmentRow({
      planId: id,
      userId: user.id,
      kind: 'photo',
      storage_path,
      file_name: file.name,
      mime_type: file.type,
      file_size: file.size,
    });
  }

  await insertHistory({
    planId: id,
    userId: user.id,
    userName: name,
    ancien: current.statut,
    nouveau: nextStatut,
    avancement: nextAvancement,
    commentaire: String(commentaire || '').trim()
      || (nextStatut === 'bloque' ? patch.motif_blocage : ''),
  });

  return getFabricationPlan(id);
}

export async function listFabricationUsers() {
  await requireUser();
  const { data, error } = await getSupabase()
    .from('profiles')
    .select('id, nom, prenom, email, statut')
    .order('nom', { ascending: true });
  if (error) {
    console.warn('[CITYMO] fabrication users', error.message);
    return [];
  }
  return (data || [])
    .filter((p) => !p.statut || p.statut === 'actif')
    .map((p) => ({
      id: p.id,
      nom: formatProfileDisplayName(p) || p.email || p.id,
    }));
}

export { SCHEMA_HINT };

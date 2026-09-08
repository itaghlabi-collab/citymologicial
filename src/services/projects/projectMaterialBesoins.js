/**
 * projectMaterialBesoins.js — Fiches besoins matériaux chantier (saisie libre)
 */
import { getSupabase } from '../../lib/supabase';
import { formatProfileDisplayName } from '../admin/users';
import {
  materialBesoinStatutBadge,
  materialBesoinStatutLabel,
} from '../../constants/projectMaterialBesoins';

const TABLE = 'project_chantier_material_needs';
const LINES = 'project_chantier_material_need_lines';

function fmtLotSummary(lines = []) {
  const lots = [...new Set(lines.map((l) => l.lot).filter(Boolean))];
  if (!lots.length) return '—';
  if (lots.length === 1) return lots[0];
  return 'Multi-lots';
}

function sumQuantite(lines = []) {
  return lines.reduce((acc, l) => acc + (Number(l.quantite) || 0), 0);
}

export function enrichMaterialBesoinRow(row, lines = []) {
  const sorted = [...lines].sort((a, b) => (a.line_order ?? 0) - (b.line_order ?? 0));
  return {
    id: row.id,
    ref_besoin: row.ref_besoin || '',
    project_id: row.project_id,
    project_ref: row.project_ref || '',
    project_name: row.project_name || '',
    client_name: row.client_name || '',
    date_besoin: row.date_besoin || '',
    priorite: row.priorite || 'Normale',
    demandeur_user_id: row.demandeur_user_id || null,
    demandeur_name: row.demandeur_name || '',
    observation: row.observation || '',
    validation_direction: row.validation_direction || '',
    statut: row.statut || 'brouillon',
    statutLabel: materialBesoinStatutLabel(row.statut),
    statutBadge: materialBesoinStatutBadge(row.statut),
    site_request_id: row.site_request_id || null,
    site_request_ref: row.site_request_ref || '',
    lines: sorted,
    line_count: sorted.length,
    lot_label: fmtLotSummary(sorted),
    quantite_globale: sumQuantite(sorted),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function requireUser() {
  const { data: { user }, error } = await getSupabase().auth.getUser();
  if (error || !user) throw new Error('Session requise.');
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

async function loadLines(needId) {
  const { data, error } = await getSupabase()
    .from(LINES)
    .select('*')
    .eq('need_id', needId)
    .order('line_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function generateMaterialBesoinRef() {
  const year = new Date().getFullYear();
  const prefix = `BM-${year}-`;
  const { count, error } = await getSupabase()
    .from(TABLE)
    .select('*', { count: 'exact', head: true })
    .like('ref_besoin', `${prefix}%`);
  if (error) throw error;
  return `${prefix}${String((count || 0) + 1).padStart(3, '0')}`;
}

function projectSnapshot(projet) {
  return {
    project_ref: projet?.ref || '',
    project_name: projet?.nom || '',
    client_name: projet?.client || projet?.client_nom || '',
  };
}

function normalizeLines(lines = []) {
  return lines
    .map((l, idx) => ({
      line_order: idx,
      designation: String(l.designation || '').trim(),
      quantite: Number(l.quantite) || 0,
      unite: l.unite || 'unité',
      lot: l.lot || 'Autre',
      date_souhaitee: l.date_souhaitee || null,
      observation: l.observation?.trim() || null,
    }))
    .filter((l) => l.designation);
}

async function replaceLines(needId, lines) {
  await getSupabase().from(LINES).delete().eq('need_id', needId);
  const rows = normalizeLines(lines);
  if (!rows.length) throw new Error('Ajoutez au moins une ligne matériau.');
  const { error } = await getSupabase().from(LINES).insert(rows.map((r) => ({ ...r, need_id: needId })));
  if (error) throw error;
}

export async function listProjectMaterialBesoins(projectId) {
  if (!projectId) return [];
  await requireUser();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const rows = data || [];
  const enriched = await Promise.all(rows.map(async (row) => {
    const lines = await loadLines(row.id);
    return enrichMaterialBesoinRow(row, lines);
  }));
  return enriched;
}

export async function getProjectMaterialBesoin(id) {
  await requireUser();
  const { data, error } = await getSupabase().from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const lines = await loadLines(id);
  return enrichMaterialBesoinRow(data, lines);
}

export async function createProjectMaterialBesoin(projectId, form, projet) {
  const user = await requireUser();
  const demandeurName = form.demandeur_name?.trim()
    || await getProfileName(user.id)
    || projet?.chef_projet
    || projet?.chef_chantier
    || '';
  const lines = normalizeLines(form.lines);
  if (!lines.length) throw new Error('Ajoutez au moins une ligne matériau.');

  const ref = await generateMaterialBesoinRef();
  const payload = {
    ref_besoin: ref,
    project_id: projectId,
    ...projectSnapshot(projet),
    date_besoin: form.date_besoin || new Date().toISOString().slice(0, 10),
    priorite: form.priorite || 'Normale',
    demandeur_user_id: user.id,
    demandeur_name: demandeurName,
    observation: form.observation?.trim() || null,
    // BM seul — pas de DC dédiée. Visible ensuite dans Demandes chantier.
    statut: 'soumis',
    created_by: user.id,
  };

  const { data, error } = await getSupabase().from(TABLE).insert([payload]).select().single();
  if (error) throw error;
  await replaceLines(data.id, form.lines);
  return getProjectMaterialBesoin(data.id);
}

export async function updateProjectMaterialBesoin(id, form, { submit = false } = {}) {
  await requireUser();
  const existing = await getProjectMaterialBesoin(id);
  if (!existing) throw new Error('Fiche introuvable.');
  if (!['brouillon', 'soumis', 'transmis'].includes(existing.statut)) {
    throw new Error('Seules les fiches en brouillon, soumises ou transmises peuvent être modifiées.');
  }

  const patch = {
    date_besoin: form.date_besoin || existing.date_besoin,
    priorite: form.priorite || existing.priorite,
    observation: form.observation?.trim() || null,
  };
  if (form.demandeur_name?.trim()) patch.demandeur_name = form.demandeur_name.trim();
  if (submit || existing.statut === 'brouillon') patch.statut = 'soumis';

  const { error } = await getSupabase().from(TABLE).update(patch).eq('id', id);
  if (error) throw error;
  await replaceLines(id, form.lines);
  return getProjectMaterialBesoin(id);
}

/**
 * Liste les BM pour affichage dans Demandes chantier (sans créer de DC).
 */
export async function listMaterialBesoinsForDemandesChantier({ projectId = null } = {}) {
  await requireUser();
  let q = getSupabase()
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false });
  if (projectId) q = q.eq('project_id', projectId);
  const { data, error } = await q;
  if (error) throw error;

  const rows = data || [];
  return Promise.all(rows.map(async (row) => {
    const lines = await loadLines(row.id);
    const need = enrichMaterialBesoinRow(row, lines);
    return materialBesoinToDemandesChantierRow(need);
  }));
}

/** Adapte un BM au format ligne de la liste Demandes chantier. */
export function materialBesoinToDemandesChantierRow(need) {
  const dateSouhaitee = (need.lines || [])
    .map((l) => l.date_souhaitee)
    .filter(Boolean)
    .sort()[0] || need.date_besoin || '';
  return {
    id: `bm:${need.id}`,
    source_type: 'material_besoin',
    material_besoin_id: need.id,
    material_need_id: need.id,
    from_material_besoin: true,
    ref: need.ref_besoin || '',
    project_id: need.project_id,
    project_ref: need.project_ref || '',
    project_name: need.project_name || '',
    client_name: need.client_name || '',
    chef_projet: '',
    chef_chantier: '',
    date_demande: need.date_besoin || '',
    date_souhaitee: dateSouhaitee,
    priorite: need.priorite || 'Normale',
    observation: need.observation || '',
    statut: need.statut === 'brouillon' ? 'brouillon' : 'soumise',
    statutLabel: need.statutLabel || materialBesoinStatutLabel(need.statut),
    origine: 'besoin_materiaux',
    prepared_by_name: '',
    distinct_articles: need.line_count || (need.lines || []).length,
    lines: need.lines || [],
    _besoin: need,
  };
}

/** Mappe une fiche BM → lignes demande chantier (articles hors catalogue). */
function mapBesoinLinesToSiteRequestLines(need) {
  return (need.lines || [])
    .filter((l) => String(l.designation || '').trim())
    .map((l, idx) => ({
      category_id: 'autres',
      article_name: String(l.designation).trim(),
      quantite_demandee: Number(l.quantite) || 0,
      unite: l.unite || 'unité',
      is_custom: true,
      date_souhaitee: l.date_souhaitee || need.date_besoin || null,
      remarque: [l.lot ? `Lot : ${l.lot}` : '', l.observation || ''].filter(Boolean).join(' — ') || null,
      line_order: idx,
    }))
    .filter((l) => Number(l.quantite_demandee) > 0);
}

/**
 * Retrouve une DC déjà créée depuis CE BM uniquement.
 * Jamais de matching flou sur observation / projet : une DC manuelle
 * (Ajouter un besoin matériel) ne doit pas être rattachée à un BM.
 */
async function findExistingSiteRequestForMaterialBesoin(need) {
  if (!need?.id) return null;
  const sb = getSupabase();
  const { data, error } = await sb
    .from('site_material_requests')
    .select('id, ref_demande, statut, observation, material_need_id, created_at')
    .eq('material_need_id', need.id)
    .neq('statut', 'annulee')
    .order('created_at', { ascending: true });
  if (error || !data?.length) return null;

  for (const row of data) {
    const { data: lines } = await sb
      .from('site_material_request_lines')
      .select('id, quantite_demandee, article_name')
      .eq('request_id', row.id)
      .limit(20);
    const hasContent = (lines || []).some(
      (l) => Number(l.quantite_demandee) > 0 || String(l.article_name || '').trim(),
    );
    if (hasContent) return row;
  }
  return data[0] || null;
}

/** Lien BM↔DC valide seulement si la DC a été créée depuis CE BM. */
async function isValidMaterialBesoinSiteRequestLink(need, siteRequestId) {
  if (!need?.id || !siteRequestId) return false;
  const { data, error } = await getSupabase()
    .from('site_material_requests')
    .select('id, material_need_id, observation')
    .eq('id', siteRequestId)
    .maybeSingle();
  if (error) {
    // Colonne absente (migration non jouée) : on conserve le lien existant.
    if (/material_need_id|column/i.test(String(error.message || ''))) return true;
    return false;
  }
  if (!data) return false;
  if (data.material_need_id != null) {
    return String(data.material_need_id) === String(need.id);
  }
  const obs = String(data.observation || '');
  if (need.ref_besoin && obs.includes(`Issu du besoin matériaux ${need.ref_besoin}`)) {
    return true;
  }
  // DC manuelle indépendante (ex. DC-00019) : ne jamais la considérer liée à un BM.
  return false;
}

async function clearInvalidMaterialBesoinSiteRequestLink(need) {
  if (!need?.id || !need.site_request_id) return need;
  const ok = await isValidMaterialBesoinSiteRequestLink(need, need.site_request_id);
  if (ok) return need;
  const { error } = await getSupabase()
    .from(TABLE)
    .update({
      site_request_id: null,
      site_request_ref: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', need.id);
  if (error && !/site_request_id|column/i.test(error.message || '')) throw error;
  return getProjectMaterialBesoin(need.id);
}

async function linkMaterialBesoinToSiteRequest(needId, siteRequest) {
  const linkPatch = {
    site_request_id: siteRequest.id,
    site_request_ref: siteRequest.ref_demande || '',
    statut: 'transmis',
    updated_at: new Date().toISOString(),
  };
  const { error: linkErr } = await getSupabase().from(TABLE).update(linkPatch).eq('id', needId);
  if (linkErr && !/site_request_id|column/i.test(linkErr.message || '')) {
    throw linkErr;
  }
  return {
    id: siteRequest.id,
    ref: siteRequest.ref_demande || '',
    ref_demande: siteRequest.ref_demande || '',
  };
}

/**
 * Crée + soumet une demande chantier (DC) depuis un besoin matériaux (BM).
 * Idempotent : 1 BM = 1 DC (réutilise si déjà existante).
 */
export async function createSiteRequestFromMaterialBesoin(need, projet = null) {
  if (!need?.id) throw new Error('Besoin matériaux introuvable.');

  if (need.site_request_id) {
    return {
      id: need.site_request_id,
      ref: need.site_request_ref || '',
      ref_demande: need.site_request_ref || '',
    };
  }

  const existing = await findExistingSiteRequestForMaterialBesoin(need);
  if (existing) {
    const { submitSiteMaterialRequest } = await import('../inventaire/siteMaterialRequests');
    if (existing.statut === 'brouillon') {
      try {
        await submitSiteMaterialRequest(existing.id);
      } catch (_) { /* déjà soumise ou lignes invalides */ }
    }
    return linkMaterialBesoinToSiteRequest(need.id, existing);
  }

  const lines = mapBesoinLinesToSiteRequestLines(need);
  if (!lines.length) throw new Error('Ajoutez au moins une ligne matériau avec quantité.');

  const { createSiteMaterialRequest, submitSiteMaterialRequest } = await import('../inventaire/siteMaterialRequests');

  const dateSouhaitee = lines
    .map((l) => l.date_souhaitee)
    .filter(Boolean)
    .sort()[0] || need.date_besoin || null;

  const observation = [
    `Issu du besoin matériaux ${need.ref_besoin || ''}`.trim(),
    need.observation || '',
  ].filter(Boolean).join('\n');

  const form = {
    project_id: need.project_id || projet?.id || null,
    project_ref: need.project_ref || projet?.ref || '',
    project_name: need.project_name || projet?.nom || '',
    client_name: need.client_name || projet?.client || projet?.client_nom || '',
    chef_projet: projet?.chef_projet || projet?.responsable || '',
    chef_chantier: projet?.chef_chantier || '',
    date_demande: need.date_besoin || new Date().toISOString().slice(0, 10),
    date_souhaitee: dateSouhaitee,
    priorite: need.priorite === 'Urgente' ? 'Urgente' : 'Normale',
    observation,
    origine: 'manuelle',
    statut: 'brouillon',
    material_need_id: need.id,
  };

  const created = await createSiteMaterialRequest(form, lines);
  const submitted = await submitSiteMaterialRequest(created.id);

  return linkMaterialBesoinToSiteRequest(need.id, {
    id: submitted.id,
    ref_demande: submitted.ref_demande || submitted.ref || created.ref_demande || '',
  });
}

async function transmitMaterialBesoinToDepot(need, projet = null) {
  if (!need) throw new Error('Fiche introuvable.');
  // Détache un lien erroné vers une DC manuelle indépendante (ex. BM-003 ↔ DC-00019).
  let fresh = await clearInvalidMaterialBesoinSiteRequestLink(need);
  if (fresh.site_request_id) {
    if (fresh.statut !== 'transmis') {
      await getSupabase().from(TABLE).update({ statut: 'transmis' }).eq('id', fresh.id);
      return getProjectMaterialBesoin(fresh.id);
    }
    return fresh;
  }
  await createSiteRequestFromMaterialBesoin(fresh, projet);
  return getProjectMaterialBesoin(fresh.id);
}

export async function submitProjectMaterialBesoin(id) {
  await requireUser();
  const item = await getProjectMaterialBesoin(id);
  if (!item) throw new Error('Fiche introuvable.');
  if (!['brouillon', 'soumis', 'transmis'].includes(item.statut)) {
    throw new Error('Cette fiche ne peut plus être soumise.');
  }
  if (item.statut === 'brouillon') {
    const { error } = await getSupabase().from(TABLE).update({ statut: 'soumis' }).eq('id', id);
    if (error) throw error;
  }
  return getProjectMaterialBesoin(id);
}

/**
 * Nettoie les liens BM↔DC erronés. Ne crée plus de DC (BM s’affiche tel quel dans Demandes chantier).
 */
export async function repairOrphanMaterialBesoinsToDepot({ projectId = null } = {}) {
  await requireUser();
  let q = getSupabase()
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: true });
  if (projectId) q = q.eq('project_id', projectId);
  const { data, error } = await q;
  if (error) throw error;

  const skippedUnlinked = [];
  for (const row of data || []) {
    if (!row.site_request_id) continue;
    const lines = await loadLines(row.id);
    const need = enrichMaterialBesoinRow(row, lines);
    const beforeId = need.site_request_id;
    const cleared = await clearInvalidMaterialBesoinSiteRequestLink(need);
    if (!cleared.site_request_id && beforeId) {
      skippedUnlinked.push({ needId: need.id, ref: need.ref_besoin, detachedRequestId: beforeId });
    }
  }
  return {
    repaired: [],
    failures: [],
    skippedUnlinked,
    scanned: skippedUnlinked.length,
  };
}

export async function deleteProjectMaterialBesoin(id) {
  await requireUser();
  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) throw error;
}

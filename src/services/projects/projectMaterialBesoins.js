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

export async function createProjectMaterialBesoin(projectId, form, projet, { submit = false } = {}) {
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
    statut: submit ? 'soumis' : 'brouillon',
    created_by: user.id,
  };

  const { data, error } = await getSupabase().from(TABLE).insert([payload]).select().single();
  if (error) throw error;
  await replaceLines(data.id, form.lines);
  let need = await getProjectMaterialBesoin(data.id);
  if (submit) {
    need = await transmitMaterialBesoinToDepot(need, projet);
  }
  return need;
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
    statut: submit ? 'soumis' : existing.statut,
  };
  if (form.demandeur_name?.trim()) patch.demandeur_name = form.demandeur_name.trim();

  const { error } = await getSupabase().from(TABLE).update(patch).eq('id', id);
  if (error) throw error;
  await replaceLines(id, form.lines);
  let need = await getProjectMaterialBesoin(id);
  if (submit && !need.site_request_id) {
    need = await transmitMaterialBesoinToDepot(need);
  }
  return need;
}

/** Mappe une fiche BM → lignes demande chantier (articles hors catalogue). */
function mapBesoinLinesToSiteRequestLines(need) {
  return (need.lines || [])
    .filter((l) => String(l.designation || '').trim())
    .map((l, idx) => ({
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
 * Crée + soumet une demande chantier (DC) depuis un besoin matériaux (BM).
 * Idempotent si site_request_id déjà renseigné.
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

  const linkPatch = {
    site_request_id: submitted.id,
    site_request_ref: submitted.ref_demande || submitted.ref || created.ref_demande || '',
    statut: 'transmis',
    updated_at: new Date().toISOString(),
  };
  const { error: linkErr } = await getSupabase().from(TABLE).update(linkPatch).eq('id', need.id);
  // Colonne absente tant que le SQL n'est pas joué : on garde au moins la DC créée.
  if (linkErr && !/site_request_id|column/i.test(linkErr.message || '')) {
    throw linkErr;
  }

  return {
    id: submitted.id,
    ref: submitted.ref_demande || submitted.ref || '',
    ref_demande: submitted.ref_demande || submitted.ref || '',
  };
}

async function transmitMaterialBesoinToDepot(need, projet = null) {
  if (!need) throw new Error('Fiche introuvable.');
  if (need.site_request_id) {
    if (need.statut !== 'transmis') {
      await getSupabase().from(TABLE).update({ statut: 'transmis' }).eq('id', need.id);
      return getProjectMaterialBesoin(need.id);
    }
    return need;
  }
  await createSiteRequestFromMaterialBesoin(need, projet);
  return getProjectMaterialBesoin(need.id);
}

export async function submitProjectMaterialBesoin(id, projet = null) {
  await requireUser();
  const item = await getProjectMaterialBesoin(id);
  if (!item) throw new Error('Fiche introuvable.');
  if (!['brouillon', 'soumis'].includes(item.statut) && !item.site_request_id) {
    throw new Error('Cette fiche ne peut plus être soumise au dépôt.');
  }
  if (item.statut === 'brouillon') {
    const { error } = await getSupabase().from(TABLE).update({ statut: 'soumis' }).eq('id', id);
    if (error) throw error;
  }
  const fresh = await getProjectMaterialBesoin(id);
  return transmitMaterialBesoinToDepot(fresh, projet);
}

/**
 * Répare les BM soumis sans demande chantier liée.
 */
export async function repairOrphanMaterialBesoinsToDepot({ projectId = null } = {}) {
  await requireUser();
  let q = getSupabase()
    .from(TABLE)
    .select('*')
    .in('statut', ['soumis', 'transmis'])
    .order('created_at', { ascending: true });
  // site_request_id peut être absent avant migration — filtre côté JS
  if (projectId) q = q.eq('project_id', projectId);
  const { data, error } = await q;
  if (error) throw error;

  const orphans = (data || []).filter((row) => !row.site_request_id);
  const repaired = [];
  const failures = [];
  for (const row of orphans) {
    try {
      const lines = await loadLines(row.id);
      const need = enrichMaterialBesoinRow(row, lines);
      let projet = { id: row.project_id };
      const { data: proj } = await getSupabase()
        .from('projects')
        .select('id, nom, ref, responsable, chef_chantier, client_nom')
        .eq('id', row.project_id)
        .maybeSingle();
      if (proj) {
        projet = {
          ...proj,
          chef_projet: proj.responsable || '',
          client: proj.client_nom || '',
        };
      }
      const req = await createSiteRequestFromMaterialBesoin(need, projet);
      repaired.push({
        needId: row.id,
        ref: row.ref_besoin,
        requestId: req.id,
        requestRef: req.ref || req.ref_demande,
      });
    } catch (err) {
      failures.push({ needId: row.id, ref: row.ref_besoin, error: err.message || String(err) });
    }
  }
  return { repaired, failures, scanned: orphans.length };
}

export async function deleteProjectMaterialBesoin(id) {
  await requireUser();
  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) throw error;
}

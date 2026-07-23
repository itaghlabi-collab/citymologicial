/**
 * purchaseRequests.js — Demandes d'achat (Supabase purchase_requests)
 */
import { getSupabase } from '../../lib/supabase';
import { employeeFullName } from '../rh/employees';
import { PURCHASE_ASSIGNEE, normalizePurchaseStatus } from '../../constants/purchaseWorkflow';
import { listProjectsForSelect } from '../projects/projects';
import { isGroupedPurchaseRequest, groupedProjectLabel } from './purchaseGrouped';
import { getSiteRequestMissingLines } from '../inventaire/siteMaterialRequests';

const TABLE = 'purchase_requests';
const ACHATS_DEPARTMENT_ID = 3;

export const PURCHASE_REQUEST_SELECT = '*, projects ( id, nom, ref, client_nom )';

/** Libellé achats : nom du projet uniquement (colonne « Nom projet »). */
export function purchaseProjectNameLabel(project) {
  if (!project) return '';
  const nom = String(project.nom || project.project_name || '').trim();
  if (nom) return nom;
  return String(project.ref || '').trim();
}

export function projectOptionLabel(p) {
  return purchaseProjectNameLabel(p);
}

const PRJ_REF_RE = /^PRJ-[A-Z0-9-]+$/i;

/** Anciens libellés → nom projet seul (sans client ni ref PRJ). */
export function compactProjectLinkLabel(label) {
  if (!label) return '—';
  const raw = String(label).trim();
  if (!raw) return '—';

  const parts = raw.split(' — ').map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return '—';

  const deduped = parts.filter((p, i) => i === 0 || p.toLowerCase() !== parts[i - 1].toLowerCase());
  const withoutRefs = deduped.filter((p) => !PRJ_REF_RE.test(p));
  const meaningful = withoutRefs.length ? withoutRefs : deduped;

  return meaningful[0] || '—';
}

function labelFromProjectJoin(projectRow) {
  if (!projectRow) return '';
  return purchaseProjectNameLabel({ nom: projectRow.nom, ref: projectRow.ref });
}

function resolveProjectLabel(row) {
  const fromJoin = labelFromProjectJoin(row?.projects);
  if (fromJoin) return fromJoin;

  const ref = String(row.project_ref || '').trim();
  const name = String(row.project_name || '').trim();
  if (!name && !ref) return '';

  if (name && !PRJ_REF_RE.test(name) && !name.includes('PRJ-')) {
    return compactProjectLinkLabel(name);
  }

  return compactProjectLinkLabel(name || ref);
}

export function purchaseLineProjectLabel(line) {
  if (!line) return '—';
  const raw = line.projet_lie || line.project_name || '';
  if (!raw) return '—';
  return compactProjectLinkLabel(raw);
}

export { isGroupedPurchaseRequest } from './purchaseGrouped';

export function isOffProjectPurchaseRequest(formOrRequest) {
  if (!formOrRequest) return false;
  if (isGroupedPurchaseRequest(formOrRequest)) return false;
  return formOrRequest.link_type === 'hors_projet'
    || formOrRequest.payload?.off_project === true;
}

export function purchaseRequestProjectLabel(request) {
  if (!request) return '—';
  if (isGroupedPurchaseRequest(request)) return groupedProjectLabel(request);
  if (isOffProjectPurchaseRequest(request)) return 'Hors projet';
  return request.projet_lie || compactProjectLinkLabel(request.project_name || request.project_ref || '—');
}

export function normalizePurchaseRequest(row) {
  if (!row) return null;
  const projectLabel = resolveProjectLabel(row);

  return {
    id: row.id,
    ref: row.ref_demande || '',
    titre: row.titre || '',
    priorite: row.priorite || 'Normale',
    statut: normalizePurchaseStatus(row.statut || 'Brouillon'),
    date_debut: row.date_debut || '',
    date_limite: row.date_limite || '',
    description: row.description || '',
    department: row.department || 'ACHATS',
    departement: row.department || 'ACHATS',
    project_id: row.project_id || null,
    project_ref: row.project_ref || '',
    project_name: row.project_name || '',
    projet_lie: projectLabel,
    assigned_employee_id: row.assigned_employee_id || null,
    assigned_employee_name: row.assigned_employee_name || row.requester_name || PURCHASE_ASSIGNEE.label,
    assignes: row.assigned_employee_name || row.requester_name || PURCHASE_ASSIGNEE.label,
    requester_user_id: row.requester_user_id || row.created_by || null,
    requester_name: row.requester_name || '',
    demandeur: row.requester_name || '',
    selected_quote_id: row.selected_quote_id || null,
    acquisition_order_id: row.acquisition_order_id || null,
    payment_order_id: row.payment_order_id || null,
    commentaires_internes: row.commentaires_internes || '',
    created_by: row.created_by || null,
    date_creation: row.created_at ? String(row.created_at).slice(0, 10) : '',
    created_at: row.created_at,
    updated_at: row.updated_at,
    payload: row.payload || {},
    off_project: row.payload?.off_project === true,
    is_grouped: row.payload?.is_grouped === true,
  };
}

export function toPurchaseRequestRow(form) {
  const grouped = isGroupedPurchaseRequest(form);
  const offProject = !grouped && isOffProjectPurchaseRequest(form);
  const projetLie = grouped ? '' : (offProject ? '' : (form.projet_lie || form.project_name || '').trim());
  const payload = {
    ...(form.payload || {}),
    off_project: grouped ? false : offProject,
    is_grouped: grouped ? true : (form.payload?.is_grouped || false),
  };
  const row = {
    titre: (form.titre || '').trim(),
    priorite: form.priorite || 'Normale',
    statut: form.statut || 'Brouillon',
    date_debut: form.date_debut || null,
    date_limite: form.date_limite || null,
    description: form.description?.trim() || null,
    department: 'ACHATS',
    project_id: grouped || offProject ? null : (form.project_id || null),
    project_ref: grouped || offProject ? null : (form.project_ref || null),
    project_name: grouped || offProject ? null : (projetLie || null),
    assigned_employee_id: form.assigned_employee_id || null,
    assigned_employee_name: form.assigned_employee_name || form.requester_name || PURCHASE_ASSIGNEE.label,
    commentaires_internes: form.commentaires_internes?.trim() || null,
    payload,
  };
  const ref = (form.ref || form.ref_demande || '').trim();
  if (ref) row.ref_demande = ref;
  return row;
}

export function getPurchaseRequestLineSummary(request) {
  const line = request?.payload?.lines?.[0];
  return {
    fournisseur: request?.payload?.fournisseur_souhaite || line?.fournisseur || '',
    quantite: line?.quantite ?? line?.quantite_demandee ?? '',
    unite: line?.unite || line?.unit || 'u',
  };
}

async function requireUser() {
  const { data: { user }, error } = await getSupabase().auth.getUser();
  if (error || !user) throw new Error('Session requise.');
  return user.id;
}

export async function generatePurchaseRequestRef() {
  const year = new Date().getFullYear();
  const prefix = `DA-${year}-`;
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('ref_demande')
    .like('ref_demande', `${prefix}%`);
  if (error) throw error;
  let maxSeq = 0;
  for (const row of data || []) {
    const match = String(row.ref_demande || '').match(/-(\d{3,})$/);
    if (match) maxSeq = Math.max(maxSeq, parseInt(match[1], 10));
  }
  return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
}

export async function assignPurchaseRequestRefIfMissing(id, existingRef = '') {
  const current = String(existingRef || '').trim();
  if (current) return current;
  const newRef = await generatePurchaseRequestRef();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update({ ref_demande: newRef })
    .eq('id', id)
    .select('ref_demande')
    .single();
  if (error) throw error;
  return data.ref_demande;
}

/** Attribue une référence DA aux demandes existantes sans ref_demande. */
export async function reconcileMissingPurchaseRequestRefs() {
  await requireUser();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('id, ref_demande, created_at')
    .or('ref_demande.is.null,ref_demande.eq.')
    .order('created_at', { ascending: true });
  if (error || !data?.length) return 0;
  let fixed = 0;
  for (const row of data) {
    await assignPurchaseRequestRefIfMissing(row.id, row.ref_demande);
    fixed += 1;
  }
  return fixed;
}

export async function listPurchaseRequests() {
  await requireUser();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select(PURCHASE_REQUEST_SELECT)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(normalizePurchaseRequest);
}

export async function createPurchaseRequest(form) {
  const { data: { user }, error: authErr } = await getSupabase().auth.getUser();
  if (authErr || !user) throw new Error('Session requise.');
  const uid = user.id;
  const { resolveCreatorAssignee } = await import('./purchaseWorkflow');
  const assignee = await resolveCreatorAssignee();
  const row = {
    ...toPurchaseRequestRow(form),
    ...assignee,
    requester_user_id: uid,
    requester_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Système',
  };
  if (!row.ref_demande) row.ref_demande = await generatePurchaseRequestRef();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([{ ...row, created_by: uid }])
    .select()
    .single();
  if (error) throw error;
  return normalizePurchaseRequest(data);
}

export async function findPurchaseRequestBySiteMaterialRequest(siteRequestId) {
  if (!siteRequestId) return null;
  await requireUser();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select(PURCHASE_REQUEST_SELECT)
    .eq('payload->>site_material_request_id', String(siteRequestId))
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn('[CITYMO] findPurchaseRequestBySiteMaterialRequest', error);
    return null;
  }
  return data ? normalizePurchaseRequest(data) : null;
}

/**
 * Crée une demande d'achat liée à une demande chantier (reste / rupture).
 * Idempotent : une seule DA par demande chantier.
 * @param {{ refresh?: boolean }} options — si true, met à jour le récap manquants sur une DA encore modifiable
 */
export async function createPurchaseRequestFromSiteRuptures(siteRequest, { refresh = false } = {}) {
  if (!siteRequest?.id) return null;

  // Uniquement demandé − préparé > 0 (pas le flag rupture seul)
  const deficitLines = getSiteRequestMissingLines(siteRequest);

  if (!deficitLines.length) {
    const existingEmpty = await findPurchaseRequestBySiteMaterialRequest(siteRequest.id);
    return existingEmpty;
  }

  const itemsDesc = deficitLines.map((l) => (
    `• ${l.article_name}: ${l.quantite_manquante} ${l.unite || 'u'}${l.rupture ? ' (rupture stock)' : ''}`
  )).join('\n');

  const description = [
    'Demande d\'achat — reste de commande (articles non préparés / non disponibles).',
    '',
    `Demande chantier : ${siteRequest.ref}`,
    `Projet : ${siteRequest.project_name || '—'}`,
    '',
    'Articles manquants :',
    itemsDesc,
  ].join('\n');

  const payloadLines = deficitLines.map((l) => ({
    article_name: l.article_name,
    designation: l.article_name,
    article_id: l.article_id || null,
    quantite: l.quantite_manquante,
    quantite_manquante: l.quantite_manquante,
    unite: l.unite || 'u',
    rupture: !!l.rupture,
  }));

  const existing = await findPurchaseRequestBySiteMaterialRequest(siteRequest.id);
  if (existing) {
    const editable = ['Brouillon', 'En étude', 'Soumise', 'brouillon', 'en_etude'].includes(existing.statut)
      || normalizePurchaseStatus(existing.statut) === 'En étude';
    if (refresh && editable) {
      return updatePurchaseRequest(existing.id, {
        titre: existing.titre || `Reste commande — ${siteRequest.ref}`,
        priorite: siteRequest.priorite === 'Critique' ? 'Urgente' : (siteRequest.priorite || existing.priorite || 'Normale'),
        description,
        project_id: siteRequest.project_id || existing.project_id,
        project_ref: siteRequest.project_ref || existing.project_ref,
        project_name: siteRequest.project_name || existing.project_name,
        date_limite: siteRequest.date_souhaitee || existing.date_limite,
        payload: {
          ...(existing.payload || {}),
          site_material_request_id: siteRequest.id,
          site_material_request_ref: siteRequest.ref,
          source: 'site_material_rupture',
          lines: payloadLines,
        },
      });
    }
    return existing;
  }

  return createPurchaseRequest({
    titre: `Reste commande — ${siteRequest.ref}`,
    priorite: siteRequest.priorite === 'Critique' ? 'Urgente' : (siteRequest.priorite || 'Normale'),
    statut: 'En étude',
    project_id: siteRequest.project_id || null,
    project_ref: siteRequest.project_ref || null,
    project_name: siteRequest.project_name || null,
    date_limite: siteRequest.date_souhaitee || null,
    description,
    payload: {
      site_material_request_id: siteRequest.id,
      site_material_request_ref: siteRequest.ref,
      source: 'site_material_rupture',
      lines: payloadLines,
    },
  });
}

export async function updatePurchaseRequestTitle(id, titre) {
  await requireUser();
  const trimmed = (titre || '').trim();
  if (!trimmed) {
    const err = new Error('Le titre est obligatoire.');
    err.code = 'VALIDATION';
    throw err;
  }

  const { data: existing, error: fetchErr } = await getSupabase()
    .from(TABLE)
    .select('payload')
    .eq('id', id)
    .maybeSingle();
  if (fetchErr) throw fetchErr;

  const payload = { ...(existing?.payload || {}) };
  const lines = [...(payload.lines || [])];
  if (lines.length === 1) {
    lines[0] = { ...lines[0], designation: trimmed };
    payload.lines = lines;
  } else if (!lines.length) {
    payload.lines = [{ designation: trimmed, quantite: null, unite: 'u' }];
  }

  const { data, error } = await getSupabase()
    .from(TABLE)
    .update({ titre: trimmed, payload })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return normalizePurchaseRequest(data);
}

export async function updatePurchaseRequest(id, form) {
  await requireUser();
  const row = toPurchaseRequestRow(form);
  delete row.statut;
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update(row)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return normalizePurchaseRequest(data);
}

export async function deletePurchaseRequest(id) {
  await requireUser();
  const sb = getSupabase();
  const { data: req, error: fetchError } = await sb
    .from(TABLE)
    .select('id, acquisition_order_id, payment_order_id')
    .eq('id', id)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!req) {
    const err = new Error('Demande d\'achat introuvable.');
    err.code = 'VALIDATION';
    throw err;
  }

  await sb.from(TABLE).update({
    acquisition_order_id: null,
    payment_order_id: null,
    selected_quote_id: null,
  }).eq('id', id);

  if (req.payment_order_id) {
    await sb.from('payment_orders').delete().eq('id', req.payment_order_id);
  }
  if (req.acquisition_order_id) {
    await sb.from('purchase_acquisition_orders').delete().eq('id', req.acquisition_order_id);
  }

  const { data: orphanOps } = await sb.from('payment_orders').select('id').eq('purchase_request_id', id);
  if (orphanOps?.length) {
    await sb.from('payment_orders').delete().in('id', orphanOps.map((o) => o.id));
  }
  const { data: orphanOas } = await sb.from('purchase_acquisition_orders').select('id').eq('purchase_request_id', id);
  if (orphanOas?.length) {
    await sb.from('purchase_acquisition_orders').delete().in('id', orphanOas.map((o) => o.id));
  }

  const { error } = await sb.from(TABLE).delete().eq('id', id);
  if (error) throw error;
}

export async function listAchatsEmployees() {
  await requireUser();
  const { data, error } = await getSupabase()
    .from('employees')
    .select('id, firstname, lastname, poste, department, department_id, statut')
    .or(`department_id.eq.${ACHATS_DEPARTMENT_ID},department.ilike.%ACHAT%`)
    .order('lastname', { ascending: true });
  if (error) throw error;
  return (data || []).filter((e) => {
    if (e.statut === 'Inactif') return false;
    const dept = (e.department || '').toUpperCase();
    return e.department_id === ACHATS_DEPARTMENT_ID || dept.includes('ACHAT');
  });
}

export function employeeOptionLabel(emp) {
  const name = employeeFullName(emp);
  return `${name}${emp.poste ? ` — ${emp.poste}` : ''}`;
}

export async function loadPurchaseRequestFormOptions() {
  const [projects, employees] = await Promise.all([
    listProjectsForSelect(),
    listAchatsEmployees().catch(() => []),
  ]);
  if (!projects.length) {
    console.warn('[CITYMO] Aucun projet pour le select Achats — exécutez RUN_PROJECTS_SELECT_ACHATS_FINANCE.sql');
  }
  return { projects, employees };
}

export function serializePurchaseAttachments(attachments = []) {
  return (attachments || []).map((a) => ({
    name: a.name,
    size: a.size ?? null,
    type: a.type || null,
    storage_path: a.storage_path,
    added_at: a.added_at || null,
    added_by_name: a.added_by_name || null,
    added_by: a.added_by || null,
  }));
}

/** Met à jour uniquement les pièces jointes (demande en brouillon). */
export async function updatePurchaseRequestAttachments(id, attachments) {
  const { data: { user }, error: authErr } = await getSupabase().auth.getUser();
  if (authErr || !user) throw new Error('Session requise.');

  const { data: existing, error: fetchErr } = await getSupabase()
    .from(TABLE)
    .select('statut, payload')
    .eq('id', id)
    .single();
  if (fetchErr) throw fetchErr;
  if (normalizePurchaseStatus(existing.statut) !== 'Brouillon') {
    const err = new Error('Les pièces jointes ne peuvent être modifiées qu\'en brouillon.');
    err.code = 'VALIDATION';
    throw err;
  }

  const payload = {
    ...(existing.payload || {}),
    attachments: serializePurchaseAttachments(attachments),
  };

  const { data, error } = await getSupabase()
    .from(TABLE)
    .update({ payload })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return normalizePurchaseRequest(data);
}

/**
 * siteMaterialRequests.js — Demandes chantier (workflow Chef chantier ↔ Magasinier ↔ DG)
 */
import { getSupabase } from '../../lib/supabase';
import {
  SITE_REQUEST_DG_THRESHOLD_MAD,
  normalizeSearchText,
  siteRequestStatutLabel,
} from '../../constants/siteMaterialRequests';
import { saveStockMovementBon } from './stockMovements';
import { listStockArticles } from './stockArticles';
import { formatProfileDisplayName, collapseDuplicatedFirstName } from '../admin/users';

const TABLE = 'site_material_requests';
const LINES = 'site_material_request_lines';
const HISTORY = 'site_material_request_history';

export { siteRequestStatutLabel };

export function matchStockArticle(name, stockArticles = []) {
  const q = normalizeSearchText(name);
  if (!q) return null;
  const exact = stockArticles.find((a) => {
    const n = normalizeSearchText(a.nom || a.designation);
    return n === q;
  });
  if (exact) return exact;
  return stockArticles.find((a) => {
    const n = normalizeSearchText(a.nom || a.designation);
    return n.includes(q) || q.includes(n);
  }) || null;
}

export function computeLineStockInfo(line, stockArticle, reserved = 0) {
  const stock = Number(stockArticle?.stock_actuel ?? line.stock_actuel ?? 0);
  const reserve = Number(reserved ?? line.stock_reserve ?? 0);
  const qty = Number(line.quantite_demandee) || 0;
  const disponibleApres = Math.max(0, stock - reserve);
  const seuil = Number(stockArticle?.seuil_alerte ?? stockArticle?.stock_minimum ?? 0);
  let status = 'ok';
  if (stock <= 0) status = 'rupture';
  else if (stock <= seuil || disponibleApres < qty) status = 'low';
  return {
    stock_actuel: stock,
    stock_reserve: reserve,
    disponible_apres: disponibleApres,
    disponible: stock > 0 && disponibleApres >= qty,
    rupture: stock <= 0,
    stock_status: status,
    article_id: stockArticle?.id || line.article_id || null,
  };
}

export function enrichLinesWithStock(lines, stockArticles = []) {
  return (lines || []).map((line) => {
    if (!(Number(line.quantite_demandee) > 0)) return line;
    const stockArt = line.article_id
      ? stockArticles.find((a) => String(a.id) === String(line.article_id))
      : matchStockArticle(line.article_name, stockArticles);
    const info = computeLineStockInfo(line, stockArt);
    return {
      ...line,
      article_id: info.article_id,
      stock_actuel: info.stock_actuel,
      stock_reserve: info.stock_reserve,
      disponible: info.disponible,
      rupture: info.rupture,
      stock_status: info.stock_status,
      disponible_apres: info.disponible_apres,
      prix_unitaire: Number(stockArt?.prix_unitaire ?? stockArt?.prix_achat ?? 0),
    };
  });
}

/** Clé de dédoublonnage article (catégorie + désignation). */
export function siteRequestLineKey(line) {
  const cat = String(line?.category_id || '').trim().toLowerCase();
  const name = String(line?.article_name || '').trim().toLowerCase();
  return `${cat}|${name}`;
}

/**
 * Fusionne les lignes en double (même article) — évite Colle x2 / Clips x2 à l'affichage et à l'enregistrement.
 * Quantité demandée = max ; préparé / livré = somme plafonnée à la demande.
 */
export function mergeDuplicateSiteRequestLines(lines = []) {
  const map = new Map();
  (lines || []).forEach((line, idx) => {
    const key = siteRequestLineKey(line);
    if (!key || key === '|') return;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...line, line_order: line.line_order ?? idx });
      return;
    }
    const demandee = Math.max(Number(existing.quantite_demandee) || 0, Number(line.quantite_demandee) || 0);
    const preparee = Math.min(
      demandee,
      (Number(existing.quantite_preparee) || 0) + (Number(line.quantite_preparee) || 0),
    );
    const livree = Math.min(
      demandee,
      (Number(existing.quantite_livree) || 0) + (Number(line.quantite_livree) || 0),
    );
    map.set(key, {
      ...existing,
      ...line,
      id: existing.id || line.id,
      quantite_demandee: demandee,
      quantite_preparee: preparee,
      quantite_livree: livree,
      article_id: existing.article_id || line.article_id || null,
      remarque: existing.remarque || line.remarque || null,
      remarque_magasinier: existing.remarque_magasinier || line.remarque_magasinier || null,
      is_custom: !!(existing.is_custom || line.is_custom),
      line_order: Math.min(existing.line_order ?? idx, line.line_order ?? idx),
    });
  });
  return [...map.values()];
}

function normalizeRequest(row, lines = [], history = []) {
  if (!row) return null;
  const mergedLines = mergeDuplicateSiteRequestLines(lines);
  const activeLines = mergedLines.filter((l) => Number(l.quantite_demandee) > 0 || l.is_custom);
  const totalArticles = activeLines.reduce((s, l) => s + (Number(l.quantite_demandee) || 0), 0);
  const distinctArticles = activeLines.length;
  const fixName = (n) => collapseDuplicatedFirstName(n) || '';
  return {
    id: row.id,
    ref: row.ref_demande || '',
    project_id: row.project_id,
    project_ref: row.project_ref || '',
    project_name: row.project_name || '',
    client_name: row.client_name || '',
    chef_projet: row.chef_projet || '',
    chef_chantier: row.chef_chantier || '',
    date_demande: row.date_demande || '',
    date_souhaitee: row.date_souhaitee || '',
    priorite: row.priorite || 'Normale',
    observation: row.observation || '',
    statut: row.statut || 'brouillon',
    statutLabel: siteRequestStatutLabel(row.statut),
    origine: row.origine === 'manuelle'
      || (row.origine == null && activeLines.length > 0 && activeLines.every((l) => l.is_custom))
      ? 'manuelle'
      : 'catalogue',
    requires_dg: !!row.requires_dg,
    movement_ref: row.movement_ref || '',
    montant_estime: Number(row.montant_estime) || 0,
    requested_by: row.requested_by,
    requested_by_name: fixName(row.requested_by_name),
    prepared_by: row.prepared_by,
    prepared_by_name: fixName(row.prepared_by_name),
    validated_dg_by: row.validated_dg_by,
    validated_dg_name: fixName(row.validated_dg_name),
    delivered_at: row.delivered_at,
    lines: mergedLines,
    history: (history || []).map((h) => ({
      ...h,
      actor_name: fixName(h.actor_name),
    })),
    total_articles: totalArticles,
    distinct_articles: distinctArticles,
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
    .select('nom, prenom, email, role')
    .eq('id', userId)
    .maybeSingle();
  if (!data) return '';
  return formatProfileDisplayName(data) || data.email || '';
}

async function getProfileRole(userId) {
  if (!userId) return '';
  const { data } = await getSupabase().from('profiles').select('role').eq('id', userId).maybeSingle();
  return data?.role || '';
}

export async function generateSiteRequestRef() {
  const year = new Date().getFullYear();
  const prefix = `DC-${year}-`;
  const { count, error } = await getSupabase()
    .from(TABLE)
    .select('*', { count: 'exact', head: true })
    .like('ref_demande', `${prefix}%`);
  if (error) throw error;
  return `${prefix}${String((count || 0) + 1).padStart(6, '0')}`;
}

async function logHistory(requestId, action, details, actorId, actorName, actorRole, ipAddress) {
  const { error } = await getSupabase().from(HISTORY).insert([{
    request_id: requestId,
    action,
    details: details || null,
    actor_id: actorId || null,
    actor_name: actorName || null,
    actor_role: actorRole || null,
    ip_address: ipAddress || null,
  }]);
  if (error) console.warn('[CITYMO] site_material_request_history', error);
}

async function loadLines(requestId) {
  const { data, error } = await getSupabase()
    .from(LINES)
    .select('*')
    .eq('request_id', requestId)
    .order('line_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function loadHistory(requestId) {
  const { data, error } = await getSupabase()
    .from(HISTORY)
    .select('*')
    .eq('request_id', requestId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

function estimateMontant(lines, stockArticles) {
  const enriched = enrichLinesWithStock(lines, stockArticles);
  return enriched.reduce((s, l) => {
    if (!(Number(l.quantite_demandee) > 0)) return s;
    const pu = Number(l.prix_unitaire) || 0;
    return s + pu * Number(l.quantite_demandee);
  }, 0);
}

function needsDgValidation(priorite, montant) {
  return priorite === 'Critique' || montant >= SITE_REQUEST_DG_THRESHOLD_MAD;
}

function toLineRows(requestId, lines, stockArticles) {
  const enriched = enrichLinesWithStock(mergeDuplicateSiteRequestLines(lines), stockArticles);
  return enriched
    .filter((l) => Number(l.quantite_demandee) > 0 || l.is_custom)
    .map((l, idx) => ({
      request_id: requestId,
      category_id: l.category_id,
      article_name: l.article_name,
      article_id: l.article_id || null,
      quantite_demandee: Number(l.quantite_demandee) || 0,
      quantite_preparee: Number(l.quantite_preparee) || 0,
      quantite_livree: Number(l.quantite_livree) || 0,
      unite: l.unite || 'u',
      remarque: l.remarque || null,
      remarque_magasinier: l.remarque_magasinier || null,
      date_souhaitee: l.date_souhaitee || null,
      stock_actuel: Number(l.stock_actuel) || 0,
      stock_reserve: Number(l.stock_reserve) || 0,
      disponible: !!l.disponible,
      rupture: !!l.rupture,
      replaced_by: l.replaced_by || null,
      is_custom: !!l.is_custom,
      line_order: l.line_order ?? idx,
    }));
}

async function replaceLines(requestId, lines, stockArticles) {
  await getSupabase().from(LINES).delete().eq('request_id', requestId);
  const rows = toLineRows(requestId, lines, stockArticles);
  if (!rows.length) return [];
  let { data, error } = await getSupabase().from(LINES).insert(rows).select('*');
  if (error && /date_souhaitee/i.test(String(error.message || ''))) {
    const stripped = rows.map(({ date_souhaitee, ...rest }) => rest);
    ({ data, error } = await getSupabase().from(LINES).insert(stripped).select('*'));
  }
  if (error) throw error;
  return data || [];
}

export async function listSiteMaterialRequests(filters = {}) {
  await requireUser();
  let q = getSupabase().from(TABLE).select('*').order('created_at', { ascending: false });
  if (filters.statut) q = q.eq('statut', filters.statut);
  if (filters.projectId) q = q.eq('project_id', filters.projectId);
  if (filters.priorite) q = q.eq('priorite', filters.priorite);
  if (filters.chefChantier) q = q.ilike('chef_chantier', `%${filters.chefChantier}%`);
  if (filters.chefProjet) q = q.ilike('chef_projet', `%${filters.chefProjet}%`);
  const { data, error } = await q;
  if (error) throw error;
  const stockArticles = await listStockArticles().catch(() => []);
  const results = [];
  for (const row of data || []) {
    const lines = await loadLines(row.id);
    results.push(normalizeRequest(row, enrichLinesWithStock(lines, stockArticles)));
  }
  return results;
}

export async function getSiteMaterialRequest(id) {
  await requireUser();
  const { data, error } = await getSupabase().from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const stockArticles = await listStockArticles().catch(() => []);
  const lines = enrichLinesWithStock(await loadLines(id), stockArticles);
  const history = await loadHistory(id);
  return normalizeRequest(data, lines, history);
}

export async function createSiteMaterialRequest(form, lines = [], { ipAddress } = {}) {
  const user = await requireUser();
  const actorName = await getProfileName(user.id);
  const actorRole = await getProfileRole(user.id);
  const stockArticles = await listStockArticles().catch(() => []);
  const ref = form.ref || await generateSiteRequestRef();
  const montant = estimateMontant(lines, stockArticles);
  const row = {
    ref_demande: ref,
    project_id: form.project_id || null,
    project_ref: form.project_ref || null,
    project_name: form.project_name || null,
    client_name: form.client_name || null,
    chef_projet: form.chef_projet || null,
    chef_chantier: form.chef_chantier || null,
    date_demande: form.date_demande || new Date().toISOString().slice(0, 10),
    date_souhaitee: form.date_souhaitee || null,
    priorite: form.priorite || 'Normale',
    observation: form.observation || null,
    origine: form.origine === 'manuelle' ? 'manuelle' : 'catalogue',
    statut: form.statut || 'brouillon',
    requires_dg: needsDgValidation(form.priorite, montant),
    montant_estime: montant,
    requested_by: user.id,
    requested_by_name: actorName,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await getSupabase().from(TABLE).insert([row]).select().single();
  if (error) {
    if (/origine/i.test(String(error.message || ''))) {
      const { origine, ...rest } = row;
      const retry = await getSupabase().from(TABLE).insert([rest]).select().single();
      if (retry.error) throw retry.error;
      const savedLines = await replaceLines(retry.data.id, lines, stockArticles);
      await logHistory(retry.data.id, 'creation', 'Demande créée', user.id, actorName, actorRole, ipAddress);
      return normalizeRequest(
        { ...retry.data, origine: form.origine === 'manuelle' ? 'manuelle' : 'catalogue' },
        enrichLinesWithStock(savedLines, stockArticles),
        await loadHistory(retry.data.id),
      );
    }
    throw error;
  }
  const savedLines = await replaceLines(data.id, lines, stockArticles);
  await logHistory(data.id, 'creation', 'Demande créée', user.id, actorName, actorRole, ipAddress);
  return normalizeRequest(data, enrichLinesWithStock(savedLines, stockArticles), await loadHistory(data.id));
}

export async function updateSiteMaterialRequest(id, form, lines = [], { ipAddress } = {}) {
  const user = await requireUser();
  const actorName = await getProfileName(user.id);
  const actorRole = await getProfileRole(user.id);
  const existing = await getSiteMaterialRequest(id);
  if (!existing) throw new Error('Demande introuvable.');
  if (['livree', 'annulee'].includes(existing.statut)) {
    throw new Error('Demande clôturée — modification impossible.');
  }
  const stockArticles = await listStockArticles().catch(() => []);
  const montant = estimateMontant(lines, stockArticles);
  const patch = {
    project_id: form.project_id ?? existing.project_id,
    project_ref: form.project_ref ?? existing.project_ref,
    project_name: form.project_name ?? existing.project_name,
    client_name: form.client_name ?? existing.client_name,
    chef_projet: form.chef_projet ?? existing.chef_projet,
    chef_chantier: form.chef_chantier ?? existing.chef_chantier,
    date_demande: form.date_demande ?? existing.date_demande,
    date_souhaitee: form.date_souhaitee ?? existing.date_souhaitee,
    priorite: form.priorite ?? existing.priorite,
    observation: form.observation ?? existing.observation,
    origine: form.origine === 'manuelle' || existing.origine === 'manuelle' ? 'manuelle' : 'catalogue',
    requires_dg: needsDgValidation(form.priorite ?? existing.priorite, montant),
    montant_estime: montant,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await getSupabase().from(TABLE).update(patch).eq('id', id).select().single();
  if (error) {
    if (/origine/i.test(String(error.message || ''))) {
      const { origine, ...rest } = patch;
      const retry = await getSupabase().from(TABLE).update(rest).eq('id', id).select().single();
      if (retry.error) throw retry.error;
      const savedLines = await replaceLines(id, lines, stockArticles);
      await logHistory(id, 'modification', 'Demande modifiée', user.id, actorName, actorRole, ipAddress);
      return normalizeRequest(
        { ...retry.data, origine: form.origine === 'manuelle' || existing.origine === 'manuelle' ? 'manuelle' : 'catalogue' },
        enrichLinesWithStock(savedLines, stockArticles),
        await loadHistory(id),
      );
    }
    throw error;
  }
  const savedLines = await replaceLines(id, lines, stockArticles);
  await logHistory(id, 'modification', 'Demande modifiée', user.id, actorName, actorRole, ipAddress);
  return normalizeRequest(data, enrichLinesWithStock(savedLines, stockArticles), await loadHistory(id));
}

export async function submitSiteMaterialRequest(id, { ipAddress } = {}) {
  const user = await requireUser();
  const req = await getSiteMaterialRequest(id);
  if (!req) throw new Error('Demande introuvable.');
  const activeLines = (req.lines || []).filter((l) => Number(l.quantite_demandee) > 0);
  if (!activeLines.length) throw new Error('Ajoutez au moins un article avec une quantité.');
  const actorName = await getProfileName(user.id);
  const actorRole = await getProfileRole(user.id);
  const { data, error } = await getSupabase().from(TABLE).update({
    statut: 'soumise',
    updated_at: new Date().toISOString(),
  }).eq('id', id).select().single();
  if (error) throw error;
  await logHistory(id, 'soumission', 'Demande soumise au magasin', user.id, actorName, actorRole, ipAddress);
  const result = normalizeRequest(data, req.lines, await loadHistory(id));
  const { notifySiteRequestSubmitted, notifySiteRequestReceived } = await import('../notifications/notificationEvents');
  notifySiteRequestSubmitted(result).catch(() => {});
  notifySiteRequestReceived(result).catch(() => {});
  return result;
}

export async function prepareSiteMaterialRequest(id, lineUpdates = [], {
  partial = false, ipAddress,
} = {}) {
  const user = await requireUser();
  const req = await getSiteMaterialRequest(id);
  if (!req) throw new Error('Demande introuvable.');
  const actorName = await getProfileName(user.id);
  const actorRole = await getProfileRole(user.id);
  const stockArticles = await listStockArticles().catch(() => []);

  const lines = (req.lines || []).map((line) => {
    const upd = lineUpdates.find((u) => u.id === line.id || (
      u.article_name === line.article_name && u.category_id === line.category_id
    ));
    if (!upd) return line;
    return {
      ...line,
      quantite_preparee: upd.quantite_preparee ?? line.quantite_preparee,
      remarque_magasinier: upd.remarque_magasinier ?? line.remarque_magasinier,
      replaced_by: upd.replaced_by ?? line.replaced_by,
      rupture: upd.rupture ?? line.rupture,
      disponible: upd.disponible ?? line.disponible,
      article_id: upd.article_id !== undefined ? upd.article_id : line.article_id,
      article_name: upd.article_name ?? line.article_name,
    };
  });

  await replaceLines(id, lines, stockArticles);
  const nextStatut = partial ? 'preparation_partielle' : 'en_preparation';
  const { data, error } = await getSupabase().from(TABLE).update({
    statut: nextStatut,
    prepared_by: user.id,
    prepared_by_name: actorName,
    updated_at: new Date().toISOString(),
  }).eq('id', id).select().single();
  if (error) throw error;
  await logHistory(id, 'preparation', partial ? 'Préparation partielle' : 'Préparation en cours', user.id, actorName, actorRole, ipAddress);
  const result = normalizeRequest(data, enrichLinesWithStock(await loadLines(id), stockArticles), await loadHistory(id));
  const {
    notifySiteRequestPrepared,
    notifySiteRequestPurchaseCreated,
  } = await import('../notifications/notificationEvents');
  notifySiteRequestPrepared(result, { partial }).catch(() => {});
  const { createPurchaseRequestFromSiteRuptures } = await import('../achats/purchaseRequests');
  createPurchaseRequestFromSiteRuptures(result)
    .then((purchase) => {
      if (purchase) notifySiteRequestPurchaseCreated(result, purchase).catch(() => {});
    })
    .catch(() => {});
  return result;
}

export async function requestDgValidation(id, { ipAddress } = {}) {
  const user = await requireUser();
  const actorName = await getProfileName(user.id);
  const actorRole = await getProfileRole(user.id);
  const { data, error } = await getSupabase().from(TABLE).update({
    statut: 'en_attente_dg',
    requires_dg: true,
    updated_at: new Date().toISOString(),
  }).eq('id', id).select().single();
  if (error) throw error;
  await logHistory(id, 'validation_dg_requise', 'Validation DG requise', user.id, actorName, actorRole, ipAddress);
  const result = normalizeRequest(data, enrichLinesWithStock(await loadLines(id)), await loadHistory(id));
  const { notifySiteRequestDgRequired } = await import('../notifications/notificationEvents');
  notifySiteRequestDgRequired(result).catch(() => {});
  return result;
}

export async function validateSiteRequestDg(id, { ipAddress } = {}) {
  const user = await requireUser();
  const actorName = await getProfileName(user.id);
  const actorRole = await getProfileRole(user.id);
  const { data, error } = await getSupabase().from(TABLE).update({
    statut: 'validee_dg',
    validated_dg_by: user.id,
    validated_dg_name: actorName,
    updated_at: new Date().toISOString(),
  }).eq('id', id).select().single();
  if (error) throw error;
  await logHistory(id, 'validation_dg', 'Validée par la Direction', user.id, actorName, actorRole, ipAddress);
  return normalizeRequest(data, enrichLinesWithStock(await loadLines(id)), await loadHistory(id));
}

export async function markSiteRequestReady(id, { ipAddress } = {}) {
  const user = await requireUser();
  const req = await getSiteMaterialRequest(id);
  if (!req) throw new Error('Demande introuvable.');
  const actorName = await getProfileName(user.id);
  const actorRole = await getProfileRole(user.id);
  const { data, error } = await getSupabase().from(TABLE).update({
    statut: 'prete',
    prepared_by: user.id,
    prepared_by_name: actorName,
    updated_at: new Date().toISOString(),
  }).eq('id', id).select().single();
  if (error) throw error;
  await logHistory(id, 'prete', 'Matériel prêt pour livraison', user.id, actorName, actorRole, ipAddress);
  const result = normalizeRequest(data, req.lines, await loadHistory(id));
  const { notifySiteRequestReady } = await import('../notifications/notificationEvents');
  notifySiteRequestReady(result).catch(() => {});
  return result;
}

export async function deliverSiteMaterialRequest(id, {
  emplacementSource = 'Dépôt principal CITYMO',
  emplacementDestination = '',
  ipAddress,
} = {}) {
  const user = await requireUser();
  const req = await getSiteMaterialRequest(id);
  if (!req) throw new Error('Demande introuvable.');
  const actorName = await getProfileName(user.id);
  const actorRole = await getProfileRole(user.id);

  const lignesBon = (req.lines || [])
    .filter((l) => Number(l.quantite_preparee || l.quantite_demandee) > 0 && l.article_id)
    .map((l) => ({
      article_id: l.article_id,
      quantite: Number(l.quantite_preparee) || Number(l.quantite_demandee),
      notes: l.remarque_magasinier || l.remarque || '',
    }));

  let movementRef = req.movement_ref || '';
  if (lignesBon.length) {
    const dest = emplacementDestination || req.project_name || 'Chantier';
    const bon = await saveStockMovementBon({
      type_mouvement: 'Sortie',
      emplacement_source: emplacementSource,
      emplacement_destination: dest,
      date_creation: new Date().toISOString().slice(0, 10),
      cree_par: actorName,
      motif: `Demande chantier ${req.ref}`,
      note: req.observation || '',
      statut: 'Validé',
      lignes: lignesBon,
    });
    movementRef = bon.ref;
  }

  const updatedLines = (req.lines || []).map((l) => ({
    ...l,
    quantite_livree: Number(l.quantite_preparee) || Number(l.quantite_demandee) || 0,
  }));
  const stockArticles = await listStockArticles().catch(() => []);
  await replaceLines(id, updatedLines, stockArticles);

  const { data, error } = await getSupabase().from(TABLE).update({
    statut: 'livree',
    movement_ref: movementRef || null,
    delivered_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', id).select().single();
  if (error) throw error;
  await logHistory(id, 'livraison', movementRef ? `Livrée — bon ${movementRef}` : 'Livrée', user.id, actorName, actorRole, ipAddress);
  const result = normalizeRequest(data, enrichLinesWithStock(await loadLines(id), stockArticles), await loadHistory(id));
  const { notifySiteRequestDelivered } = await import('../notifications/notificationEvents');
  notifySiteRequestDelivered(result).catch(() => {});
  return result;
}

export async function cancelSiteMaterialRequest(id, reason = '', { ipAddress } = {}) {
  const user = await requireUser();
  const actorName = await getProfileName(user.id);
  const actorRole = await getProfileRole(user.id);
  const { data, error } = await getSupabase().from(TABLE).update({
    statut: 'annulee',
    observation: reason ? `${reason}` : undefined,
    updated_at: new Date().toISOString(),
  }).eq('id', id).select().single();
  if (error) throw error;
  await logHistory(id, 'annulation', reason || 'Demande annulée', user.id, actorName, actorRole, ipAddress);
  return normalizeRequest(data, enrichLinesWithStock(await loadLines(id)), await loadHistory(id));
}

export async function deleteSiteMaterialRequest(id) {
  await requireUser();
  const req = await getSiteMaterialRequest(id);
  if (!req) return;
  if (req.statut === 'livree') {
    throw new Error('Une demande déjà livrée ne peut pas être supprimée.');
  }
  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) throw error;
}

/**
 * stockDiversExpense.js — Consommables → DIVERS → Dépenses générales.
 *
 * Ne touche PAS aux dépenses par projet (chantiers liés).
 * Idempotence : ref_paiement = citymo:sm:general:{movement_line_id}
 */
import { getSupabase } from '../../lib/supabase';
import { generateChargeRef, assignChargeRefIfMissing } from '../finance/charges';
import { normalizeArticleType, ARTICLE_TYPE_CONSOMMABLE } from './articleMovementRules';
import {
  DIVERS_EMPLACEMENT_CODE,
  isDiversEmplacement,
  ensureDiversWarehouse,
} from './stockWarehouses';

export const STOCK_DIVERS_CHARGE_CATEGORY = 'Consommables / Matériaux consommables';
export const STOCK_DIVERS_CHARGE_STATUT = 'Comptabilisée automatiquement';
export const EXPENSE_SCOPE_GENERAL = 'general';
export const SOURCE_MODULE_INVENTORY = 'inventory';
export const SOURCE_TYPE_STOCK_MOVEMENT = 'stock_movement';

const REF_PREFIX = 'citymo:sm:general:';
const RETURN_REF_PREFIX = 'citymo:sm:general-return:';

function normKey(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function diversChargeRefKey(movementLineId) {
  if (!movementLineId) return '';
  return `${REF_PREFIX}${movementLineId}`;
}

export function diversReturnChargeRefKey(movementLineId) {
  if (!movementLineId) return '';
  return `${RETURN_REF_PREFIX}${movementLineId}`;
}

export function isStockDiversCharge(charge) {
  const ref = String(charge?.ref_paiement || '');
  return ref.startsWith(REF_PREFIX) || ref.startsWith(RETURN_REF_PREFIX);
}

export function parseDiversMovementIdFromCharge(charge) {
  const ref = String(charge?.ref_paiement || '');
  if (ref.startsWith(REF_PREFIX)) return ref.slice(REF_PREFIX.length);
  if (ref.startsWith(RETURN_REF_PREFIX)) return ref.slice(RETURN_REF_PREFIX.length);
  return '';
}

function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Valorisation (fallback aligné métier) :
 * 1. coût moyen source (si stock_levels.cout_moyen / unit_cost)
 * 2. coût lot (si disponible)
 * 3. dernier prix d’achat validé
 * 4. prix_unitaire article
 * Jamais le prix de vente.
 */
export async function resolveConsumableUnitCost(articleId, sourceEmplacement = '') {
  if (!articleId) return { unitCost: 0, method: 'none' };
  const sb = getSupabase();

  // 1. Coût moyen / unit_cost sur le niveau source
  if (sourceEmplacement) {
    try {
      const { data: levels } = await sb
        .from('stock_levels')
        .select('quantite, cout_moyen, unit_cost, prix_unitaire, payload')
        .eq('article_id', articleId)
        .ilike('emplacement', sourceEmplacement.trim());
      const level = (levels || [])[0];
      if (level) {
        const avg = Number(level.cout_moyen ?? level.unit_cost ?? level.prix_unitaire) || 0;
        if (avg > 0) return { unitCost: avg, method: 'cout_moyen_source' };
        const pCost = Number(level.payload?.cout_moyen ?? level.payload?.unit_cost) || 0;
        if (pCost > 0) return { unitCost: pCost, method: 'cout_moyen_payload' };
      }
    } catch { /* colonnes optionnelles */ }
  }

  // 2. Lot — non disponible dans le schéma actuel → skip

  // 3. Dernier prix d’achat (lignes demandes / OA si présentes)
  try {
    const { data: purchaseLines } = await sb
      .from('purchase_request_lines')
      .select('prix_unitaire_ht, prix_unitaire, created_at')
      .eq('article_id', articleId)
      .order('created_at', { ascending: false })
      .limit(5);
    for (const line of purchaseLines || []) {
      const pu = Number(line.prix_unitaire_ht ?? line.prix_unitaire) || 0;
      if (pu > 0) return { unitCost: pu, method: 'dernier_prix_achat' };
    }
  } catch { /* table optionnelle */ }

  // 4. Fallback article
  const { data: art, error } = await sb
    .from('stock_articles')
    .select('id, prix_unitaire, article_type, nom, reference, unite, category_id, stock_categories(nom)')
    .eq('id', articleId)
    .maybeSingle();
  if (error) throw error;
  const pu = Number(art?.prix_unitaire) || 0;
  return {
    unitCost: pu,
    method: 'prix_unitaire_article',
    article: art,
  };
}

async function ensureConsumablesCategoryId() {
  const sb = getSupabase();
  const target = normKey(STOCK_DIVERS_CHARGE_CATEGORY);
  const { data, error } = await sb.from('finance_categories').select('id, nom');
  if (error) {
    console.warn('[CITYMO] finance_categories', error);
    return null;
  }
  const found = (data || []).find((r) => normKey(r.nom) === target);
  if (found?.id) return found.id;

  const uid = (await sb.auth.getUser()).data?.user?.id;
  const { data: created, error: createErr } = await sb
    .from('finance_categories')
    .insert([{
      nom: STOCK_DIVERS_CHARGE_CATEGORY,
      description: 'Affectation stock consommables hors projet (DIVERS)',
      statut: 'Active',
      created_by: uid || null,
    }])
    .select('id')
    .single();
  if (createErr) {
    console.warn('[CITYMO] ensure consommables category', createErr);
    return null;
  }
  return created?.id || null;
}

async function findChargeByRefPaiement(refKey) {
  if (!refKey) return null;
  const { data, error } = await getSupabase()
    .from('finance_charges')
    .select('*')
    .eq('ref_paiement', refKey)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

function buildMetaCommentaire({
  refMouvement, articleCode, articleNom, qty, unit, unitCost, source, destination,
  expenseScope, sourceModule, sourceType, sourceId, destinationCode, method,
}) {
  const meta = {
    citymo_stock_divers: true,
    source_module: sourceModule || SOURCE_MODULE_INVENTORY,
    source_type: sourceType || SOURCE_TYPE_STOCK_MOVEMENT,
    source_id: sourceId,
    expense_scope: expenseScope || EXPENSE_SCOPE_GENERAL,
    destination_code: destinationCode || DIVERS_EMPLACEMENT_CODE,
    ref_mouvement: refMouvement,
    article_code: articleCode,
    article_nom: articleNom,
    quantite: qty,
    unite: unit,
    cout_unitaire: unitCost,
    emplacement_source: source,
    emplacement_destination: destination,
    valorisation: method,
    auto_generated: true,
  };
  return `STOCK_DIVERS_META:${JSON.stringify(meta)}`;
}

export function parseDiversMetaFromCharge(charge) {
  const c = String(charge?.commentaire || '');
  const idx = c.indexOf('STOCK_DIVERS_META:');
  if (idx < 0) return null;
  try {
    return JSON.parse(c.slice(idx + 'STOCK_DIVERS_META:'.length));
  } catch {
    return null;
  }
}

/**
 * Déclenche une dépense générale si :
 * - article Consommable
 * - type Transfert ou Sortie
 * - destination = DIVERS
 * - mouvement validé / non annulé
 */
export function shouldCreateDiversGeneralExpense({ typeMouvement, articleType, destination, statut, annule }) {
  if (annule) return false;
  const st = String(statut || '').trim();
  if (st && !['Validé', 'Terminé', 'Comptabilisée automatiquement'].includes(st) && /annul/i.test(st)) {
    return false;
  }
  if (/annul/i.test(st)) return false;
  const type = String(typeMouvement || '').trim();
  if (type !== 'Transfert' && type !== 'Sortie') return false;
  if (normalizeArticleType(articleType) !== ARTICLE_TYPE_CONSOMMABLE) return false;
  if (!isDiversEmplacement(destination)) return false;
  return true;
}

/**
 * Retour DIVERS → dépôt : contre-dépense si les unités avaient été comptabilisées.
 */
export function shouldCreateDiversReturnExpense({ typeMouvement, articleType, source, destination, statut, annule }) {
  if (annule) return false;
  if (/annul/i.test(String(statut || ''))) return false;
  const type = String(typeMouvement || '').trim();
  // Transfert retour ou Entrée depuis DIVERS
  const fromDivers = isDiversEmplacement(source);
  const toNonDivers = destination && !isDiversEmplacement(destination);
  if (!fromDivers || !toNonDivers) return false;
  if (type !== 'Transfert' && type !== 'Entrée' && type !== 'Retour') return false;
  if (normalizeArticleType(articleType) !== ARTICLE_TYPE_CONSOMMABLE) return false;
  return true;
}

async function loadArticle(articleId) {
  const { data, error } = await getSupabase()
    .from('stock_articles')
    .select('id, reference, nom, article_type, unite, prix_unitaire, category_id, stock_categories(nom)')
    .eq('id', articleId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function markMovementFinanceLink(movementId, chargeId, kind = 'general') {
  if (!movementId || !chargeId) return;
  const { data: row } = await getSupabase()
    .from('stock_movements')
    .select('id, payload')
    .eq('id', movementId)
    .maybeSingle();
  if (!row) return;
  const payload = {
    ...(row.payload || {}),
    finance_charge_id: chargeId,
    finance_expense_scope: kind,
    financially_allocated_quantity: Number((row.payload || {}).financially_allocated_quantity) || undefined,
  };
  await getSupabase().from('stock_movements').update({ payload }).eq('id', movementId);
}

/**
 * Crée / réutilise la dépense générale pour une ligne de mouvement vers DIVERS.
 */
export async function syncDiversGeneralExpenseForMovementLine({
  movementId,
  refMouvement,
  typeMouvement,
  articleId,
  quantite,
  emplacementSource,
  emplacementDestination,
  dateMouvement,
  creePar,
  statut,
  annule,
  articleTypeHint,
} = {}) {
  const qty = Number(quantite) || 0;
  if (!movementId || qty <= 0) return { action: 'none', id: null };

  const art = await loadArticle(articleId);
  const articleType = articleTypeHint || art?.article_type;

  if (!shouldCreateDiversGeneralExpense({
    typeMouvement,
    articleType,
    destination: emplacementDestination,
    statut,
    annule,
  })) {
    return { action: 'skipped', id: null, reason: 'not_eligible' };
  }

  const refKey = diversChargeRefKey(movementId);
  const existing = await findChargeByRefPaiement(refKey);
  if (existing?.id && !/annul/i.test(String(existing.statut || ''))) {
    return { action: 'existing', id: existing.id, ref: existing.ref_charge };
  }

  const { unitCost, method } = await resolveConsumableUnitCost(articleId, emplacementSource);
  const montant = roundMoney(qty * unitCost);
  if (montant <= 0) {
    console.warn('[CITYMO] DIVERS expense skipped — coût unitaire nul', { articleId, movementId });
    return { action: 'skipped', id: null, reason: 'zero_cost' };
  }

  const categoryId = await ensureConsumablesCategoryId();
  const subCat = art?.stock_categories?.nom || '';
  const articleCode = art?.reference || '';
  const articleNom = art?.nom || '';
  const unit = art?.unite || 'U';

  const chargeRow = {
    date_charge: dateMouvement || new Date().toISOString().slice(0, 10),
    libelle: `Affectation stock DIVERS — ${articleNom || articleCode || 'Article'}`,
    categorie: STOCK_DIVERS_CHARGE_CATEGORY,
    category_id: categoryId,
    montant,
    fournisseur: articleCode || null,
    projet_lie: null,
    project_id: null,
    departement: subCat || DIVERS_EMPLACEMENT_CODE,
    mode_paiement: 'Stock',
    ref_paiement: refKey,
    statut: STOCK_DIVERS_CHARGE_STATUT,
    commentaire: buildMetaCommentaire({
      refMouvement,
      articleCode,
      articleNom,
      qty,
      unit,
      unitCost,
      source: emplacementSource,
      destination: DIVERS_EMPLACEMENT_CODE,
      sourceId: movementId,
      method,
    }),
    validateur: creePar || null,
  };

  const sb = getSupabase();
  const uid = (await sb.auth.getUser()).data?.user?.id;

  if (existing?.id) {
    // Réactivation éventuelle après annulation
    const refCharge = await assignChargeRefIfMissing(existing.id, existing.ref_charge);
    const { data, error } = await sb
      .from('finance_charges')
      .update({ ...chargeRow, ref_charge: refCharge })
      .eq('id', existing.id)
      .select('id, ref_charge')
      .single();
    if (error) throw error;
    await markMovementFinanceLink(movementId, data.id);
    return { action: 'updated', id: data.id, ref: data.ref_charge, montant, unitCost };
  }

  const { data, error } = await sb
    .from('finance_charges')
    .insert([{
      ...chargeRow,
      ref_charge: await generateChargeRef(),
      created_by: uid || null,
    }])
    .select('id, ref_charge')
    .single();
  if (error) throw error;

  await markMovementFinanceLink(movementId, data.id);
  // Pas de sync caisse / project_expenses : imputation stock hors projet
  return { action: 'created', id: data.id, ref: data.ref_charge, montant, unitCost };
}

/**
 * Contre-dépense générale (retour depuis DIVERS).
 */
export async function syncDiversReturnExpenseForMovementLine({
  movementId,
  refMouvement,
  typeMouvement,
  articleId,
  quantite,
  emplacementSource,
  emplacementDestination,
  dateMouvement,
  creePar,
  statut,
  annule,
  articleTypeHint,
} = {}) {
  const qty = Number(quantite) || 0;
  if (!movementId || qty <= 0) return { action: 'none', id: null };

  const art = await loadArticle(articleId);
  const articleType = articleTypeHint || art?.article_type;

  if (!shouldCreateDiversReturnExpense({
    typeMouvement,
    articleType,
    source: emplacementSource,
    destination: emplacementDestination,
    statut,
    annule,
  })) {
    return { action: 'skipped', id: null, reason: 'not_eligible' };
  }

  const refKey = diversReturnChargeRefKey(movementId);
  const existing = await findChargeByRefPaiement(refKey);
  if (existing?.id && !/annul/i.test(String(existing.statut || ''))) {
    return { action: 'existing', id: existing.id, ref: existing.ref_charge };
  }

  // Coût unitaire = même méthode / dernier coût d’affectation si trouvé
  let unitCost = 0;
  let method = 'prix_unitaire_article';
  let originRef = '';
  try {
    const { data: prior } = await getSupabase()
      .from('finance_charges')
      .select('id, ref_charge, montant, commentaire, ref_paiement')
      .like('ref_paiement', `${REF_PREFIX}%`)
      .ilike('commentaire', `%${art?.reference || articleId}%`)
      .order('created_at', { ascending: false })
      .limit(20);
    for (const ch of prior || []) {
      const meta = parseDiversMetaFromCharge(ch);
      if (meta && (meta.article_code === art?.reference || meta.source_id)) {
        unitCost = Number(meta.cout_unitaire) || 0;
        originRef = ch.ref_charge || '';
        method = 'affectation_initiale';
        if (unitCost > 0) break;
      }
    }
  } catch { /* ignore */ }

  if (unitCost <= 0) {
    const resolved = await resolveConsumableUnitCost(articleId, emplacementSource);
    unitCost = resolved.unitCost;
    method = resolved.method;
  }

  const montant = -roundMoney(qty * unitCost);
  if (montant === 0) return { action: 'skipped', id: null, reason: 'zero_cost' };

  const categoryId = await ensureConsumablesCategoryId();
  const articleCode = art?.reference || '';
  const articleNom = art?.nom || '';
  const unit = art?.unite || 'U';

  const chargeRow = {
    date_charge: dateMouvement || new Date().toISOString().slice(0, 10),
    libelle: `Retour de consommable depuis DIVERS — ${articleNom || articleCode}`,
    categorie: STOCK_DIVERS_CHARGE_CATEGORY,
    category_id: categoryId,
    montant,
    fournisseur: articleCode || null,
    projet_lie: null,
    project_id: null,
    departement: DIVERS_EMPLACEMENT_CODE,
    mode_paiement: 'Stock',
    ref_paiement: refKey,
    statut: STOCK_DIVERS_CHARGE_STATUT,
    commentaire: [
      originRef ? `Contre-écriture de ${originRef}` : 'Contre-écriture DIVERS',
      `Motif: Retour de consommable depuis DIVERS`,
      buildMetaCommentaire({
        refMouvement,
        articleCode,
        articleNom,
        qty,
        unit,
        unitCost,
        source: emplacementSource,
        destination: emplacementDestination,
        sourceId: movementId,
        method,
      }),
    ].join(' | '),
    validateur: creePar || null,
  };

  const sb = getSupabase();
  const uid = (await sb.auth.getUser()).data?.user?.id;

  if (existing?.id) {
    const refCharge = await assignChargeRefIfMissing(existing.id, existing.ref_charge);
    const { data, error } = await sb
      .from('finance_charges')
      .update({ ...chargeRow, ref_charge: refCharge })
      .eq('id', existing.id)
      .select('id, ref_charge')
      .single();
    if (error) throw error;
    return { action: 'updated', id: data.id, ref: data.ref_charge, montant };
  }

  const { data, error } = await sb
    .from('finance_charges')
    .insert([{
      ...chargeRow,
      ref_charge: await generateChargeRef(),
      created_by: uid || null,
    }])
    .select('id, ref_charge')
    .single();
  if (error) throw error;
  return { action: 'created', id: data.id, ref: data.ref_charge, montant };
}

/** Annule la dépense générale liée à une ligne de mouvement (conserve l’historique). */
export async function cancelDiversExpenseForMovementLine(movementId) {
  if (!movementId) return { action: 'none' };
  const results = [];
  for (const key of [diversChargeRefKey(movementId), diversReturnChargeRefKey(movementId)]) {
    const existing = await findChargeByRefPaiement(key);
    if (!existing?.id) continue;
    if (/annul/i.test(String(existing.statut || ''))) {
      results.push({ action: 'already_cancelled', id: existing.id });
      continue;
    }
    const { error } = await getSupabase()
      .from('finance_charges')
      .update({ statut: 'Annulé' })
      .eq('id', existing.id);
    if (error) throw error;
    results.push({ action: 'cancelled', id: existing.id, ref: existing.ref_charge });
  }
  return { action: results.length ? 'cancelled' : 'none', results };
}

/**
 * Point d’entrée après validation d’un bon (toutes les lignes).
 */
export async function syncDiversExpensesForBon(bon) {
  if (!bon?.lignes?.length) return [];
  await ensureDiversWarehouse().catch(() => null);

  const dest = bon.emplacement_destination || '';
  const src = bon.emplacement_source || '';
  const type = bon.type_mouvement;
  const statut = bon.statut || 'Validé';
  const results = [];

  for (const ligne of bon.lignes) {
    const movementId = ligne.id;
    if (!movementId || !ligne.article_id) continue;

    try {
      const toDivers = await syncDiversGeneralExpenseForMovementLine({
        movementId,
        refMouvement: bon.ref,
        typeMouvement: type,
        articleId: ligne.article_id,
        quantite: ligne.quantite,
        emplacementSource: src,
        emplacementDestination: dest,
        dateMouvement: bon.date_creation,
        creePar: bon.cree_par,
        statut,
      });
      if (toDivers.action !== 'skipped' && toDivers.action !== 'none') {
        results.push({ movementId, kind: 'to_divers', ...toDivers });
        continue;
      }

      const fromDivers = await syncDiversReturnExpenseForMovementLine({
        movementId,
        refMouvement: bon.ref,
        typeMouvement: type,
        articleId: ligne.article_id,
        quantite: ligne.quantite,
        emplacementSource: src,
        emplacementDestination: dest,
        dateMouvement: bon.date_creation,
        creePar: bon.cree_par,
        statut,
      });
      if (fromDivers.action !== 'skipped' && fromDivers.action !== 'none') {
        results.push({ movementId, kind: 'from_divers', ...fromDivers });
      }
    } catch (err) {
      console.warn('[CITYMO] sync DIVERS expense', err);
      results.push({ movementId, action: 'error', error: err?.message });
    }
  }
  return results;
}

/** Annulation de toutes les dépenses liées aux lignes d’un bon. */
export async function cancelDiversExpensesForBon(bonOrRows) {
  const ids = [];
  if (Array.isArray(bonOrRows)) {
    bonOrRows.forEach((r) => { if (r?.id) ids.push(r.id); });
  } else if (bonOrRows?.lignes) {
    bonOrRows.lignes.forEach((l) => { if (l?.id) ids.push(l.id); });
  }
  const out = [];
  for (const id of ids) {
    out.push(await cancelDiversExpenseForMovementLine(id));
  }
  return out;
}

/**
 * DRY RUN lecture seule — anciens mouvements vers DIVERS / AUTRE / HORS PROJET.
 * Ne crée aucune dépense.
 */
export async function dryRunHistoricalDiversMovements() {
  const { data, error } = await getSupabase()
    .from('stock_movements')
    .select('id, ref_mouvement, type_mouvement, quantite, date_mouvement, payload, stock_articles(reference, nom, article_type, prix_unitaire, unite)')
    .in('type_mouvement', ['Sortie', 'Transfert', 'sortie', 'Entree', 'Entrée'])
    .order('date_mouvement', { ascending: false });
  if (error) throw error;

  const rows = [];
  for (const row of data || []) {
    const p = row.payload || {};
    const dest = p.emplacement_destination || '';
    const src = p.emplacement_source || '';
    if (!isDiversEmplacement(dest) && !(isDiversEmplacement(src) && dest)) continue;

    const art = row.stock_articles || {};
    if (normalizeArticleType(art.article_type) !== ARTICLE_TYPE_CONSOMMABLE) continue;

    const qty = Number(row.quantite) || 0;
    const unitCost = Number(art.prix_unitaire) || 0;
    const refKey = diversChargeRefKey(row.id);
    const existing = await findChargeByRefPaiement(refKey).catch(() => null);

    rows.push({
      reference: row.ref_mouvement,
      movement_id: row.id,
      article: [art.reference, art.nom].filter(Boolean).join(' — '),
      article_type: art.article_type,
      quantite: qty,
      cout_valorise: unitCost,
      montant: roundMoney(qty * unitCost),
      destination_actuelle: dest || '—',
      source: src || '—',
      date: row.date_mouvement,
      type: row.type_mouvement,
      depense_generale_existante: existing ? (existing.ref_charge || existing.id) : null,
      risque_doublon: Boolean(existing && !/annul/i.test(String(existing.statut || ''))),
    });
  }

  return {
    generated_at: new Date().toISOString(),
    note: 'DRY RUN — aucune dépense créée, aucun mouvement modifié.',
    total: rows.length,
    rows,
  };
}

export async function findDiversChargeForMovement(movementId) {
  if (!movementId) return null;
  const direct = await findChargeByRefPaiement(diversChargeRefKey(movementId));
  if (direct) return direct;
  return findChargeByRefPaiement(diversReturnChargeRefKey(movementId));
}

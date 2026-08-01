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

export const FINANCIAL_SYNC = {
  PENDING: 'pending',
  SYNCED: 'synced',
  FAILED: 'failed',
  NOT_APPLICABLE: 'not_applicable',
};

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

function normalizeMvtType(type) {
  const k = String(type || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (k === 'sortie') return 'Sortie';
  if (k === 'transfert') return 'Transfert';
  if (k === 'entree') return 'Entrée';
  if (k === 'retour') return 'Retour';
  if (k === 'rebut') return 'Rebut';
  return String(type || '').trim();
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
export async function resolveConsumableUnitCost(articleId, sourceEmplacement = '', unitCostOverride = null) {
  if (!articleId) return { unitCost: 0, method: 'none' };
  const override = Number(unitCostOverride);
  if (Number.isFinite(override) && override > 0) {
    return { unitCost: override, method: 'override' };
  }
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

  // 4. Fallback article (prix_unitaire — jamais prix de vente)
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

/**
 * Résout DIVERS par id / code / libellé (rapport de mapping).
 */
export async function resolveDiversLocation(formValue) {
  await ensureDiversWarehouse().catch(() => null);
  const { data: warehouses } = await getSupabase()
    .from('stock_warehouses')
    .select('id, nom, type_depot, statut, projet_lie')
    .order('nom');
  const diversRows = (warehouses || []).filter((w) => isDiversEmplacement(w.nom)
    && String(w.statut || 'Actif').toLowerCase() !== 'inactif');
  const divers = diversRows[0] || null;
  const sent = String(formValue || '').trim();
  const matched = isDiversEmplacement(sent)
    || (divers && String(divers.nom).trim().toLowerCase() === sent.toLowerCase())
    || (divers && String(divers.id) === sent);

  return {
    form_value_sent: sent,
    backend_received: sent,
    matched,
    divers_id: divers?.id || null,
    divers_code: divers ? DIVERS_EMPLACEMENT_CODE : null,
    divers_label: divers?.nom || null,
    divers_type: divers?.type_depot || null,
    divers_actif: divers ? String(divers.statut || 'Actif') : null,
    divers_projet_lie: divers?.projet_lie || null,
    canonical_destination: matched ? (divers?.nom || DIVERS_EMPLACEMENT_CODE) : sent,
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
  if (/annul/i.test(st)) return false;
  const type = normalizeMvtType(typeMouvement);
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
  const type = normalizeMvtType(typeMouvement);
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

async function markMovementFinanceLink(movementId, patch = {}) {
  if (!movementId) return;
  const { data: row } = await getSupabase()
    .from('stock_movements')
    .select('id, payload')
    .eq('id', movementId)
    .maybeSingle();
  if (!row) return;
  const payload = {
    ...(row.payload || {}),
    ...patch,
  };
  // Nettoyer undefined
  Object.keys(payload).forEach((k) => {
    if (payload[k] === undefined) delete payload[k];
  });
  await getSupabase().from('stock_movements').update({ payload }).eq('id', movementId);
}

async function setFinancialSyncStatus(movementId, status, {
  expenseId = null,
  error = null,
  scope = EXPENSE_SCOPE_GENERAL,
  qty = undefined,
} = {}) {
  await markMovementFinanceLink(movementId, {
    financial_sync_status: status,
    financial_expense_id: expenseId,
    financial_sync_error: error,
    finance_expense_scope: scope,
    finance_charge_id: expenseId || undefined,
    ...(qty != null ? { financially_allocated_quantity: qty } : {}),
  });
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
  unitCostOverride = null,
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
    await setFinancialSyncStatus(movementId, FINANCIAL_SYNC.NOT_APPLICABLE);
    return { action: 'skipped', id: null, reason: 'not_eligible' };
  }

  await setFinancialSyncStatus(movementId, FINANCIAL_SYNC.PENDING);

  const mapping = await resolveDiversLocation(emplacementDestination);
  const destCanonical = mapping.canonical_destination;

  const refKey = diversChargeRefKey(movementId);
  let existing = null;
  try {
    existing = await findChargeByRefPaiement(refKey);
  } catch (err) {
    // maybeSingle échoue s'il y a des doublons — on continue pour créer / récupérer
    console.warn('[CITYMO] findChargeByRefPaiement', err);
  }
  if (existing?.id && !/annul/i.test(String(existing.statut || ''))) {
    await setFinancialSyncStatus(movementId, FINANCIAL_SYNC.SYNCED, {
      expenseId: existing.id,
      qty: Number(quantite) || 0,
    });
    return { action: 'existing', id: existing.id, ref: existing.ref_charge, mapping };
  }

  const { unitCost, method } = await resolveConsumableUnitCost(
    articleId,
    emplacementSource,
    unitCostOverride,
  );
  const montant = roundMoney(qty * unitCost);
  if (montant <= 0) {
    const errMsg = `Coût unitaire nul ou invalide (méthode ${method}). Renseignez le prix unitaire de l’article (ex. 20 MAD) puis réessayez. Impossible de créer la dépense ${qty} × ${unitCost}.`;
    await setFinancialSyncStatus(movementId, FINANCIAL_SYNC.FAILED, { error: errMsg });
    return { action: 'failed', id: null, reason: 'zero_cost', error: errMsg, mapping };
  }

  try {
    const categoryId = await ensureConsumablesCategoryId();
    const subCat = art?.stock_categories?.nom || '';
    const articleCode = art?.reference || '';
    const articleNom = art?.nom || '';
    const unit = art?.unite || 'U';

    const chargeForm = {
      date: dateMouvement || new Date().toISOString().slice(0, 10),
      libelle: `Affectation stock DIVERS — ${articleNom || articleCode || 'Article'}`,
      categorie: STOCK_DIVERS_CHARGE_CATEGORY,
      category_id: categoryId,
      montant,
      fournisseur: articleCode || null,
      projet_lie: null,
      project_id: null,
      departement: subCat || DIVERS_EMPLACEMENT_CODE,
      mode_paiement: 'Autre',
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
        destination: destCanonical || DIVERS_EMPLACEMENT_CODE,
        sourceId: movementId,
        method,
      }),
      validateur: creePar || null,
    };

    const sb = getSupabase();
    const uid = (await sb.auth.getUser()).data?.user?.id;

    if (existing?.id) {
      const refCharge = await assignChargeRefIfMissing(existing.id, existing.ref_charge);
      const { data, error } = await sb
        .from('finance_charges')
        .update({
          date_charge: chargeForm.date,
          libelle: chargeForm.libelle,
          categorie: chargeForm.categorie,
          category_id: chargeForm.category_id,
          montant: chargeForm.montant,
          fournisseur: chargeForm.fournisseur,
          projet_lie: null,
          project_id: null,
          departement: chargeForm.departement,
          mode_paiement: chargeForm.mode_paiement,
          ref_paiement: chargeForm.ref_paiement,
          statut: chargeForm.statut,
          commentaire: chargeForm.commentaire,
          validateur: chargeForm.validateur,
          ref_charge: refCharge,
        })
        .eq('id', existing.id)
        .select('id, ref_charge')
        .single();
      if (error) throw error;
      await setFinancialSyncStatus(movementId, FINANCIAL_SYNC.SYNCED, {
        expenseId: data.id,
        qty,
      });
      return { action: 'updated', id: data.id, ref: data.ref_charge, montant, unitCost, mapping };
    }

    // Insert direct (même table que Dépenses générales) — hors projet, idempotent via ref_paiement
    const { data, error } = await sb
      .from('finance_charges')
      .insert([{
        date_charge: chargeForm.date,
        libelle: chargeForm.libelle,
        categorie: chargeForm.categorie,
        category_id: chargeForm.category_id,
        montant: chargeForm.montant,
        fournisseur: chargeForm.fournisseur,
        projet_lie: null,
        project_id: null,
        departement: chargeForm.departement,
        mode_paiement: chargeForm.mode_paiement,
        ref_paiement: chargeForm.ref_paiement,
        statut: chargeForm.statut,
        commentaire: chargeForm.commentaire,
        validateur: chargeForm.validateur,
        ref_charge: await generateChargeRef(),
        created_by: uid || null,
      }])
      .select('id, ref_charge')
      .single();
    if (error) throw error;

    await setFinancialSyncStatus(movementId, FINANCIAL_SYNC.SYNCED, {
      expenseId: data.id,
      qty,
    });
    return { action: 'created', id: data.id, ref: data.ref_charge, montant, unitCost, mapping };
  } catch (err) {
    const errMsg = err?.message || err?.details || String(err);
    await setFinancialSyncStatus(movementId, FINANCIAL_SYNC.FAILED, { error: errMsg });
    return { action: 'failed', id: null, error: errMsg, mapping };
  }
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
    mode_paiement: 'Autre',
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
      const unitCostOverride = Number(ligne.cout_unitaire ?? bon.cout_unitaire) || null;
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
        unitCostOverride,
      });
      if (toDivers.action === 'created' || toDivers.action === 'updated' || toDivers.action === 'existing') {
        results.push({ movementId, kind: 'to_divers', ...toDivers });
        continue;
      }
      if (toDivers.action === 'failed') {
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
      await setFinancialSyncStatus(movementId, FINANCIAL_SYNC.FAILED, {
        error: err?.message || String(err),
      }).catch(() => {});
      results.push({ movementId, action: 'failed', error: err?.message });
    }
  }
  return results;
}

/** Réessayer la sync financière d’une ligne de mouvement. */
export async function retryDiversExpenseSync(movementId) {
  if (!movementId) throw new Error('movementId requis');
  const { data: row, error } = await getSupabase()
    .from('stock_movements')
    .select('*, stock_articles(reference, nom, article_type, prix_unitaire, unite)')
    .eq('id', movementId)
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new Error('Mouvement introuvable');

  const p = row.payload || {};
  const bonLike = {
    ref: row.ref_mouvement,
    type_mouvement: row.type_mouvement === 'Entree' ? 'Entrée' : row.type_mouvement,
    emplacement_source: p.emplacement_source || '',
    emplacement_destination: p.emplacement_destination || '',
    date_creation: row.date_mouvement,
    cree_par: p.cree_par || '',
    statut: p.statut || 'Validé',
    cout_unitaire: Number(p.cout_unitaire) || Number(row.stock_articles?.prix_unitaire) || null,
    lignes: [{
      id: row.id,
      article_id: row.article_id,
      quantite: row.quantite,
      cout_unitaire: Number(p.cout_unitaire) || Number(row.stock_articles?.prix_unitaire) || null,
    }],
  };
  const results = await syncDiversExpensesForBon(bonLike);
  return results[0] || { action: 'none' };
}

/**
 * Backfill : crée les dépenses générales manquantes pour les mouvements
 * consommables → DIVERS déjà validés (idempotent).
 */
export async function backfillPendingDiversGeneralExpenses({ limit = 150 } = {}) {
  await ensureDiversWarehouse().catch(() => null);
  const { data, error } = await getSupabase()
    .from('stock_movements')
    .select('id, ref_mouvement, type_mouvement, quantite, date_mouvement, payload, article_id, stock_articles(article_type, prix_unitaire)')
    .in('type_mouvement', ['Sortie', 'Transfert', 'sortie', 'transfert'])
    .order('date_mouvement', { ascending: false })
    .limit(limit);
  if (error) throw error;

  const created = [];
  const failed = [];
  const skipped = [];

  for (const row of data || []) {
    const p = row.payload || {};
    if (/annul/i.test(String(p.statut || ''))) {
      skipped.push({ id: row.id, reason: 'annule' });
      continue;
    }
    const dest = p.emplacement_destination || '';
    const artType = row.stock_articles?.article_type;
    if (!shouldCreateDiversGeneralExpense({
      typeMouvement: row.type_mouvement === 'Entree' ? 'Entrée' : row.type_mouvement,
      articleType: artType,
      destination: dest,
      statut: p.statut || 'Validé',
      annule: false,
    })) {
      skipped.push({ id: row.id, reason: 'not_eligible' });
      continue;
    }

    // Déjà sync OK
    if (p.financial_sync_status === FINANCIAL_SYNC.SYNCED) {
      const existing = await findChargeByRefPaiement(diversChargeRefKey(row.id)).catch(() => null);
      if (existing?.id) {
        skipped.push({ id: row.id, reason: 'already_synced' });
        continue;
      }
    }

    const res = await syncDiversGeneralExpenseForMovementLine({
      movementId: row.id,
      refMouvement: row.ref_mouvement,
      typeMouvement: row.type_mouvement === 'Entree' ? 'Entrée' : row.type_mouvement,
      articleId: row.article_id,
      quantite: row.quantite,
      emplacementSource: p.emplacement_source || '',
      emplacementDestination: dest,
      dateMouvement: row.date_mouvement,
      creePar: p.cree_par || '',
      statut: p.statut || 'Validé',
      articleTypeHint: artType,
      unitCostOverride: Number(p.cout_unitaire) || Number(row.stock_articles?.prix_unitaire) || null,
    });

    if (res.action === 'created' || res.action === 'updated') {
      created.push({ id: row.id, ref: row.ref_mouvement, ...res });
    } else if (res.action === 'existing') {
      skipped.push({ id: row.id, reason: 'existing_charge' });
    } else if (res.action === 'failed') {
      failed.push({ id: row.id, ref: row.ref_mouvement, error: res.error });
    } else {
      skipped.push({ id: row.id, reason: res.reason || res.action });
    }
  }

  return {
    scanned: (data || []).length,
    created_count: created.length,
    failed_count: failed.length,
    created,
    failed,
  };
}

/**
 * DRY RUN lecture seule — cas PEINTURE VINYLIQUE / DIVERS / 6 kg.
 * Ne modifie aucune donnée.
 */
export async function dryRunPeintureDiversSortieBug({
  articleNameIncludes = 'PEINTURE VINYLIQUE',
  qty = 6,
} = {}) {
  const mapping = await resolveDiversLocation(DIVERS_EMPLACEMENT_CODE);
  const { data, error } = await getSupabase()
    .from('stock_movements')
    .select('id, ref_mouvement, type_mouvement, quantite, date_mouvement, payload, stock_articles(id, reference, nom, article_type, prix_unitaire, unite)')
    .order('date_mouvement', { ascending: false })
    .limit(200);
  if (error) throw error;

  const needle = String(articleNameIncludes || '').toUpperCase();
  const candidates = (data || []).filter((row) => {
    const art = row.stock_articles || {};
    const name = String(art.nom || '').toUpperCase();
    const p = row.payload || {};
    const dest = p.emplacement_destination || '';
    const q = Number(row.quantite) || 0;
    return name.includes(needle)
      && (qty == null || q === Number(qty))
      && isDiversEmplacement(dest);
  });

  const rows = [];
  for (const row of candidates) {
    const p = row.payload || {};
    const art = row.stock_articles || {};
    const src = p.emplacement_source || '';
    const dest = p.emplacement_destination || '';
    const typeDb = row.type_mouvement;
    const typeUi = typeDb === 'Entree' ? 'Entrée' : typeDb;
    const kind = (() => {
      const k = String(typeUi || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (k === 'sortie') return 'exit (Sortie — pas de crédit dest)';
      if (k === 'transfert') return 'transfer';
      return k;
    })();
    const unitCost = Number(art.prix_unitaire) || 0;
    const q = Number(row.quantite) || 0;
    const expected = roundMoney(q * unitCost);
    const existing = await findChargeByRefPaiement(diversChargeRefKey(row.id)).catch(() => null);

    // Niveaux actuels (lecture)
    let levelDepot = null;
    let levelDivers = null;
    try {
      const { data: levels } = await getSupabase()
        .from('stock_levels')
        .select('emplacement, quantite')
        .eq('article_id', art.id || row.article_id);
      (levels || []).forEach((l) => {
        if (String(l.emplacement || '').toUpperCase().includes('LAKHYAYTA')) levelDepot = l;
        if (isDiversEmplacement(l.emplacement)) levelDivers = l;
      });
    } catch { /* ignore */ }

    const isSortie = String(typeUi).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === 'sortie';

    rows.push({
      movement_id: row.id,
      reference: row.ref_mouvement,
      type_enregistre_db: typeDb,
      type_selectionne_utilisateur: typeUi,
      type_normalise: kind,
      source: src,
      destination: dest,
      quantite: q,
      article: `${art.reference || ''} — ${art.nom || ''}`,
      article_type: art.article_type,
      cout_unitaire: unitCost,
      montant_attendu: expected || 120,
      impact_actuel_depot: levelDepot ? Number(levelDepot.quantite) : null,
      impact_actuel_divers: levelDivers ? Number(levelDivers.quantite) : null,
      depense_generale: existing
        ? { id: existing.id, ref: existing.ref_charge, montant: existing.montant, statut: existing.statut }
        : null,
      financial_sync_status: p.financial_sync_status || null,
      financial_sync_error: p.financial_sync_error || null,
      divers_mapping: mapping,
      proposition_si_sortie: isSortie ? {
        retirer_qty_divers: q,
        conserver_debit_depot: true,
        creer_depense_generale: !existing,
        montant: expected || (q * 20),
        ne_pas_supprimer_mouvement: true,
        note: 'Aucune modification appliquée — validation explicite requise.',
      } : null,
    });
  }

  return {
    generated_at: new Date().toISOString(),
    note: 'DRY RUN — aucune donnée modifiée.',
    divers_emplacement: mapping,
    total_candidates: rows.length,
    rows,
  };
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

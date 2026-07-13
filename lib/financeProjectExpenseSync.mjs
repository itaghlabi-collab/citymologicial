/**
 * Utilitaires partagés — sync finance_charges / payment_orders → project_expenses
 */

export const SKIP_CHARGE_STATUTS = ['Annulé', 'Refusé', 'Refusée', 'Brouillon'];
export const CHARGE_LIVE_STATUT = 'Payé';
export const OP_LIVE_STATUT = 'Payé';
/** Rattrapage historique : dépenses déjà validées/comptabilisées mais jamais liées au projet. */
export const CHARGE_BACKFILL_STATUTS = ['Payé', 'Validé', 'Validée', 'Comptabilisée', 'Comptabilisé'];

export function normalizeName(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildProjectIndexes(projects) {
  const projectById = Object.fromEntries((projects || []).map((p) => [String(p.id), p]));
  const projectByName = {};
  const projectByRef = {};
  (projects || []).forEach((p) => {
    projectByName[normalizeName(p.nom)] = p;
    if (p.ref) projectByRef[p.ref] = p;
  });
  return { projectById, projectByName, projectByRef };
}

export function resolveChargeProject(charge, indexes) {
  const { projectById, projectByName, projectByRef } = indexes;
  const label = String(charge.projet_lie || '').trim();
  const refPart = label.split(' — ')[0]?.trim();
  if (refPart && projectByRef[refPart]) return projectByRef[refPart];
  if (charge.project_id) {
    const id = String(charge.project_id);
    return projectById[id] || { id };
  }
  if (!label) return null;
  const nomPart = label.split(' — ')[1]?.trim() || label;
  return projectByName[normalizeName(nomPart)] || projectByName[normalizeName(label)] || null;
}

export function isChargeEligibleForBackfill(charge) {
  if (!charge || SKIP_CHARGE_STATUTS.includes(charge.statut)) return false;
  return CHARGE_BACKFILL_STATUTS.includes(String(charge.statut || '').trim());
}

export function isChargeEligibleForLiveSync(charge) {
  return String(charge?.statut || '').trim() === CHARGE_LIVE_STATUT;
}

export function chargeMatchesSince(charge, since) {
  if (!since) return true;
  const d = String(charge.date_charge || '').slice(0, 10);
  const created = String(charge.created_at || '').slice(0, 10);
  return (d && d >= since) || (created && created >= since);
}

export function orderMatchesSince(order, since) {
  if (!since) return true;
  const d = String(order.date_paiement || order.date_ordre || '').slice(0, 10);
  const created = String(order.created_at || '').slice(0, 10);
  return (d && d >= since) || (created && created >= since);
}

export function chargeProjectExpenseRow(charge, projectId, { backfill = false } = {}) {
  const paid = backfill
    ? isChargeEligibleForBackfill(charge)
    : isChargeEligibleForLiveSync(charge);
  return {
    project_id: projectId,
    project_match_status: 'matched',
    date_depense: charge.date_charge,
    categorie: charge.categorie,
    element_depense: charge.libelle || charge.categorie || 'Charge',
    description: charge.commentaire,
    fournisseur: charge.fournisseur,
    montant: Number(charge.montant) || 0,
    observation: charge.ref_charge ? `Réf. ${charge.ref_charge}` : null,
    origine: 'charge_manuelle',
    source_type: 'finance_charge',
    source_id: charge.id,
    statut: paid ? 'payee' : 'en_attente',
    mode_paiement: charge.mode_paiement,
    montant_paye: paid ? Number(charge.montant) || 0 : null,
    date_paiement: paid ? charge.date_charge : null,
  };
}

export function paymentOrderProjectExpenseRow(order) {
  const montant = Number(order.montant_ttc ?? order.montant) || 0;
  const hasPurchase = Boolean(order.purchase_request_id);
  return {
    project_id: order.project_id,
    project_match_status: 'matched',
    date_depense: order.date_paiement || order.date_ordre,
    categorie: hasPurchase ? "Demande d'achat" : 'Ordre de paiement',
    element_depense: order.motif || order.ref_ordre || 'Ordre de paiement',
    description: order.commentaire || order.observation,
    fournisseur: order.fournisseur_lie || order.beneficiaire,
    montant,
    origine: hasPurchase ? 'achat' : 'ordre_paiement',
    source_type: hasPurchase ? 'purchase_request' : 'payment_order',
    source_id: hasPurchase ? order.purchase_request_id : order.id,
    statut: 'payee',
    payment_order_id: order.id,
    purchase_request_id: order.purchase_request_id || null,
    purchase_acquisition_order_id: order.purchase_acquisition_order_id || null,
    mode_paiement: order.mode_paiement,
    montant_paye: montant,
    date_paiement: order.date_paiement || order.date_ordre,
  };
}

export function sourceKey(sourceType, sourceId) {
  return `${sourceType}:${sourceId}`;
}

/** Évite les upserts inutiles lors du rattrapage (ligne déjà à jour). */
export function projectExpenseRowNeedsUpdate(existing, row) {
  if (!existing) return true;
  return String(existing.statut || '') !== String(row.statut || '')
    || String(existing.project_id || '') !== String(row.project_id || '')
    || Number(existing.montant) !== Number(row.montant);
}

export async function upsertProjectExpenseRow(admin, row) {
  const { data: existing } = await admin
    .from('project_expenses')
    .select('id')
    .eq('source_type', row.source_type)
    .eq('source_id', row.source_id)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await admin.from('project_expenses').update(row).eq('id', existing.id);
    return error ? { action: 'error', error } : { action: 'updated' };
  }

  const { error } = await admin.from('project_expenses').insert(row);
  return error ? { action: 'error', error } : { action: 'created' };
}

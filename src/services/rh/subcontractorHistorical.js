/**
 * subcontractorHistorical.js — Historique pré-ERP / already_accounted
 *
 * Date réelle (operationDate) ≠ date de saisie ERP (enteredAt).
 * already_accounted=true → visible en historique, aucun nouveau décaissement caisse.
 */
import { getSupabase } from '../../lib/supabase';
import { round2 } from './subcontractorAdvanceMath';
import { logSubcontractorAccountEvent } from './subcontractorAccountEvents';
import {
  ACCOUNTING_STATUS,
  ACCOUNTING_STATUS_LABEL,
  isAlreadyAccounted,
  accountingStatusOf,
  accountingStatusLabel,
  buildHistoricalInsertFields,
  normalizeHistoricalFlags,
  splitHistoricalOps,
  buildDualFinancialViews,
} from './subcontractorHistoricalMath';

export {
  ACCOUNTING_STATUS,
  ACCOUNTING_STATUS_LABEL,
  isAlreadyAccounted,
  accountingStatusOf,
  accountingStatusLabel,
  buildHistoricalInsertFields,
  normalizeHistoricalFlags,
  splitHistoricalOps,
  buildDualFinancialViews,
};

const OPENING_TABLE = 'subcontractor_opening_balances';

export function normalizeOpeningBalance(row) {
  if (!row) return null;
  return {
    id: row.id,
    subcontractorId: row.subcontractor_id,
    arreteeDate: row.arretee_date || '',
    travauxAnterieurs: Number(row.travaux_anterieurs) || 0,
    avancesVerseesAnterieures: Number(row.avances_versees_anterieures) || 0,
    avancesConsommeesAnterieures: Number(row.avances_consommees_anterieures) || 0,
    soldeAvanceOuverture: Number(row.solde_avance_ouverture) || 0,
    paiementsAnterieurs: Number(row.paiements_anterieurs) || 0,
    resteAnterieur: Number(row.reste_anterieur) || 0,
    retenuesAnterieures: Number(row.retenues_anterieures) || 0,
    observation: row.observation || '',
    pieceUrl: row.piece_url || '',
    alreadyAccounted: row.already_accounted !== false,
    linkedAdvanceId: row.linked_advance_id || null,
    created_at: row.created_at,
    createdBy: row.created_by || null,
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

export async function getOpeningBalance(subcontractorId) {
  if (!subcontractorId) return null;
  try {
    const { data, error } = await getSupabase()
      .from(OPENING_TABLE)
      .select('*')
      .eq('subcontractor_id', subcontractorId)
      .maybeSingle();
    if (error) {
      if (/does not exist|schema cache|Could not find/i.test(error.message || '')) return null;
      throw error;
    }
    return normalizeOpeningBalance(data);
  } catch {
    return null;
  }
}

/**
 * Méthode 2 — Solde d’ouverture.
 * Crée aussi une avance already_accounted pour le solde disponible (imputation future),
 * sans sync caisse.
 */
export async function createOpeningBalance(subcontractorId, form = {}, { subcontractorName } = {}) {
  const userId = await getAuthUserId();
  const existing = await getOpeningBalance(subcontractorId);
  if (existing) {
    const err = new Error(
      'Une situation d’ouverture existe déjà pour ce sous-traitant. '
      + 'Évitez le double comptage (méthode détaillée + solde d’ouverture).',
    );
    err.code = 'OPENING_EXISTS';
    throw err;
  }

  const travaux = round2(Math.max(0, Number(form.travauxAnterieurs) || 0));
  const avancesVersees = round2(Math.max(0, Number(form.avancesVerseesAnterieures) || 0));
  let avancesConso = round2(Math.max(0, Number(form.avancesConsommeesAnterieures) || 0));
  if (avancesConso > avancesVersees) avancesConso = avancesVersees;
  let solde = form.soldeAvanceOuverture != null && form.soldeAvanceOuverture !== ''
    ? round2(Math.max(0, Number(form.soldeAvanceOuverture) || 0))
    : round2(Math.max(0, avancesVersees - avancesConso));
  if (solde > avancesVersees - avancesConso + 0.009) {
    solde = round2(Math.max(0, avancesVersees - avancesConso));
  }
  const paiements = round2(Math.max(0, Number(form.paiementsAnterieurs) || 0));
  const retenues = round2(Math.max(0, Number(form.retenuesAnterieures) || 0));
  const reste = form.resteAnterieur != null && form.resteAnterieur !== ''
    ? round2(Math.max(0, Number(form.resteAnterieur) || 0))
    : round2(Math.max(0, travaux - avancesConso - paiements - retenues));
  const arreteeDate = form.arreteeDate || new Date().toISOString().slice(0, 10);

  let linkedAdvanceId = null;
  if (avancesVersees > 0) {
    const { createGlobalAdvance } = await import('./subcontractorAdvances');
    const adv = await createGlobalAdvance(subcontractorId, {
      advanceDate: arreteeDate,
      amount: avancesVersees,
      consumedAmount: avancesConso,
      paymentMethod: form.paymentMethod || 'historique',
      reference: form.reference || `OUVERTURE-${arreteeDate}`,
      observation: form.observation || 'Solde d’ouverture — avance historique déjà comptabilisée',
      alreadyAccounted: true,
    }, { subcontractorName, skipCashSync: true });
    linkedAdvanceId = adv.id;
  }

  const row = {
    subcontractor_id: subcontractorId,
    arretee_date: arreteeDate,
    travaux_anterieurs: travaux,
    avances_versees_anterieures: avancesVersees,
    avances_consommees_anterieures: avancesConso,
    solde_avance_ouverture: solde,
    paiements_anterieurs: paiements,
    reste_anterieur: reste,
    retenues_anterieures: retenues,
    observation: form.observation?.trim() || null,
    piece_url: form.pieceUrl?.trim() || null,
    already_accounted: true,
    linked_advance_id: linkedAdvanceId,
    created_by: userId,
  };

  const { data, error } = await getSupabase()
    .from(OPENING_TABLE)
    .insert([row])
    .select('*')
    .single();
  if (error) {
    if (/duplicate|unique/i.test(error.message || '')) {
      const err = new Error('Situation d’ouverture déjà enregistrée pour ce sous-traitant.');
      err.code = 'OPENING_EXISTS';
      throw err;
    }
    throw error;
  }

  await logSubcontractorAccountEvent({
    subcontractorId,
    eventType: 'historical',
    advanceId: linkedAdvanceId,
    amount: avancesVersees,
    reference: `OUVERTURE-${arreteeDate}`,
    observation: 'Situation initiale / solde d’ouverture (déjà comptabilisée)',
    meta: { openingBalanceId: data.id, ...row },
  });

  return normalizeOpeningBalance(data);
}

/**
 * Changement contrôlé already_accounted. Motif + historisation obligatoires.
 */
export async function changeAlreadyAccountedFlag({
  table,
  id,
  subcontractorId,
  nextValue,
  reason,
  entityLabel = 'opération',
}) {
  const userId = await getAuthUserId();
  const motif = String(reason || '').trim();
  if (!motif || motif.length < 5) {
    const err = new Error('Motif obligatoire (min. 5 caractères) pour modifier le statut de comptabilisation.');
    err.code = 'VALIDATION';
    throw err;
  }
  if (!table || !id) {
    const err = new Error('Opération introuvable.');
    err.code = 'VALIDATION';
    throw err;
  }

  const { data: prev, error: readErr } = await getSupabase()
    .from(table)
    .select('*')
    .eq('id', id)
    .single();
  if (readErr) throw readErr;

  const prevVal = !!prev.already_accounted;
  const next = !!nextValue;
  if (prevVal === next) return prev;

  const patch = {
    already_accounted: next,
    already_accounted_changed_at: new Date().toISOString(),
    already_accounted_changed_by: userId,
    already_accounted_change_reason: motif,
  };
  const { data, error } = await getSupabase()
    .from(table)
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;

  await logSubcontractorAccountEvent({
    subcontractorId: subcontractorId || prev.subcontractor_id,
    eventType: 'historical',
    paymentId: table.includes('payment') ? id : null,
    advanceId: table.includes('advance') ? id : null,
    situationId: table.includes('situation') ? id : null,
    amount: Number(prev.amount || prev.gross_amount) || 0,
    observation: `Statut comptabilisation ${entityLabel} : ${prevVal} → ${next}. Motif : ${motif}`,
    meta: { table, id, from: prevVal, to: next, reason: motif },
  });

  return data;
}

export function stripHistoricalColumns(row) {
  if (!row || typeof row !== 'object') return row;
  const {
    already_accounted,
    entered_at,
    entered_by,
    already_accounted_changed_at,
    already_accounted_changed_by,
    already_accounted_change_reason,
    ...rest
  } = row;
  return rest;
}

export function isMissingHistoricalColumnError(error) {
  const msg = error?.message || '';
  return /already_accounted|entered_at|entered_by|opening_balances|schema cache|Could not find/i.test(msg);
}

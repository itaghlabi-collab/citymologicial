/**
 * Déduplication des écritures caisse issues des dépenses générales.
 * N'annule que des copies accidentelles (même charge, ou même empreinte
 * créée dans une fenêtre courte). Ne touche pas aux alimentations,
 * paiements RH, ni aux dépenses réellement distinctes.
 */

export const CHARGE_CASH_SOURCE = 'charge';
export const ACCIDENTAL_DUP_WINDOW_MS = 60 * 60 * 1000;

function createdMs(row) {
  const raw = row?.created_at;
  if (!raw) return null;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function byCreatedThenId(a, b) {
  const ma = createdMs(a);
  const mb = createdMs(b);
  if (ma != null && mb != null && ma !== mb) return ma - mb;
  return String(a?.id || '').localeCompare(String(b?.id || ''));
}

function isActiveChargeCash(tx) {
  if (!tx || tx.statut === 'Annulé') return false;
  const src = String(tx.source_type || '').trim();
  if (src === CHARGE_CASH_SOURCE) return true;
  return Boolean(tx.charge_id) && !src;
}

export function chargeCashFingerprint(tx) {
  const date = String(tx?.date || tx?.date_operation || '').slice(0, 10);
  const montant = String(Math.round((Number(tx?.montant) || 0) * 100));
  const desc = String(tx?.description || tx?.libelle || '').trim().toLowerCase();
  const who = String(tx?.contrepartie || tx?.fournisseur || '').trim().toLowerCase();
  const mode = String(tx?.mode_paiement || '').trim().toLowerCase();
  return `${date}|${montant}|${desc}|${who}|${mode}`;
}

/**
 * @returns {{ keepIds: string[], cancelIds: string[], extraChargeIds: string[] }}
 */
export function selectDuplicateChargeCashIds(rows, windowMs = ACCIDENTAL_DUP_WINDOW_MS) {
  const active = (rows || []).filter(isActiveChargeCash);
  const cancel = new Set();
  const extraChargeIds = new Set();

  const bySource = new Map();
  for (const t of active) {
    const sid = t.source_id || t.charge_id;
    if (!sid) continue;
    if (!bySource.has(String(sid))) bySource.set(String(sid), []);
    bySource.get(String(sid)).push(t);
  }
  for (const group of bySource.values()) {
    const sorted = [...group].sort(byCreatedThenId);
    for (const extra of sorted.slice(1)) cancel.add(String(extra.id));
  }

  const remaining = active.filter((t) => !cancel.has(String(t.id)));
  const byFp = new Map();
  for (const t of remaining) {
    const fp = chargeCashFingerprint(t);
    if (!byFp.has(fp)) byFp.set(fp, []);
    byFp.get(fp).push(t);
  }

  for (const group of byFp.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort(byCreatedThenId);
    const firstMs = createdMs(sorted[0]);
    const lastMs = createdMs(sorted[sorted.length - 1]);
    const span = firstMs != null && lastMs != null ? lastMs - firstMs : 0;
    if (span > windowMs) continue;
    const keeper = sorted[0];
    const keeperCharge = String(keeper.source_id || keeper.charge_id || '');
    for (const extra of sorted.slice(1)) {
      cancel.add(String(extra.id));
      const cid = String(extra.source_id || extra.charge_id || '');
      if (cid && cid !== keeperCharge) extraChargeIds.add(cid);
    }
  }

  const keepIds = active
    .map((t) => String(t.id))
    .filter((id) => !cancel.has(id));

  return {
    keepIds,
    cancelIds: [...cancel],
    extraChargeIds: [...extraChargeIds],
  };
}

async function cancelRows(table, ids) {
  if (!ids?.length) return 0;
  const { getSupabase } = await import('../../lib/supabase.js');
  const { error } = await getSupabase()
    .from(table)
    .update({ statut: 'Annulé' })
    .in('id', ids);
  if (error) throw error;
  return ids.length;
}

/** Annule les copies caisse (et les dépenses jumelles) sans supprimer l'historique. */
export async function dedupeAccidentalChargeCashDuplicates() {
  const { getSupabase } = await import('../../lib/supabase.js');
  const { data, error } = await getSupabase()
    .from('finance_transactions')
    .select('id, date_operation, montant, description, contrepartie, mode_paiement, source_type, source_id, charge_id, statut, created_at')
    .or('source_type.eq.charge,charge_id.not.is.null')
    .neq('statut', 'Annulé');
  if (error) throw error;

  const rows = (data || []).map((row) => ({
    ...row,
    date: row.date_operation,
  }));
  const { cancelIds, extraChargeIds } = selectDuplicateChargeCashIds(rows);
  const txCancelled = await cancelRows('finance_transactions', cancelIds);
  let chargesCancelled = 0;
  if (extraChargeIds.length) {
    try {
      chargesCancelled = await cancelRows('finance_charges', extraChargeIds);
    } catch (err) {
      console.warn('[CITYMO] dedupe charges jumelles', err);
    }
  }
  return { txCancelled, chargesCancelled };
}

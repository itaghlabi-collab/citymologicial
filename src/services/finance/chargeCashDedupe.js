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

export function chargeRecordFingerprint(c) {
  const date = String(c?.date || c?.date_charge || '').slice(0, 10);
  const montant = String(Math.round((Number(c?.montant) || 0) * 100));
  const lib = String(c?.libelle || '').trim().toLowerCase();
  const projet = String(c?.projet_lie || c?.project_id || '').trim().toLowerCase();
  const mode = String(c?.mode_paiement || '').trim().toLowerCase();
  return `${date}|${montant}|${lib}|${projet}|${mode}`;
}

/**
 * Copies Dépenses courantes : même réf, ou même date/libellé/montant/projet/mode.
 * @returns {{ cancelIds: string[] }}
 */
export function selectDuplicateChargeRecordIds(charges) {
  const active = (charges || []).filter((c) => c?.id && c.statut !== 'Annulé');
  const cancel = new Set();

  const byRef = new Map();
  for (const c of active) {
    const ref = String(c.ref || c.ref_charge || '').trim();
    if (!ref) continue;
    if (!byRef.has(ref)) byRef.set(ref, []);
    byRef.get(ref).push(c);
  }
  for (const group of byRef.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort(byCreatedThenId);
    for (const extra of sorted.slice(1)) cancel.add(String(extra.id));
  }

  const remaining = active.filter((c) => !cancel.has(String(c.id)));
  const byFp = new Map();
  for (const c of remaining) {
    const fp = chargeRecordFingerprint(c);
    if (!byFp.has(fp)) byFp.set(fp, []);
    byFp.get(fp).push(c);
  }
  for (const group of byFp.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort(byCreatedThenId);
    for (const extra of sorted.slice(1)) cancel.add(String(extra.id));
  }

  return { cancelIds: [...cancel] };
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

export async function dedupeAccidentalChargeRecords() {
  const { getSupabase } = await import('../../lib/supabase.js');
  const { data, error } = await getSupabase()
    .from('finance_charges')
    .select('id, date_charge, libelle, montant, fournisseur, projet_lie, project_id, mode_paiement, ref_charge, statut, created_at')
    .neq('statut', 'Annulé');
  if (error) throw error;
  const rows = (data || []).map((row) => ({
    ...row,
    date: row.date_charge,
    ref: row.ref_charge,
  }));
  const { cancelIds } = selectDuplicateChargeRecordIds(rows);
  const chargesCancelled = await cancelRows('finance_charges', cancelIds);
  if (cancelIds.length) {
    const { error: txErr } = await getSupabase()
      .from('finance_transactions')
      .update({ statut: 'Annulé' })
      .eq('source_type', 'charge')
      .in('source_id', cancelIds);
    if (txErr) console.warn('[CITYMO] cancel cash for duplicate charges', txErr);
  }
  return { chargesCancelled };
}

export async function reconcileMissingChargeCashLines() {
  const { getSupabase } = await import('../../lib/supabase.js');
  const { CASH_RESTART_DATE } = await import('./cashRestartLedger.js');
  const { normalizeCharge } = await import('./charges.js');
  const { syncChargeToTransaction } = await import('./financeTransactions.js');
  const { data: charges, error } = await getSupabase()
    .from('finance_charges')
    .select('*')
    .neq('statut', 'Annulé')
    .gte('date_charge', CASH_RESTART_DATE);
  if (error) throw error;
  const { data: txs, error: txErr } = await getSupabase()
    .from('finance_transactions')
    .select('source_id')
    .eq('source_type', 'charge')
    .neq('statut', 'Annulé');
  if (txErr) throw txErr;
  const synced = new Set((txs || []).map((t) => String(t.source_id || '')).filter(Boolean));
  let syncedMissing = 0;
  const { isCashPaymentMode, getCashSheetPaymentMode } = await import('./cashSheetDisplay.js');
  for (const row of charges || []) {
    if (synced.has(String(row.id))) continue;
    const charge = normalizeCharge(row);
    if (!isCashPaymentMode(getCashSheetPaymentMode(charge))) continue;
    try {
      await syncChargeToTransaction(charge);
      syncedMissing += 1;
    } catch (err) {
      console.warn('[CITYMO] reconcile charge → caisse', row.id, err);
    }
  }
  return { syncedMissing };
}

/** Dédoublonne dépenses + caisse, puis rattache les espèces manquantes (ex. RAHHOU). */
export async function reconcileDepensesCourantesCash() {
  const charges = await dedupeAccidentalChargeRecords().catch((err) => {
    console.warn('[CITYMO] dedupe dépenses courantes', err);
    return { chargesCancelled: 0 };
  });
  const cash = await dedupeAccidentalChargeCashDuplicates().catch((err) => {
    console.warn('[CITYMO] dedupe charge → caisse', err);
    return { txCancelled: 0, chargesCancelled: 0 };
  });
  const missing = await reconcileMissingChargeCashLines().catch((err) => {
    console.warn('[CITYMO] reconcile charge cash manquant', err);
    return { syncedMissing: 0 };
  });
  return {
    chargesCancelled: (charges.chargesCancelled || 0) + (cash.chargesCancelled || 0),
    txCancelled: cash.txCancelled || 0,
    syncedMissing: missing.syncedMissing || 0,
  };
}

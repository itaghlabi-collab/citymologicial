/**
 * achatDemandesRecuperation.js — Demandes de récupération Achats liées aux OP.
 * OP Initié → « En cours »
 * OP Payé → « À récupérer » + notif magasinier
 * Magasinier marque récupérée avec chauffeur + véhicule.
 */
import { getSupabase } from '../../lib/supabase';
import {
  notifyInventaireUsers,
  NOTIFICATION_TYPES,
  NOTIFICATION_PRIORITIES,
  moduleActionUrl,
} from '../notifications/notifications';
import { normalizePaymentOrderStatut } from '../finance/paymentOrders';

const TABLE = 'achat_demandes_recuperation';

export const DEMANDE_RECUP_STATUTS = {
  EN_COURS: 'en_cours',
  PRETE: 'prete_a_recuperer',
  RECUPEREE: 'recuperee',
  ANNULEE: 'annulee',
};

export const DEMANDE_RECUP_LABEL = {
  en_cours: 'En cours',
  prete_a_recuperer: 'À récupérer',
  a_recuperer: 'À récupérer', // legacy
  recuperee: 'Récupérée',
  annulee: 'Annulée',
};

export const DEMANDE_RECUP_BADGE = {
  en_cours: 'badge-blue',
  prete_a_recuperer: 'badge-orange',
  a_recuperer: 'badge-orange',
  recuperee: 'badge-green',
  annulee: 'badge-grey',
};

async function getAuthUser() {
  const { data: { user }, error } = await getSupabase().auth.getUser();
  if (error || !user) {
    const err = new Error('Session requise.');
    err.code = 'AUTH';
    throw err;
  }
  return user;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function isMissingTableError(err) {
  const msg = err?.message || String(err || '');
  const code = err?.code || '';
  // Uniquement absence réelle de table — pas les erreurs CHECK / RLS qui citent le nom
  if (code === '42P01') return true;
  if (/relation ["'].*achat_demandes_recuperation["'] does not exist/i.test(msg)) return true;
  if (/Could not find the table ['"]public\.achat_demandes_recuperation['"]/i.test(msg)) return true;
  if (/schema cache/i.test(msg) && /achat_demandes_recuperation/i.test(msg)) return true;
  return false;
}

/** Mappe le statut OP → statut demande récupération (null si hors scope). */
export function recupStatutFromOpStatut(opStatut) {
  const s = normalizePaymentOrderStatut(opStatut);
  if (s === 'Payé') return DEMANDE_RECUP_STATUTS.PRETE;
  if (s === 'Initié') return DEMANDE_RECUP_STATUTS.EN_COURS;
  return null;
}

/** Titre de la demande d'achat uniquement. */
async function resolvePurchaseRequestTitre(purchaseRequestId, fallback = '') {
  if (!purchaseRequestId) return String(fallback || '').trim();
  const { data, error } = await getSupabase()
    .from('purchase_requests')
    .select('titre')
    .eq('id', purchaseRequestId)
    .maybeSingle();
  if (error || !data) return String(fallback || '').trim();
  return String(data.titre || '').trim() || String(fallback || '').trim();
}

export function normalizeDemandeRecuperation(row) {
  if (!row) return null;
  let statut = row.statut || DEMANDE_RECUP_STATUTS.PRETE;
  if (statut === 'a_recuperer') statut = DEMANDE_RECUP_STATUTS.PRETE;
  return {
    id: row.id,
    ref: row.ref || '',
    qui: row.qui || '',
    quand: row.quand || '',
    quoi: row.quoi || '',
    statut,
    statut_label: DEMANDE_RECUP_LABEL[statut] || statut,
    payment_order_id: row.payment_order_id || '',
    purchase_request_id: row.purchase_request_id || '',
    purchase_request_ref: row.purchase_request_ref || '',
    purchase_oa_ref: row.purchase_oa_ref || '',
    fournisseur: row.fournisseur || '',
    projet: row.projet || '',
    chauffeur: row.chauffeur || '',
    vehicule: row.vehicule || '',
    date_recuperation: row.date_recuperation || '',
    created_by: row.created_by || '',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function generateRef() {
  const year = new Date().getFullYear();
  const prefix = `DR-${year}-`;
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('ref')
    .like('ref', `${prefix}%`)
    .order('ref', { ascending: false })
    .limit(50);
  if (error) throw error;
  let max = 0;
  (data || []).forEach((r) => {
    const m = String(r.ref || '').match(/DR-\d{4}-(\d+)/i);
    if (m) max = Math.max(max, Number(m[1]) || 0);
  });
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

export async function listDemandesRecuperationAchats() {
  await getAuthUser();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(normalizeDemandeRecuperation);
}

/**
 * Crée / met à jour une demande liée à un OP Achats.
 * Initié → en_cours | Payé → prete_a_recuperer
 */
export async function ensureDemandeFromOp(op, { notify = false } = {}) {
  if (!op?.id) return null;
  if (!op.purchase_request_id) return null;

  const targetStatut = recupStatutFromOpStatut(op.statut);
  if (!targetStatut) return null;

  const { data: existing, error: findErr } = await getSupabase()
    .from(TABLE)
    .select('*')
    .eq('payment_order_id', op.id)
    .maybeSingle();
  if (findErr) {
    if (isMissingTableError(findErr)) return null;
    throw findErr;
  }

  const titre = await resolvePurchaseRequestTitre(
    op.purchase_request_id,
    op.purchase_request_titre || op.titre || '',
  );
  const quoi = titre || '—';

  // Mise à jour si déjà existante (ex. Initié → Payé, ou corriger le quoi)
  if (existing) {
    const cur = existing.statut === 'a_recuperer' ? DEMANDE_RECUP_STATUTS.PRETE : existing.statut;
    // Ne pas rétrograder une récupérée
    if (cur === DEMANDE_RECUP_STATUTS.RECUPEREE || cur === DEMANDE_RECUP_STATUTS.ANNULEE) {
      return { demande: normalizeDemandeRecuperation(existing), created: false, updated: false };
    }
    const patch = {};
    if (cur !== targetStatut) patch.statut = targetStatut;
    if (quoi && existing.quoi !== quoi) patch.quoi = quoi;
    if (op.purchase_request_ref && existing.purchase_request_ref !== op.purchase_request_ref) {
      patch.purchase_request_ref = op.purchase_request_ref;
    }
    if (op.purchase_oa_ref && existing.purchase_oa_ref !== op.purchase_oa_ref) {
      patch.purchase_oa_ref = op.purchase_oa_ref;
    }
    const four = op.fournisseur_lie || op.beneficiaire || '';
    if (four && existing.fournisseur !== four) patch.fournisseur = four;

    if (Object.keys(patch).length === 0) {
      return { demande: normalizeDemandeRecuperation(existing), created: false, updated: false };
    }

    const { data: updated, error: updErr } = await getSupabase()
      .from(TABLE)
      .update(patch)
      .eq('id', existing.id)
      .select('*')
      .single();
    if (updErr) throw updErr;

    const demande = normalizeDemandeRecuperation(updated);
    // Notif uniquement au passage à « À récupérer »
    if (notify && patch.statut === DEMANDE_RECUP_STATUTS.PRETE) {
      try {
        await notifyMagasinierRecuperation(demande, op);
      } catch (err) {
        console.warn('[CITYMO] notif magasinier récupération', err);
      }
    }
    return { demande, created: false, updated: true };
  }

  let userId = null;
  try {
    userId = (await getAuthUser()).id;
  } catch {
    userId = null;
  }

  const row = {
    ref: await generateRef(),
    qui: '',
    quand: op.date_paiement || todayISO(),
    quoi,
    statut: targetStatut,
    payment_order_id: op.id,
    purchase_request_id: op.purchase_request_id,
    purchase_request_ref: op.purchase_request_ref || '',
    purchase_oa_ref: op.purchase_oa_ref || '',
    fournisseur: op.fournisseur_lie || op.beneficiaire || '',
    projet: '',
    created_by: userId,
  };

  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([row])
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      const { data: again } = await getSupabase()
        .from(TABLE)
        .select('*')
        .eq('payment_order_id', op.id)
        .maybeSingle();
      if (again) return { demande: normalizeDemandeRecuperation(again), created: false, updated: false };
    }
    throw error;
  }

  const demande = normalizeDemandeRecuperation(data);
  if (notify && targetStatut === DEMANDE_RECUP_STATUTS.PRETE) {
    try {
      await notifyMagasinierRecuperation(demande, op);
    } catch (err) {
      console.warn('[CITYMO] notif magasinier récupération', err);
    }
  }
  return { demande, created: true, updated: false };
}

/** @deprecated alias — garder compat appels Payé */
export async function ensureDemandeFromPaidOp(op, opts = {}) {
  return ensureDemandeFromOp(op, opts);
}

async function notifyMagasinierRecuperation(demande, op) {
  const da = demande.purchase_request_ref || op?.purchase_request_ref || '—';
  const opRef = op?.ref || demande.ref || '—';
  const titre = demande.quoi || '—';
  return notifyInventaireUsers({
    title: 'À récupérer',
    message: `Paiement validé (${opRef}) — DA ${da} : ${titre}. Confirmez chauffeur + véhicule.`,
    type: NOTIFICATION_TYPES.SYSTEM,
    priority: NOTIFICATION_PRIORITIES.HIGH,
    entityType: 'achat_demande_recuperation',
    entityId: demande.id,
    actionUrl: moduleActionUrl('suivi-receptions'),
    submoduleCode: 'suivi-receptions',
  });
}

/** Hook : OP Achats → Payé. */
export async function onAchatsPaymentOrderPaid(op) {
  try {
    return await ensureDemandeFromOp({ ...op, statut: 'Payé' }, { notify: true });
  } catch (err) {
    console.warn('[CITYMO] ensureDemandeFromOp (payé)', err);
    return null;
  }
}

/** Hook : OP Achats → Initié. */
export async function onAchatsPaymentOrderInitiated(op) {
  try {
    return await ensureDemandeFromOp({ ...op, statut: 'Initié' }, { notify: false });
  } catch (err) {
    console.warn('[CITYMO] ensureDemandeFromOp (initié)', err);
    return null;
  }
}

function mapOpRow(row) {
  return {
    id: row.id,
    ref: row.ref_ordre || row.ref || '',
    statut: row.statut,
    purchase_request_id: row.purchase_request_id,
    purchase_request_ref: row.purchase_request_ref || '',
    purchase_oa_ref: row.purchase_oa_ref || '',
    fournisseur_lie: row.fournisseur_lie || '',
    beneficiaire: row.beneficiaire || '',
    motif: row.motif || '',
    date_paiement: row.date_paiement || '',
  };
}

/** Backfill : OP Initié / Payé (rapide, non bloquant pour l’UI). */
export async function syncPaidOpsToDemandesRecuperation() {
  await getAuthUser();

  const { error: probeErr } = await getSupabase().from(TABLE).select('id').limit(1);
  if (probeErr && isMissingTableError(probeErr)) {
    const err = new Error(probeErr.message || 'Table absente');
    err.code = '42P01';
    throw err;
  }

  const { data: existingRows, error: existingErr } = await getSupabase()
    .from(TABLE)
    .select('id, payment_order_id, statut, quoi')
    .not('payment_order_id', 'is', null);
  if (existingErr) {
    if (isMissingTableError(existingErr)) return [];
    throw existingErr;
  }
  const byOpId = new Map((existingRows || []).map((r) => [r.payment_order_id, r]));

  const { data, error } = await getSupabase()
    .from('payment_orders')
    .select('id, ref_ordre, ref, statut, purchase_request_id, purchase_request_ref, purchase_oa_ref, fournisseur_lie, beneficiaire, motif, date_paiement, created_at')
    .not('purchase_request_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(120);
  if (error) {
    if (error.code === '42P01') return [];
    throw error;
  }

  const touched = [];
  for (const row of data || []) {
    const statut = normalizePaymentOrderStatut(row.statut);
    if (statut !== 'Payé' && statut !== 'Initié') continue;
    const op = mapOpRow(row);
    try {
      const result = await ensureDemandeFromOp(op, { notify: false });
      if (result?.created || result?.updated) touched.push(result.demande);
      byOpId.set(row.id, result?.demande || byOpId.get(row.id));
    } catch (err) {
      if (isMissingTableError(err)) return touched;
      console.warn('[CITYMO] sync demande récupération OP', row.id, err);
    }
  }
  return touched;
}

export async function markDemandeRecuperationDone(id, { chauffeur, vehicule, date_recuperation } = {}) {
  await getAuthUser();
  const ch = String(chauffeur || '').trim();
  const ve = String(vehicule || '').trim();
  if (!ch) {
    const err = new Error('Indiquez le chauffeur.');
    err.code = 'VALIDATION';
    throw err;
  }
  if (!ve) {
    const err = new Error('Indiquez le véhicule.');
    err.code = 'VALIDATION';
    throw err;
  }
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update({
      statut: DEMANDE_RECUP_STATUTS.RECUPEREE,
      chauffeur: ch,
      vehicule: ve,
      date_recuperation: date_recuperation || todayISO(),
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return normalizeDemandeRecuperation(data);
}

export async function deleteDemandeRecuperationAchats(id) {
  await getAuthUser();
  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) throw error;
}

export function filterDemandesRecuperation(rows, { search = '', statut = '', date = '' } = {}) {
  const q = search.trim().toLowerCase();
  const d = String(date || '').slice(0, 10);
  return (rows || []).filter((r) => {
    if (statut) {
      const s = r.statut === 'a_recuperer' ? DEMANDE_RECUP_STATUTS.PRETE : r.statut;
      if (s !== statut) return false;
    }
    if (d) {
      const rowDate = String(r.date_recuperation || r.quand || r.created_at || '').slice(0, 10);
      if (rowDate !== d) return false;
    }
    if (!q) return true;
    const hay = `${r.ref} ${r.quoi} ${r.purchase_request_ref} ${r.purchase_oa_ref} ${r.fournisseur} ${r.chauffeur} ${r.vehicule}`.toLowerCase();
    return hay.includes(q);
  });
}

export function computeDemandesRecuperationKpis(rows) {
  const list = rows || [];
  const isPrete = (r) => r.statut === DEMANDE_RECUP_STATUTS.PRETE || r.statut === 'a_recuperer';
  return {
    total: list.length,
    enCours: list.filter((r) => r.statut === DEMANDE_RECUP_STATUTS.EN_COURS).length,
    aRecuperer: list.filter(isPrete).length,
    recuperees: list.filter((r) => r.statut === DEMANDE_RECUP_STATUTS.RECUPEREE).length,
    annulees: list.filter((r) => r.statut === DEMANDE_RECUP_STATUTS.ANNULEE).length,
  };
}

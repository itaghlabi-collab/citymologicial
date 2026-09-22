/**
 * achatDemandesRecuperation.js — Demandes de récupération Achats liées aux OP payés.
 * OP Payé → « Prête à récupérer » + notif magasinier.
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
  PRETE: 'prete_a_recuperer',
  RECUPEREE: 'recuperee',
  ANNULEE: 'annulee',
};

export const DEMANDE_RECUP_LABEL = {
  prete_a_recuperer: 'Prête à récupérer',
  a_recuperer: 'Prête à récupérer', // legacy
  recuperee: 'Récupérée',
  annulee: 'Annulée',
};

export const DEMANDE_RECUP_BADGE = {
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

function buildQuoi(op) {
  const parts = [
    op.purchase_request_ref ? `DA ${op.purchase_request_ref}` : '',
    op.purchase_oa_ref ? `OA ${op.purchase_oa_ref}` : '',
    op.ref ? `OP ${op.ref}` : '',
    op.fournisseur_lie || op.beneficiaire || '',
    op.motif || '',
  ].filter(Boolean);
  return parts.join(' — ') || 'Récupération marchandise payée';
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

/** Crée (si besoin) une demande liée à un OP Achats payé. */
export async function ensureDemandeFromPaidOp(op, { notify = false } = {}) {
  if (!op?.id) return null;
  if (!op.purchase_request_id) return null;
  if (normalizePaymentOrderStatut(op.statut) !== 'Payé') return null;

  const { data: existing, error: findErr } = await getSupabase()
    .from(TABLE)
    .select('*')
    .eq('payment_order_id', op.id)
    .maybeSingle();
  if (findErr) {
    if (isMissingTableError(findErr)) return null;
    throw findErr;
  }
  if (existing) {
    return { demande: normalizeDemandeRecuperation(existing), created: false };
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
    quoi: buildQuoi(op),
    statut: DEMANDE_RECUP_STATUTS.PRETE,
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
    // Course : une autre requête a déjà créé la ligne
    if (error.code === '23505') {
      const { data: again } = await getSupabase()
        .from(TABLE)
        .select('*')
        .eq('payment_order_id', op.id)
        .maybeSingle();
      if (again) return { demande: normalizeDemandeRecuperation(again), created: false };
    }
    throw error;
  }

  const demande = normalizeDemandeRecuperation(data);
  if (notify) {
    try {
      await notifyMagasinierRecuperation(demande, op);
    } catch (err) {
      console.warn('[CITYMO] notif magasinier récupération', err);
    }
  }
  return { demande, created: true };
}

async function notifyMagasinierRecuperation(demande, op) {
  const da = demande.purchase_request_ref || op?.purchase_request_ref || '—';
  const opRef = op?.ref || demande.ref || '—';
  return notifyInventaireUsers({
    title: 'Prête à récupérer',
    message: `Paiement validé (${opRef}) — DA ${da}. Ouvrez Demande de récupération pour confirmer (chauffeur + véhicule).`,
    type: NOTIFICATION_TYPES.SYSTEM,
    priority: NOTIFICATION_PRIORITIES.HIGH,
    entityType: 'achat_demande_recuperation',
    entityId: demande.id,
    actionUrl: moduleActionUrl('suivi-receptions'),
    submoduleCode: 'suivi-receptions',
  });
}

/** Hook appelé quand un OP Achats passe à Payé. */
export async function onAchatsPaymentOrderPaid(op) {
  try {
    return await ensureDemandeFromPaidOp(op, { notify: true });
  } catch (err) {
    console.warn('[CITYMO] ensureDemandeFromPaidOp', err);
    return null;
  }
}

function isMissingTableError(err) {
  const msg = err?.message || String(err || '');
  return err?.code === '42P01' || /does not exist|schema cache|achat_demandes_recuperation/i.test(msg);
}

/** Backfill : OP Achats déjà payés sans demande (rapide, non bloquant pour l’UI). */
export async function syncPaidOpsToDemandesRecuperation() {
  await getAuthUser();

  // Probe table — si absente, sortir tout de suite
  const { error: probeErr } = await getSupabase().from(TABLE).select('id').limit(1);
  if (probeErr && isMissingTableError(probeErr)) {
    const err = new Error(probeErr.message || 'Table absente');
    err.code = '42P01';
    throw err;
  }

  const { data: existingRows, error: existingErr } = await getSupabase()
    .from(TABLE)
    .select('payment_order_id')
    .not('payment_order_id', 'is', null);
  if (existingErr) {
    if (isMissingTableError(existingErr)) return [];
    throw existingErr;
  }
  const already = new Set((existingRows || []).map((r) => r.payment_order_id).filter(Boolean));

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

  const created = [];
  for (const row of data || []) {
    if (already.has(row.id)) continue;
    const statut = normalizePaymentOrderStatut(row.statut);
    if (statut !== 'Payé') continue;
    const op = {
      id: row.id,
      ref: row.ref_ordre || row.ref || '',
      statut: 'Payé',
      purchase_request_id: row.purchase_request_id,
      purchase_request_ref: row.purchase_request_ref || '',
      purchase_oa_ref: row.purchase_oa_ref || '',
      fournisseur_lie: row.fournisseur_lie || '',
      beneficiaire: row.beneficiaire || '',
      motif: row.motif || '',
      date_paiement: row.date_paiement || '',
    };
    try {
      const result = await ensureDemandeFromPaidOp(op, { notify: false });
      if (result?.created) {
        created.push(result.demande);
        already.add(row.id);
      }
    } catch (err) {
      if (isMissingTableError(err)) return created;
      console.warn('[CITYMO] sync demande récupération OP', row.id, err);
    }
  }
  return created;
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

export function filterDemandesRecuperation(rows, { search = '', statut = '' } = {}) {
  const q = search.trim().toLowerCase();
  return (rows || []).filter((r) => {
    if (statut) {
      const s = r.statut === 'a_recuperer' ? DEMANDE_RECUP_STATUTS.PRETE : r.statut;
      if (s !== statut) return false;
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
    aRecuperer: list.filter(isPrete).length,
    recuperees: list.filter((r) => r.statut === DEMANDE_RECUP_STATUTS.RECUPEREE).length,
    annulees: list.filter((r) => r.statut === DEMANDE_RECUP_STATUTS.ANNULEE).length,
  };
}

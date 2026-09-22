/**
 * achatDemandesRecuperation.js — Demandes de récupération Achats (simple).
 * Qui / quand / quoi + suivi statut. Ne touche pas Logistique ni OA check-list.
 */
import { getSupabase } from '../../lib/supabase';

const TABLE = 'achat_demandes_recuperation';

export const DEMANDE_RECUP_STATUTS = {
  A_RECUPERER: 'a_recuperer',
  RECUPEREE: 'recuperee',
  ANNULEE: 'annulee',
};

export const DEMANDE_RECUP_LABEL = {
  a_recuperer: 'À récupérer',
  recuperee: 'Récupérée',
  annulee: 'Annulée',
};

export const DEMANDE_RECUP_BADGE = {
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

export function normalizeDemandeRecuperation(row) {
  if (!row) return null;
  const statut = row.statut || DEMANDE_RECUP_STATUTS.A_RECUPERER;
  return {
    id: row.id,
    ref: row.ref || '',
    qui: row.qui || '',
    quand: row.quand || '',
    quoi: row.quoi || '',
    statut,
    statut_label: DEMANDE_RECUP_LABEL[statut] || statut,
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

export async function createDemandeRecuperationAchats(form) {
  const user = await getAuthUser();
  const qui = String(form.qui || '').trim();
  const quand = String(form.quand || '').trim();
  const quoi = String(form.quoi || '').trim();
  if (!qui) {
    const err = new Error('Indiquez qui récupère / demande.');
    err.code = 'VALIDATION';
    throw err;
  }
  if (!quand) {
    const err = new Error('Indiquez la date (quand).');
    err.code = 'VALIDATION';
    throw err;
  }
  if (!quoi) {
    const err = new Error('Indiquez quoi récupérer.');
    err.code = 'VALIDATION';
    throw err;
  }

  const row = {
    ref: await generateRef(),
    qui,
    quand,
    quoi,
    statut: DEMANDE_RECUP_STATUTS.A_RECUPERER,
    created_by: user.id,
  };

  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([row])
    .select('*')
    .single();
  if (error) throw error;
  return normalizeDemandeRecuperation(data);
}

export async function updateDemandeRecuperationStatut(id, statut) {
  await getAuthUser();
  if (!Object.values(DEMANDE_RECUP_STATUTS).includes(statut)) {
    const err = new Error('Statut invalide.');
    err.code = 'VALIDATION';
    throw err;
  }
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update({ statut })
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
    if (statut && r.statut !== statut) return false;
    if (!q) return true;
    const hay = `${r.ref} ${r.qui} ${r.quoi}`.toLowerCase();
    return hay.includes(q);
  });
}

export function computeDemandesRecuperationKpis(rows) {
  const list = rows || [];
  return {
    total: list.length,
    aRecuperer: list.filter((r) => r.statut === DEMANDE_RECUP_STATUTS.A_RECUPERER).length,
    recuperees: list.filter((r) => r.statut === DEMANDE_RECUP_STATUTS.RECUPEREE).length,
    annulees: list.filter((r) => r.statut === DEMANDE_RECUP_STATUTS.ANNULEE).length,
  };
}

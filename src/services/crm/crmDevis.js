/**
 * crmDevis.js — CRM Devis CRUD (Supabase crm_devis / crm_devis_lignes)
 */
import { getSupabase } from '../../lib/supabase';
import { clientDisplayName } from './clients';
import { moneyLineHt, moneyComputeDocumentTotals, moneyToNumber } from '../../utils/decimalMoney';

const TABLE = 'crm_devis';
const LIGNES = 'crm_devis_lignes';

export const CRM_DEVIS_STATUTS = ['brouillon', 'envoye', 'valide', 'refuse', 'expire', 'en_attente', 'converti'];

const DEVIS_SELECT = `
  *,
  clients ( id, nom, prenom, email, telephone, ice, adresse, ville, responsable )
`;

function ligneTotalHt(l) {
  if (l.type !== 'article') return 0;
  return moneyToNumber(moneyLineHt({
    qty: l.quantite,
    unitPriceHt: l.prix_ht,
    remisePct: l.remise,
  }));
}

function computeTotals(lignes = []) {
  const result = moneyComputeDocumentTotals(lignes, (l) => {
    if (l.type !== 'article') return null;
    return {
      qty: l.quantite,
      unitPriceHt: l.prix_ht,
      tvaPct: l.tva,
      remisePct: l.remise,
    };
  });
  return {
    ...result,
    total_tva: result.total_vat,
  };
}

export function normalizeLigne(row) {
  if (!row) return null;
  const quantite = Number(row.quantite ?? 1);
  const remise = Number(row.remise ?? 0);
  let prix_ht = Number(row.prix_ht ?? row.prix ?? 0);
  const totalStored = Number(row.total_ht ?? 0);
  if ((!prix_ht || Number.isNaN(prix_ht)) && totalStored > 0 && quantite > 0 && (row.type || 'article') === 'article') {
    const factor = 1 - (remise / 100);
    prix_ht = totalStored / (quantite * (factor > 0 ? factor : 1));
  }
  return {
    id: row.id,
    _id: row.id,
    devis_id: row.devis_id,
    ordre: row.ordre ?? 0,
    type: row.type || 'article',
    designation: row.designation || '',
    description: row.description || '',
    article_id: row.article_id ? String(row.article_id) : '',
    categorie_id: row.categorie_id ? String(row.categorie_id) : '',
    quantite,
    unite: row.unite || 'unite',
    prix_ht: Number.isFinite(prix_ht) ? prix_ht : 0,
    remise,
    tva: Number(row.tva ?? 20),
    total_ht: totalStored || ligneTotalHt({ ...row, prix_ht, quantite, remise }),
  };
}

/** Libellé liste déroulante projet : REF — CLIENT — TITRE — MONTANT MAD */
export function crmDevisSelectLabel(devis) {
  if (!devis) return '';
  const ref = (devis.reference || '—').trim();
  const client = (devis.client_nom || '—').trim();
  const titre = (devis.titre || '—').trim();
  const ttc = Number(devis.total_ttc || 0).toLocaleString('fr-MA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${ref} — ${client} — ${titre} — ${ttc} MAD`;
}

export function findCrmDevisByReference(devisList, reference) {
  const ref = (reference || '').trim();
  if (!ref || !devisList?.length) return null;
  return devisList.find((d) => (d.reference || '').trim() === ref) || null;
}

export function normalizeCrmDevis(row, lignes = []) {
  if (!row) return null;
  const c = row.clients;
  const clientNom = clientDisplayName(c) || c?.nom || '';
  return {
    id: row.id,
    reference: row.reference || '',
    titre: row.titre || '',
    statut: row.statut || 'brouillon',
    date_creation: row.date_creation || row.created_at?.slice?.(0, 10) || '',
    date_validite: row.date_validite || '',
    commercial: row.commercial || '',
    type_projet: row.type_projet || '',
    client_id: row.client_id ? String(row.client_id) : '',
    client_nom: clientNom,
    client: c ? {
      id: c.id,
      nom: c.nom,
      prenom: c.prenom,
      email: c.email,
      telephone: c.telephone,
      ice: c.ice,
      adresse: c.adresse,
      ville: c.ville,
    } : null,
    modalites_paiement: row.modalites_paiement || '',
    conditions: row.conditions || '',
    notes_internes: row.notes_internes || '',
    total_ht: Number(row.total_ht ?? 0),
    total_tva: Number(row.total_tva ?? 0),
    total_ttc: Number(row.total_ttc ?? 0),
    lignes: (lignes || []).map(normalizeLigne),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toDevisRow(form, totals) {
  return {
    reference: form.reference?.trim() || '',
    titre: form.titre?.trim() || '',
    statut: form.statut || 'brouillon',
    date_creation: form.date_creation || new Date().toISOString().slice(0, 10),
    date_validite: form.date_validite || null,
    commercial: form.commercial?.trim() || null,
    type_projet: form.type_projet || null,
    client_id: form.client_id || null,
    modalites_paiement: form.modalites_paiement || null,
    conditions: form.conditions?.trim() || null,
    notes_internes: form.notes_internes?.trim() || null,
    total_ht: totals.total_ht ?? 0,
    total_tva: totals.total_tva ?? totals.total_vat ?? 0,
    total_ttc: totals.total_ttc ?? 0,
  };
}

function toLigneRow(ligne, devisId, ordre) {
  const total_ht = ligneTotalHt(ligne);
  const isEphemeral = ligne.ephemeral && !ligne.article_id;
  return {
    devis_id: devisId,
    ordre,
    type: ligne.type || 'article',
    designation: ligne.designation?.trim() || null,
    description: ligne.description?.trim() || null,
    article_id: isEphemeral ? null : (ligne.article_id || null),
    categorie_id: ligne.categorie_id || null,
    quantite: Number(ligne.quantite) || 0,
    unite: ligne.unite || 'unite',
    prix_ht: Number(ligne.prix_ht) || 0,
    remise: Number(ligne.remise) || 0,
    tva: Number(ligne.tva) ?? 20,
    total_ht,
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

export async function generateCrmDevisReference() {
  await getAuthUserId();
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const prefix = `PR-${y}-${m}-`;
  const { count, error } = await getSupabase()
    .from(TABLE)
    .select('*', { count: 'exact', head: true })
    .like('reference', `${prefix}%`);
  if (error) throw error;
  const seq = String((count || 0) + 1).padStart(4, '0');
  return `${prefix}${seq}`;
}

async function fetchLignes(devisId) {
  const { data, error } = await getSupabase()
    .from(LIGNES)
    .select('*')
    .eq('devis_id', devisId)
    .order('ordre', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function listCrmDevis() {
  await getAuthUserId();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select(DEVIS_SELECT)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[CITYMO] crmDevis list', error);
    throw error;
  }
  return (data || []).map((row) => normalizeCrmDevis(row, []));
}

export async function getCrmDevisById(id) {
  await getAuthUserId();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select(DEVIS_SELECT)
    .eq('id', id)
    .single();
  if (error) {
    console.error('[CITYMO] crmDevis get', error, { id });
    throw error;
  }
  const lignes = await fetchLignes(id);
  return normalizeCrmDevis(data, lignes);
}

/** Sérialise les upserts concurrentes (même onglet) pour éviter delete+insert entrelacés → doublons. */
const ligneUpsertChainByDevis = new Map();

async function upsertLignesOnce(devisId, lignes) {
  await getSupabase().from(LIGNES).delete().eq('devis_id', devisId);
  const rows = (lignes || [])
    .filter((l) => {
      if (l.type !== 'article') return true;
      return Number(l.quantite) > 0;
    })
    .map((l, i) => toLigneRow(l, devisId, i));
  if (rows.length === 0) return;
  const { error } = await getSupabase().from(LIGNES).insert(rows);
  if (error) {
    console.error('[CITYMO] crmDevis lignes insert', error, rows);
    throw error;
  }
}

async function upsertLignes(devisId, lignes) {
  const key = String(devisId);
  const prev = ligneUpsertChainByDevis.get(key) || Promise.resolve();
  const next = prev
    .catch(() => {})
    .then(() => upsertLignesOnce(devisId, lignes));
  ligneUpsertChainByDevis.set(key, next);
  try {
    await next;
  } finally {
    if (ligneUpsertChainByDevis.get(key) === next) {
      ligneUpsertChainByDevis.delete(key);
    }
  }
}

export async function createCrmDevis(form) {
  await getAuthUserId();
  const totals = computeTotals(form.lignes);
  const reference = form.reference?.trim() || await generateCrmDevisReference();
  const row = { ...toDevisRow({ ...form, reference }, totals), reference };

  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([row])
    .select('*')
    .single();
  if (error) {
    console.error('[CITYMO] crmDevis insert', error, row);
    throw error;
  }
  await upsertLignes(data.id, form.lignes || []);
  return getCrmDevisById(data.id);
}

export async function updateCrmDevis(id, form) {
  await getAuthUserId();
  const totals = computeTotals(form.lignes);
  const row = toDevisRow(form, totals);

  const { error } = await getSupabase()
    .from(TABLE)
    .update(row)
    .eq('id', id);
  if (error) {
    console.error('[CITYMO] crmDevis update', error, { id, row });
    throw error;
  }
  await upsertLignes(id, form.lignes || []);
  return getCrmDevisById(id);
}

export async function deleteCrmDevis(id) {
  await getAuthUserId();
  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) {
    console.error('[CITYMO] crmDevis delete', error, { id });
    throw error;
  }
}

export async function updateCrmDevisStatut(id, statut, patch = {}) {
  await getAuthUserId();
  if (!CRM_DEVIS_STATUTS.includes(statut)) {
    throw new Error('Statut invalide.');
  }
  const { error } = await getSupabase()
    .from(TABLE)
    .update({ statut, ...patch })
    .eq('id', id);
  if (error) {
    console.error('[CITYMO] crmDevis statut', error, { id, statut });
    throw error;
  }
  return getCrmDevisById(id);
}

export async function isDevisLinkedToProject(devisId) {
  const { data, error } = await getSupabase()
    .from('projects')
    .select('id')
    .eq('devis_id', devisId)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

export async function listDevisIdsWithProjects() {
  const { data, error } = await getSupabase()
    .from('projects')
    .select('devis_id')
    .not('devis_id', 'is', null);
  if (error) throw error;
  return new Set((data || []).map((r) => String(r.devis_id)));
}

export async function convertCrmDevisToProject(devisId) {
  const devis = await getCrmDevisById(devisId);
  if (await isDevisLinkedToProject(devisId)) {
    throw new Error('Ce devis est déjà converti en projet.');
  }
  const { createProject } = await import('../projects/projects');
  const lignesTxt = (devis.lignes || [])
    .filter((l) => l.type === 'article')
    .map((l) => `• ${l.designation} — ${l.quantite} ${l.unite} × ${Number(l.prix_ht).toLocaleString('fr-MA')} MAD`)
    .join('\n');
  const project = await createProject({
    nom: devis.titre || `Projet ${devis.reference}`,
    client_id: devis.client_id,
    client_nom: devis.client_nom,
    type_projet: devis.type_projet,
    budget_estime: devis.total_ttc,
    devis_id: devis.id,
    devis_reference: devis.reference,
    responsable: devis.commercial,
    description: lignesTxt || null,
    observations: `Créé depuis devis ${devis.reference}`,
    statut: 'brouillon',
    date_debut: new Date().toISOString().slice(0, 10),
  });
  try {
    await updateCrmDevisStatut(devisId, 'converti');
  } catch (err) {
    console.warn('[CITYMO] crmDevis converti statut', err);
  }
  return { project, devis };
}

export async function duplicateCrmDevis(id) {
  const original = await getCrmDevisById(id);
  const reference = await generateCrmDevisReference();
  return createCrmDevis({
    ...original,
    id: undefined,
    reference,
    titre: `${original.titre} (copie)`,
    statut: 'brouillon',
    date_creation: new Date().toISOString().slice(0, 10),
    lignes: (original.lignes || []).map((l) => ({ ...l, id: undefined, _id: undefined })),
  });
}

export function filterCrmDevis(records, filters = {}) {
  const { search = '', statut = '', commercial = '' } = filters;
  return (records || []).filter((d) => {
    if (statut && d.statut !== statut) return false;
    if (commercial && d.commercial !== commercial) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = `${d.reference || ''} ${d.titre || ''} ${d.client_nom || ''} ${d.commercial || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function computeCrmDevisStats(records) {
  const list = records || [];
  return {
    total: list.length,
    valides: list.filter((d) => d.statut === 'valide').length,
    enAttente: list.filter((d) => d.statut === 'en_attente' || d.statut === 'envoye').length,
    refuses: list.filter((d) => d.statut === 'refuse' || d.statut === 'expire').length,
    montantTotal: list.reduce((s, d) => s + Number(d.total_ttc || 0), 0),
    montantValides: list.filter((d) => d.statut === 'valide').reduce((s, d) => s + Number(d.total_ttc || 0), 0),
    montantAttente: list.filter((d) => d.statut === 'en_attente' || d.statut === 'envoye').reduce((s, d) => s + Number(d.total_ttc || 0), 0),
  };
}

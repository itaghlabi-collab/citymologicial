/**
 * crmProformas.js — Factures Proforma CRM (tables dédiées)
 * Numérotation PF-YYYY-##### indépendante de FAC / AC / PR.
 * Aucune sync caisse / paiement / écriture comptable.
 */
import { getSupabase } from '../../lib/supabase';
import { clientDisplayName } from './clients';
import { getCrmDevisById } from './crmDevis';
import { moneyLineHt, moneyComputeDocumentTotals, moneyToNumber } from '../../utils/decimalMoney';
import { hydrateDocLigneFromSource } from '../../utils/crm/docLigneHydrate';
import { listArticles } from './articles';

const TABLE = 'crm_proformas';
const LIGNES = 'crm_proforma_lignes';

/** Statuts métier proforma (non comptables) */
export const CRM_PROFORMA_STATUTS = [
  'brouillon',
  'envoyee',
  'acceptee',
  'refusee',
  'expiree',
  'convertie',
  'annulee',
];

export const CRM_PROFORMA_STATUT_LABEL = {
  brouillon: 'Brouillon',
  envoyee: 'Envoyée',
  acceptee: 'Acceptée',
  refusee: 'Refusée',
  expiree: 'Expirée',
  convertie: 'Convertie en facture',
  annulee: 'Annulée',
};

const PROFORMA_SELECT = `
  *,
  clients!client_id ( id, nom, prenom, email, telephone, ice, adresse, ville, responsable ),
  crm_devis!devis_id ( id, reference ),
  crm_factures!facture_id ( id, numero )
`;

function ligneTotalHt(l) {
  if (l.type !== 'article') return 0;
  return moneyToNumber(moneyLineHt({
    qty: l.quantite,
    unitPriceHt: l.prix_ht,
    remisePct: l.remise,
  }));
}

/**
 * Prix unitaire robuste depuis une ligne devis/facture.
 * Si prix_ht est vide mais total_ht est renseigné → déduit PU = total / (qté × facteur remise).
 */
export function resolveLignePrixHt(l) {
  if (!l || (l.type && l.type !== 'article')) return 0;
  let prix = moneyToNumber(l.prix_ht ?? l.prix ?? 0);
  const qty = moneyToNumber(l.quantite ?? 0);
  const remise = moneyToNumber(l.remise ?? 0);
  const total = moneyToNumber(l.total_ht ?? 0);
  if (prix === 0 && total > 0 && qty > 0) {
    const factor = 1 - (remise / 100);
    prix = moneyToNumber(total / (qty * (factor > 0 ? factor : 1)));
  }
  return prix;
}

/** Mappe une ligne devis → ligne proforma (formulaire / insert) */
export function mapDevisLigneToProformaLigne(l) {
  const type = l?.type || 'article';
  const quantite = type === 'article' ? (moneyToNumber(l.quantite ?? 1) || 1) : moneyToNumber(l.quantite ?? 0);
  const remise = moneyToNumber(l?.remise ?? 0);
  const tva = l?.tva == null || l?.tva === '' ? 20 : moneyToNumber(l.tva);
  const prix_ht = resolveLignePrixHt({ ...l, type, quantite, remise });
  return {
    type,
    designation: l?.designation || '',
    description: l?.description || '',
    article_id: l?.article_id ? String(l.article_id) : '',
    categorie_id: l?.categorie_id ? String(l.categorie_id) : '',
    quantite,
    unite: l?.unite || 'unite',
    prix_ht,
    remise,
    tva,
    total_ht: type === 'article'
      ? moneyToNumber(moneyLineHt({ qty: quantite, unitPriceHt: prix_ht, remisePct: remise }))
      : 0,
  };
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

async function getAuthUserId() {
  const { data: { user }, error } = await getSupabase().auth.getUser();
  if (error) throw error;
  if (!user?.id) {
    const err = new Error('Authentification requise.');
    err.code = 'AUTH';
    throw err;
  }
  return user.id;
}

export function normalizeProformaLigne(row) {
  if (!row) return null;
  return {
    id: row.id,
    _id: row.id,
    proforma_id: row.proforma_id,
    ordre: row.ordre ?? 0,
    type: row.type || 'article',
    designation: row.designation || '',
    description: row.description || '',
    article_id: row.article_id ? String(row.article_id) : '',
    categorie_id: row.categorie_id ? String(row.categorie_id) : '',
    quantite: Number(row.quantite ?? 1),
    unite: row.unite || 'unite',
    prix_ht: resolveLignePrixHt(row),
    remise: Number(row.remise ?? 0),
    tva: Number(row.tva ?? 20),
    total_ht: Number(row.total_ht ?? ligneTotalHt({ ...row, prix_ht: resolveLignePrixHt(row) })),
  };
}

export function normalizeCrmProforma(row, lignes = []) {
  if (!row) return null;
  const c = row.clients;
  const clientNom = clientDisplayName(c) || c?.nom || '';
  const devisRef = row.crm_devis?.reference || '';
  const factureNumero = row.crm_factures?.numero || '';
  return {
    id: row.id,
    numero: row.numero || '',
    titre: row.titre || '',
    objet: row.objet || row.titre || '',
    statut: row.statut || 'brouillon',
    statutLabel: CRM_PROFORMA_STATUT_LABEL[row.statut] || row.statut || 'Brouillon',
    date_emission: row.date_emission || row.created_at?.slice?.(0, 10) || '',
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
    devis_id: row.devis_id ? String(row.devis_id) : '',
    devis_reference: devisRef,
    facture_id: row.facture_id ? String(row.facture_id) : '',
    facture_numero: factureNumero,
    converted_at: row.converted_at || null,
    modalites_paiement: row.modalites_paiement || '',
    conditions: row.conditions || '',
    notes_internes: row.notes_internes || '',
    notes: row.notes || '',
    total_ht: Number(row.total_ht ?? 0),
    total_tva: Number(row.total_tva ?? 0),
    total_ttc: Number(row.total_ttc ?? 0),
    lignes: (lignes || []).map(normalizeProformaLigne),
    created_by: row.created_by || null,
    updated_by: row.updated_by || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toProformaRow(form, totals, userId, { isCreate = false } = {}) {
  const row = {
    numero: form.numero?.trim() || '',
    titre: (form.titre || form.objet || '').trim() || 'Proforma',
    objet: form.objet?.trim() || form.titre?.trim() || null,
    statut: form.statut || 'brouillon',
    date_emission: form.date_emission || new Date().toISOString().slice(0, 10),
    date_validite: form.date_validite || null,
    commercial: form.commercial?.trim() || null,
    type_projet: form.type_projet || null,
    client_id: form.client_id || null,
    devis_id: form.devis_id || null,
    facture_id: form.facture_id || null,
    converted_at: form.converted_at || null,
    modalites_paiement: form.modalites_paiement || null,
    conditions: form.conditions?.trim() || null,
    notes_internes: form.notes_internes?.trim() || null,
    notes: form.notes?.trim() || null,
    total_ht: totals.total_ht ?? 0,
    total_tva: totals.total_tva ?? totals.total_vat ?? 0,
    total_ttc: totals.total_ttc ?? 0,
    updated_by: userId || null,
  };
  if (isCreate) row.created_by = userId || null;
  return row;
}

function toLigneRow(ligne, proformaId, ordre) {
  return {
    proforma_id: proformaId,
    ordre,
    type: ligne.type || 'article',
    designation: ligne.designation?.trim() || null,
    description: ligne.description?.trim() || null,
    article_id: ligne.article_id || null,
    categorie_id: ligne.categorie_id || null,
    quantite: Number(ligne.quantite) || 1,
    unite: ligne.unite || 'unite',
    prix_ht: resolveLignePrixHt(ligne),
    remise: moneyToNumber(ligne.remise) || 0,
    tva: ligne.tva == null || ligne.tva === '' ? 20 : moneyToNumber(ligne.tva),
    total_ht: moneyToNumber(ligne.total_ht) || ligneTotalHt({ ...ligne, prix_ht: resolveLignePrixHt(ligne) }),
  };
}

/**
 * Numérotation indépendante : PF-2026-00001
 * Ne touche JAMAIS à FAC- / AC- / PR-
 */
export async function generateCrmProformaNumero() {
  await getAuthUserId();
  const year = new Date().getFullYear();
  const prefix = `PF-${year}-`;
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('numero')
    .ilike('numero', `${prefix}%`);
  if (error) throw error;
  let maxSeq = 0;
  const re = new RegExp(`^PF-${year}-(\\d+)$`, 'i');
  for (const row of data || []) {
    const match = String(row.numero || '').match(re);
    if (match) maxSeq = Math.max(maxSeq, parseInt(match[1], 10));
  }
  return `${prefix}${String(maxSeq + 1).padStart(5, '0')}`;
}

async function fetchLignes(proformaId) {
  const { data, error } = await getSupabase()
    .from(LIGNES)
    .select('*')
    .eq('proforma_id', proformaId)
    .order('ordre', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function upsertLignes(proformaId, lignes) {
  await getSupabase().from(LIGNES).delete().eq('proforma_id', proformaId);
  const rows = (lignes || [])
    .filter((l) => l.type !== 'article' || l.designation?.trim() || l.article_id)
    .map((l, i) => toLigneRow(l, proformaId, i));
  if (rows.length === 0) return;
  const { error } = await getSupabase().from(LIGNES).insert(rows);
  if (error) {
    console.error('[CITYMO] crmProformas lignes insert', error, rows);
    throw error;
  }
}

export async function listCrmProformas() {
  await getAuthUserId();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select(PROFORMA_SELECT)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[CITYMO] crmProformas list', error);
    throw error;
  }
  return (data || []).map((row) => normalizeCrmProforma(row, []));
}

export async function getCrmProformaById(id) {
  await getAuthUserId();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select(PROFORMA_SELECT)
    .eq('id', id)
    .single();
  if (error) {
    console.error('[CITYMO] crmProformas get', error, { id });
    throw error;
  }
  const lignes = await fetchLignes(id);
  return normalizeCrmProforma(data, lignes);
}

export async function createCrmProforma(form) {
  const userId = await getAuthUserId();
  const computed = computeTotals(form.lignes);
  const totals = {
    total_ht: computed.total_ht || Number(form.total_ht) || 0,
    total_tva: computed.total_tva || Number(form.total_tva) || 0,
    total_ttc: computed.total_ttc || Number(form.total_ttc) || 0,
  };
  const numero = form.numero?.trim() || await generateCrmProformaNumero();
  const row = {
    ...toProformaRow({ ...form, numero }, totals, userId, { isCreate: true }),
    numero,
  };

  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([row])
    .select('*')
    .single();
  if (error) {
    console.error('[CITYMO] crmProformas insert', error, row);
    throw error;
  }
  await upsertLignes(data.id, form.lignes || []);
  return getCrmProformaById(data.id);
}

export async function updateCrmProforma(id, form) {
  const userId = await getAuthUserId();
  const existing = await getCrmProformaById(id);
  if (!existing) {
    const err = new Error('Proforma introuvable.');
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (existing.statut === 'convertie') {
    const err = new Error('Une proforma convertie en facture ne peut plus être modifiée.');
    err.code = 'VALIDATION';
    throw err;
  }
  if (existing.statut === 'annulee') {
    const err = new Error('Une proforma annulée ne peut plus être modifiée.');
    err.code = 'VALIDATION';
    throw err;
  }

  const computed = computeTotals(form.lignes);
  const totals = {
    total_ht: computed.total_ht || Number(form.total_ht) || 0,
    total_tva: computed.total_tva || Number(form.total_tva) || 0,
    total_ttc: computed.total_ttc || Number(form.total_ttc) || 0,
  };
  const row = toProformaRow(
    {
      ...form,
      numero: form.numero || existing.numero,
      facture_id: existing.facture_id || form.facture_id,
      converted_at: existing.converted_at || form.converted_at,
    },
    totals,
    userId,
  );
  // Ne jamais écraser le numéro PF généré
  row.numero = existing.numero;

  const { error } = await getSupabase()
    .from(TABLE)
    .update(row)
    .eq('id', id);
  if (error) {
    console.error('[CITYMO] crmProformas update', error, { id, row });
    throw error;
  }
  await upsertLignes(id, form.lignes || []);
  return getCrmProformaById(id);
}

export async function deleteCrmProforma(id) {
  await getAuthUserId();
  const existing = await getCrmProformaById(id);
  if (!existing) return;
  if (existing.statut === 'convertie' || existing.facture_id) {
    const err = new Error('Impossible de supprimer une proforma déjà convertie en facture.');
    err.code = 'VALIDATION';
    throw err;
  }
  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) {
    console.error('[CITYMO] crmProformas delete', error, { id });
    throw error;
  }
}

export async function cancelCrmProforma(id) {
  await getAuthUserId();
  const existing = await getCrmProformaById(id);
  if (!existing) {
    const err = new Error('Proforma introuvable.');
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (existing.statut === 'convertie') {
    const err = new Error('Une proforma convertie ne peut pas être annulée.');
    err.code = 'VALIDATION';
    throw err;
  }
  return updateCrmProforma(id, { ...existing, statut: 'annulee' });
}

/** Duplique une proforma → nouveau numéro PF, statut brouillon */
export async function duplicateCrmProforma(id) {
  const source = await getCrmProformaById(id);
  if (!source) {
    const err = new Error('Proforma introuvable.');
    err.code = 'NOT_FOUND';
    throw err;
  }
  return createCrmProforma({
    ...source,
    numero: undefined,
    statut: 'brouillon',
    facture_id: null,
    converted_at: null,
    titre: source.titre ? `${source.titre} (copie)` : 'Proforma (copie)',
  });
}

/**
 * Crée une proforma depuis un devis CRM (devis inchangé).
 */
export async function createCrmProformaFromDevis(devisId) {
  await getAuthUserId();
  const devis = await getCrmDevisById(devisId);
  if (!devis) {
    const err = new Error('Devis introuvable.');
    err.code = 'NOT_FOUND';
    throw err;
  }
  const articles = await listArticles().catch(() => []);
  return createCrmProforma({
    titre: devis.titre || `Proforma — ${devis.reference || ''}`.trim(),
    objet: devis.titre || '',
    statut: 'brouillon',
    date_emission: new Date().toISOString().slice(0, 10),
    date_validite: devis.date_validite || null,
    commercial: devis.commercial || '',
    type_projet: devis.type_projet || '',
    client_id: devis.client_id || null,
    devis_id: devis.id,
    modalites_paiement: devis.modalites_paiement || '',
    conditions: devis.conditions || '',
    notes_internes: devis.notes_internes || '',
    notes: '',
    lignes: (devis.lignes || []).map((l) => hydrateDocLigneFromSource(l, articles)),
  });
}

/**
 * Marque la proforma comme convertie + lie facture_id / converted_at.
 * La création de la facture FAC (avec proforma_id inverse) est faite à l'étape 4.
 */
export async function markCrmProformaConverted(proformaId, factureId) {
  const userId = await getAuthUserId();
  const existing = await getCrmProformaById(proformaId);
  if (!existing) {
    const err = new Error('Proforma introuvable.');
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (existing.statut === 'convertie' || existing.facture_id) {
    const err = new Error('Cette proforma a déjà été convertie en facture.');
    err.code = 'ALREADY_CONVERTED';
    throw err;
  }
  if (!factureId) {
    const err = new Error('Identifiant facture requis pour la conversion.');
    err.code = 'VALIDATION';
    throw err;
  }
  const { error } = await getSupabase()
    .from(TABLE)
    .update({
      statut: 'convertie',
      facture_id: factureId,
      converted_at: new Date().toISOString(),
      updated_by: userId,
    })
    .eq('id', proformaId);
  if (error) {
    console.error('[CITYMO] crmProformas mark converted', error, { proformaId, factureId });
    throw error;
  }
  return getCrmProformaById(proformaId);
}

export function computeCrmProformaTotals(lignes) {
  return computeTotals(lignes);
}

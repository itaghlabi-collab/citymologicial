/**
 * crmFactures.js — CRM Factures CRUD (Supabase crm_factures / crm_facture_lignes)
 */
import { getSupabase } from '../../lib/supabase';
import { clientDisplayName } from './clients';
import { getCrmDevisById } from './crmDevis';
import { syncFacturePaymentsToCash } from '../finance/financeSync';
import { moneyLineHt, moneyLineTtc, moneyComputeDocumentTotals, moneyToNumber } from '../../utils/decimalMoney';

const TABLE = 'crm_factures';
const LIGNES = 'crm_facture_lignes';
const PAIEMENTS = 'crm_facture_paiements';

export const CRM_FACTURE_STATUTS = [
  'brouillon', 'envoyee', 'payee', 'partiellement_payee',
  'impayee', 'en_retard', 'annulee',
];

const FACTURE_SELECT = `
  *,
  clients ( id, nom, prenom, email, telephone, ice, adresse, ville, responsable ),
  crm_devis ( id, reference )
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

function computeAcompte(form, total_ttc) {
  const raw = Number(form.acompte_montant) || 0;
  if (form.acompte_type === 'pct') return Math.round(total_ttc * (raw / 100) * 100) / 100;
  return raw;
}

function computePaiements(form, total_ttc) {
  const paiements = form.paiements || [];
  const totalPaiements = paiements.reduce((s, p) => s + Number(p.montant || 0), 0);
  const acompte = computeAcompte(form, total_ttc);
  const total_paye = Math.round((totalPaiements + acompte) * 100) / 100;
  const reste_a_payer = Math.max(0, Math.round((total_ttc - total_paye) * 100) / 100);
  return { total_paye, reste_a_payer, acompteCalc: acompte };
}

export function normalizeLigne(row) {
  if (!row) return null;
  return {
    id: row.id,
    _id: row.id,
    facture_id: row.facture_id,
    ordre: row.ordre ?? 0,
    type: row.type || 'article',
    designation: row.designation || '',
    description: row.description || '',
    article_id: row.article_id ? String(row.article_id) : '',
    categorie_id: row.categorie_id ? String(row.categorie_id) : '',
    quantite: Number(row.quantite ?? 1),
    unite: row.unite || 'unite',
    prix_ht: Number(row.prix_ht ?? 0),
    remise: Number(row.remise ?? 0),
    tva: Number(row.tva ?? 20),
    total_ht: Number(row.total_ht ?? ligneTotalHt(row)),
  };
}

export function normalizePaiement(row) {
  if (!row) return null;
  return {
    id: row.id,
    montant: Number(row.montant ?? 0),
    date: row.date_paiement || row.date || '',
    mode: row.mode || 'virement',
    reference: row.reference || '',
  };
}

export function normalizeCrmFacture(row, lignes = [], paiements = []) {
  if (!row) return null;
  const c = row.clients;
  const clientNom = clientDisplayName(c) || c?.nom || '';
  const devisRef = row.crm_devis?.reference || '';
  return {
    id: row.id,
    numero: row.numero || '',
    titre: row.titre || '',
    statut: row.statut || 'brouillon',
    date_emission: row.date_emission || row.created_at?.slice?.(0, 10) || '',
    date_echeance: row.date_echeance || '',
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
    facture_type: row.type || 'facture',
    pourcentage_acompte: row.pourcentage_acompte != null ? Number(row.pourcentage_acompte) : null,
    devise: row.devise || 'MAD',
    devis_reste_apres: row.devis_reste_apres != null ? Number(row.devis_reste_apres) : null,
    modalites_paiement: row.modalites_paiement || '',
    conditions: row.conditions || '',
    notes_internes: row.notes_internes || '',
    acompte_montant: Number(row.acompte_montant ?? 0),
    acompte_type: row.acompte_type || 'fixe',
    total_ht: Number(row.total_ht ?? 0),
    total_tva: Number(row.total_tva ?? 0),
    total_ttc: Number(row.total_ttc ?? 0),
    total_paye: Number(row.total_paye ?? 0),
    reste_a_payer: Number(row.reste_a_payer ?? 0),
    lignes: (lignes || []).map(normalizeLigne),
    paiements: (paiements || []).map(normalizePaiement),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toFactureRow(form, totals, payeInfo) {
  return {
    type: form.facture_type || form.type || 'facture',
    numero: form.numero?.trim() || '',
    titre: form.titre?.trim() || '',
    statut: form.statut || 'brouillon',
    date_emission: form.date_emission || new Date().toISOString().slice(0, 10),
    date_echeance: form.date_echeance || null,
    commercial: form.commercial?.trim() || null,
    type_projet: form.type_projet || null,
    client_id: form.client_id || null,
    devis_id: form.devis_id || null,
    modalites_paiement: form.modalites_paiement || null,
    conditions: form.conditions?.trim() || null,
    notes_internes: form.notes_internes?.trim() || null,
    acompte_montant: Number(form.acompte_montant) || 0,
    acompte_type: form.acompte_type || 'fixe',
    pourcentage_acompte: form.pourcentage_acompte != null ? Number(form.pourcentage_acompte) : null,
    devise: form.devise || 'MAD',
    devis_reste_apres: form.devis_reste_apres != null ? Number(form.devis_reste_apres) : null,
    total_ht: totals.total_ht ?? 0,
    total_tva: totals.total_tva ?? totals.total_vat ?? 0,
    total_ttc: totals.total_ttc ?? 0,
    total_paye: payeInfo.total_paye,
    reste_a_payer: payeInfo.reste_a_payer,
  };
}

function toLigneRow(ligne, factureId, ordre) {
  return {
    facture_id: factureId,
    ordre,
    type: ligne.type || 'article',
    designation: ligne.designation?.trim() || null,
    description: ligne.description?.trim() || null,
    article_id: ligne.article_id || null,
    categorie_id: ligne.categorie_id || null,
    quantite: Number(ligne.quantite) || 0,
    unite: ligne.unite || 'unite',
    prix_ht: Number(ligne.prix_ht) || 0,
    remise: Number(ligne.remise) || 0,
    tva: Number(ligne.tva) ?? 20,
    total_ht: ligneTotalHt(ligne),
  };
}

function toPaiementRow(p, factureId) {
  return {
    facture_id: factureId,
    montant: Number(p.montant) || 0,
    date_paiement: p.date || p.date_paiement || new Date().toISOString().slice(0, 10),
    mode: p.mode || 'virement',
    reference: p.reference?.trim() || null,
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

export async function generateCrmAcompteNumero() {
  await getAuthUserId();
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const prefix = `AC-${y}-${m}-`;
  const { count, error } = await getSupabase()
    .from(TABLE)
    .select('*', { count: 'exact', head: true })
    .like('numero', `${prefix}%`);
  if (error) throw error;
  const seq = String((count || 0) + 1).padStart(4, '0');
  return `${prefix}${seq}`;
}

export async function getDevisAcompteSummary(devisId) {
  await getAuthUserId();
  const devis = await getCrmDevisById(devisId);
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('id, numero, date_emission, total_ttc, acompte_montant, statut')
    .eq('devis_id', devisId)
    .eq('type', 'acompte')
    .neq('statut', 'annulee')
    .order('date_emission', { ascending: true });
  if (error) throw error;
  const acomptes = (data || []).map((a) => ({
    id: a.id,
    numero: a.numero,
    date: a.date_emission,
    montant: Number(a.total_ttc || 0),
  }));
  const dejaFacture = acomptes.reduce((s, a) => s + a.montant, 0);
  const devisTTC = Number(devis.total_ttc || 0);
  const resteAFacturer = Math.max(0, Math.round((devisTTC - dejaFacture) * 100) / 100);
  return { devis, acomptes, dejaFacture, resteAFacturer, devisTTC };
}

export async function createCrmFactureAcompte(form) {
  await getAuthUserId();
  const summary = await getDevisAcompteSummary(form.devis_id);
  const devis = summary.devis;
  const acompteTTC = Math.round(Number(form.acompte_ttc || 0) * 100) / 100;

  if (acompteTTC <= 0) {
    const err = new Error('Le montant de l\'acompte doit être supérieur à 0.');
    err.code = 'VALIDATION';
    throw err;
  }
  if (acompteTTC > summary.resteAFacturer + 0.01) {
    const err = new Error('Le montant dépasse le reste à facturer sur ce devis.');
    err.code = 'VALIDATION';
    throw err;
  }

  const devisHT = Number(devis.total_ht || 0);
  const devisTVA = Number(devis.total_tva || 0);
  const tvaRate = devisHT > 0 ? devisTVA / devisHT : 0.2;
  const acompteHT = Math.round((acompteTTC / (1 + tvaRate)) * 100) / 100;
  const acompteTVA = Math.round((acompteTTC - acompteHT) * 100) / 100;
  const tvaPct = Math.round(tvaRate * 10000) / 100;
  const resteApres = Math.max(0, Math.round((summary.resteAFacturer - acompteTTC) * 100) / 100);
  const pct = form.mode === 'pct' ? Number(form.valeur) : (summary.devisTTC > 0 ? (acompteTTC / summary.devisTTC) * 100 : 0);

  const numero = form.numero?.trim() || await generateCrmAcompteNumero();
  const ligneDesc = form.mode === 'pct'
    ? `Acompte de ${Number(form.valeur)}% sur le devis ${devis.reference}`
    : `Acompte forfaitaire sur le devis ${devis.reference}`;

  const payload = {
    facture_type: 'acompte',
    numero,
    titre: form.titre || `Facture acompte — ${devis.reference}`,
    statut: form.statut || 'brouillon',
    date_emission: form.date_emission || new Date().toISOString().slice(0, 10),
    date_echeance: form.date_echeance || null,
    commercial: devis.commercial || null,
    client_id: devis.client_id || null,
    devis_id: form.devis_id,
    devise: form.devise || 'MAD',
    acompte_montant: acompteTTC,
    acompte_type: form.mode === 'pct' ? 'pct' : 'fixe',
    pourcentage_acompte: form.mode === 'pct' ? pct : null,
    devis_reste_apres: resteApres,
    total_ht: acompteHT,
    total_tva: acompteTVA,
    total_ttc: acompteTTC,
    total_paye: 0,
    reste_a_payer: acompteTTC,
    lignes: [{
      type: 'article',
      designation: `Acompte — ${devis.reference}`,
      description: ligneDesc,
      quantite: 1,
      unite: 'forfait',
      prix_ht: acompteHT,
      remise: 0,
      tva: tvaPct,
    }],
    paiements: [],
  };

  const row = toFactureRow(payload, { total_ht: acompteHT, total_tva: acompteTVA, total_ttc: acompteTTC }, {
    total_paye: 0,
    reste_a_payer: acompteTTC,
  });

  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([{ ...row, numero }])
    .select('*')
    .single();
  if (error) {
    console.error('[CITYMO] crmFactures acompte insert', error, row);
    throw error;
  }
  await upsertLignes(data.id, payload.lignes);
  return getCrmFactureById(data.id);
}

export async function generateCrmFactureNumero() {
  await getAuthUserId();
  const year = new Date().getFullYear();
  const prefix = `FAC-${year}-`;
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('numero')
    .ilike('numero', `${prefix}%`);
  if (error) throw error;
  let maxSeq = 0;
  const re = new RegExp(`^FAC-${year}-(\\d+)$`, 'i');
  for (const row of data || []) {
    const match = String(row.numero || '').match(re);
    if (match) maxSeq = Math.max(maxSeq, parseInt(match[1], 10));
  }
  return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
}

async function fetchLignes(factureId) {
  const { data, error } = await getSupabase()
    .from(LIGNES)
    .select('*')
    .eq('facture_id', factureId)
    .order('ordre', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function fetchPaiements(factureId) {
  const { data, error } = await getSupabase()
    .from(PAIEMENTS)
    .select('*')
    .eq('facture_id', factureId)
    .order('date_paiement', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function listCrmFactures() {
  await getAuthUserId();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select(FACTURE_SELECT)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[CITYMO] crmFactures list', error);
    throw error;
  }
  return (data || []).map((row) => normalizeCrmFacture(row, [], []));
}

export async function getCrmFactureById(id) {
  await getAuthUserId();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select(FACTURE_SELECT)
    .eq('id', id)
    .single();
  if (error) {
    console.error('[CITYMO] crmFactures get', error, { id });
    throw error;
  }
  const [lignes, paiements] = await Promise.all([fetchLignes(id), fetchPaiements(id)]);
  return normalizeCrmFacture(data, lignes, paiements);
}

async function upsertLignes(factureId, lignes) {
  await getSupabase().from(LIGNES).delete().eq('facture_id', factureId);
  const rows = (lignes || [])
    .filter((l) => l.type !== 'article' || l.designation?.trim() || l.article_id)
    .map((l, i) => toLigneRow(l, factureId, i));
  if (rows.length === 0) return;
  const { error } = await getSupabase().from(LIGNES).insert(rows);
  if (error) {
    console.error('[CITYMO] crmFactures lignes insert', error, rows);
    throw error;
  }
}

async function upsertPaiements(factureId, paiements) {
  await getSupabase().from(PAIEMENTS).delete().eq('facture_id', factureId);
  const rows = (paiements || [])
    .filter((p) => Number(p.montant) > 0)
    .map((p) => toPaiementRow(p, factureId));
  if (rows.length === 0) return [];
  const { data, error } = await getSupabase().from(PAIEMENTS).insert(rows).select('*');
  if (error) {
    console.error('[CITYMO] crmFactures paiements insert', error, rows);
    throw error;
  }
  return (data || []).map(normalizePaiement);
}

export async function createCrmFacture(form) {
  await getAuthUserId();
  const computed = computeTotals(form.lignes);
  const totals = {
    total_ht: computed.total_ht || Number(form.total_ht) || 0,
    total_tva: computed.total_tva || Number(form.total_tva) || 0,
    total_ttc: computed.total_ttc || Number(form.total_ttc) || 0,
  };
  const payeInfo = computePaiements(form, totals.total_ttc);
  const numero = form.numero?.trim() || await generateCrmFactureNumero();
  const row = { ...toFactureRow({ ...form, numero, facture_type: 'facture' }, totals, payeInfo), numero };

  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([row])
    .select('*')
    .single();
  if (error) {
    console.error('[CITYMO] crmFactures insert', error, row);
    throw error;
  }
  await upsertLignes(data.id, form.lignes || []);
  await upsertPaiements(data.id, form.paiements || []);
  const facture = await getCrmFactureById(data.id);
  await syncFacturePaymentsToCash(facture).catch((err) => console.warn('[CITYMO] sync facture → caisse', err));
  return facture;
}

export async function updateCrmFacture(id, form) {
  await getAuthUserId();
  const computed = computeTotals(form.lignes);
  const totals = {
    total_ht: computed.total_ht || Number(form.total_ht) || 0,
    total_tva: computed.total_tva || Number(form.total_tva) || 0,
    total_ttc: computed.total_ttc || Number(form.total_ttc) || 0,
  };
  const payeInfo = computePaiements(form, totals.total_ttc);
  const row = toFactureRow(form, totals, payeInfo);

  const { error } = await getSupabase()
    .from(TABLE)
    .update(row)
    .eq('id', id);
  if (error) {
    console.error('[CITYMO] crmFactures update', error, { id, row });
    throw error;
  }
  await upsertLignes(id, form.lignes || []);
  await upsertPaiements(id, form.paiements || []);
  const facture = await getCrmFactureById(id);
  await syncFacturePaymentsToCash(facture).catch((err) => console.warn('[CITYMO] sync facture → caisse', err));
  return facture;
}

/**
 * Marque une facture comme payée :
 * - ajoute un règlement du reste à payer (si besoin)
 * - statut → payee, reste_a_payer → 0
 */
export async function markCrmFacturePaid(id, options = {}) {
  await getAuthUserId();
  const facture = await getCrmFactureById(id);
  if (!facture) {
    const err = new Error('Facture introuvable.');
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (facture.statut === 'annulee') {
    const err = new Error('Impossible de marquer une facture annulée comme payée.');
    err.code = 'VALIDATION';
    throw err;
  }
  if (facture.statut === 'payee' && Number(facture.reste_a_payer) <= 0) {
    return facture;
  }

  const totalTtc = Number(facture.total_ttc) || 0;
  const dejaPaye = (facture.paiements || []).reduce((s, p) => s + (Number(p.montant) || 0), 0)
    + (Number(facture.acompte_montant) || 0);
  const reste = Math.max(0, Math.round((totalTtc - dejaPaye) * 100) / 100);
  const today = new Date().toISOString().slice(0, 10);

  const paiements = [...(facture.paiements || [])];
  if (reste > 0) {
    paiements.push({
      montant: reste,
      date: options.date || today,
      mode: options.mode || 'virement',
      reference: options.reference || 'Règlement complet',
    });
  }

  return updateCrmFacture(id, {
    ...facture,
    statut: 'payee',
    paiements,
    total_paye: totalTtc,
    reste_a_payer: 0,
  });
}

export async function deleteCrmFacture(id) {
  await getAuthUserId();
  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) {
    console.error('[CITYMO] crmFactures delete', error, { id });
    throw error;
  }
}

export async function duplicateCrmFacture(id) {
  const original = await getCrmFactureById(id);
  const numero = await generateCrmFactureNumero();
  return createCrmFacture({
    ...original,
    id: undefined,
    numero,
    titre: `${original.titre} (copie)`,
    statut: 'brouillon',
    date_emission: new Date().toISOString().slice(0, 10),
    paiements: [],
    lignes: (original.lignes || []).map((l) => ({ ...l, id: undefined, _id: undefined })),
  });
}

function addDaysIso(isoDate, days) {
  const d = isoDate ? new Date(isoDate) : new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Crée une facture complète à partir d'un devis (lignes, client, conditions). */
export async function createCrmFactureFromDevis(devisId) {
  await getAuthUserId();
  const devis = await getCrmDevisById(devisId);

  const { data: existing, error: existErr } = await getSupabase()
    .from(TABLE)
    .select('id, numero')
    .eq('devis_id', devisId)
    .eq('type', 'facture')
    .neq('statut', 'annulee')
    .maybeSingle();
  if (existErr) throw existErr;
  if (existing?.id) {
    const err = new Error(`Une facture existe déjà pour ce devis : ${existing.numero}`);
    err.code = 'DUPLICATE';
    err.factureId = existing.id;
    throw err;
  }

  const today = new Date().toISOString().slice(0, 10);
  return createCrmFacture({
    devis_id: devisId,
    client_id: devis.client_id || '',
    commercial: devis.commercial || '',
    type_projet: devis.type_projet || '',
    modalites_paiement: devis.modalites_paiement || '',
    conditions: devis.conditions || '',
    titre: devis.titre ? `Facture — ${devis.titre}` : `Facture — ${devis.reference}`,
    statut: 'envoyee',
    date_emission: today,
    date_echeance: addDaysIso(devis.date_validite || today, 30),
    total_ht: devis.total_ht,
    total_tva: devis.total_tva,
    total_ttc: devis.total_ttc,
    lignes: (devis.lignes || []).map((l) => ({
      ...l,
      id: undefined,
      _id: undefined,
      devis_id: undefined,
      facture_id: undefined,
    })),
    paiements: [],
    acompte_montant: 0,
    acompte_type: 'fixe', // contrainte DB : 'fixe' | 'pct' uniquement
  });
}

export function filterCrmFactures(records, filters = {}) {
  const {
    search = '', statut = '', commercial = '', client_id = '',
    date = '', montant_min = '', montant_max = '',
  } = filters;

  return (records || []).filter((f) => {
    if (statut && f.statut !== statut) return false;
    if (commercial && f.commercial !== commercial) return false;
    if (client_id && String(f.client_id) !== String(client_id)) return false;
    if (date && f.date_emission !== date) return false;
    if (montant_min !== '' && Number(f.total_ttc) < Number(montant_min)) return false;
    if (montant_max !== '' && Number(f.total_ttc) > Number(montant_max)) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = `${f.numero || ''} ${f.titre || ''} ${f.client_nom || ''} ${f.commercial || ''} ${f.devis_reference || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function computeCrmFactureStats(records) {
  const list = records || [];
  const now = new Date();
  return {
    totalFacture: list.reduce((s, f) => s + Number(f.total_ttc || 0), 0),
    totalEncaisse: list.reduce((s, f) => s + Number(f.total_paye || 0), 0),
    totalReste: list.reduce((s, f) => s + Number(f.reste_a_payer || 0), 0),
    nImpayees: list.filter((f) => f.statut === 'impayee' || f.statut === 'envoyee').length,
    nEnRetard: list.filter((f) => {
      if (f.statut === 'payee' || f.statut === 'annulee') return false;
      if (f.statut === 'en_retard') return true;
      return f.date_echeance && new Date(f.date_echeance) < now;
    }).length,
    totalAcomptes: list
      .filter((f) => f.facture_type === 'acompte')
      .reduce((s, f) => s + Number(f.total_ttc || 0), 0),
  };
}

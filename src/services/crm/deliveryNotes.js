/**
 * deliveryNotes.js — CRM Bons de livraison (Supabase delivery_notes / delivery_note_items)
 */
import { getSupabase } from '../../lib/supabase';
import { clientDisplayName } from './clients';
import { getCrmDevisById } from './crmDevis';

const TABLE = 'delivery_notes';
const ITEMS = 'delivery_note_items';

const NOTE_SELECT = `
  *,
  clients ( id, nom, prenom, email, telephone, ice, adresse, ville, responsable )
`;

export function computeLigneStats(lignes = []) {
  const list = (lignes || []).filter((l) => l.designation?.trim() || l.article_id);
  const total_articles = list.length;
  const total_commandees = list.reduce((s, l) => s + Number(l.quantite_commandee || 0), 0);
  const total_livrees = list.reduce((s, l) => s + Number(l.quantite_livree || 0), 0);
  const total_restantes = list.reduce((s, l) => s + Number(l.quantite_restante ?? Math.max(0, Number(l.quantite_commandee || 0) - Number(l.quantite_livree || 0))), 0);
  const pct_livre = total_commandees > 0
    ? Math.min(100, Math.round((total_livrees / total_commandees) * 100))
    : 0;
  return { total_articles, total_commandees, total_livrees, total_restantes, pct_livre };
}

export function normalizeLigne(row) {
  if (!row) return null;
  return {
    id: row.id,
    _id: row.id,
    delivery_note_id: row.delivery_note_id,
    ordre: row.ordre ?? 0,
    article_id: row.article_id ? String(row.article_id) : '',
    categorie_id: row.categorie_id ? String(row.categorie_id) : '',
    designation: row.designation || '',
    description: row.description || '',
    unite: row.unite || 'unite',
    quantite_commandee: Number(row.quantite_commandee ?? 1),
    quantite_livree: Number(row.quantite_livree ?? 0),
    quantite_restante: Number(row.quantite_restante ?? 0),
    observation: row.remarque || '',
    remarque: row.remarque || '',
    statut_ligne: row.statut_ligne || 'a_livrer',
  };
}

export function normalizeDeliveryNote(row, lignes = []) {
  if (!row) return null;
  const c = row.clients;
  const clientNom = row.client_nom || clientDisplayName(c) || c?.nom || '';
  const stats = computeLigneStats(lignes);
  return {
    id: row.id,
    numero: row.numero || '',
    statut: row.statut || 'brouillon',
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
    adresse_livraison: row.adresse_livraison || '',
    date_livraison: row.date_livraison || '',
    date_echeance: row.date_echeance || '',
    commercial: row.commercial || '',
    prepare_par: row.prepare_par || row.commercial || '',
    projet: row.projet || '',
    devis_id: row.devis_id ? String(row.devis_id) : '',
    facture_id: row.facture_id ? String(row.facture_id) : '',
    devis_reference: row.devis_reference || '',
    facture_reference: row.facture_reference || '',
    contact_reception: row.contact_reception || '',
    tel_reception: row.tel_reception || '',
    remarques: row.remarques || '',
    notes_internes: row.notes_internes || '',
    signature_client: row.signature_client || '',
    date_validation: row.date_validation || '',
    est_facture: !!row.est_facture,
    pct_livre: Number(row.pct_livre ?? stats.pct_livre),
    total_articles: Number(row.total_articles ?? stats.total_articles),
    total_commandees: Number(row.total_commandees ?? stats.total_commandees),
    total_livrees: Number(row.total_livrees ?? stats.total_livrees),
    total_restantes: Number(row.total_restantes ?? stats.total_restantes),
    lignes: (lignes || []).map(normalizeLigne),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toNoteRow(form, stats) {
  return {
    numero: form.numero?.trim() || '',
    statut: form.statut || 'brouillon',
    client_id: form.client_id || null,
    client_nom: form.client_nom?.trim() || null,
    adresse_livraison: form.adresse_livraison?.trim() || null,
    date_livraison: form.date_livraison || new Date().toISOString().slice(0, 10),
    date_echeance: form.date_echeance || null,
    commercial: form.commercial?.trim() || null,
    prepare_par: form.prepare_par?.trim() || form.commercial?.trim() || null,
    projet: form.projet?.trim() || null,
    devis_id: form.devis_id || null,
    facture_id: form.facture_id || null,
    devis_reference: form.devis_reference?.trim() || null,
    facture_reference: form.facture_reference?.trim() || null,
    contact_reception: form.contact_reception?.trim() || null,
    tel_reception: form.tel_reception?.trim() || null,
    remarques: form.remarques?.trim() || null,
    notes_internes: form.notes_internes?.trim() || null,
    signature_client: form.signature_client?.trim() || null,
    date_validation: form.date_validation || null,
    est_facture: !!form.est_facture,
    pct_livre: stats.pct_livre,
    total_articles: stats.total_articles,
    total_commandees: stats.total_commandees,
    total_livrees: stats.total_livrees,
    total_restantes: stats.total_restantes,
  };
}

function toItemRow(ligne, noteId, ordre) {
  const cmd = Number(ligne.quantite_commandee) || 0;
  const liv = Number(ligne.quantite_livree) || 0;
  const rest = ligne.quantite_restante != null && ligne.quantite_restante !== ''
    ? Number(ligne.quantite_restante)
    : Math.max(0, cmd - liv);
  return {
    delivery_note_id: noteId,
    ordre,
    article_id: ligne.article_id || null,
    categorie_id: ligne.categorie_id || null,
    designation: ligne.designation?.trim() || null,
    description: ligne.description?.trim() || null,
    unite: ligne.unite || 'unite',
    quantite_commandee: cmd,
    quantite_livree: liv,
    quantite_restante: rest,
    remarque: (ligne.observation || ligne.remarque || '').trim() || null,
    statut_ligne: ligne.statut_ligne || 'a_livrer',
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

export async function generateDeliveryNoteNumero() {
  await getAuthUserId();
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const prefix = `BL-${y}${m}-`;
  const { count, error } = await getSupabase()
    .from(TABLE)
    .select('*', { count: 'exact', head: true })
    .like('numero', `${prefix}%`);
  if (error) throw error;
  const seq = String((count || 0) + 1).padStart(4, '0');
  return `${prefix}${seq}`;
}

async function fetchItems(noteId) {
  const { data, error } = await getSupabase()
    .from(ITEMS)
    .select('*')
    .eq('delivery_note_id', noteId)
    .order('ordre', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function upsertItems(noteId, lignes) {
  await getSupabase().from(ITEMS).delete().eq('delivery_note_id', noteId);
  const rows = (lignes || [])
    .filter((l) => l.designation?.trim() || l.article_id)
    .map((l, i) => toItemRow(l, noteId, i));
  if (rows.length === 0) return;
  const { error } = await getSupabase().from(ITEMS).insert(rows);
  if (error) {
    console.error('[CITYMO] deliveryNotes items insert', error, rows);
    throw error;
  }
}

export async function listDeliveryNotes() {
  await getAuthUserId();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select(NOTE_SELECT)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[CITYMO] deliveryNotes list', error);
    throw error;
  }
  return (data || []).map((row) => normalizeDeliveryNote(row, []));
}

export async function getDeliveryNoteById(id) {
  await getAuthUserId();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select(NOTE_SELECT)
    .eq('id', id)
    .single();
  if (error) {
    console.error('[CITYMO] deliveryNotes get', error, { id });
    throw error;
  }
  const items = await fetchItems(id);
  return normalizeDeliveryNote(data, items);
}

export async function createDeliveryNote(form) {
  await getAuthUserId();
  const stats = computeLigneStats(form.lignes);
  const numero = form.numero?.trim() || await generateDeliveryNoteNumero();
  const row = { ...toNoteRow({ ...form, numero }, stats), numero };

  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert([row])
    .select('*')
    .single();
  if (error) {
    console.error('[CITYMO] deliveryNotes insert', error, row);
    throw error;
  }
  await upsertItems(data.id, form.lignes || []);
  return getDeliveryNoteById(data.id);
}

export async function updateDeliveryNote(id, form) {
  await getAuthUserId();
  const stats = computeLigneStats(form.lignes);
  const row = toNoteRow(form, stats);

  const { error } = await getSupabase()
    .from(TABLE)
    .update(row)
    .eq('id', id);
  if (error) {
    console.error('[CITYMO] deliveryNotes update', error, { id, row });
    throw error;
  }
  await upsertItems(id, form.lignes || []);
  return getDeliveryNoteById(id);
}

export async function deleteDeliveryNote(id) {
  await getAuthUserId();
  const { error } = await getSupabase().from(TABLE).delete().eq('id', id);
  if (error) {
    console.error('[CITYMO] deliveryNotes delete', error, { id });
    throw error;
  }
}

export async function duplicateDeliveryNote(id) {
  const original = await getDeliveryNoteById(id);
  const numero = await generateDeliveryNoteNumero();
  return createDeliveryNote({
    ...original,
    id: undefined,
    numero,
    statut: 'brouillon',
    date_livraison: new Date().toISOString().slice(0, 10),
    date_validation: '',
    signature_client: '',
    est_facture: false,
    lignes: (original.lignes || []).map((l) => ({
      ...l,
      id: undefined,
      _id: undefined,
      quantite_livree: 0,
      quantite_restante: l.quantite_commandee,
      statut_ligne: 'a_livrer',
    })),
  });
}

export async function createDeliveryNoteFromDevis(devisId, extra = {}) {
  const dv = await getCrmDevisById(devisId);
  const lignes = (dv.lignes || [])
    .filter((l) => l.type === 'article')
    .map((l) => ({
      article_id: l.article_id || '',
      categorie_id: l.categorie_id || '',
      designation: l.designation || '',
      description: l.description || '',
      quantite_commandee: Number(l.quantite) || 1,
      quantite_livree: 0,
      quantite_restante: Number(l.quantite) || 1,
      unite: l.unite || 'unite',
      observation: '',
      statut_ligne: 'a_livrer',
    }));

  return createDeliveryNote({
    client_id: dv.client_id,
    client_nom: dv.client_nom,
    commercial: dv.commercial,
    prepare_par: dv.commercial,
    projet: dv.type_projet || '',
    devis_id: devisId,
    devis_reference: dv.reference,
    adresse_livraison: extra.adresse_livraison || '',
    date_livraison: new Date().toISOString().slice(0, 10),
    statut: 'brouillon',
    lignes: lignes.length ? lignes : [{ designation: '', quantite_commandee: 1, quantite_livree: 0, quantite_restante: 1, unite: 'unite' }],
    ...extra,
  });
}

export function filterDeliveryNotes(records, filters = {}) {
  const {
    search = '',
    statut = '',
    commercial = '',
    client_id = '',
    date = '',
  } = filters;

  return (records || []).filter((b) => {
    if (statut && b.statut !== statut) return false;
    if (commercial && b.commercial !== commercial) return false;
    if (client_id && String(b.client_id) !== String(client_id)) return false;
    if (date && b.date_livraison !== date) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = `${b.numero || ''} ${b.client_nom || ''} ${b.projet || ''} ${b.commercial || ''} ${b.devis_reference || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function computeDeliveryNoteStats(records) {
  const list = records || [];
  return {
    total: list.length,
    enAttente: list.filter((b) => ['en_attente', 'preparation', 'brouillon'].includes(b.statut)).length,
    livres: list.filter((b) => b.statut === 'livre').length,
    liesDevis: list.filter((b) => b.devis_id).length,
    factures: list.filter((b) => b.est_facture || b.statut === 'facture').length,
    enRetard: list.filter((b) => {
      if (!b.date_echeance || ['livre', 'annule', 'facture'].includes(b.statut)) return false;
      return new Date(b.date_echeance) < new Date();
    }).length,
  };
}

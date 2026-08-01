/**
 * mouvementRapide.js — Mouvement rapide (single-article) via stock_movements existant.
 * Réutilise intégralement saveStockMovementBon / validateStockMovementBon / deleteStockMovementBon.
 * Préfixe MR- au lieu de BM- pour distinguer dans l'historique.
 */
import { getSupabase } from '../../lib/supabase';
import { requireSupabaseUserId } from '../supabase/requireUser';
import {
  saveStockMovementBon,
  normalizeStockMovement,
  deleteStockMovementBon,
} from './stockMovements';
import { computeArticleStock, listStockLevelsForArticle, getStockArticleById } from './stockArticles';
import {
  assertMovementAllowedForArticle,
  normalizeArticleType,
  SORTIE_BLOCKED_MESSAGE,
} from './articleMovementRules';

const TABLE = 'stock_movements';
const ARTICLES = 'stock_articles';

export async function generateMRRef() {
  const y = new Date().getFullYear();
  const prefix = `MR-${y}-`;
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('ref_mouvement')
    .ilike('ref_mouvement', `${prefix}%`);
  if (error) throw error;
  let max = 0;
  (data || []).forEach((r) => {
    const m = String(r.ref_mouvement || '').match(/-(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return `${prefix}${String(max + 1).padStart(5, '0')}`;
}

/**
 * Enregistre un mouvement rapide (1 article, validation immédiate).
 * @param {Object} form
 * @param {string} form.type_mouvement - 'Entrée' | 'Sortie' | 'Transfert'
 * @param {string} form.article_id
 * @param {number} form.quantite
 * @param {string} form.emplacement_source
 * @param {string} form.emplacement_destination
 * @param {string} form.date_creation
 * @param {string} form.motif
 * @param {string} [form.cree_par]
 * @param {string} [form.note]
 * @param {string} [form.projet]
 * @param {string} [form.beneficiaire]
 * @param {string} [form.fournisseur]
 * @param {string} [form.ref_externe]
 */
export async function saveMouvementRapide(form) {
  const articleId = form.article_id;
  if (!articleId) {
    const err = new Error('Sélectionnez un article.');
    err.code = 'VALIDATION';
    throw err;
  }

  const article = await getStockArticleById(articleId);
  if (!article) {
    const err = new Error('Article introuvable.');
    err.code = 'VALIDATION';
    throw err;
  }
  assertMovementAllowedForArticle(article, form.type_mouvement);

  const ref = await generateMRRef();

  const bon = {
    ref,
    type_mouvement: form.type_mouvement,
    emplacement_source: form.emplacement_source || '',
    emplacement_destination: form.emplacement_destination || '',
    date_creation: form.date_creation || new Date().toISOString().slice(0, 10),
    motif: form.motif || '',
    cree_par: form.cree_par || '',
    note: [
      form.note || '',
      form.projet ? `Projet: ${form.projet}` : '',
      form.beneficiaire ? `Bénéficiaire: ${form.beneficiaire}` : '',
      form.fournisseur ? `Fournisseur: ${form.fournisseur}` : '',
      form.ref_externe ? `Réf. externe: ${form.ref_externe}` : '',
    ].filter(Boolean).join(' | '),
    statut: 'Validé',
    lignes: [{
      article_id: form.article_id,
      quantite: Number(form.quantite) || 0,
      notes: '',
    }],
  };

  return saveStockMovementBon(bon);
}

/**
 * Annule un mouvement rapide en créant le mouvement inverse.
 */
export async function annulerMouvementRapide(refOriginal, motifAnnulation, userName) {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*, stock_articles(reference, nom)')
    .eq('ref_mouvement', refOriginal)
    .order('created_at', { ascending: true });
  if (error) throw error;
  if (!data?.length) {
    const err = new Error('Mouvement introuvable.');
    err.code = 'VALIDATION';
    throw err;
  }

  const first = data[0];
  const p = first.payload || {};

  if (p.statut === 'Annulé' || p.annule_par) {
    const err = new Error('Ce mouvement est déjà annulé.');
    err.code = 'VALIDATION';
    throw err;
  }

  const type = first.type_mouvement || '';
  let inverseType = type;
  let inverseSrc = p.emplacement_destination || '';
  let inverseDest = p.emplacement_source || '';

  if (type === 'Entree') {
    inverseType = 'Sortie';
    inverseSrc = p.emplacement_destination || '';
    inverseDest = '';
  } else if (type === 'Sortie') {
    inverseType = 'Entree';
    inverseSrc = '';
    inverseDest = p.emplacement_source || '';
  }

  const inverseRef = await generateMRRef();
  const uid = await requireSupabaseUserId();

  const inverseBon = {
    ref: inverseRef,
    type_mouvement: inverseType === 'Entree' ? 'Entrée' : inverseType,
    emplacement_source: inverseSrc,
    emplacement_destination: inverseDest,
    date_creation: new Date().toISOString().slice(0, 10),
    motif: `Annulation de ${refOriginal} — ${motifAnnulation || 'sans motif'}`,
    cree_par: userName || '',
    note: `Annulation du mouvement ${refOriginal}`,
    statut: 'Validé',
    lignes: data.map((row) => ({
      article_id: row.article_id ? String(row.article_id) : '',
      quantite: Number(row.quantite) || 0,
      notes: '',
    })),
  };

  const saved = await saveStockMovementBon(inverseBon);

  // Mark original as cancelled
  await Promise.all(data.map((row) =>
    getSupabase()
      .from(TABLE)
      .update({
        payload: {
          ...(row.payload || {}),
          statut: 'Annulé',
          annule_par: inverseRef,
          motif_annulation: motifAnnulation || '',
          date_annulation: new Date().toISOString(),
        },
      })
      .eq('id', row.id)
  ));

  return { inverseRef, inverseBon: saved };
}

/**
 * Liste les mouvements rapides (MR-*).
 */
export async function listMouvementsRapides() {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*, stock_articles(reference, nom)')
    .ilike('ref_mouvement', 'MR-%')
    .order('date_mouvement', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((row) => normalizeStockMovement(row));
}

/**
 * Supprime un mouvement rapide (inverse le stock si appliqué, puis efface les lignes).
 * Réutilise deleteStockMovementBon.
 */
export async function deleteMouvementRapide(ref) {
  if (!ref || !String(ref).startsWith('MR-')) {
    const err = new Error('Référence mouvement rapide invalide.');
    err.code = 'VALIDATION';
    throw err;
  }
  await deleteStockMovementBon(ref);
}

/**
 * Stock actuel d'un article par emplacement.
 */
export async function getArticleStockInfo(articleId) {
  const totalStock = await computeArticleStock(articleId);
  const levels = await listStockLevelsForArticle(articleId);
  return { totalStock, levels };
}

/**
 * Audit lecture seule : sorties historiques par type d’article.
 * Ne modifie aucun mouvement.
 */
export async function auditHistoricalSortiesByArticleType() {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('id, ref_mouvement, type_mouvement, article_id, quantite, date_mouvement, payload, stock_articles(reference, nom, article_type)')
    .in('type_mouvement', ['Sortie', 'sortie'])
    .order('date_mouvement', { ascending: false });
  if (error) throw error;

  const rows = (data || []).map((row) => {
    const p = row.payload || {};
    const art = row.stock_articles || {};
    const articleType = normalizeArticleType(art.article_type);
    return {
      reference: row.ref_mouvement || '',
      article_code: art.reference || '',
      article_nom: art.nom || '',
      article_type: articleType || art.article_type || '—',
      quantite: Number(row.quantite) || 0,
      source: p.emplacement_source || '',
      destination: p.emplacement_destination || '',
      date: row.date_mouvement || '',
      statut: p.statut || '',
      categorie: articleType === 'Matériel' || articleType === 'Outil'
        ? 'sortie_materiel_ou_outil'
        : (articleType === 'Consommable' ? 'sortie_consommable' : 'sortie_autre'),
    };
  });

  return {
    total: rows.length,
    materiel_outil: rows.filter((r) => r.categorie === 'sortie_materiel_ou_outil'),
    consommable: rows.filter((r) => r.categorie === 'sortie_consommable'),
    autre: rows.filter((r) => r.categorie === 'sortie_autre'),
    rows,
    message: SORTIE_BLOCKED_MESSAGE,
  };
}

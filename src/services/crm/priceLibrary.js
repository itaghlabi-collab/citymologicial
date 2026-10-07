/**
 * priceLibrary.js — CRM › Bibliothèque de prix.
 * Lecture seule : agrège les lignes de tous les devis et factures (crm_devis_lignes / crm_facture_lignes)
 * par désignation + unité, et exporte en Excel. Aucune écriture en base.
 */
import * as XLSX from 'xlsx';
import { getSupabase } from '../../lib/supabase';
import { clientDisplayName } from './clients';
import { normalizeLigne as normalizeDevisLigne } from './crmDevis';
import { normalizeLigne as normalizeFactureLigne } from './crmFactures';

const PAGE = 1000;
const CACHE_TTL_MS = 10 * 60 * 1000;
const LINE_COLUMNS = 'type, designation, description, categorie_id, unite, quantite, prix_ht, remise, tva, total_ht';
const ACOMPTE_LINE_RE = /^\s*(facture\s+d['’]\s*)?acompte\b/i;

let cache = null;

function isFactureAcompte(f) {
  return f?.type === 'acompte' || /^AC-/i.test(String(f?.numero || ''));
}

async function fetchAll(table, select, orderCol = 'id') {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await getSupabase()
      .from(table)
      .select(select)
      .order(orderCol, { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

function normKey(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, ' ')
    .trim();
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Charge et met à plat toutes les lignes article des devis et factures (cache 10 min, `force` pour recharger). */
export async function loadPriceLines({ force = false } = {}) {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;

  const { data: { session } } = await getSupabase().auth.getSession();
  if (!session?.user) {
    const err = new Error('Session requise.');
    err.code = 'AUTH';
    throw err;
  }

  const [devis, factures, devisLignes, factureLignes, categories] = await Promise.all([
    fetchAll('crm_devis', 'id, reference, statut, date_creation, clients ( nom, prenom )'),
    fetchAll('crm_factures', 'id, numero, type, statut, date_emission, clients ( nom, prenom )'),
    fetchAll('crm_devis_lignes', `id, devis_id, ${LINE_COLUMNS}`),
    fetchAll('crm_facture_lignes', `id, facture_id, ${LINE_COLUMNS}`),
    fetchAll('categories', 'id, nom').catch(() => []),
  ]);

  const catById = new Map((categories || []).map((c) => [String(c.id), c.nom || '']));
  const devisById = new Map(devis.map((d) => [d.id, d]));
  const facturesHorsAcompte = factures.filter((f) => !isFactureAcompte(f));
  const factureById = new Map(facturesHorsAcompte.map((f) => [f.id, f]));

  const lines = [];
  const push = (l, doc, source) => {
    if (!doc || l.type !== 'article') return;
    const designation = String(l.designation || '').trim();
    if (!designation || ACOMPTE_LINE_RE.test(designation)) return;
    const prix = round2(l.prix_ht);
    const remise = Number(l.remise) || 0;
    lines.push({
      source,
      reference: source === 'Devis' ? doc.reference : doc.numero,
      date: String((source === 'Devis' ? doc.date_creation : doc.date_emission) || '').slice(0, 10),
      statut: doc.statut || '',
      client: clientDisplayName(doc.clients) || '',
      designation,
      description: String(l.description || '').trim(),
      categorie: catById.get(String(l.categorie_id || '')) || '',
      unite: String(l.unite || 'unite').trim(),
      quantite: Number(l.quantite) || 0,
      prix_ht: prix,
      remise,
      prix_net: round2(prix * (1 - remise / 100)),
      tva: Number(l.tva ?? 20),
    });
  };

  devisLignes.forEach((row) => push(normalizeDevisLigne(row), devisById.get(row.devis_id), 'Devis'));
  factureLignes.forEach((row) => push(normalizeFactureLigne(row), factureById.get(row.facture_id), 'Facture'));

  lines.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const data = { lines, nbDevis: devis.length, nbFactures: facturesHorsAcompte.length };
  cache = { at: Date.now(), data };
  return data;
}

/** Regroupe par désignation + unité. Les prix à 0 sont exclus des statistiques. */
export function buildPriceLibrary(lines) {
  const groups = new Map();
  (lines || []).forEach((l) => {
    const key = `${normKey(l.designation)}|${normKey(l.unite)}`;
    let g = groups.get(key);
    if (!g) {
      g = { key, labels: new Map(), unite: l.unite, categories: new Map(), rows: [] };
      groups.set(key, g);
    }
    g.labels.set(l.designation, (g.labels.get(l.designation) || 0) + 1);
    if (l.categorie) g.categories.set(l.categorie, (g.categories.get(l.categorie) || 0) + 1);
    g.rows.push(l);
  });

  const mostFrequent = (m) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';

  return [...groups.values()].map((g) => {
    const priced = g.rows.filter((r) => r.prix_ht > 0);
    const prices = priced.map((r) => r.prix_ht);
    const last = priced[0] || g.rows[0];
    const sum = prices.reduce((s, p) => s + p, 0);
    return {
      designation: mostFrequent(g.labels),
      categorie: mostFrequent(g.categories),
      unite: g.unite,
      nb: g.rows.length,
      nbDevis: g.rows.filter((r) => r.source === 'Devis').length,
      nbFactures: g.rows.filter((r) => r.source === 'Facture').length,
      prixMin: prices.length ? round2(Math.min(...prices)) : 0,
      prixMoyen: prices.length ? round2(sum / prices.length) : 0,
      prixMax: prices.length ? round2(Math.max(...prices)) : 0,
      dernierPrix: last ? last.prix_ht : 0,
      dernierDate: last?.date || '',
      dernierRef: last?.reference || '',
      dernierClient: last?.client || '',
    };
  }).sort((a, b) => a.designation.localeCompare(b.designation, 'fr'));
}

function frDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return d ? `${d}/${m}/${y}` : iso;
}

export function exportPriceLibraryExcel(library, lines) {
  const libRows = library.map((r) => ({
    'Désignation': r.designation,
    'Catégorie': r.categorie,
    'Unité': r.unite,
    'Prix min HT': r.prixMin,
    'Prix moyen HT': r.prixMoyen,
    'Prix max HT': r.prixMax,
    'Dernier prix HT': r.dernierPrix,
    'Date dernier prix': frDate(r.dernierDate),
    'Réf. dernier document': r.dernierRef,
    'Client dernier document': r.dernierClient,
    'Occurrences': r.nb,
    'Nb devis': r.nbDevis,
    'Nb factures': r.nbFactures,
  }));
  const detailRows = lines.map((l) => ({
    'Source': l.source,
    'Référence': l.reference,
    'Date': frDate(l.date),
    'Statut': l.statut,
    'Client': l.client,
    'Désignation': l.designation,
    'Description': l.description,
    'Catégorie': l.categorie,
    'Unité': l.unite,
    'Quantité': l.quantite,
    'Prix unitaire HT': l.prix_ht,
    'Remise %': l.remise,
    'Prix net HT': l.prix_net,
    'TVA %': l.tva,
  }));

  const wb = XLSX.utils.book_new();
  const wsLib = XLSX.utils.json_to_sheet(libRows);
  wsLib['!cols'] = [{ wch: 50 }, { wch: 20 }, { wch: 10 }, { wch: 12 }, { wch: 13 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 20 }, { wch: 28 }, { wch: 11 }, { wch: 9 }, { wch: 11 }];
  wsLib['!autofilter'] = { ref: wsLib['!ref'] || 'A1' };
  XLSX.utils.book_append_sheet(wb, wsLib, 'Bibliothèque de prix');

  const wsDetail = XLSX.utils.json_to_sheet(detailRows);
  wsDetail['!cols'] = [{ wch: 9 }, { wch: 18 }, { wch: 11 }, { wch: 12 }, { wch: 26 }, { wch: 50 }, { wch: 40 }, { wch: 18 }, { wch: 9 }, { wch: 9 }, { wch: 14 }, { wch: 9 }, { wch: 12 }, { wch: 7 }];
  wsDetail['!autofilter'] = { ref: wsDetail['!ref'] || 'A1' };
  XLSX.utils.book_append_sheet(wb, wsDetail, 'Détail');

  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  XLSX.writeFile(wb, `CITYMO_Bibliotheque_de_prix_${stamp}.xlsx`);
}

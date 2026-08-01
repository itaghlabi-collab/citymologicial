/**
 * DRY RUN — mouvements historiques consommables → DIVERS / AUTRE / HORS PROJET.
 * Ne crée aucune dépense. Ne modifie aucun mouvement.
 *
 * Usage (session service role ou utilisateur authentifié) :
 *   node scripts/dry-run-divers-expenses.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync, writeFileSync } from 'fs';

function loadEnv(path) {
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split('\n')
      .filter((l) => l && !l.startsWith('#'))
      .map((l) => {
        const i = l.indexOf('=');
        if (i < 0) return null;
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
      })
      .filter(Boolean),
  );
}

function isDivers(value) {
  const key = String(value || '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return key === 'DIVERS' || key === 'AUTRE' || key === 'HORS PROJET' || key === 'HORSPROJET';
}

function isConsommable(t) {
  const key = String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return key === 'consommable' || key === 'consumable';
}

const root = loadEnv('.env');
const server = loadEnv('server/.env');
const url = server.SUPABASE_URL || root.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  || server.SUPABASE_SERVICE_ROLE_KEY
  || server.SUPABASE_ANON_KEY
  || root.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('Supabase URL/key manquants.');
  process.exit(1);
}

const sb = createClient(url, key);
const { data, error } = await sb
  .from('stock_movements')
  .select('id, ref_mouvement, type_mouvement, quantite, date_mouvement, payload, stock_articles(reference, nom, article_type, prix_unitaire)')
  .order('date_mouvement', { ascending: false });

if (error) {
  console.error('DRY RUN ERROR:', error.message);
  process.exit(1);
}

const rows = [];
for (const row of data || []) {
  const p = row.payload || {};
  const dest = p.emplacement_destination || '';
  const src = p.emplacement_source || '';
  if (!isDivers(dest) && !(isDivers(src) && dest)) continue;
  const art = row.stock_articles || {};
  if (!isConsommable(art.article_type)) continue;
  const qty = Number(row.quantite) || 0;
  const unit = Number(art.prix_unitaire) || 0;
  const refKey = `citymo:sm:general:${row.id}`;
  const { data: existing } = await sb
    .from('finance_charges')
    .select('id, ref_charge, statut')
    .eq('ref_paiement', refKey)
    .maybeSingle();

  rows.push({
    reference: row.ref_mouvement,
    article: [art.reference, art.nom].filter(Boolean).join(' — '),
    quantite: qty,
    cout_valorise: unit,
    montant: Math.round(qty * unit * 100) / 100,
    destination_actuelle: dest || '—',
    source: src || '—',
    date: row.date_mouvement,
    depense_generale_existante: existing?.ref_charge || existing?.id || null,
    risque_doublon: Boolean(existing && !/annul/i.test(String(existing.statut || ''))),
  });
}

const report = {
  generated_at: new Date().toISOString(),
  note: 'DRY RUN — aucune dépense créée, aucun mouvement modifié.',
  total: rows.length,
  rows,
};
writeFileSync('scripts/dry-run-divers-expenses-report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ total: rows.length, sample: rows.slice(0, 15) }, null, 2));
console.log('\nRapport: scripts/dry-run-divers-expenses-report.json');

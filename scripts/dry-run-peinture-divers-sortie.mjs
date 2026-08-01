/**
 * DRY RUN — bug Sortie consommable → DIVERS (PEINTURE 6 kg).
 * Lecture seule : aucune modification.
 *
 * Usage (session authentifiée / service role) :
 *   node scripts/dry-run-peinture-divers-sortie.mjs
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

function isDivers(v) {
  const k = String(v || '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return k === 'DIVERS' || k === 'AUTRE' || k === 'HORS PROJET' || k === 'HORSPROJET';
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

const { data: warehouses } = await sb.from('stock_warehouses').select('id, nom, type_depot, statut, projet_lie');
const divers = (warehouses || []).find((w) => isDivers(w.nom));

const { data, error } = await sb
  .from('stock_movements')
  .select('id, ref_mouvement, type_mouvement, quantite, date_mouvement, payload, stock_articles(id, reference, nom, article_type, prix_unitaire, unite)')
  .order('date_mouvement', { ascending: false })
  .limit(300);

if (error) {
  console.error('DRY RUN ERROR:', error.message);
  process.exit(1);
}

const rows = [];
for (const row of data || []) {
  const art = row.stock_articles || {};
  const name = String(art.nom || '').toUpperCase();
  const p = row.payload || {};
  const dest = p.emplacement_destination || '';
  const qty = Number(row.quantite) || 0;
  if (!name.includes('PEINTURE VINYLIQUE')) continue;
  if (qty !== 6) continue;
  if (!isDivers(dest)) continue;

  const unit = Number(art.prix_unitaire) || 20;
  const refKey = `citymo:sm:general:${row.id}`;
  const { data: charge } = await sb.from('finance_charges').select('id, ref_charge, montant, statut').eq('ref_paiement', refKey).maybeSingle();

  let depotQty = null;
  let diversQty = null;
  const { data: levels } = await sb.from('stock_levels').select('emplacement, quantite').eq('article_id', art.id || row.article_id);
  (levels || []).forEach((l) => {
    if (String(l.emplacement || '').toUpperCase().includes('LAKHYAYTA')) depotQty = Number(l.quantite);
    if (isDivers(l.emplacement)) diversQty = Number(l.quantite);
  });

  const typeDb = row.type_mouvement;
  const isSortie = String(typeDb).toLowerCase().includes('sortie');

  rows.push({
    movement_id: row.id,
    reference: row.ref_mouvement,
    type_enregistre: typeDb,
    type_normalise: isSortie ? 'Sortie (exit — pas de crédit dest)' : typeDb,
    source: p.emplacement_source || '',
    destination: dest,
    quantite: qty,
    article: `${art.reference} — ${art.nom}`,
    article_type: art.article_type,
    cout_unitaire: unit,
    montant_attendu: Math.round(qty * unit * 100) / 100,
    impact_depot_lakhyayta: depotQty,
    impact_divers: diversQty,
    depense_generale: charge || null,
    financial_sync_status: p.financial_sync_status || null,
    financial_sync_error: p.financial_sync_error || null,
    divers_emplacement: divers ? {
      id: divers.id,
      code: 'DIVERS',
      label: divers.nom,
      type: divers.type_depot,
      statut: divers.statut,
      projet_lie: divers.projet_lie,
    } : null,
    proposition: isSortie ? {
      retirer_6kg_divers: true,
      conserver_debit_depot: true,
      creer_depense_120: !charge,
      ne_pas_supprimer_mouvement: true,
      note: 'Aucune modification appliquée — validation explicite requise.',
    } : null,
  });
}

const report = {
  generated_at: new Date().toISOString(),
  note: 'DRY RUN — aucune donnée modifiée.',
  total: rows.length,
  rows,
};
writeFileSync('scripts/dry-run-peinture-divers-sortie-report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

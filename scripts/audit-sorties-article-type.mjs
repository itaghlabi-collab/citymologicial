/**
 * Audit lecture seule — sorties historiques par type d’article.
 * Ne modifie aucun mouvement.
 *
 * Usage (session authentifiée requise via service role ou token) :
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/audit-sorties-article-type.mjs
 *
 * Ou depuis la console navigateur connecté :
 *   const { auditHistoricalSortiesByArticleType } = await import('/src/services/inventaire/mouvementRapide.js');
 *   console.table((await auditHistoricalSortiesByArticleType()).rows);
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

function normalizeArticleType(raw) {
  const t = String(raw || '').trim();
  if (!t) return '';
  const key = t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (key === 'materiel' || key === 'material') return 'Matériel';
  if (key === 'outil' || key === 'tool') return 'Outil';
  if (key === 'consommable' || key === 'consumable') return 'Consommable';
  return t;
}

const root = loadEnv('.env');
const server = loadEnv('server/.env');
const url = server.SUPABASE_URL || root.VITE_SUPABASE_URL || root.SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY
  || server.SUPABASE_SERVICE_ROLE_KEY
  || process.env.SUPABASE_ANON_KEY
  || server.SUPABASE_ANON_KEY
  || root.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('Supabase URL/key manquants.');
  process.exit(1);
}

const sb = createClient(url, key);
const { data, error } = await sb
  .from('stock_movements')
  .select('id, ref_mouvement, type_mouvement, article_id, quantite, date_mouvement, payload, stock_articles(reference, nom, article_type)')
  .in('type_mouvement', ['Sortie', 'sortie'])
  .order('date_mouvement', { ascending: false });

if (error) {
  console.error('AUDIT ERROR (lecture seule) :', error.message);
  console.error('Astuce : définir SUPABASE_SERVICE_ROLE_KEY ou exécuter auditHistoricalSortiesByArticleType() connecté.');
  process.exit(1);
}

const rows = (data || []).map((row) => {
  const p = row.payload || {};
  const art = row.stock_articles || {};
  const articleType = normalizeArticleType(art.article_type);
  return {
    reference: row.ref_mouvement || '',
    article: [art.reference, art.nom].filter(Boolean).join(' — '),
    article_type: articleType || art.article_type || '—',
    quantite: Number(row.quantite) || 0,
    source: p.emplacement_source || '',
    destination: p.emplacement_destination || '',
    date: row.date_mouvement || '',
  };
});

const materiel = rows.filter((r) => r.article_type === 'Matériel');
const outil = rows.filter((r) => r.article_type === 'Outil');
const consommable = rows.filter((r) => r.article_type === 'Consommable');
const autre = rows.filter((r) => !['Matériel', 'Outil', 'Consommable'].includes(r.article_type));

const report = {
  generated_at: new Date().toISOString(),
  note: 'Lecture seule — aucun mouvement modifié.',
  total_sorties: rows.length,
  counts: {
    materiel: materiel.length,
    outil: outil.length,
    consommable: consommable.length,
    autre: autre.length,
  },
  sorties_materiel: materiel,
  sorties_outil: outil,
  sorties_consommable: consommable,
  sorties_autre: autre,
};

const out = 'scripts/audit-sorties-article-type-report.json';
writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, sorties_materiel: materiel, sorties_outil: outil, sorties_consommable: consommable.slice(0, 30), sorties_autre: autre }, null, 2));
console.log(`\nRapport écrit : ${out}`);

/**
 * Vérifie tables document_folders / documents + bucket Storage "documents"
 * Usage: node scripts/verify-mes-documents.mjs
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function loadEnv() {
  try {
    const raw = readFileSync(resolve(root, '.env'), 'utf8');
    const env = {};
    for (const line of raw.split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) env[m[1].trim()] = m[2].trim();
    }
    return env;
  } catch {
    return {};
  }
}

const env = { ...process.env, ...loadEnv() };
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('✗ VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY manquants');
  process.exit(1);
}

const sb = createClient(url, key);

async function checkTable(name) {
  const { error } = await sb.from(name).select('id').limit(1);
  if (!error) return { ok: true, message: 'table accessible' };
  const code = error.code || '';
  const msg = error.message || '';
  if (code === 'PGRST205' || msg.includes('Could not find the table')) {
    return { ok: false, message: 'table absente — exécutez RUN_MES_DOCUMENTS.sql' };
  }
  if (code === '42501' || msg.includes('permission') || msg.includes('JWT')) {
    return { ok: true, message: 'table présente (RLS — connexion requise pour lire)' };
  }
  return { ok: false, message: `${code}: ${msg}` };
}

async function checkFoldersSeed() {
  const { data, error } = await sb.from('document_folders').select('id,name,is_system').eq('is_system', true).limit(20);
  if (error) return { ok: false, count: 0, message: error.message };
  return { ok: true, count: (data || []).length, names: (data || []).map((r) => r.name) };
}

async function checkBucket() {
  const { data, error } = await sb.storage.listBuckets();
  if (error) return { ok: false, message: error.message };
  const bucket = (data || []).find((b) => b.id === 'documents' || b.name === 'documents');
  if (!bucket) return { ok: false, message: 'bucket "documents" introuvable' };
  return { ok: true, message: `bucket "${bucket.name}" (public: ${bucket.public})` };
}

async function main() {
  console.log('=== CITYMO — Vérification Mes documents ===\n');
  console.log(`Projet: ${url}\n`);

  const folders = await checkTable('document_folders');
  console.log(folders.ok ? `✓ document_folders — ${folders.message}` : `✗ document_folders — ${folders.message}`);

  const docs = await checkTable('documents');
  console.log(docs.ok ? `✓ documents — ${docs.message}` : `✗ documents — ${docs.message}`);

  const bucket = await checkBucket();
  console.log(bucket.ok ? `✓ Storage — ${bucket.message}` : `✗ Storage — ${bucket.message}`);

  if (folders.ok) {
    const seed = await checkFoldersSeed();
    if (seed.ok) {
      console.log(`✓ Dossiers système visibles: ${seed.count}`);
      if (seed.count > 0) console.log(`  → ${seed.names.join(', ')}`);
      else console.log('  ! 0 dossier seed (SQL peut-être pas exécuté ou RLS sans session)');
    } else {
      console.log(`! Seed dossiers: ${seed.message}`);
    }
  }

  console.log('\n---');
  if (!folders.ok || !docs.ok) {
    console.log('Action: Supabase Dashboard → SQL Editor → coller supabase/RUN_MES_DOCUMENTS.sql → Run');
    process.exit(1);
  }
  console.log('Schéma OK. Connectez-vous à l\'app pour tester l\'upload dans ACHATS.');
}

main().catch((e) => { console.error(e); process.exit(1); });

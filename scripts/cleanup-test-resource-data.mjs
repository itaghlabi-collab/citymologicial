/**
 * Exécute supabase/CLEANUP_TEST_RESOURCE_DATA.sql
 *
 * Prérequis :
 *   export SUPABASE_ACCESS_TOKEN="sbp_..."
 *   ou export SUPABASE_DB_URL="postgresql://..."
 *
 * Usage: node scripts/cleanup-test-resource-data.mjs
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = 'npddbwsskaojcawaxygh';
const SQL_PATH = resolve(__dirname, '../supabase/CLEANUP_TEST_RESOURCE_DATA.sql');

async function runViaManagementApi(token, sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Management API ${res.status}: ${body}`);
  return body;
}

async function runViaPg(dbUrl, sql) {
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

async function main() {
  const sql = readFileSync(SQL_PATH, 'utf8');
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;

  if (token) {
    console.log('Nettoyage via Supabase Management API...');
    const result = await runViaManagementApi(token, sql);
    console.log('✓ Données test supprimées:', result || 'OK');
    return;
  }

  if (dbUrl) {
    console.log('Nettoyage via PostgreSQL...');
    await runViaPg(dbUrl, sql);
    console.log('✓ Données test supprimées');
    return;
  }

  console.error(`Exécutez le SQL manuellement dans Supabase → SQL Editor :
  supabase/CLEANUP_TEST_RESOURCE_DATA.sql

Ou :
  export SUPABASE_ACCESS_TOKEN="sbp_..."
  node scripts/cleanup-test-resource-data.mjs
`);
  process.exit(1);
}

main().catch((e) => { console.error('✗', e.message); process.exit(1); });

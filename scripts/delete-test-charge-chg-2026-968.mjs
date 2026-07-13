/**
 * Supprime uniquement la dépense test CHG-2026-968.
 *
 * Prérequis :
 *   export SUPABASE_ACCESS_TOKEN="sbp_..."
 *   ou export SUPABASE_DB_URL="postgresql://..."
 *
 * Usage: node scripts/delete-test-charge-chg-2026-968.mjs
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = 'npddbwsskaojcawaxygh';
const SQL_PATH = resolve(__dirname, '../supabase/DELETE_TEST_CHARGE_CHG_2026_968.sql');

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
    console.log('Suppression via Supabase Management API...');
    const result = await runViaManagementApi(token, sql);
    console.log('✓', result || 'Dépense test supprimée');
    return;
  }

  if (dbUrl) {
    console.log('Suppression via PostgreSQL...');
    await runViaPg(dbUrl, sql);
    console.log('✓ Dépense test CHG-2026-968 supprimée');
    return;
  }

  console.error(`Définissez SUPABASE_ACCESS_TOKEN ou SUPABASE_DB_URL, puis relancez.

Ou exécutez manuellement dans Supabase → SQL Editor :
  supabase/DELETE_TEST_CHARGE_CHG_2026_968.sql
`);
  process.exit(1);
}

main().catch((e) => { console.error('✗', e.message); process.exit(1); });

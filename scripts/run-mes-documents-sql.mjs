/**
 * Exécute supabase/RUN_MES_DOCUMENTS.sql sur le projet lié.
 *
 * Prérequis (une des options) :
 *   export SUPABASE_ACCESS_TOKEN="sbp_..."   # supabase login
 *   export SUPABASE_DB_URL="postgresql://postgres.[ref]:[password]@..."
 *
 * Usage: node scripts/run-mes-documents-sql.mjs
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = 'npddbwsskaojcawaxygh';
const SQL_PATH = resolve(__dirname, '../supabase/RUN_MES_DOCUMENTS.sql');

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
    console.log('Exécution via Supabase Management API...');
    const result = await runViaManagementApi(token, sql);
    console.log('✓ SQL exécuté:', result || 'OK');
    return;
  }

  if (dbUrl) {
    console.log('Exécution via connexion PostgreSQL directe...');
    await runViaPg(dbUrl, sql);
    console.log('✓ SQL exécuté');
    return;
  }

  console.error(`Impossible d'exécuter le SQL automatiquement.

Options :
  1) Supabase Dashboard → SQL Editor → coller le contenu de :
     supabase/RUN_MES_DOCUMENTS.sql → Run

  2) Terminal :
     npx supabase login
     npx supabase link --project-ref ${PROJECT_REF}
     npx supabase db query -f supabase/RUN_MES_DOCUMENTS.sql --linked

  3) Avec token :
     export SUPABASE_ACCESS_TOKEN="sbp_..."
     node scripts/run-mes-documents-sql.mjs
`);
  process.exit(1);
}

main().catch((e) => { console.error('✗', e.message); process.exit(1); });

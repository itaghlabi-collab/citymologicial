/**
 * Vérifie localement que les fichiers SQL étape 2 sont présents et cohérents.
 * N'applique rien sur Supabase.
 * Usage: node scripts/test-push-subscriptions-migration.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migration = path.join(root, 'supabase/migrations/20260716120000_push_subscriptions.sql');
const runFile = path.join(root, 'supabase/RUN_PUSH_SUBSCRIPTIONS.sql');
const verify = path.join(root, 'supabase/VERIFY_PUSH_SUBSCRIPTIONS_RLS.sql');
const rollback = path.join(root, 'supabase/ROLLBACK_PUSH_SUBSCRIPTIONS.sql');

for (const f of [migration, runFile, verify, rollback]) {
  if (!fs.existsSync(f)) {
    console.error('FAIL: missing', f);
    process.exit(1);
  }
}

const sql = fs.readFileSync(migration, 'utf8');
const mustInclude = [
  'CREATE TABLE IF NOT EXISTS public.push_subscriptions',
  'REFERENCES auth.users(id) ON DELETE CASCADE',
  'CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint)',
  'auth_key',
  'idx_push_subscriptions_user_id',
  'idx_push_subscriptions_user_id_active',
  'ENABLE ROW LEVEL SECURITY',
  'FORCE ROW LEVEL SECURITY',
  'push_subscriptions_select_own',
  'push_subscriptions_insert_own',
  'push_subscriptions_update_own',
  'push_subscriptions_delete_own',
  'auth.uid() = user_id',
  'REVOKE ALL ON TABLE public.push_subscriptions FROM anon',
  'GRANT ALL ON TABLE public.push_subscriptions TO service_role',
  'EXECUTE FUNCTION public.set_updated_at()',
];

for (const needle of mustInclude) {
  if (!sql.includes(needle)) {
    console.error('FAIL: migration missing:', needle);
    process.exit(1);
  }
}

if (/USING\s*\(\s*true\s*\)/i.test(sql) || /WITH CHECK\s*\(\s*true\s*\)/i.test(sql)) {
  console.error('FAIL: permissive true policy found');
  process.exit(1);
}
if (/GRANT\s+.*\s+TO\s+anon\b/i.test(sql)) {
  console.error('FAIL: grant to anon found');
  process.exit(1);
}
if (/CREATE POLICY[\s\S]{0,80}TO\s+anon\b/i.test(sql)) {
  console.error('FAIL: policy for anon found');
  process.exit(1);
}
if (/DROP\s+TABLE\s+(IF\s+EXISTS\s+)?public\.notifications\b/i.test(sql)
  || /ALTER\s+TABLE\s+public\.notifications\b/i.test(sql)) {
  console.error('FAIL: must not mutate public.notifications');
  process.exit(1);
}

const rb = fs.readFileSync(rollback, 'utf8');
if (!rb.includes('DROP TABLE IF EXISTS public.push_subscriptions')) {
  console.error('FAIL: rollback incomplete');
  process.exit(1);
}
if (/\bDROP FUNCTION\b.*set_updated_at/i.test(rb)) {
  console.error('FAIL: rollback must not drop shared set_updated_at()');
  process.exit(1);
}

console.log('PASS: migration file present');
console.log('PASS: required DDL / RLS clauses present');
console.log('PASS: no permissive USING(true) / anon grants');
console.log('PASS: rollback script present and safe');
console.log('ALL PUSH_SUBSCRIPTIONS MIGRATION CHECKS PASSED');
console.log('NOTE: apply SQL on Supabase only after explicit validation (not run by this script).');

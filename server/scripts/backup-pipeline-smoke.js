#!/usr/bin/env node
/**
 * Smoke test pipeline sauvegarde (sans écrire erp_backups).
 * Usage : depuis server/ avec variables Railway/Supabase chargées
 *   node scripts/backup-pipeline-smoke.js
 */
require('dotenv').config();

const { exportDatabase } = require('../services/backup/databaseExporter');
const { exportFiles, resolveFilesMode } = require('../services/backup/filesExporter');
const { testSupabaseConnection } = require('../services/backup/backupEnvCheck');

async function main() {
  const mode = resolveFilesMode();
  console.log('[smoke] mode fichiers:', mode);

  await testSupabaseConnection();
  console.log('[smoke] Supabase OK');

  const db = await exportDatabase();
  const tables = db.meta?.tables?.length || 0;
  const rows = Object.values(db.meta?.rowCounts || {}).reduce((a, b) => a + b, 0);
  console.log('[smoke] export DB OK', { tables, rows });

  const prefix = `SMOKE-${Date.now()}`;
  let lastProgress = '';
  const manifest = await exportFiles(prefix, {
    mode,
    onProgress: (p) => {
      if (p.phase === 'bucket_listed') {
        lastProgress = `${p.bucket}: ${p.count} (total ${p.totalListed})`;
      }
    },
  });

  console.log('[smoke] export fichiers OK', {
    mode: manifest.mode,
    files: manifest.total_files,
    errors: manifest.errors?.length || 0,
    lastBucket: lastProgress,
  });

  console.log('[smoke] SUCCESS');
}

main().catch((err) => {
  console.error('[smoke] FAILED', err.message);
  process.exit(1);
});

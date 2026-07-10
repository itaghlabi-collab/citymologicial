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
const { createPipeline } = require('../services/backup/backupPipeline');

async function main() {
  const mode = resolveFilesMode();
  console.log('[smoke] mode fichiers:', mode);

  const pipeline = createPipeline('SMOKE');
  try {
    await pipeline.run('testSupabaseConnection', () => testSupabaseConnection());
    console.log('[smoke] Supabase OK');

    const db = await pipeline.run('exportDatabase', () => exportDatabase());
    const tables = db.meta?.tables?.length || 0;
    const rows = Object.values(db.meta?.rowCounts || {}).reduce((a, b) => a + b, 0);
    console.log('[smoke] export DB OK', { tables, rows });

    const prefix = `SMOKE-${Date.now()}`;
    const manifest = await pipeline.run(
      'exportFiles',
      () => exportFiles(prefix, { mode, pipeline }),
    );

    console.log('[smoke] export fichiers OK', {
      mode: manifest.mode,
      files: manifest.total_files,
      errors: manifest.errors?.length || 0,
      steps: pipeline.lastStep,
    });

    console.log('[smoke] SUCCESS');
  } finally {
    pipeline.dispose();
  }
}

main().catch((err) => {
  console.error('[smoke] FAILED', err.message);
  process.exit(1);
});

/**
 * Export base de données ERP (tables public) en JSON — heartbeat par table.
 */
const { getSupabaseAdmin } = require('../../lib/supabaseAdmin');
const { OP_TIMEOUT_MS } = require('./backupPipeline');

const PAGE_SIZE = 1000;
const TABLE_TIMEOUT_MS = Number(process.env.BACKUP_TABLE_TIMEOUT_MS) || 60_000;
const EXCLUDE_TABLES = new Set(['schema_migrations']);

async function listTables(pipeline) {
  const run = pipeline
    ? (loc, fn) => pipeline.run(loc, fn)
    : (loc, fn) => fn();

  const sb = getSupabaseAdmin();
  return run('databaseExporter.listTables', async () => {
    const { data, error } = await sb.rpc('get_public_table_names');
    if (error) throw new Error(`Liste tables échouée : ${error.message}`);
    return (data || []).filter((t) => !EXCLUDE_TABLES.has(t));
  });
}

async function exportTable(table, pipeline) {
  const sb = getSupabaseAdmin();
  const rows = [];
  let from = 0;
  let page = 0;

  while (true) {
    page += 1;
    const location = `databaseExporter.exportTable(${table}, page=${page}, from=${from})`;

    const fetchPage = async () => {
      const { data, error } = await sb
        .from(table)
        .select('*')
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      return data;
    };

    let data;
    try {
      data = pipeline
        ? await pipeline.run(location, fetchPage, { timeoutMs: TABLE_TIMEOUT_MS })
        : await fetchPage();
    } catch (err) {
      return { table, rows: [], skipped: true, reason: err.message };
    }

    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
    pipeline?.touchProgress(`Export table ${table} — ${rows.length} lignes…`);
  }

  return { table, rows, skipped: false };
}

async function exportDatabase(pipeline = null) {
  const tables = await listTables(pipeline);
  const exported = {};
  const meta = { tables: [], skipped: [], rowCounts: {} };

  let index = 0;
  for (const table of tables) {
    index += 1;
    pipeline?.touchProgress(`Export DB ${index}/${tables.length} — ${table}…`);

    const result = await exportTable(table, pipeline);
    if (result.skipped) {
      meta.skipped.push({ table: result.table, reason: result.reason });
      continue;
    }
    exported[table] = result.rows;
    meta.tables.push(table);
    meta.rowCounts[table] = result.rows.length;
    pipeline?.touchProgress(`Table ${table} OK (${result.rows.length} lignes)`);
  }

  return {
    format: 'citymo-db-json-v1',
    exported_at: new Date().toISOString(),
    meta,
    tables: exported,
  };
}

async function exportErpConfig(pipeline = null) {
  const sb = getSupabaseAdmin();
  const config = { exported_at: new Date().toISOString() };
  const tables = ['erp_roles', 'role_permissions', 'erp_backup_schedules'];

  for (const table of tables) {
    const fetch = async () => {
      const { data, error } = await sb.from(table).select('*');
      if (error) throw error;
      return data;
    };
    try {
      if (pipeline) {
        config[table] = await pipeline.run(`exportErpConfig.${table}`, fetch, { timeoutMs: TABLE_TIMEOUT_MS });
      } else {
        const { data, error } = await sb.from(table).select('*');
        if (!error) config[table] = data || [];
      }
    } catch {
      config[table] = [];
    }
  }

  return config;
}

module.exports = { exportDatabase, exportErpConfig, listTables };

/**
 * Export base de données ERP (tables public) en JSON.
 */
const { getSupabaseAdmin } = require('../../lib/supabaseAdmin');

const PAGE_SIZE = 1000;
const EXCLUDE_TABLES = new Set(['schema_migrations']);

async function listTables() {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.rpc('get_public_table_names');
  if (error) throw new Error(`Liste tables échouée : ${error.message}`);
  return (data || []).filter((t) => !EXCLUDE_TABLES.has(t));
}

async function exportTable(table) {
  const sb = getSupabaseAdmin();
  const rows = [];
  let from = 0;

  while (true) {
    const { data, error } = await sb
      .from(table)
      .select('*')
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      // Table sans accès direct ou vue — ignorer avec note
      return { table, rows: [], skipped: true, reason: error.message };
    }

    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return { table, rows, skipped: false };
}

async function exportDatabase() {
  const tables = await listTables();
  const exported = {};
  const meta = { tables: [], skipped: [], rowCounts: {} };

  for (const table of tables) {
    const result = await exportTable(table);
    if (result.skipped) {
      meta.skipped.push({ table: result.table, reason: result.reason });
      continue;
    }
    exported[table] = result.rows;
    meta.tables.push(table);
    meta.rowCounts[table] = result.rows.length;
  }

  return {
    format: 'citymo-db-json-v1',
    exported_at: new Date().toISOString(),
    meta,
    tables: exported,
  };
}

async function exportErpConfig() {
  const sb = getSupabaseAdmin();
  const config = { exported_at: new Date().toISOString() };

  const tables = ['erp_roles', 'role_permissions', 'erp_backup_schedules'];
  for (const table of tables) {
    const { data, error } = await sb.from(table).select('*');
    if (!error) config[table] = data || [];
  }

  return config;
}

module.exports = { exportDatabase, exportErpConfig, listTables };

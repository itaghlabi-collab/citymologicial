/**
 * Colonnes réelles de erp_backups — détection au runtime, aucun UPDATE sur colonne absente.
 */
const { getSupabaseAdmin } = require('../../lib/supabaseAdmin');
const { appendErrorTag, backupSqlError, DOMAINS } = require('./backupErrors');

const OPTIONAL_COLUMNS = [
  'progress_at',
  'drive_synced',
  'drive_folder_id',
  'drive_sync_error',
];

let schemaCache = null;
let schemaLoadPromise = null;

function columnMissing(error, column) {
  if (!error?.message) return false;
  const msg = error.message.toLowerCase();
  return msg.includes(column.toLowerCase())
    && (msg.includes('does not exist') || msg.includes('could not find'));
}

async function probeColumn(column) {
  const sb = getSupabaseAdmin();
  const { error } = await sb.from('erp_backups').select(column).limit(0);
  if (!error) return true;
  if (columnMissing(error, column)) return false;
  // Erreur réseau / permission : ne pas bloquer, supposer absent pour éviter UPDATE risqué
  console.warn(`[backup:schema] probe ${column} ambigu : ${error.message}`);
  return false;
}

async function loadErpBackupSchema() {
  if (schemaCache) return schemaCache;
  if (schemaLoadPromise) return schemaLoadPromise;

  schemaLoadPromise = (async () => {
    const schema = {};
    for (const col of OPTIONAL_COLUMNS) {
      schema[col] = await probeColumn(col);
    }
    schemaCache = schema;
    console.info('[backup:schema] erp_backups colonnes optionnelles', schema);
    return schema;
  })();

  try {
    return await schemaLoadPromise;
  } finally {
    schemaLoadPromise = null;
  }
}

function buildFinalizePayload(fields, schema) {
  const {
    statut,
    file_path,
    taille_bytes,
    error_message,
    drive_synced,
    drive_folder_id,
    drive_sync_error,
  } = fields;

  let errMsg = error_message ?? null;
  const virtual = {};

  const hasDriveCols = schema.drive_synced || schema.drive_folder_id || schema.drive_sync_error;

  if (!hasDriveCols) {
    if (drive_sync_error) {
      errMsg = appendErrorTag(errMsg, DOMAINS.DRIVE, drive_sync_error);
      virtual.drive_sync_error = drive_sync_error;
    }
    if (drive_synced !== undefined) virtual.drive_synced = drive_synced;
    if (drive_folder_id !== undefined) virtual.drive_folder_id = drive_folder_id;
  }

  const payload = {
    statut,
    file_path: file_path ?? null,
    taille_bytes: taille_bytes ?? null,
    error_message: errMsg,
  };

  if (schema.drive_synced && drive_synced !== undefined) payload.drive_synced = drive_synced;
  if (schema.drive_folder_id && drive_folder_id !== undefined) payload.drive_folder_id = drive_folder_id;
  if (schema.drive_sync_error && drive_sync_error !== undefined) {
    payload.drive_sync_error = drive_sync_error;
  }

  return {
    payload,
    virtual: Object.keys(virtual).length ? virtual : null,
  };
}

async function updateErpBackupRow(id, fields) {
  const schema = await loadErpBackupSchema();
  const { payload, virtual } = buildFinalizePayload(fields, schema);
  const sb = getSupabaseAdmin();

  const { data, error } = await sb
    .from('erp_backups')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    throw backupSqlError(`Mise à jour sauvegarde : ${error.message}`);
  }

  return virtual ? { ...data, ...virtual } : data;
}

async function buildInsertPayload(base) {
  const schema = await loadErpBackupSchema();
  const payload = { ...base };
  if (schema.progress_at) {
    payload.progress_at = new Date().toISOString();
  }
  return payload;
}

module.exports = {
  loadErpBackupSchema,
  buildFinalizePayload,
  updateErpBackupRow,
  buildInsertPayload,
};

/**
 * Logs sauvegardes ERP — visibles dans la console Railway.
 * Ne jamais logger de secrets (clés, JSON service account).
 */
function ts() {
  return new Date().toISOString();
}

function log(tag, message, extra) {
  const base = `[${tag}] ${ts()} — ${message}`;
  if (extra !== undefined) {
    console.log(base, extra);
  } else {
    console.log(base);
  }
}

function logError(tag, message, err) {
  const detail = err?.message || String(err || '');
  console.error(`[${tag}] ${ts()} — ${message}${detail ? ` : ${detail}` : ''}`);
}

module.exports = {
  backupStart: (ref, type, actor) => log('BACKUP START', `${ref} type=${type}`, {
    actor: actor?.email || actor?.nom || 'system',
  }),
  supabaseExportOk: (meta) => log('SUPABASE EXPORT OK', `${meta.tables || 0} tables`, meta),
  storageExportOk: (meta) => log('STORAGE EXPORT OK', `${meta.files || 0} fichiers`, meta),
  storageUploadOk: (path, bytes) => log('STORAGE UPLOAD OK', path, { bytes }),
  googleDriveUploadOk: (path) => log('GOOGLE DRIVE UPLOAD OK', path),
  googleDriveUploadFail: (path, err) => logError('GOOGLE DRIVE UPLOAD FAIL', path, err),
  backupDone: (ref, summary) => log('BACKUP DONE', ref, summary),
  backupError: (ref, err) => logError('BACKUP ERROR', ref, err),
  envOk: (msg, extra) => log('BACKUP ENV', msg, extra),
  envWarn: (msg) => console.warn(`[BACKUP ENV] ${ts()} — ${msg}`),
};

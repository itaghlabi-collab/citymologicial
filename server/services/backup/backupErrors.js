/**
 * Erreurs sauvegarde avec domaine explicite pour diagnostic immédiat.
 */
const DOMAINS = {
  DRIVE: 'Google Drive',
  SQL: 'SQL',
  STORAGE: 'Storage',
  SUPABASE: 'Supabase',
};

class BackupError extends Error {
  constructor(domain, message) {
    super(`[${domain}] ${message}`);
    this.name = 'BackupError';
    this.domain = domain;
  }
}

function backupDriveError(message) {
  return new BackupError(DOMAINS.DRIVE, message);
}

function backupSqlError(message) {
  return new BackupError(DOMAINS.SQL, message);
}

function backupStorageError(message) {
  return new BackupError(DOMAINS.STORAGE, message);
}

function backupSupabaseError(message) {
  return new BackupError(DOMAINS.SUPABASE, message);
}

function isBackupError(err) {
  return err instanceof BackupError;
}

function appendErrorTag(existing, domain, message) {
  if (!message) return existing || null;
  const tag = `[${domain}]`;
  const part = `${tag} ${message}`;
  if (!existing) return part;
  if (existing.includes(tag)) return existing;
  return `${existing} | ${part}`;
}

function formatFailMessage(err, fallbackLocation) {
  if (isBackupError(err)) return err.message;
  if (err?.name === 'TimeoutError') return `[Supabase] ${err.message}`;
  const loc = fallbackLocation || err?.location || 'inconnu';
  return `[Supabase] ${loc}: ${err.message}`;
}

module.exports = {
  BackupError,
  DOMAINS,
  backupDriveError,
  backupSqlError,
  backupStorageError,
  backupSupabaseError,
  isBackupError,
  appendErrorTag,
  formatFailMessage,
};

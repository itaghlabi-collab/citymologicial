/**
 * Gestion des jobs sauvegarde async — anti-blocage « en_cours » infini.
 */
const { getSupabaseAdmin } = require('../../lib/supabaseAdmin');
const logger = require('./backupLogger');

const { PROGRESS_STALE_MS, OP_TIMEOUT_MS } = require('./backupPipeline');

/** Job en cours en mémoire — ne pas réconcilier. */
let inMemoryJobRef = null;

function isJobActiveInMemory(ref) {
  return Boolean(ref && inMemoryJobRef === ref);
}

/** Sauvegarde éligible à réconciliation (ms depuis création). */
const STUCK_BACKUP_MS = Number(process.env.BACKUP_STUCK_AFTER_MS) || 10 * 60 * 1000;

/** Sans heartbeat DB depuis ce délai → réconciliation (ms). */
const HEARTBEAT_STALE_MS = Number(process.env.BACKUP_HEARTBEAT_STALE_MS) || 3 * 60 * 1000;

/** Durée max absolue d'un job (ms). */
const JOB_TIMEOUT_MS = Number(process.env.BACKUP_JOB_TIMEOUT_MS) || 90 * 60 * 1000;

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Délai dépassé (${Math.round(ms / 60000)} min) — ${label}`));
    }, ms);
    promise
      .then((v) => { clearTimeout(timer); resolve(v); })
      .catch((e) => { clearTimeout(timer); reject(e); });
  });
}

async function reconcileStuckBackups() {
  const sb = getSupabaseAdmin();
  const now = Date.now();
  const ageCutoff = new Date(now - STUCK_BACKUP_MS).toISOString();
  const heartbeatCutoff = new Date(now - HEARTBEAT_STALE_MS).toISOString();
  const absoluteCutoff = new Date(now - JOB_TIMEOUT_MS).toISOString();

  const { data: candidates, error } = await sb
    .from('erp_backups')
    .select('id, ref, created_at, progress_at')
    .eq('statut', 'en_cours');

  if (error) {
    console.error('[backup:reconcile] lecture échouée', error.message);
    return [];
  }

  const stuck = (candidates || []).filter((row) => {
    if (isJobActiveInMemory(row.ref)) return false;
    if (row.created_at < absoluteCutoff) return true;
    if (row.created_at > ageCutoff) return false;
    if (!row.progress_at) return true;
    return row.progress_at < heartbeatCutoff;
  });

  const reconciled = [];
  for (const row of stuck) {
    const msg = `Job interrompu — aucune progression DB depuis ${Math.round(HEARTBEAT_STALE_MS / 1000)}s (dernière activité enregistrée). Relancez une sauvegarde.`;
    const { error: updErr } = await sb
      .from('erp_backups')
      .update({
        statut: 'erreur',
        error_message: msg,
      })
      .eq('id', row.id)
      .eq('statut', 'en_cours');

    if (!updErr) {
      reconciled.push(row.ref);
      logger.envWarn(`Sauvegarde ${row.ref} marquée erreur (bloquée depuis ${row.created_at})`);
    }
  }

  if (reconciled.length) {
    console.info('[backup:reconcile] finalisées', { refs: reconciled });
  }
  return reconciled;
}

async function findRecentRunningBackup() {
  const sb = getSupabaseAdmin();
  const cutoff = new Date(Date.now() - STUCK_BACKUP_MS).toISOString();

  const { data, error } = await sb
    .from('erp_backups')
    .select('id, ref, created_at')
    .eq('statut', 'en_cours')
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) return null;
  return data?.[0] || null;
}

async function assertNoConcurrentBackup() {
  await reconcileStuckBackups();

  const dbRunning = await findRecentRunningBackup();
  if (dbRunning) {
    const err = new Error(
      `Sauvegarde ${dbRunning.ref} déjà en cours. Attendez la fin ou actualisez dans quelques minutes.`,
    );
    err.status = 409;
    throw err;
  }

  if (inMemoryJobRef) {
    const err = new Error(
      `Sauvegarde ${inMemoryJobRef} en cours sur ce serveur. Une seule sauvegarde à la fois.`,
    );
    err.status = 409;
    throw err;
  }
}

function markJobStarted(ref) {
  inMemoryJobRef = ref;
}

function markJobFinished(ref) {
  if (inMemoryJobRef === ref) inMemoryJobRef = null;
}

async function updateBackupProgress(backupId, message) {
  const sb = getSupabaseAdmin();
  const now = new Date().toISOString();
  const payload = { description: message, progress_at: now };
  const { error } = await sb
    .from('erp_backups')
    .update(payload)
    .eq('id', backupId)
    .eq('statut', 'en_cours');
  if (error && error.message?.includes('progress_at')) {
    await sb
      .from('erp_backups')
      .update({ description: message })
      .eq('id', backupId)
      .eq('statut', 'en_cours');
  }
}

module.exports = {
  STUCK_BACKUP_MS,
  HEARTBEAT_STALE_MS,
  JOB_TIMEOUT_MS,
  withTimeout,
  reconcileStuckBackups,
  findRecentRunningBackup,
  assertNoConcurrentBackup,
  markJobStarted,
  markJobFinished,
  isJobActiveInMemory,
  updateBackupProgress,
};

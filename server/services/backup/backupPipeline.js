/**
 * Pipeline sauvegarde — étapes numérotées, timeouts, heartbeat DB périodique.
 */
const OP_TIMEOUT_MS = Number(process.env.BACKUP_OP_TIMEOUT_MS) || 30_000;
/** Upload archives volumineuses (database.json.gz) — plus large que OP_TIMEOUT. */
const UPLOAD_TIMEOUT_MS = Number(process.env.BACKUP_UPLOAD_TIMEOUT_MS) || 10 * 60_000;
/** Délai sans heartbeat mémoire avant échec du job (ms). */
const PROGRESS_STALE_MS = Number(process.env.BACKUP_PROGRESS_STALE_MS) || 10 * 60_000;
const COMPRESS_TIMEOUT_MS = Number(process.env.BACKUP_COMPRESS_TIMEOUT_MS) || 5 * 60_000;
const WATCHDOG_POLL_MS = 5_000;
/** Heartbeat DB pendant les étapes longues (ms). */
const DB_HEARTBEAT_MS = Number(process.env.BACKUP_DB_HEARTBEAT_MS) || 30_000;

class TimeoutError extends Error {
  constructor(message, meta = {}) {
    super(message);
    this.name = 'TimeoutError';
    this.step = meta.step || null;
    this.location = meta.location || null;
    this.elapsedMs = meta.elapsedMs || null;
  }
}

function formatFailMessage(err, fallbackLocation) {
  if (err instanceof TimeoutError) return err.message;
  const loc = fallbackLocation || err.location || 'inconnu';
  return `${loc}: ${err.message}`;
}

function runTimed(stepLabel, location, fn, timeoutMs = OP_TIMEOUT_MS) {
  const start = Date.now();
  console.info(`[backup:pipeline] ${stepLabel} START | ${location}`);

  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      const elapsed = Date.now() - start;
      const msg = `TimeoutError: ${stepLabel} — ${location} (${elapsed}ms > ${timeoutMs}ms)`;
      console.error(`[backup:pipeline] ${stepLabel} TIMEOUT ${elapsed}ms | ${location}`);
      reject(new TimeoutError(msg, { step: stepLabel, location, elapsedMs: elapsed }));
    }, timeoutMs);

    Promise.resolve()
      .then(fn)
      .then((value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const elapsed = Date.now() - start;
        console.info(`[backup:pipeline] ${stepLabel} OK ${elapsed}ms | ${location}`);
        resolve(value);
      })
      .catch((err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const elapsed = Date.now() - start;
        console.error(`[backup:pipeline] ${stepLabel} FAIL ${elapsed}ms | ${location}`, err.message);
        if (err instanceof TimeoutError) {
          reject(err);
          return;
        }
        const wrapped = new Error(`${stepLabel} — ${location}: ${err.message}`);
        wrapped.cause = err;
        wrapped.step = stepLabel;
        wrapped.location = location;
        reject(wrapped);
      });
  });
}

/**
 * @param {string} ref
 * @param {(msg: string) => Promise<void>|void} [onProgress]
 */
function createPipeline(ref, onProgress) {
  let step = 0;
  let lastProgressAt = Date.now();
  let lastDbHeartbeatAt = 0;
  let lastLocation = 'pipeline:init';
  let lastProgressMsg = `Sauvegarde ${ref} en cours…`;
  let staleError = null;

  function writeDbProgress(msg) {
    if (!onProgress) return;
    lastDbHeartbeatAt = Date.now();
    Promise.resolve(onProgress(msg || lastProgressMsg)).catch(() => {});
  }

  const watchdog = setInterval(() => {
    const idle = Date.now() - lastProgressAt;
    if (idle > PROGRESS_STALE_MS && !staleError) {
      staleError = new TimeoutError(
        `TimeoutError: progression figée ${Math.round(idle / 1000)}s (max ${PROGRESS_STALE_MS / 1000}s) — dernière étape: ${lastLocation}`,
        { location: lastLocation, elapsedMs: idle },
      );
      console.error(`[backup:pipeline] WATCHDOG | ${ref} | ${staleError.message}`);
      return;
    }
    // Heartbeat DB même si l'étape est longue et silencieuse (upload Drive, etc.)
    if (Date.now() - lastDbHeartbeatAt >= DB_HEARTBEAT_MS) {
      writeDbProgress(`${lastProgressMsg} (${lastLocation})`);
    }
  }, WATCHDOG_POLL_MS);

  function touchProgress(msg) {
    lastProgressAt = Date.now();
    if (msg) lastProgressMsg = msg;
    writeDbProgress(msg || lastProgressMsg);
  }

  function assertAlive() {
    if (staleError) throw staleError;
  }

  async function run(location, fn, opts = {}) {
    assertAlive();
    step += 1;
    lastLocation = location;
    const label = `STEP ${step}`;
    touchProgress(opts.progressMsg || `Étape ${step} — ${location}`);
    const result = await runTimed(label, location, async () => {
      assertAlive();
      return fn();
    }, opts.timeoutMs ?? OP_TIMEOUT_MS);
    touchProgress(opts.progressMsg || `Étape ${step} OK — ${location}`);
    return result;
  }

  function dispose() {
    clearInterval(watchdog);
  }

  return {
    run,
    touchProgress,
    assertAlive,
    dispose,
    get lastLocation() { return lastLocation; },
    get lastStep() { return step; },
  };
}

module.exports = {
  TimeoutError,
  OP_TIMEOUT_MS,
  UPLOAD_TIMEOUT_MS,
  PROGRESS_STALE_MS,
  COMPRESS_TIMEOUT_MS,
  runTimed,
  createPipeline,
  formatFailMessage,
};

/**
 * Export fichiers Supabase Storage — copie fichier-par-fichier tolérante.
 * Un timeout / échec sur un fichier n’arrête pas les autres.
 */
const { getSupabaseAdmin } = require('../../lib/supabaseAdmin');
const supabaseStorageProvider = require('./supabaseStorageProvider');
const { runTimed } = require('./backupPipeline');
const { resolveBackupContentType } = require('./backupContentType');

const SOURCE_BUCKETS_FALLBACK = [
  'citymo-workers',
  'citymo-projects',
  'citymo-documents',
  'documents',
];

const EXCLUDE_BUCKETS = new Set(['citymo-backups']);

const LIST_PAGE_SIZE = 1000;
const MAX_FOLDER_DEPTH = Number(process.env.BACKUP_MAX_FOLDER_DEPTH) || 24;
const MAX_LIST_PAGES_PER_PREFIX = Number(process.env.BACKUP_MAX_LIST_PAGES) || 200;
const COPY_CONCURRENCY = Number(process.env.BACKUP_FILE_COPY_CONCURRENCY) || 4;
const MAX_FILE_BYTES = Number(process.env.BACKUP_MAX_FILE_BYTES) || 100 * 1024 * 1024;
/** Timeout par fichier (download + upload), défaut 120 s. */
const FILE_COPY_TIMEOUT_MS = Number(process.env.BACKUP_FILE_COPY_TIMEOUT_MS) || 120_000;
/** Tentatives par fichier (backoff exponentiel). */
const FILE_COPY_RETRIES = Math.max(1, Number(process.env.BACKUP_FILE_COPY_RETRIES) || 3);

function resolveFilesMode(mode) {
  const m = (mode || process.env.BACKUP_FILES_MODE || 'manifest').toLowerCase();
  return m === 'full' ? 'full' : 'manifest';
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function backoffMs(attempt) {
  // 2s, 4s, 8s…
  return Math.min(30_000, 1000 * (2 ** attempt));
}

function logCopy(msg, meta = {}) {
  const extra = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  console.info(`[backup:copy] ${msg}${extra}`);
}

async function listSourceBuckets(pipeline) {
  return pipeline.run(
    'filesExporter.listSourceBuckets',
    async () => {
      const sb = getSupabaseAdmin();
      const { data, error } = await sb.storage.listBuckets();
      if (error) throw new Error(error.message);
      if (!data?.length) return SOURCE_BUCKETS_FALLBACK;
      return data
        .map((b) => b.name || b.id)
        .filter((name) => name && !EXCLUDE_BUCKETS.has(name));
    },
    { progressMsg: 'Inventaire : liste des buckets…' },
  );
}

async function listBucketFiles(bucket, pipeline, onProgress) {
  const files = [];
  const sb = getSupabaseAdmin();

  async function walk(prefix, depth) {
    pipeline.assertAlive();
    if (depth > MAX_FOLDER_DEPTH) {
      throw new Error(`Profondeur max ${MAX_FOLDER_DEPTH} dépassée : ${bucket}/${prefix}`);
    }

    let offset = 0;
    let page = 0;

    while (true) {
      pipeline.assertAlive();
      page += 1;
      if (page > MAX_LIST_PAGES_PER_PREFIX) {
        throw new Error(`Pagination max ${MAX_LIST_PAGES_PER_PREFIX} pages : ${bucket}/${prefix || '/'}`);
      }

      const listPath = prefix || '(racine)';
      const location = `storage.list(${bucket}, ${listPath}, offset=${offset}, page=${page})`;

      const { data, error } = await pipeline.run(location, async () => (
        sb.storage.from(bucket).list(prefix, {
          limit: LIST_PAGE_SIZE,
          offset,
          sortBy: { column: 'name', order: 'asc' },
        })
      ));

      if (error) {
        throw new Error(`Liste ${bucket}/${prefix || ''} : ${error.message}`);
      }

      if (!data?.length) break;

      for (const item of data) {
        pipeline.assertAlive();
        const itemPath = prefix ? `${prefix}/${item.name}` : item.name;
        if (item.id === null) {
          await walk(itemPath, depth + 1);
        } else {
          files.push({
            bucket,
            path: itemPath,
            size: Number(item.metadata?.size || item.metadata?.contentLength || 0),
            mimetype: item.metadata?.mimetype || null,
            updated_at: item.updated_at || item.created_at || null,
          });
          onProgress?.({ phase: 'listed', bucket, path: itemPath, listed: files.length });
        }
      }

      if (data.length < LIST_PAGE_SIZE) break;
      offset += LIST_PAGE_SIZE;
    }
  }

  await pipeline.run(
    `listBucketFiles.walk(${bucket})`,
    () => walk('', 0),
    { progressMsg: `Inventaire bucket « ${bucket} »…` },
  );

  return files;
}

/**
 * Consomme un Blob / Response en Buffer (streaming si stream() dispo).
 */
async function materializeDownload(data, { label, onProgress } = {}) {
  const t0 = Date.now();
  if (data && typeof data.stream === 'function') {
    const reader = data.stream().getReader();
    const chunks = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(Buffer.from(value));
      received += value.byteLength || value.length || 0;
      onProgress?.(received);
    }
    const buf = Buffer.concat(chunks);
    return { buf, downloadMs: Date.now() - t0, streamed: true, bytes: buf.length };
  }
  const ab = await data.arrayBuffer();
  const buf = Buffer.from(ab);
  return { buf, downloadMs: Date.now() - t0, streamed: false, bytes: buf.length };
}

/**
 * Une tentative : download (stream) → upload backup (+ miroir Drive optionnel).
 * Timeout unique sur toute la tentative (défaut 120 s).
 */
async function copyFileOnce(file, backupPrefix, pipeline, { mirrorDrive } = {}) {
  const bucket = file.bucket;
  const filePath = file.path;
  const label = `${bucket}/${filePath}`;
  const destPath = `${backupPrefix}/files/${bucket}/${filePath}`;

  return runTimed('storage.copyFile', label, async () => {
    const sb = getSupabaseAdmin();
    const timings = {
      downloadMs: 0,
      uploadMs: 0,
      mirrorMs: 0,
      totalMs: 0,
    };
    const tAll = Date.now();

    pipeline.touchProgress(`Téléchargement ${label}…`);

    const { data, error } = await sb.storage.from(bucket).download(filePath);
    if (error) throw new Error(`Lecture ${label} : ${error.message}`);

    const { buf, downloadMs, streamed, bytes } = await materializeDownload(data, {
      label,
      onProgress: (n) => {
        if (n === 0 || n % (512 * 1024) < 64 * 1024) {
          pipeline.touchProgress(`Download ${label} — ${Math.round(n / 1024)} Ko`);
        }
      },
    });
    timings.downloadMs = downloadMs;

    if (buf.length > MAX_FILE_BYTES) {
      throw new Error(`Fichier trop volumineux (${buf.length} o, max ${MAX_FILE_BYTES})`);
    }

    const blobMime = data?.type || null;
    const resolved = resolveBackupContentType(file.mimetype || blobMime, filePath);

    pipeline.touchProgress(`Upload backup ${destPath} (${bytes} o)…`);
    const tUp = Date.now();
    await supabaseStorageProvider.upload(destPath, buf, resolved.contentType, {
      sourceBucket: bucket,
      sourcePath: filePath,
    });
    timings.uploadMs = Date.now() - tUp;

    if (mirrorDrive) {
      const tM = Date.now();
      await mirrorDrive(destPath, buf, resolved.contentType);
      timings.mirrorMs = Date.now() - tM;
    }

    timings.totalMs = Date.now() - tAll;

    return {
      source: label,
      dest: destPath,
      bucket,
      path: filePath,
      size: buf.length,
      size_listed: file.size || null,
      mimetype: resolved.contentType,
      mimetype_source: resolved.source,
      streamed,
      timings,
    };
  }, FILE_COPY_TIMEOUT_MS);
}

/**
 * Copie un fichier avec retries exponentiels + journal détaillé.
 * N’interrompt jamais le lot : renvoie { ok, entry } ou { ok:false, error }.
 */
async function copyFileWithRetry(file, backupPrefix, pipeline, opts = {}) {
  const label = `${file.bucket}/${file.path}`;
  const attempts = [];
  const t0 = Date.now();

  logCopy('START', {
    bucket: file.bucket,
    path: file.path,
    size_listed: file.size || null,
    timeout_ms: FILE_COPY_TIMEOUT_MS,
    retries: FILE_COPY_RETRIES,
  });

  for (let attempt = 1; attempt <= FILE_COPY_RETRIES; attempt += 1) {
    pipeline.assertAlive();
    const attemptStart = Date.now();
    try {
      const entry = await copyFileOnce(file, backupPrefix, pipeline, opts);
      const elapsed = Date.now() - t0;
      logCopy('OK', {
        bucket: file.bucket,
        path: file.path,
        size_bytes: entry.size,
        download_ms: entry.timings.downloadMs,
        upload_ms: entry.timings.uploadMs,
        mirror_ms: entry.timings.mirrorMs,
        total_ms: entry.timings.totalMs,
        streamed: entry.streamed,
        attempt,
      });
      return {
        ok: true,
        entry: {
          ...entry,
          attempts: attempt,
          elapsed_ms: elapsed,
        },
      };
    } catch (err) {
      const attemptMs = Date.now() - attemptStart;
      const errName = err?.name || 'Error';
      const errMsg = err?.message || String(err);
      attempts.push({
        attempt,
        error: errMsg,
        error_name: errName,
        elapsed_ms: attemptMs,
        timeout: errName === 'TimeoutError' || /TimeoutError/i.test(errMsg),
      });
      logCopy('FAIL', {
        bucket: file.bucket,
        path: file.path,
        size_listed: file.size || null,
        attempt,
        max_attempts: FILE_COPY_RETRIES,
        download_ms: null,
        copy_ms: attemptMs,
        error_name: errName,
        error: errMsg.slice(0, 400),
      });

      if (attempt < FILE_COPY_RETRIES) {
        const wait = backoffMs(attempt);
        logCopy('RETRY', {
          bucket: file.bucket,
          path: file.path,
          next_attempt: attempt + 1,
          backoff_ms: wait,
        });
        pipeline.touchProgress(`Retry ${attempt + 1}/${FILE_COPY_RETRIES} — ${label} (attente ${wait}ms)`);
        await sleep(wait);
      }
    }
  }

  const failed = {
    bucket: file.bucket,
    path: file.path,
    dest: `${backupPrefix}/files/${file.bucket}/${file.path}`,
    mimetype: file.mimetype || null,
    size: file.size || null,
    error: attempts[attempts.length - 1]?.error || 'échec copie',
    error_name: attempts[attempts.length - 1]?.error_name || 'Error',
    attempts,
    elapsed_ms: Date.now() - t0,
    timeout: attempts.some((a) => a.timeout),
  };

  logCopy('GIVE_UP', {
    bucket: file.bucket,
    path: file.path,
    size_listed: file.size || null,
    attempts: FILE_COPY_RETRIES,
    total_ms: failed.elapsed_ms,
    error: failed.error.slice(0, 400),
  });

  return { ok: false, error: failed };
}

async function copyFilesParallel(files, backupPrefix, pipeline, onProgress, { mirrorDrive } = {}) {
  const manifestEntries = [];
  const errors = [];
  let done = 0;
  let index = 0;
  const batchStarted = Date.now();
  let bytesCopied = 0;

  async function worker() {
    while (true) {
      pipeline.assertAlive();
      if (index >= files.length) return;
      const i = index;
      index += 1;
      const file = files[i];

      const result = await copyFileWithRetry(file, backupPrefix, pipeline, { mirrorDrive });
      done += 1;

      if (result.ok) {
        manifestEntries.push(result.entry);
        bytesCopied += result.entry.size || 0;
        onProgress?.({
          phase: 'copied',
          bucket: file.bucket,
          path: file.path,
          size: result.entry.size,
          copied: done,
          total: files.length,
        });
        pipeline.touchProgress(`Copie ${done}/${files.length} OK — ${file.bucket}/${file.path}`);
      } else {
        errors.push(result.error);
        onProgress?.({
          phase: 'copy_error',
          bucket: file.bucket,
          path: file.path,
          error: result.error.error,
          copied: done,
          total: files.length,
        });
        pipeline.touchProgress(
          `Échec fichier ${done}/${files.length} — ${file.bucket}/${file.path} (poursuite)`,
        );
      }
    }
  }

  const workerCount = Math.min(COPY_CONCURRENCY, Math.max(1, files.length));
  // Timeout lot = marge large ; chaque fichier a son propre timeout+retry
  const batchTimeout = Math.max(
    FILE_COPY_TIMEOUT_MS * 2,
    Math.ceil(files.length / workerCount) * FILE_COPY_TIMEOUT_MS * FILE_COPY_RETRIES
      + Math.ceil(files.length / workerCount) * 15_000,
  );

  await pipeline.run(
    `copyFilesParallel.workers(${workerCount}, ${files.length} fichiers)`,
    () => Promise.all(Array.from({ length: workerCount }, () => worker())),
    {
      timeoutMs: batchTimeout,
      progressMsg: `Copie parallèle ${files.length} fichier(s) (timeout/fichier ${FILE_COPY_TIMEOUT_MS / 1000}s)…`,
    },
  );

  const elapsedMs = Date.now() - batchStarted;
  const summary = {
    total: files.length,
    copied: manifestEntries.length,
    failed: errors.length,
    failed_files: errors.map((e) => ({
      bucket: e.bucket,
      path: e.path,
      size: e.size,
      error: e.error,
      timeout: e.timeout,
    })),
    elapsed_ms: elapsedMs,
    bytes_copied: bytesCopied,
    throughput_bps: elapsedMs > 0 ? Math.round((bytesCopied * 1000) / elapsedMs) : 0,
  };

  logCopy('BATCH_SUMMARY', {
    total: summary.total,
    copied: summary.copied,
    failed: summary.failed,
    elapsed_ms: summary.elapsed_ms,
    bytes_copied: summary.bytes_copied,
    throughput_bps: summary.throughput_bps,
    failed_paths: summary.failed_files.map((f) => `${f.bucket}/${f.path}`).slice(0, 20),
  });

  return { manifestEntries, errors, summary };
}

/**
 * @param {string} backupPrefix
 * @param {{ mode?: string, pipeline: object, onProgress?: Function }} options
 */
async function exportFiles(backupPrefix, options = {}) {
  const { pipeline, onProgress, mirrorDrive } = options;
  if (!pipeline) throw new Error('exportFiles requiert pipeline (backupPipeline.createPipeline).');

  const mode = resolveFilesMode(options.mode);
  const buckets = await listSourceBuckets(pipeline);
  const exportStarted = Date.now();

  const manifest = {
    format: mode === 'full' ? 'citymo-files-v2' : 'citymo-files-v3-manifest',
    mode,
    exported_at: new Date().toISOString(),
    buckets,
    files: [],
    errors: [],
    copied_files: 0,
    drive_copied_files: 0,
    copy_summary: null,
  };

  let totalListed = 0;
  let driveCopiedCount = 0;
  const batchSummaries = [];
  const mirrorWithCount = mirrorDrive
    ? async (destPath, buf, contentType) => {
      await mirrorDrive(destPath, buf, contentType);
      driveCopiedCount += 1;
    }
    : null;
  let bucketIndex = 0;

  for (const bucket of buckets) {
    pipeline.assertAlive();
    bucketIndex += 1;
    onProgress?.({ phase: 'bucket_start', bucket, mode, bucketIndex, bucketTotal: buckets.length });

    let bucketFiles;
    try {
      bucketFiles = await pipeline.run(
        `exportFiles.bucket[${bucketIndex}/${buckets.length}]=${bucket}`,
        () => listBucketFiles(bucket, pipeline, (p) => {
          if (p.listed === 1 || p.listed % 50 === 0) {
            onProgress?.({ phase: 'listing', bucket, listed: p.listed, path: p.path });
            pipeline.touchProgress(`Inventaire ${bucket} — ${p.listed} objets`);
          }
        }),
        { progressMsg: `Bucket ${bucketIndex}/${buckets.length} : ${bucket}…` },
      );
    } catch (err) {
      manifest.errors.push({ bucket, path: '', error: err.message });
      pipeline.touchProgress(`Bucket ${bucket} en erreur : ${err.message}`);
      continue;
    }

    totalListed += bucketFiles.length;
    onProgress?.({
      phase: 'bucket_listed',
      bucket,
      count: bucketFiles.length,
      totalListed,
      bucketIndex,
      bucketTotal: buckets.length,
    });
    pipeline.touchProgress(`${bucket} : ${bucketFiles.length} fichier(s) — total inventorié ${totalListed}`);

    if (mode === 'manifest') {
      await pipeline.run(
        `exportFiles.manifestMerge(${bucket}, ${bucketFiles.length} entrées)`,
        async () => {
          for (const f of bucketFiles) {
            manifest.files.push({
              bucket: f.bucket,
              path: f.path,
              size: f.size,
              mimetype: f.mimetype,
              updated_at: f.updated_at,
            });
          }
        },
        { progressMsg: `Manifeste ${bucket} (${bucketFiles.length})…` },
      );
      continue;
    }

    if (!bucketFiles.length) continue;

    const { manifestEntries, errors, summary } = await copyFilesParallel(
      bucketFiles,
      backupPrefix,
      pipeline,
      onProgress,
      { mirrorDrive: mirrorWithCount },
    );
    manifest.files.push(...manifestEntries);
    manifest.errors.push(...errors);
    if (summary) batchSummaries.push({ bucket, ...summary });
  }

  const totalElapsed = Date.now() - exportStarted;
  const totalCopied = mode === 'full' ? manifest.files.length : 0;
  const totalFailed = manifest.errors.filter((e) => e.path).length;
  const bytesCopied = manifest.files.reduce((s, f) => s + (f.size || 0), 0);

  manifest.total_files = manifest.files.length;
  manifest.total_size = bytesCopied;
  manifest.listed_objects = totalListed;
  manifest.copied_files = totalCopied;
  manifest.drive_copied_files = mode === 'full' ? driveCopiedCount : 0;
  manifest.copy_summary = {
    total_listed: totalListed,
    copied: totalCopied,
    failed: totalFailed,
    failed_files: manifest.errors
      .filter((e) => e.path)
      .map((e) => ({
        bucket: e.bucket,
        path: e.path,
        size: e.size,
        error: e.error,
        timeout: Boolean(e.timeout),
      })),
    elapsed_ms: totalElapsed,
    bytes_copied: bytesCopied,
    throughput_bps: totalElapsed > 0 ? Math.round((bytesCopied * 1000) / totalElapsed) : 0,
    file_timeout_ms: FILE_COPY_TIMEOUT_MS,
    retries: FILE_COPY_RETRIES,
    buckets: batchSummaries,
  };

  const s = manifest.copy_summary;
  const summaryLines = [
    `Fichiers listés : ${s.total_listed}`,
    `Copiés : ${s.copied}`,
    `Échoués : ${s.failed}`,
    `Temps total : ${Math.round(s.elapsed_ms / 1000)}s`,
    `Débit moyen : ${s.throughput_bps > 0 ? `${(s.throughput_bps / 1024).toFixed(1)} Ko/s` : '—'}`,
  ];
  if (s.failed_files.length) {
    summaryLines.push('Échoués :');
    for (const f of s.failed_files.slice(0, 30)) {
      summaryLines.push(`  - ${f.bucket}/${f.path}${f.timeout ? ' (timeout)' : ''} — ${f.error}`);
    }
  }
  console.info(`[backup:copy] EXPORT_SUMMARY\n${summaryLines.join('\n')}`);
  pipeline.touchProgress(
    `Copie Storage : ${s.copied}/${s.total_listed} OK, ${s.failed} échec(s)`,
  );

  return manifest;
}

module.exports = {
  exportFiles,
  listSourceBuckets,
  listBucketFiles,
  resolveFilesMode,
  FILE_COPY_TIMEOUT_MS,
  FILE_COPY_RETRIES,
  copyFileWithRetry,
};

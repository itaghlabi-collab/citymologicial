/**
 * Export fichiers Supabase Storage — pipeline déterministe (timeouts 30s / watchdog 60s).
 */
const { getSupabaseAdmin } = require('../../lib/supabaseAdmin');
const supabaseStorageProvider = require('./supabaseStorageProvider');
const { OP_TIMEOUT_MS } = require('./backupPipeline');

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

function resolveFilesMode(mode) {
  const m = (mode || process.env.BACKUP_FILES_MODE || 'manifest').toLowerCase();
  return m === 'full' ? 'full' : 'manifest';
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

/**
 * Liste récursive paginée — chaque appel storage.list() a un timeout 30s.
 */
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

async function copyFileToBackup(bucket, filePath, backupPrefix, pipeline, { mirrorDrive } = {}) {
  const label = `${bucket}/${filePath}`;
  const sb = getSupabaseAdmin();

  const { data, error } = await pipeline.run(
    `storage.download(${label})`,
    () => sb.storage.from(bucket).download(filePath),
  );
  if (error) throw new Error(`Lecture ${label} : ${error.message}`);

  const buffer = await pipeline.run(
    `arrayBuffer(${label})`,
    () => data.arrayBuffer(),
  );
  const buf = Buffer.from(buffer);
  if (buf.length > MAX_FILE_BYTES) {
    throw new Error(`Fichier trop volumineux (${buf.length} o, max ${MAX_FILE_BYTES})`);
  }

  const destPath = `${backupPrefix}/files/${bucket}/${filePath}`;
  await pipeline.run(
    `supabaseStorage.upload(${destPath})`,
    () => supabaseStorageProvider.upload(destPath, buf, data.type || 'application/octet-stream'),
  );

  if (mirrorDrive) {
    await pipeline.run(
      `googleDrive.mirror(${destPath})`,
      () => mirrorDrive(destPath, buf, data.type || 'application/octet-stream'),
      { timeoutMs: Number(process.env.BACKUP_DRIVE_UPLOAD_TIMEOUT_MS) || 300_000 },
    );
  }

  return { source: label, dest: destPath, size: buf.length };
}

async function copyFilesParallel(files, backupPrefix, pipeline, onProgress, { mirrorDrive } = {}) {
  const manifestEntries = [];
  const errors = [];
  let done = 0;
  let index = 0;

  async function worker(workerId) {
    while (true) {
      pipeline.assertAlive();
      if (index >= files.length) return;
      const i = index;
      index += 1;
      const file = files[i];
      try {
        const copied = await copyFileToBackup(file.bucket, file.path, backupPrefix, pipeline, { mirrorDrive });
        manifestEntries.push(copied);
        done += 1;
        onProgress?.({ phase: 'copied', bucket: file.bucket, path: file.path, copied: done, total: files.length });
        pipeline.touchProgress(`Copie ${done}/${files.length} — ${file.bucket}/${file.path}`);
      } catch (err) {
        errors.push({ bucket: file.bucket, path: file.path, error: err.message });
        done += 1;
        onProgress?.({ phase: 'copy_error', bucket: file.bucket, path: file.path, error: err.message, copied: done, total: files.length });
        pipeline.touchProgress(`Erreur copie ${file.bucket}/${file.path}: ${err.message}`);
      }
    }
  }

  const workerCount = Math.min(COPY_CONCURRENCY, files.length || 1);
  await pipeline.run(
    `copyFilesParallel.workers(${workerCount}, ${files.length} fichiers)`,
    () => Promise.all(Array.from({ length: workerCount }, (_, w) => worker(w + 1))),
    { timeoutMs: Math.max(OP_TIMEOUT_MS, files.length * OP_TIMEOUT_MS), progressMsg: `Copie parallèle ${files.length} fichier(s)…` },
  );

  return { manifestEntries, errors };
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

  const manifest = {
    format: mode === 'full' ? 'citymo-files-v2' : 'citymo-files-v3-manifest',
    mode,
    exported_at: new Date().toISOString(),
    buckets,
    files: [],
    errors: [],
    copied_files: 0,
    drive_copied_files: 0,
  };

  let totalListed = 0;
  let driveCopiedCount = 0;
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

    const { manifestEntries, errors } = await copyFilesParallel(
      bucketFiles,
      backupPrefix,
      pipeline,
      onProgress,
      { mirrorDrive: mirrorWithCount },
    );
    manifest.files.push(...manifestEntries);
    manifest.errors.push(...errors);
  }

  manifest.total_files = manifest.files.length;
  manifest.total_size = manifest.files.reduce((s, f) => s + (f.size || 0), 0);
  manifest.listed_objects = totalListed;
  manifest.copied_files = mode === 'full' ? manifest.files.length : 0;
  manifest.drive_copied_files = mode === 'full' ? driveCopiedCount : 0;
  return manifest;
}

module.exports = {
  exportFiles,
  listSourceBuckets,
  listBucketFiles,
  resolveFilesMode,
};

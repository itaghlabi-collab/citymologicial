/**
 * Export fichiers Supabase Storage pour sauvegardes ERP.
 *
 * BACKUP_FILES_MODE :
 *   manifest (défaut) — inventaire rapide (métadonnées), sans copie binaire → fiable sur Railway
 *   full            — copie chaque fichier vers citymo-backups (lent, optionnel)
 */
const { getSupabaseAdmin } = require('../../lib/supabaseAdmin');
const supabaseStorageProvider = require('./supabaseStorageProvider');

const SOURCE_BUCKETS_FALLBACK = [
  'citymo-workers',
  'citymo-projects',
  'citymo-documents',
  'documents',
];

const EXCLUDE_BUCKETS = new Set(['citymo-backups']);

const LIST_PAGE_SIZE = 1000;
const COPY_CONCURRENCY = Number(process.env.BACKUP_FILE_COPY_CONCURRENCY) || 4;
const FILE_COPY_TIMEOUT_MS = Number(process.env.BACKUP_FILE_COPY_TIMEOUT_MS) || 120_000;
const MAX_FILE_BYTES = Number(process.env.BACKUP_MAX_FILE_BYTES) || 100 * 1024 * 1024;

function resolveFilesMode(mode) {
  const m = (mode || process.env.BACKUP_FILES_MODE || 'manifest').toLowerCase();
  return m === 'full' ? 'full' : 'manifest';
}

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Délai dépassé (${Math.round(ms / 1000)}s) — ${label}`));
    }, ms);
    promise
      .then((v) => { clearTimeout(timer); resolve(v); })
      .catch((e) => { clearTimeout(timer); reject(e); });
  });
}

async function listSourceBuckets() {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.storage.listBuckets();
  if (error || !data?.length) return SOURCE_BUCKETS_FALLBACK;
  return data
    .map((b) => b.name || b.id)
    .filter((name) => name && !EXCLUDE_BUCKETS.has(name));
}

/**
 * Liste récursive paginée d'un bucket (heartbeat possible via onProgress).
 */
async function listBucketFiles(bucket, onProgress) {
  const files = [];
  const sb = getSupabaseAdmin();

  async function walk(prefix) {
    let offset = 0;
    while (true) {
      const { data, error } = await sb.storage.from(bucket).list(prefix, {
        limit: LIST_PAGE_SIZE,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      });

      if (error) {
        throw new Error(`Liste ${bucket}/${prefix || ''} : ${error.message}`);
      }

      if (!data?.length) break;

      for (const item of data) {
        const itemPath = prefix ? `${prefix}/${item.name}` : item.name;
        if (item.id === null) {
          await walk(itemPath);
        } else {
          const entry = {
            bucket,
            path: itemPath,
            size: Number(item.metadata?.size || item.metadata?.contentLength || 0),
            mimetype: item.metadata?.mimetype || null,
            updated_at: item.updated_at || item.created_at || null,
          };
          files.push(entry);
          onProgress?.({ phase: 'listed', bucket, path: itemPath, listed: files.length });
        }
      }

      if (data.length < LIST_PAGE_SIZE) break;
      offset += LIST_PAGE_SIZE;
    }
  }

  await walk('');
  return files;
}

async function copyFileToBackup(bucket, filePath, backupPrefix) {
  const sb = getSupabaseAdmin();
  const label = `${bucket}/${filePath}`;

  const { data, error } = await withTimeout(
    sb.storage.from(bucket).download(filePath),
    FILE_COPY_TIMEOUT_MS,
    `lecture ${label}`,
  );
  if (error) throw new Error(`Lecture ${label} : ${error.message}`);

  const buffer = Buffer.from(await data.arrayBuffer());
  if (buffer.length > MAX_FILE_BYTES) {
    throw new Error(`Fichier trop volumineux (${buffer.length} o, max ${MAX_FILE_BYTES})`);
  }

  const destPath = `${backupPrefix}/files/${bucket}/${filePath}`;
  await withTimeout(
    supabaseStorageProvider.upload(destPath, buffer, data.type || 'application/octet-stream'),
    FILE_COPY_TIMEOUT_MS,
    `écriture ${destPath}`,
  );

  return { source: label, dest: destPath, size: buffer.length };
}

async function copyFilesParallel(files, backupPrefix, onProgress) {
  const manifestEntries = [];
  const errors = [];
  let done = 0;
  let index = 0;

  async function worker() {
    while (index < files.length) {
      const i = index;
      index += 1;
      const file = files[i];
      try {
        const copied = await copyFileToBackup(file.bucket, file.path, backupPrefix);
        manifestEntries.push(copied);
        done += 1;
        onProgress?.({ phase: 'copied', bucket: file.bucket, path: file.path, copied: done, total: files.length });
      } catch (err) {
        errors.push({ bucket: file.bucket, path: file.path, error: err.message });
        done += 1;
        onProgress?.({ phase: 'copy_error', bucket: file.bucket, path: file.path, error: err.message, copied: done, total: files.length });
      }
    }
  }

  const workers = Array.from({ length: Math.min(COPY_CONCURRENCY, files.length || 1) }, () => worker());
  await Promise.all(workers);

  return { manifestEntries, errors };
}

/**
 * @param {string} backupPrefix
 * @param {{ mode?: string, onProgress?: Function }} options
 */
async function exportFiles(backupPrefix, options = {}) {
  const mode = resolveFilesMode(options.mode);
  const onProgress = options.onProgress;
  const buckets = await listSourceBuckets();

  const manifest = {
    format: mode === 'full' ? 'citymo-files-v2' : 'citymo-files-v3-manifest',
    mode,
    exported_at: new Date().toISOString(),
    buckets,
    files: [],
    errors: [],
  };

    let totalListed = 0;

  for (const bucket of buckets) {
    onProgress?.({ phase: 'bucket_start', bucket, mode });

    let bucketFiles;
    try {
      bucketFiles = await listBucketFiles(bucket, (p) => {
        totalListed = p.listed;
        if (p.listed === 1 || p.listed % 100 === 0) {
          onProgress?.({ phase: 'listing', bucket, listed: p.listed, path: p.path });
        }
      });
    } catch (err) {
      manifest.errors.push({ bucket, path: '', error: err.message });
      continue;
    }

    onProgress?.({
      phase: 'bucket_listed',
      bucket,
      count: bucketFiles.length,
      totalListed: totalListed + bucketFiles.length,
    });
    totalListed += bucketFiles.length;

    if (mode === 'manifest') {
      for (const f of bucketFiles) {
        manifest.files.push({
          bucket: f.bucket,
          path: f.path,
          size: f.size,
          mimetype: f.mimetype,
          updated_at: f.updated_at,
        });
      }
      continue;
    }

    const { manifestEntries, errors } = await copyFilesParallel(bucketFiles, backupPrefix, onProgress);
    manifest.files.push(...manifestEntries);
    manifest.errors.push(...errors);
  }

  manifest.total_files = manifest.files.length;
  manifest.total_size = manifest.files.reduce((s, f) => s + (f.size || 0), 0);
  manifest.listed_objects = totalListed;
  return manifest;
}

module.exports = {
  exportFiles,
  listSourceBuckets,
  listBucketFiles,
  resolveFilesMode,
};

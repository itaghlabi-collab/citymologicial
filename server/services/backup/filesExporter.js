/**
 * Export fichiers Supabase Storage (documents, PDF, scans RH, etc.)
 */
const { getSupabaseAdmin } = require('../../lib/supabaseAdmin');

const SOURCE_BUCKETS_FALLBACK = [
  'citymo-workers',
  'citymo-projects',
  'citymo-documents',
  'documents',
];

const EXCLUDE_BUCKETS = new Set(['citymo-backups']);

async function listSourceBuckets() {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.storage.listBuckets();
  if (error || !data?.length) return SOURCE_BUCKETS_FALLBACK;
  return data
    .map((b) => b.name || b.id)
    .filter((name) => name && !EXCLUDE_BUCKETS.has(name));
}

async function listBucketFiles(bucket, prefix = '', acc = []) {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.storage.from(bucket).list(prefix, {
    limit: 1000,
    sortBy: { column: 'name', order: 'asc' },
  });
  if (error) {
    return { bucket, prefix, error: error.message, files: acc };
  }

  for (const item of data || []) {
    const itemPath = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.id === null) {
      await listBucketFiles(bucket, itemPath, acc);
    } else {
      acc.push({
        bucket,
        path: itemPath,
        size: item.metadata?.size || item.metadata?.contentLength || 0,
        mimetype: item.metadata?.mimetype || null,
        updated_at: item.updated_at || item.created_at || null,
      });
    }
  }
  return { bucket, files: acc };
}

async function copyFileToBackup(bucket, filePath, backupPrefix, storageProvider) {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.storage.from(bucket).download(filePath);
  if (error) throw new Error(`Lecture ${bucket}/${filePath} : ${error.message}`);

  const buffer = Buffer.from(await data.arrayBuffer());
  const destPath = `${backupPrefix}/files/${bucket}/${filePath}`;
  await storageProvider.upload(destPath, buffer, data.type || 'application/octet-stream');
  return { source: `${bucket}/${filePath}`, dest: destPath, size: buffer.length };
}

async function exportFiles(backupPrefix, storageProvider, onProgress) {
  const buckets = await listSourceBuckets();
  const manifest = {
    format: 'citymo-files-v2',
    exported_at: new Date().toISOString(),
    buckets,
    files: [],
    errors: [],
  };

  for (const bucket of buckets) {
    const listing = await listBucketFiles(bucket);
    const files = listing.files || [];

    for (const file of files) {
      try {
        const copied = await copyFileToBackup(bucket, file.path, backupPrefix, storageProvider);
        manifest.files.push(copied);
        onProgress?.({ bucket, path: file.path, size: copied.size });
      } catch (err) {
        manifest.errors.push({ bucket, path: file.path, error: err.message });
      }
    }
  }

  manifest.total_files = manifest.files.length;
  manifest.total_size = manifest.files.reduce((s, f) => s + (f.size || 0), 0);
  return manifest;
}

module.exports = { exportFiles, listSourceBuckets, listBucketFiles };

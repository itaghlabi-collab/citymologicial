#!/usr/bin/env node
/**
 * Diagnostic MIME bucket citymo-backups — upload JPEG + PNG de test, download, checksum, cleanup.
 * N'utilise QUE le préfixe __citymo_mime_probe__/ (aucune donnée ERP).
 *
 * Usage :
 *   cd server && node scripts/test-backup-bucket-mime.js
 *
 * Nécessite SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (dotenv / Railway).
 */
require('dotenv').config();

const crypto = require('crypto');
const { getSupabaseAdmin } = require('../lib/supabaseAdmin');
const { upload, download, remove, BUCKET } = require('../services/backup/supabaseStorageProvider');
const { resolveBackupContentType } = require('../services/backup/backupContentType');

/** Minimal valid 1×1 JPEG */
const JPEG_BYTES = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k=',
  'base64',
);

/** Minimal valid 1×1 PNG */
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

async function probeOne({ name, buffer, mime }) {
  const path = `__citymo_mime_probe__/${Date.now()}_${name}`;
  const resolved = resolveBackupContentType(mime, name);
  console.log(`[probe] upload ${path} mime=${resolved.contentType} (${buffer.length} o)`);

  const up = await upload(path, buffer, resolved.contentType, {
    sourceBucket: 'probe',
    sourcePath: name,
  });
  console.log(`[probe] upload OK contentType=${up.contentType}`);

  const down = await download(path);
  const okSize = down.length === buffer.length;
  const okHash = sha256(down) === sha256(buffer);
  console.log(`[probe] download size=${down.length} sizeOk=${okSize} hashOk=${okHash}`);

  await remove(path);
  console.log(`[probe] cleanup OK ${path}`);

  if (!okSize || !okHash) {
    throw new Error(`Vérification échouée pour ${name}`);
  }
  return true;
}

async function checkBucketMimePolicy() {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.storage.getBucket(BUCKET);
  if (error) {
    console.warn('[probe] getBucket:', error.message);
    return;
  }
  console.log('[probe] bucket', {
    id: data.id,
    public: data.public,
    file_size_limit: data.file_size_limit,
    allowed_mime_types: data.allowed_mime_types,
  });
  if (Array.isArray(data.allowed_mime_types) && data.allowed_mime_types.length > 0) {
    console.warn(
      '[probe] ATTENTION : allowed_mime_types est encore restrictif. '
      + 'Exécutez supabase/RUN_CITYMO_BACKUPS_ALLOW_ALL_MIME.sql',
    );
  }
}

async function main() {
  if (!process.env.SUPABASE_URL && !process.env.VITE_SUPABASE_URL) {
    throw new Error('SUPABASE_URL manquant');
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY manquant');
  }

  await checkBucketMimePolicy();
  await probeOne({ name: 'probe.jpg', buffer: JPEG_BYTES, mime: 'image/jpeg' });
  await probeOne({ name: 'probe.png', buffer: PNG_BYTES, mime: 'image/png' });
  await probeOne({
    name: 'noext',
    buffer: Buffer.from('citymo-raw-probe'),
    mime: null,
  });
  console.log('[probe] SUCCÈS — JPEG, PNG et sans-extension OK sur', BUCKET);
}

main().catch((err) => {
  console.error('[probe] ÉCHEC', err.message);
  process.exit(1);
});

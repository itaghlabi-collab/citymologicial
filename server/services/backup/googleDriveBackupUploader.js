/**
 * Upload artefacts sauvegarde → sous-dossier BCK-xxxx sur Google Drive.
 * Télécharge toujours depuis Supabase Storage avant envoi (jamais de chemin local).
 */
const { Readable } = require('stream');
const supabaseStorageProvider = require('./supabaseStorageProvider');
const {
  assertRootFolderAccessible,
  getDriveRootFolderId,
  findChildFolder,
  getOrCreateFolder,
  findFileInFolder,
  getDrive,
} = require('./googleDriveStorageProvider');
const {
  loadDriveContext,
  getDriveListOpts,
  formatDriveApiError,
} = require('./googleDriveContext');
const { getSharedDriveApiFlags } = require('./googleDriveAuth');

/** backupRef → folderId Google Drive (conservé pour tout le job). */
const backupFolderCache = new Map();

const ARCHIVE_NAMES = [
  'database.json.gz',
  'files-manifest.json.gz',
  'complete-index.json.gz',
];

function logDrive(msg) {
  console.info(`[DRIVE] ${msg}`);
}

function parseStoragePath(storagePath) {
  const parts = String(storagePath).split('/').filter(Boolean);
  if (parts.length < 2) {
    throw new Error(`Chemin Supabase invalide pour Drive : ${storagePath}`);
  }
  const backupRef = parts[0];
  const fileName = parts[parts.length - 1];
  const relativePath = parts.slice(1).join('/');
  return { backupRef, fileName, relativePath };
}

/**
 * Crée ou récupère le dossier BCK-xxxx sous le dossier racine partagé.
 * @returns {Promise<string>} folderId Google Drive
 */
async function ensureBackupFolder(backupRef) {
  if (backupFolderCache.has(backupRef)) {
    return backupFolderCache.get(backupRef);
  }

  await assertRootFolderAccessible();
  const rootId = getDriveRootFolderId();
  let folderId = await findChildFolder(rootId, backupRef);

  if (!folderId) {
    folderId = await getOrCreateFolder(rootId, backupRef);
    logDrive(`folder created: ${folderId} (ref=${backupRef})`);
  } else {
    logDrive(`folder exists: ${folderId} (ref=${backupRef})`);
  }

  backupFolderCache.set(backupRef, folderId);
  return folderId;
}

function getCachedBackupFolderId(backupRef) {
  return backupFolderCache.get(backupRef) || null;
}

async function resolveParentFolderId(backupRef, relativePath) {
  const backupFolderId = await ensureBackupFolder(backupRef);
  const segments = relativePath.split('/').filter(Boolean);
  const fileName = segments.pop();

  if (!segments.length) {
    return { parentId: backupFolderId, fileName };
  }

  let parentId = backupFolderId;
  for (const segment of segments) {
    parentId = await getOrCreateFolder(parentId, segment);
  }
  return { parentId, fileName };
}

/**
 * Upload un buffer dans le dossier BCK-xxxx (chemin relatif sous ce dossier).
 */
async function uploadBufferToBackup(backupRef, relativePath, buffer, contentType = 'application/gzip') {
  if (!buffer?.length) {
    throw new Error(`Buffer vide pour ${backupRef}/${relativePath}`);
  }

  const { parentId, fileName } = await resolveParentFolderId(backupRef, relativePath);
  const sourceType = Buffer.isBuffer(buffer) ? 'buffer' : 'stream';

  logDrive(`upload start: ${fileName}`);
  logDrive(`source type: ${sourceType}`);
  logDrive(`source size: ${buffer.length}`);
  logDrive(`target parent: ${parentId}`);

  const drive = getDrive();
  const apiFlags = getSharedDriveApiFlags();
  const existingId = await findFileInFolder(parentId, fileName);
  const media = {
    mimeType: contentType || 'application/octet-stream',
    body: Buffer.isBuffer(buffer) ? Readable.from(buffer) : buffer,
  };

  let fileId;
  let size;

  try {
    if (existingId) {
      const res = await drive.files.update({
        fileId: existingId,
        media,
        fields: 'id, size',
        ...apiFlags,
      });
      fileId = res.data.id;
      size = Number(res.data.size) || buffer.length;
    } else {
      const res = await drive.files.create({
        requestBody: {
          name: fileName,
          parents: [parentId],
        },
        media,
        fields: 'id, size',
        ...apiFlags,
      });
      fileId = res.data.id;
      size = Number(res.data.size) || buffer.length;
    }
  } catch (err) {
    const ctx = await loadDriveContext().catch(() => ({}));
    throw new Error(formatDriveApiError(err, ctx));
  }

  if (!fileId || size <= 0) {
    throw new Error(`Upload Drive invalide pour ${fileName} (fileId=${fileId}, size=${size})`);
  }

  logDrive(`upload success: ${fileId} (${fileName}, ${size} bytes)`);
  return { fileId, folderId: parentId, fileName, bytes: size };
}

/**
 * Télécharge depuis Supabase Storage puis upload vers Drive.
 */
async function uploadFromSupabasePath(storagePath, contentType) {
  const { backupRef, relativePath } = parseStoragePath(storagePath);

  logDrive(`download from supabase: ${storagePath}`);
  const buffer = await supabaseStorageProvider.download(storagePath);

  if (!buffer?.length) {
    throw new Error(`Fichier Supabase vide ou introuvable : ${storagePath}`);
  }

  logDrive(`supabase download ok: ${storagePath} (${buffer.length} bytes)`);
  return uploadBufferToBackup(backupRef, relativePath, buffer, contentType);
}

/**
 * Liste les fichiers directs (non-dossiers) dans BCK-xxxx.
 */
async function listBackupFolderFiles(backupRef) {
  const folderId = await ensureBackupFolder(backupRef);
  const drive = getDrive();
  const listOpts = await getDriveListOpts();
  const q = `'${folderId}' in parents and trashed=false`;

  const res = await drive.files.list({
    q,
    fields: 'files(id, name, size, mimeType)',
    pageSize: 1000,
    ...listOpts,
  });

  const items = (res.data.files || []).filter(
    (f) => f.mimeType !== 'application/vnd.google-apps.folder',
  );

  logDrive(`folder list (${folderId}): ${items.length} fichier(s) direct(s)`);
  for (const f of items) {
    logDrive(`  - ${f.name} id=${f.id} size=${f.size || 0}`);
  }

  return { folderId, files: items };
}

/**
 * Vérifie que les 3 archives gzip sont présentes à la racine du dossier BCK-xxxx.
 */
async function verifyBackupArchivesOnDrive(backupRef, { minArchives = 3 } = {}) {
  const { folderId, files } = await listBackupFolderFiles(backupRef);
  const issues = [];

  for (const name of ARCHIVE_NAMES.slice(0, minArchives)) {
    const match = files.find((f) => f.name === name);
    if (!match) {
      issues.push(`${name} absent`);
      continue;
    }
    const size = Number(match.size) || 0;
    if (size <= 0) {
      issues.push(`${name} taille 0 (id=${match.id})`);
      continue;
    }
    logDrive(`archive verified: ${name} id=${match.id} size=${size}`);
  }

  if (issues.length) {
    throw new Error(
      `Dossier Drive ${backupRef} incomplet (${files.length} fichier(s) direct(s)) — ${issues.join('; ')}`,
    );
  }

  if (files.length < minArchives) {
    throw new Error(
      `Dossier Drive ${backupRef} : ${files.length} fichier(s) trouvé(s), minimum ${minArchives} attendu(s)`,
    );
  }

  return {
    folderId,
    files: files.map((f) => ({ id: f.id, name: f.name, size: Number(f.size) || 0 })),
  };
}

function resetBackupFolderCache() {
  backupFolderCache.clear();
}

module.exports = {
  ARCHIVE_NAMES,
  ensureBackupFolder,
  getCachedBackupFolderId,
  uploadBufferToBackup,
  uploadFromSupabasePath,
  listBackupFolderFiles,
  verifyBackupArchivesOnDrive,
  resetBackupFolderCache,
  parseStoragePath,
};

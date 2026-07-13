/**
 * Stockage Google Drive — OAuth (Mon Drive) ou Service Account (Shared Drive).
 */
const {
  getDriveRootFolderId,
  isGoogleDriveEnabled,
  resetResolvedDriveRootFolderId,
} = require('./googleDriveConfig');
const { getDrive, getSharedDriveApiFlags, resetDriveAuth } = require('./googleDriveAuth');
const {
  loadDriveContext,
  getDriveListOpts,
  formatDriveApiError,
  resetDriveContext,
} = require('./googleDriveContext');

let rootFolderVerified = false;
const folderCache = new Map();

function resetDriveClient() {
  resetDriveAuth();
  resetResolvedDriveRootFolderId();
  rootFolderVerified = false;
  folderCache.clear();
  resetDriveContext();
}

async function assertRootFolderAccessible() {
  if (rootFolderVerified) return;

  try {
    await loadDriveContext();
    rootFolderVerified = true;
  } catch (err) {
    const rootId = getDriveRootFolderId();
    throw new Error(formatDriveApiError(err, { rootFolderId: rootId }));
  }
}

function escapeDriveQuery(value) {
  return String(value).replace(/'/g, "\\'");
}

function apiFlags() {
  return getSharedDriveApiFlags();
}

async function findChildFolder(parentId, name) {
  const drive = getDrive();
  const listOpts = await getDriveListOpts();
  const q = [
    `name='${escapeDriveQuery(name)}'`,
    `'${parentId}' in parents`,
    "mimeType='application/vnd.google-apps.folder'",
    'trashed=false',
  ].join(' and ');

  const res = await drive.files.list({ q, fields: 'files(id)', pageSize: 1, ...listOpts });
  return res.data.files?.[0]?.id || null;
}

async function findFileInFolder(parentId, name) {
  const drive = getDrive();
  const listOpts = await getDriveListOpts();
  const q = [
    `name='${escapeDriveQuery(name)}'`,
    `'${parentId}' in parents`,
    'trashed=false',
  ].join(' and ');

  const res = await drive.files.list({ q, fields: 'files(id)', pageSize: 1, ...listOpts });
  return res.data.files?.[0]?.id || null;
}

async function getOrCreateFolder(parentId, name) {
  const cacheKey = `${parentId}/${name}`;
  if (folderCache.has(cacheKey)) return folderCache.get(cacheKey);

  const existing = await findChildFolder(parentId, name);
  if (existing) {
    folderCache.set(cacheKey, existing);
    return existing;
  }

  const drive = getDrive();
  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
    ...apiFlags(),
  });

  folderCache.set(cacheKey, created.data.id);
  return created.data.id;
}

async function resolvePathFolderIds(filePath) {
  const parts = filePath.split('/').filter(Boolean);
  if (!parts.length) throw new Error('Chemin Drive invalide.');

  const fileName = parts.pop();
  let parentId = getDriveRootFolderId();

  for (const segment of parts) {
    parentId = await getOrCreateFolder(parentId, segment);
  }

  return { parentId, fileName };
}

async function upload(filePath, buffer, contentType = 'application/gzip') {
  if (!isGoogleDriveEnabled()) {
    throw new Error('Google Drive non configuré.');
  }

  if (!buffer?.length) {
    throw new Error(`Buffer vide pour ${filePath}`);
  }

  await assertRootFolderAccessible();

  const drive = getDrive();
  const flags = apiFlags();
  const { parentId, fileName } = await resolvePathFolderIds(filePath);
  const existingId = await findFileInFolder(parentId, fileName);

  const mimeType = contentType || 'application/octet-stream';
  const media = { mimeType, body: buffer };

  try {
    if (existingId) {
      await drive.files.update({
        fileId: existingId,
        media,
        ...flags,
      });
      return { path: filePath, fileId: existingId, bucket: 'google_drive' };
    }

    const created = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [parentId],
      },
      media,
      fields: 'id, webViewLink, webContentLink, size',
      ...flags,
    });

    return {
      path: filePath,
      fileId: created.data.id,
      webViewLink: created.data.webViewLink,
      bucket: 'google_drive',
      bytes: Number(created.data.size) || buffer.length,
    };
  } catch (err) {
    const ctx = await loadDriveContext().catch(() => ({}));
    throw new Error(formatDriveApiError(err, ctx));
  }
}

async function download(filePath) {
  const drive = getDrive();
  const flags = apiFlags();
  const { parentId, fileName } = await resolvePathFolderIds(filePath);
  const fileId = await findFileInFolder(parentId, fileName);
  if (!fileId) throw new Error(`Fichier Drive introuvable : ${filePath}`);

  const res = await drive.files.get(
    { fileId, alt: 'media', ...flags },
    { responseType: 'arraybuffer' },
  );
  return Buffer.from(res.data);
}

async function getSignedUrl(filePath) {
  const drive = getDrive();
  const flags = apiFlags();
  const { parentId, fileName } = await resolvePathFolderIds(filePath);
  const fileId = await findFileInFolder(parentId, fileName);
  if (!fileId) throw new Error(`Fichier Drive introuvable : ${filePath}`);

  const meta = await drive.files.get({
    fileId,
    fields: 'webViewLink, webContentLink',
    ...flags,
  });
  return meta.data.webContentLink || meta.data.webViewLink;
}

async function getBackupFolderLink(backupRef) {
  await assertRootFolderAccessible();

  const drive = getDrive();
  const flags = apiFlags();
  const rootId = getDriveRootFolderId();
  let folderId = await findChildFolder(rootId, backupRef);
  if (!folderId) folderId = await getOrCreateFolder(rootId, backupRef);

  const meta = await drive.files.get({
    fileId: folderId,
    fields: 'webViewLink',
    ...flags,
  });
  return { folderId, url: meta.data.webViewLink };
}

async function remove(filePath) {
  const drive = getDrive();
  const flags = apiFlags();
  const { parentId, fileName } = await resolvePathFolderIds(filePath);
  const fileId = await findFileInFolder(parentId, fileName);
  if (fileId) {
    await drive.files.delete({ fileId, ...flags });
  }
}

async function removeBackupFolder(backupRef) {
  const rootId = getDriveRootFolderId();
  const folderId = await findChildFolder(rootId, backupRef);
  if (!folderId) return;

  const drive = getDrive();
  const listOpts = await getDriveListOpts();
  const flags = apiFlags();

  const children = await drive.files.list({
    q: `'${folderId}' in parents and trashed=false`,
    fields: 'files(id)',
    pageSize: 1000,
    ...listOpts,
  });

  for (const child of children.data.files || []) {
    await drive.files.delete({ fileId: child.id, ...flags });
  }
  await drive.files.delete({ fileId: folderId, ...flags });
  folderCache.delete(`${rootId}/${backupRef}`);
}

async function listBackupTree(backupRef) {
  await assertRootFolderAccessible();
  const rootId = getDriveRootFolderId();
  const folderId = await findChildFolder(rootId, backupRef);
  if (!folderId) return [];

  const drive = getDrive();
  const listOpts = await getDriveListOpts();
  const files = [];

  async function walk(parentId, relPrefix) {
    let pageToken = null;
    do {
      const res = await drive.files.list({
        q: `'${parentId}' in parents and trashed=false`,
        fields: 'nextPageToken, files(id, name, mimeType, size)',
        pageSize: 1000,
        pageToken: pageToken || undefined,
        ...listOpts,
      });

      for (const f of res.data.files || []) {
        const relPath = relPrefix ? `${relPrefix}/${f.name}` : f.name;
        if (f.mimeType === 'application/vnd.google-apps.folder') {
          await walk(f.id, relPath);
        } else {
          files.push({
            id: f.id,
            name: f.name,
            relPath,
            size: Number(f.size) || 0,
          });
        }
      }
      pageToken = res.data.nextPageToken;
    } while (pageToken);
  }

  await walk(folderId, '');
  return files;
}

async function listBackupFiles(backupRef) {
  await assertRootFolderAccessible();
  const rootId = getDriveRootFolderId();
  const folderId = await findChildFolder(rootId, backupRef);
  if (!folderId) return [];

  const drive = getDrive();
  const listOpts = await getDriveListOpts();
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'`,
    fields: 'files(id, name, size)',
    pageSize: 100,
    ...listOpts,
  });
  return res.data.files || [];
}

async function verifyDriveBackupFiles(backupRef, expectedPaths) {
  const expectedNames = expectedPaths.map((p) => p.split('/').pop());
  const files = await listBackupFiles(backupRef);
  const found = new Set(files.map((f) => f.name));
  const missing = expectedNames.filter((name) => !found.has(name));
  if (missing.length) {
    throw new Error(
      `Fichiers manquants sur Drive (${missing.join(', ')}) — ${files.length}/${expectedNames.length} présents.`,
    );
  }
  return { count: files.length, names: [...found] };
}

async function list(prefix) {
  const drive = getDrive();
  const listOpts = await getDriveListOpts();
  const rootId = getDriveRootFolderId();
  const folderId = prefix ? (await findChildFolder(rootId, prefix) || rootId) : rootId;

  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed=false`,
    fields: 'files(id, name, size)',
    pageSize: 1000,
    ...listOpts,
  });

  return (res.data.files || []).map((f) => ({ name: f.name, id: f.id, size: f.size }));
}

module.exports = {
  upload,
  download,
  getSignedUrl,
  remove,
  list,
  listBackupFiles,
  listBackupTree,
  verifyDriveBackupFiles,
  getBackupFolderLink,
  removeBackupFolder,
  assertRootFolderAccessible,
  resetDriveClient,
  getDrive,
  getDriveRootFolderId,
  findChildFolder,
  getOrCreateFolder,
  findFileInFolder,
};

/**
 * Stockage Google Drive — 2e copie de sécurité (compte de service).
 * Projet GCP : citymo-erp-sauvegardes
 */
const { Readable } = require('stream');
const { google } = require('googleapis');
const {
  getServiceAccountCredentials,
  getDriveRootFolderId,
  isGoogleDriveEnabled,
} = require('./googleDriveConfig');

let driveClient = null;
const folderCache = new Map();

function getDrive() {
  if (driveClient) return driveClient;
  const credentials = getServiceAccountCredentials();
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });
  driveClient = google.drive({ version: 'v3', auth });
  return driveClient;
}

function escapeDriveQuery(value) {
  return String(value).replace(/'/g, "\\'");
}

async function findChildFolder(parentId, name) {
  const drive = getDrive();
  const q = [
    `name='${escapeDriveQuery(name)}'`,
    `'${parentId}' in parents`,
    "mimeType='application/vnd.google-apps.folder'",
    'trashed=false',
  ].join(' and ');

  const res = await drive.files.list({ q, fields: 'files(id)', pageSize: 1 });
  return res.data.files?.[0]?.id || null;
}

async function findFileInFolder(parentId, name) {
  const drive = getDrive();
  const q = [
    `name='${escapeDriveQuery(name)}'`,
    `'${parentId}' in parents`,
    'trashed=false',
  ].join(' and ');

  const res = await drive.files.list({ q, fields: 'files(id)', pageSize: 1 });
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

  const drive = getDrive();
  const { parentId, fileName } = await resolvePathFolderIds(filePath);
  const existingId = await findFileInFolder(parentId, fileName);

  const media = {
    mimeType: contentType,
    body: Readable.from(buffer),
  };

  if (existingId) {
    await drive.files.update({
      fileId: existingId,
      media,
    });
    return { path: filePath, fileId: existingId, bucket: 'google_drive' };
  }

  const created = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [parentId],
    },
    media,
    fields: 'id, webViewLink, webContentLink',
  });

  return {
    path: filePath,
    fileId: created.data.id,
    webViewLink: created.data.webViewLink,
    bucket: 'google_drive',
  };
}

async function download(filePath) {
  const drive = getDrive();
  const { parentId, fileName } = await resolvePathFolderIds(filePath);
  const fileId = await findFileInFolder(parentId, fileName);
  if (!fileId) throw new Error(`Fichier Drive introuvable : ${filePath}`);

  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' },
  );
  return Buffer.from(res.data);
}

async function getSignedUrl(filePath) {
  const drive = getDrive();
  const { parentId, fileName } = await resolvePathFolderIds(filePath);
  const fileId = await findFileInFolder(parentId, fileName);
  if (!fileId) throw new Error(`Fichier Drive introuvable : ${filePath}`);

  const meta = await drive.files.get({
    fileId,
    fields: 'webViewLink, webContentLink',
  });
  return meta.data.webContentLink || meta.data.webViewLink;
}

async function getBackupFolderLink(backupRef) {
  const rootId = getDriveRootFolderId();
  let folderId = await findChildFolder(rootId, backupRef);
  if (!folderId) folderId = await getOrCreateFolder(rootId, backupRef);

  const meta = await drive.files.get({
    fileId: folderId,
    fields: 'webViewLink',
  });
  return { folderId, url: meta.data.webViewLink };
}

async function remove(filePath) {
  const drive = getDrive();
  const { parentId, fileName } = await resolvePathFolderIds(filePath);
  const fileId = await findFileInFolder(parentId, fileName);
  if (fileId) {
    await drive.files.delete({ fileId });
  }
}

async function removeBackupFolder(backupRef) {
  const rootId = getDriveRootFolderId();
  const folderId = await findChildFolder(rootId, backupRef);
  if (!folderId) return;

  const drive = getDrive();
  const children = await drive.files.list({
    q: `'${folderId}' in parents and trashed=false`,
    fields: 'files(id)',
    pageSize: 1000,
  });

  for (const child of children.data.files || []) {
    await drive.files.delete({ fileId: child.id });
  }
  await drive.files.delete({ fileId: folderId });
  folderCache.delete(`${rootId}/${backupRef}`);
}

async function list(prefix) {
  const drive = getDrive();
  const rootId = getDriveRootFolderId();
  const folderId = prefix ? (await findChildFolder(rootId, prefix) || rootId) : rootId;

  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed=false`,
    fields: 'files(id, name, size)',
    pageSize: 1000,
  });

  return (res.data.files || []).map((f) => ({ name: f.name, id: f.id, size: f.size }));
}

module.exports = {
  upload,
  download,
  getSignedUrl,
  remove,
  list,
  getBackupFolderLink,
  removeBackupFolder,
};

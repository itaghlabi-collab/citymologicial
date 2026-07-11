/**
 * Contexte Google Drive — détecte Drive partagé vs Mon Drive personnel.
 *
 * CAUSE RACINE des échecs persistants :
 * Les comptes de service n'ont AUCUN quota sur « Mon Drive » personnel.
 * Erreur Google : "Service Accounts do not have storage quota"
 * → le dossier GOOGLE_DRIVE_FOLDER_ID DOIT être dans un Drive partagé (Shared Drive).
 */
const { Readable } = require('stream');
const {
  getDriveRootFolderId,
  getServiceAccountEmail,
  normalizeDriveFolderId,
} = require('./googleDriveConfig');

let contextCache = null;

function resetDriveContext() {
  contextCache = null;
}

function getDrive() {
  return require('./googleDriveStorageProvider').getDrive();
}

function isServiceAccountQuotaError(message) {
  const msg = String(message || '').toLowerCase();
  return msg.includes('service accounts do not have storage quota')
    || msg.includes('storage quota')
    || msg.includes('cannot upload to my drive');
}

function formatDriveApiError(err, context = {}) {
  const raw = String(err?.message || err || 'erreur inconnue');

  if (isServiceAccountQuotaError(raw)) {
    const email = getServiceAccountEmail() || 'le compte de service';
    return (
      'Google Drive : compte de service sans quota sur Mon Drive personnel. '
      + 'Le dossier configuré doit être dans un Drive partagé (Shared Drive), pas dans « Mon Drive ». '
      + `Étapes : 1) Google Drive → Drives partagés → créer « CITYMO Sauvegardes ». `
      + `2) Ajouter ${email} comme Gestionnaire de contenu. `
      + `3) Créer le dossier sauvegardes DANS ce drive partagé. `
      + `4) Mettre à jour GOOGLE_DRIVE_FOLDER_ID sur Railway avec le nouvel ID. `
      + `(Détail Google : ${raw})`
    );
  }

  if (context.rootFolderId && raw.includes('File not found')) {
    const email = getServiceAccountEmail();
    return `Dossier Drive inaccessible (ID ${context.rootFolderId}). Partagez-le avec ${email} (Éditeur ou Gestionnaire de contenu). Détail : ${raw}`;
  }

  return raw;
}

/**
 * Charge métadonnées du dossier racine et détecte s'il est dans un Drive partagé.
 */
async function loadDriveContext() {
  if (contextCache) return contextCache;

  const rootFolderId = getDriveRootFolderId();
  const configuredDriveId = process.env.GOOGLE_DRIVE_SHARED_DRIVE_ID?.trim() || null;
  const drive = getDrive();

  let data;
  try {
    const res = await drive.files.get({
      fileId: rootFolderId,
      fields: 'id, name, driveId, mimeType, capabilities, parents',
      supportsAllDrives: true,
    });
    data = res.data;
  } catch (err) {
    throw new Error(formatDriveApiError(err, { rootFolderId }));
  }

  const sharedDriveId = data.driveId || configuredDriveId || null;
  const isSharedDrive = Boolean(sharedDriveId);

  contextCache = {
    rootFolderId,
    rootFolderName: data.name || rootFolderId,
    sharedDriveId,
    isSharedDrive,
    isPersonalDrive: !isSharedDrive,
    canAddChildren: data.capabilities?.canAddChildren !== false,
    canEdit: data.capabilities?.canEdit !== false,
  };

  console.info('[DRIVE] context loaded', {
    folder: contextCache.rootFolderName,
    folderId: contextCache.rootFolderId,
    sharedDriveId: contextCache.sharedDriveId || '(aucun — Mon Drive personnel)',
    isSharedDrive: contextCache.isSharedDrive,
  });

  return contextCache;
}

function getListOptsForContext(ctx) {
  const opts = {
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  };
  if (ctx?.sharedDriveId) {
    opts.corpora = 'drive';
    opts.driveId = ctx.sharedDriveId;
  }
  return opts;
}

async function getDriveListOpts() {
  const ctx = await loadDriveContext();
  return getListOptsForContext(ctx);
}

/**
 * Vérifie que le dossier est dans un Drive partagé (requis pour compte de service).
 */
async function assertSharedDriveRequired() {
  const ctx = await loadDriveContext();
  const email = getServiceAccountEmail() || 'citymo-backup-service@...';

  if (ctx.isPersonalDrive) {
    throw new Error(
      `Configuration invalide : « ${ctx.rootFolderName} » est dans Mon Drive personnel (ID ${ctx.rootFolderId}). `
      + 'Les comptes de service Google ne peuvent pas y uploader de fichiers (aucun quota). '
      + 'Créez un Drive partagé (Shared Drive) dans Google Workspace, placez-y le dossier sauvegardes, '
      + `ajoutez ${email} comme Gestionnaire de contenu, puis mettez à jour GOOGLE_DRIVE_FOLDER_ID.`,
    );
  }

  if (!ctx.canAddChildren && !ctx.canEdit) {
    throw new Error(
      `Le compte de service ${email} n'a pas la permission d'écrire dans le dossier ${ctx.rootFolderId}. `
      + 'Attribuez le rôle Gestionnaire de contenu sur le Drive partagé.',
    );
  }

  return ctx;
}

/**
 * Test réel d'upload + suppression (détecte quota / permissions avant le job).
 */
async function probeDriveWriteAccess() {
  const ctx = await assertSharedDriveRequired();
  const drive = getDrive();
  const probeName = `.citymo-probe-${Date.now()}.txt`;
  const body = Buffer.from('citymo-drive-probe-ok', 'utf8');

  console.info('[DRIVE] probe upload start');
  console.info('[DRIVE] probe target folder:', ctx.rootFolderId);
  console.info('[DRIVE] probe shared drive:', ctx.sharedDriveId);

  let fileId;
  try {
    const created = await drive.files.create({
      requestBody: {
        name: probeName,
        parents: [ctx.rootFolderId],
      },
      media: {
        mimeType: 'text/plain',
        body: Readable.from(body),
      },
      supportsAllDrives: true,
      fields: 'id, size',
    });
    fileId = created.data.id;
    console.info(`[DRIVE] probe upload success: ${fileId}`);
  } catch (err) {
    throw new Error(formatDriveApiError(err, ctx));
  }

  try {
    await drive.files.delete({ fileId, supportsAllDrives: true });
    console.info('[DRIVE] probe cleanup ok');
  } catch (err) {
    console.warn('[DRIVE] probe cleanup failed (non bloquant):', err.message);
  }

  return { ok: true, folderId: ctx.rootFolderId, sharedDriveId: ctx.sharedDriveId };
}

/**
 * Résout un ID depuis URL drives/ ou folders/ pour GOOGLE_DRIVE_SHARED_DRIVE_ID.
 */
function normalizeSharedDriveId(raw) {
  if (!raw?.trim()) return null;
  let id = String(raw).trim();
  const fromDrives = id.match(/\/drives\/([a-zA-Z0-9_-]+)/);
  const fromFolders = id.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (fromDrives) id = fromDrives[1];
  else if (fromFolders) id = fromFolders[1];
  return id;
}

module.exports = {
  loadDriveContext,
  resetDriveContext,
  getDriveListOpts,
  getListOptsForContext,
  assertSharedDriveRequired,
  probeDriveWriteAccess,
  formatDriveApiError,
  isServiceAccountQuotaError,
  normalizeSharedDriveId,
};

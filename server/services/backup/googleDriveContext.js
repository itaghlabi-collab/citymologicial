/**
 * Contexte Google Drive — adapté au mode d'authentification (OAuth vs Service Account).
 */
const { Readable } = require('stream');
const {
  getDriveRootFolderId,
  getServiceAccountEmail,
} = require('./googleDriveConfig');
const {
  getDrive,
  getAuthMode,
  getSharedDriveApiFlags,
  isOAuthMode,
  isServiceAccountMode,
  AUTH_MODES,
} = require('./googleDriveAuth');

let contextCache = null;

function resetDriveContext() {
  contextCache = null;
}

function isServiceAccountQuotaError(message) {
  const msg = String(message || '').toLowerCase();
  return msg.includes('service accounts do not have storage quota')
    || (msg.includes('storage quota') && msg.includes('service account'));
}

function formatDriveApiError(err, context = {}) {
  const raw = String(err?.message || err || 'erreur inconnue');
  const mode = context.authMode || getAuthMode();

  if (isServiceAccountQuotaError(raw)) {
    if (mode === AUTH_MODES.SERVICE_ACCOUNT) {
      const email = getServiceAccountEmail() || 'le compte de service';
      return (
        'Service Account sans quota sur Mon Drive. '
        + 'Solutions : (1) configurer OAuth (GOOGLE_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN) pour Mon Drive, '
        + `ou (2) placer le dossier dans un Drive partagé avec ${email} comme Gestionnaire de contenu. `
        + `(Détail Google : ${raw})`
      );
    }
  }

  if (context.rootFolderId && raw.includes('File not found')) {
    if (mode === AUTH_MODES.OAUTH) {
      return `Dossier Drive inaccessible (ID ${context.rootFolderId}). Vérifiez GOOGLE_DRIVE_FOLDER_ID et le refresh token OAuth. Détail : ${raw}`;
    }
    const email = getServiceAccountEmail();
    return `Dossier Drive inaccessible (ID ${context.rootFolderId}). Partagez-le avec ${email}. Détail : ${raw}`;
  }

  return raw;
}

async function loadDriveContext() {
  if (contextCache) return contextCache;

  const authMode = getAuthMode();
  const rootFolderId = getDriveRootFolderId();
  const configuredDriveId = process.env.GOOGLE_DRIVE_SHARED_DRIVE_ID?.trim() || null;
  const drive = getDrive();
  const apiFlags = getSharedDriveApiFlags();

  let data;
  try {
    const res = await drive.files.get({
      fileId: rootFolderId,
      fields: 'id, name, driveId, mimeType, capabilities, parents',
      ...apiFlags,
    });
    data = res.data;
  } catch (err) {
    throw new Error(formatDriveApiError(err, { rootFolderId, authMode }));
  }

  const sharedDriveId = data.driveId || configuredDriveId || null;
  const isSharedDrive = Boolean(sharedDriveId);

  contextCache = {
    authMode,
    rootFolderId,
    rootFolderName: data.name || rootFolderId,
    sharedDriveId,
    isSharedDrive,
    isPersonalDrive: !isSharedDrive,
    canAddChildren: data.capabilities?.canAddChildren !== false,
    canEdit: data.capabilities?.canEdit !== false,
  };

  console.info('[DRIVE] context loaded', {
    authMode: contextCache.authMode,
    folder: contextCache.rootFolderName,
    folderId: contextCache.rootFolderId,
    sharedDriveId: contextCache.sharedDriveId || (authMode === AUTH_MODES.OAUTH ? '(Mon Drive OAuth)' : '(aucun)'),
    isSharedDrive: contextCache.isSharedDrive,
  });

  if (isServiceAccountMode() && contextCache.isPersonalDrive) {
    console.warn(
      '[DRIVE] ATTENTION : Service Account + Mon Drive personnel = uploads impossibles. '
      + 'Passez en mode OAuth ou utilisez un Drive partagé.',
    );
  }

  return contextCache;
}

function getListOptsForContext(ctx) {
  if (isOAuthMode()) {
    return {};
  }
  const opts = getSharedDriveApiFlags();
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
 * Service Account uniquement — le dossier doit être dans un Shared Drive.
 */
async function assertSharedDriveRequired() {
  if (!isServiceAccountMode()) return loadDriveContext();

  const ctx = await loadDriveContext();
  const email = getServiceAccountEmail() || 'compte de service';

  if (ctx.isPersonalDrive) {
    throw new Error(
      `Mode Service Account : « ${ctx.rootFolderName} » est dans Mon Drive personnel. `
      + 'Interdit — aucun quota. Utilisez OAuth (GOOGLE_OAUTH_*) ou un Drive partagé.',
    );
  }

  if (!ctx.canAddChildren && !ctx.canEdit) {
    throw new Error(
      `Le compte de service ${email} ne peut pas écrire dans ${ctx.rootFolderId}. `
      + 'Rôle Gestionnaire de contenu requis sur le Shared Drive.',
    );
  }

  return ctx;
}

/**
 * Test upload + suppression — adapté au mode auth.
 */
async function probeDriveWriteAccess() {
  const ctx = isServiceAccountMode()
    ? await assertSharedDriveRequired()
    : await loadDriveContext();

  const drive = getDrive();
  const apiFlags = getSharedDriveApiFlags();
  const probeName = `.citymo-probe-${Date.now()}.txt`;
  const body = Buffer.from('citymo-drive-probe-ok', 'utf8');

  console.info('[DRIVE] probe upload start', { mode: ctx.authMode, folder: ctx.rootFolderId });

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
      fields: 'id, size',
      ...apiFlags,
    });
    fileId = created.data.id;
    console.info(`[DRIVE] probe upload success: ${fileId}`);
  } catch (err) {
    throw new Error(formatDriveApiError(err, ctx));
  }

  try {
    await drive.files.delete({ fileId, ...apiFlags });
    console.info('[DRIVE] probe cleanup ok');
  } catch (err) {
    console.warn('[DRIVE] probe cleanup failed (non bloquant):', err.message);
  }

  return {
    ok: true,
    authMode: ctx.authMode,
    folderId: ctx.rootFolderId,
    sharedDriveId: ctx.sharedDriveId || null,
  };
}

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

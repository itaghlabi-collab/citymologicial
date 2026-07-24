/**
 * Messages utilisateur sauvegardes — jamais de secrets.
 */
const { classifyDriveError } = require('./googleDriveErrors');

function sanitizeErrorForUser(errOrMessage) {
  const raw = String(errOrMessage?.message || errOrMessage || '');
  if (/invalid_grant|refresh.?token|revoked/i.test(raw)) {
    return {
      code: 'invalid_grant',
      userMessage: 'Google Drive déconnecté — reconnexion nécessaire',
      technical: raw.slice(0, 500),
    };
  }
  if (/storage upload failed|bad request|mime/i.test(raw)) {
    return {
      code: 'storage_upload',
      userMessage: 'Échec upload Storage — vérifier bucket et droits',
      technical: raw.slice(0, 500),
    };
  }
  if (/copie physique incomplète|physical/i.test(raw)) {
    return {
      code: 'physical_incomplete',
      userMessage: 'Copie fichiers incomplète — relancer la sauvegarde',
      technical: raw.slice(0, 500),
    };
  }
  if (/google drive|\[drive\]/i.test(raw)) {
    const c = classifyDriveError(errOrMessage);
    return { code: c.code, userMessage: c.userMessage, technical: raw.slice(0, 500) };
  }
  return {
    code: 'backup_error',
    userMessage: raw.length > 120 ? `${raw.slice(0, 117)}…` : (raw || 'Erreur de sauvegarde'),
    technical: raw.slice(0, 500),
  };
}

module.exports = { sanitizeErrorForUser };

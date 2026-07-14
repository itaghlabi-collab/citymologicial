/**
 * Tests unitaires — résolution MIME sauvegardes CITYMO.
 * Usage : cd server && node --test tests/backupContentType.test.js
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveBackupContentType,
  normalizeMime,
  mimeFromPath,
  isMimeNotSupportedError,
  OCTET_STREAM,
} = require('../services/backup/backupContentType');

describe('resolveBackupContentType', () => {
  it('conserve image/jpeg', () => {
    const r = resolveBackupContentType('image/jpeg', 'cin/recto.jpg');
    assert.equal(r.contentType, 'image/jpeg');
    assert.equal(r.source, 'provided');
    assert.equal(r.preserved, true);
  });

  it('normalise image/jpg → image/jpeg', () => {
    const r = resolveBackupContentType('image/jpg', 'a.jpg');
    assert.equal(r.contentType, 'image/jpeg');
  });

  it('conserve image/png', () => {
    const r = resolveBackupContentType('image/png', 'capture.png');
    assert.equal(r.contentType, 'image/png');
    assert.equal(r.preserved, true);
  });

  it('conserve application/pdf', () => {
    const r = resolveBackupContentType('application/pdf', 'doc.pdf');
    assert.equal(r.contentType, 'application/pdf');
  });

  it('conserve application/json', () => {
    const r = resolveBackupContentType('application/json', 'data.json');
    assert.equal(r.contentType, 'application/json');
  });

  it('conserve application/zip', () => {
    const r = resolveBackupContentType('application/zip', 'archive.zip');
    assert.equal(r.contentType, 'application/zip');
  });

  it('infère JPEG depuis extension si MIME absent', () => {
    const r = resolveBackupContentType(null, 'workers/cin/recto.jpeg');
    assert.equal(r.contentType, 'image/jpeg');
    assert.equal(r.source, 'extension');
  });

  it('infère PNG depuis extension', () => {
    const r = resolveBackupContentType('', 'screenshot.png');
    assert.equal(r.contentType, 'image/png');
    assert.equal(r.source, 'extension');
  });

  it('fichier sans extension → application/octet-stream', () => {
    const r = resolveBackupContentType(null, 'BCK-2026/files/rawfile');
    assert.equal(r.contentType, OCTET_STREAM);
    assert.equal(r.source, 'fallback');
  });

  it('MIME inconnu non vide est conservé', () => {
    const r = resolveBackupContentType('application/x-custom-binary', 'file.bin');
    assert.equal(r.contentType, 'application/x-custom-binary');
    assert.equal(r.source, 'provided');
  });

  it('MIME invalide + sans extension → octet-stream', () => {
    const r = resolveBackupContentType('not-a-mime', 'noext');
    assert.equal(r.contentType, OCTET_STREAM);
    assert.equal(r.source, 'fallback');
  });

  it('strip charset dans Blob type', () => {
    const r = resolveBackupContentType('image/png; charset=binary', 'a.png');
    assert.equal(r.contentType, 'image/png');
  });
});

describe('normalizeMime / mimeFromPath / errors', () => {
  it('normalizeMime nullish', () => {
    assert.equal(normalizeMime(null), null);
    assert.equal(normalizeMime(''), null);
    assert.equal(normalizeMime('unknown'), null);
  });

  it('mimeFromPath', () => {
    assert.equal(mimeFromPath('a/b/c.PDF'), 'application/pdf');
    assert.equal(mimeFromPath('noext'), null);
  });

  it('isMimeNotSupportedError', () => {
    assert.equal(
      isMimeNotSupportedError(new Error('mime type image/jpeg is not supported')),
      true,
    );
    assert.equal(isMimeNotSupportedError(new Error('network')), false);
  });
});

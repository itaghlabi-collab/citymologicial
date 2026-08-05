/**
 * Tests statiques — priorité resolveRefreshToken (DB > ENV > missing).
 * Aucun appel réseau, aucun secret loggé.
 */
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const authPath = require.resolve('./googleDriveAuth');
const statePath = require.resolve('./googleDriveAuthState');

let savedEnv;

function reloadAuth(mockGetStored) {
  delete require.cache[authPath];
  delete require.cache[statePath];
  require.cache[statePath] = {
    id: statePath,
    filename: statePath,
    loaded: true,
    exports: {
      getStoredRefreshToken: mockGetStored,
    },
  };
  return require('./googleDriveAuth');
}

describe('resolveRefreshToken — priorité DB / ENV', () => {
  beforeEach(() => {
    savedEnv = {
      refresh: process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
      id: process.env.GOOGLE_OAUTH_CLIENT_ID,
      secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    };
    process.env.GOOGLE_OAUTH_CLIENT_ID = '57318763988-test.apps.googleusercontent.com';
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-secret';
  });

  afterEach(() => {
    if (savedEnv.refresh === undefined) delete process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
    else process.env.GOOGLE_OAUTH_REFRESH_TOKEN = savedEnv.refresh;
    if (savedEnv.id === undefined) delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    else process.env.GOOGLE_OAUTH_CLIENT_ID = savedEnv.id;
    if (savedEnv.secret === undefined) delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    else process.env.GOOGLE_OAUTH_CLIENT_SECRET = savedEnv.secret;
    delete require.cache[authPath];
    delete require.cache[statePath];
  });

  it('DB présente → database_validated (ignore ENV Playground)', async () => {
    process.env.GOOGLE_OAUTH_REFRESH_TOKEN = 'env-playground-token';
    const auth = reloadAuth(async () => 'db-erp-token');
    auth.resetDriveAuth();
    const token = await auth.resolveRefreshToken();
    assert.equal(token, 'db-erp-token');
    assert.equal(auth.getRefreshTokenSource(), 'database_validated');
  });

  it('DB vide + ENV présente → env_fallback', async () => {
    process.env.GOOGLE_OAUTH_REFRESH_TOKEN = 'env-only-token';
    const auth = reloadAuth(async () => null);
    auth.resetDriveAuth();
    const token = await auth.resolveRefreshToken();
    assert.equal(token, 'env-only-token');
    assert.equal(auth.getRefreshTokenSource(), 'env_fallback');
  });

  it('aucune source → missing + throw', async () => {
    delete process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
    const auth = reloadAuth(async () => null);
    auth.resetDriveAuth();
    await assert.rejects(() => auth.resolveRefreshToken(), /refresh token non configuré/);
    assert.equal(auth.getRefreshTokenSource(), 'missing');
  });

  it('seedDbRefreshTokenCache invalide l’ancien client mémoire', async () => {
    process.env.GOOGLE_OAUTH_REFRESH_TOKEN = 'env-old';
    const auth = reloadAuth(async () => 'db-new');
    auth.resetDriveAuth();
    auth.seedDbRefreshTokenCache('db-new');
    const token = await auth.resolveRefreshToken();
    assert.equal(token, 'db-new');
    assert.equal(auth.getRefreshTokenSource(), 'database_validated');
  });

  it('unauthorized_client classifié clairement', () => {
    delete require.cache[require.resolve('./googleDriveErrors')];
    const { classifyDriveError } = require('./googleDriveErrors');
    const c = classifyDriveError(new Error('unauthorized_client'));
    assert.equal(c.code, 'unauthorized_client');
    assert.match(c.userMessage, /incompatible/i);
    assert.equal(c.reconnectRequired, true);
  });
});

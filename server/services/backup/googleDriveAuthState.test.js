/**
 * Tests unitaires — erp_backup_drive_state optionnelle (pas de crash sauvegarde).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// Mock avant require du module
const calls = { from: [], upsertPayloads: [] };

function makeError(message, code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

const mockSb = {
  from(table) {
    calls.from.push(table);
    return {
      select() {
        return {
          eq() {
            return {
              async maybeSingle() {
                return {
                  data: null,
                  error: makeError(
                    "Could not find the table 'public.erp_backup_drive_state' in the schema cache",
                    'PGRST205',
                  ),
                };
              },
            };
          },
        };
      },
      upsert(payload) {
        calls.upsertPayloads.push(payload);
        return {
          select() {
            return {
              async single() {
                return {
                  data: null,
                  error: makeError(
                    "Could not find the table 'public.erp_backup_drive_state' in the schema cache",
                    'PGRST205',
                  ),
                };
              },
            };
          },
        };
      },
    };
  },
};

require.cache[require.resolve('../../lib/supabaseAdmin')] = {
  id: require.resolve('../../lib/supabaseAdmin'),
  filename: require.resolve('../../lib/supabaseAdmin'),
  loaded: true,
  exports: { getSupabaseAdmin: () => mockSb },
};

// Recharger le module d’état
const statePath = require.resolve('./googleDriveAuthState');
delete require.cache[statePath];
const state = require('./googleDriveAuthState');

describe('googleDriveAuthState — table absente', () => {
  it('readState ne throw pas et renvoie un état mémoire', async () => {
    const row = await state.readState();
    assert.ok(row);
    assert.equal(row.status, 'unknown');
  });

  it('upsertState ne throw pas (non bloquant)', async () => {
    const row = await state.markDriveActive({ folderId: 'folder-test', authMode: 'oauth' });
    assert.ok(row);
    assert.equal(row.status, 'active');
    assert.equal(row.folder_id, 'folder-test');
    assert.ok(row.last_upload_at);
  });

  it('isDriveReconnectRequired fonctionne en mémoire', async () => {
    await state.markDriveReconnectRequired(new Error('invalid_grant'));
    assert.equal(await state.isDriveReconnectRequired(), true);
  });

  it('getDriveStatePublic expose table_available=false', async () => {
    const pub = await state.getDriveStatePublic();
    assert.equal(pub.table_available, false);
    assert.equal(pub.reconnect_required, true);
  });
});

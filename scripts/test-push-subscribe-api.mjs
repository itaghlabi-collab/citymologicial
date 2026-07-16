/**
 * Tests unitaires API Push subscribe/unsubscribe/status (sans réseau).
 * Usage: node scripts/test-push-subscribe-api.mjs
 */

import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const mod = await import(pathToFileURL(path.join(root, 'lib/pushSubscriptionsVercel.mjs')).href);

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

// --- parseSubscribePayload ---
try {
  mod.parseSubscribePayload({});
  assert(false, 'empty body should throw');
} catch (e) {
  assert(e.status === 400, 'empty body → 400');
}

try {
  mod.parseSubscribePayload({ endpoint: 'http://insecure', keys: { p256dh: 'a', auth: 'b' } });
  assert(false, 'http endpoint should throw');
} catch (e) {
  assert(e.status === 400, 'http endpoint → 400');
}

const parsed = mod.parseSubscribePayload({
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
  expirationTime: 123,
  keys: { p256dh: 'p256', auth: 'authsecret' },
  deviceName: 'Pixel',
  browser: 'Chrome',
  platform: 'Android',
  userAgent: 'Mozilla/5.0',
});
assert(parsed.endpoint.startsWith('https://'), 'https endpoint');
assert(parsed.p256dh === 'p256' && parsed.auth_key === 'authsecret', 'keys mapped');
assert(parsed.expiration_time === 123, 'expiration');
assert(parsed.device_name === 'Pixel', 'device');
console.log('PASS: parseSubscribePayload');

// --- parseUnsubscribePayload ---
try {
  mod.parseUnsubscribePayload({});
  assert(false, 'unsubscribe without endpoint');
} catch (e) {
  assert(e.status === 400, 'unsubscribe missing → 400');
}
const u = mod.parseUnsubscribePayload({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc' });
assert(u.endpoint.includes('fcm'), 'unsubscribe endpoint');
console.log('PASS: parseUnsubscribePayload');

// --- sanitizeSubscriptionRow ---
const safe = mod.sanitizeSubscriptionRow({
  id: '1',
  endpoint: 'https://x',
  p256dh: 'SECRET',
  auth_key: 'SECRET2',
  device_name: 'Phone',
  is_active: true,
  created_at: 't',
});
assert(!('p256dh' in safe) && !('auth_key' in safe) && !('authKey' in safe), 'no secrets in sanitize');
assert(safe.deviceName === 'Phone' && safe.isActive === true, 'safe fields');
console.log('PASS: sanitizeSubscriptionRow');

// --- upsert / revoke / status with mock admin ---
const store = new Map();
const userA = 'user-a';
const userB = 'user-b';
const endpoint = 'https://fcm.googleapis.com/fcm/send/device1';

function mockAdmin() {
  return {
    from() {
      const api = {
        _filters: {},
        _payload: null,
        _mode: null,
        upsert(row) {
          api._mode = 'upsert';
          api._payload = row;
          return api;
        },
        update(row) {
          api._mode = 'update';
          api._payload = row;
          return api;
        },
        select() { return api; },
        eq(col, val) {
          api._filters[col] = val;
          return api;
        },
        order() { return api; },
        async maybeSingle() {
          if (api._mode === 'upsert') {
            const prev = store.get(api._payload.endpoint);
            const next = {
              id: prev?.id || 'sub-1',
              ...api._payload,
              created_at: prev?.created_at || '2026-01-01',
              updated_at: '2026-01-02',
            };
            store.set(next.endpoint, next);
            return { data: next, error: null };
          }
          if (api._mode === 'update') {
            const row = store.get(api._filters.endpoint);
            if (!row || row.user_id !== api._filters.user_id) {
              return { data: null, error: null };
            }
            const next = { ...row, ...api._payload, updated_at: '2026-01-03' };
            store.set(next.endpoint, next);
            return { data: next, error: null };
          }
          return { data: null, error: null };
        },
        then(resolve) {
          // for status: .select().eq().eq().order() returns thenable of list
          const rows = [...store.values()].filter((r) => {
            if (api._filters.user_id && r.user_id !== api._filters.user_id) return false;
            if (api._filters.is_active != null && Boolean(r.is_active) !== Boolean(api._filters.is_active)) return false;
            return true;
          });
          return resolve({ data: rows, error: null });
        },
      };
      return api;
    },
  };
}

const admin = mockAdmin();
process.env.VAPID_PUBLIC_KEY = 'BPublicTest';
process.env.VAPID_PRIVATE_KEY = 'PrivateTest';

const payload = mod.parseSubscribePayload({
  endpoint,
  keys: { p256dh: 'p', auth: 'a' },
  deviceName: 'A1',
});

const upserted = await mod.upsertPushSubscription(userA, payload, admin);
assert(upserted.user_id === userA && upserted.is_active === true, 'upsert owner A');
assert(store.get(endpoint).p256dh === 'p', 'stored keys');

const upserted2 = await mod.upsertPushSubscription(userA, {
  ...payload,
  p256dh: 'p2',
  auth_key: 'a2',
}, admin);
assert(store.size === 1, 'no duplicate endpoint');
assert(store.get(endpoint).p256dh === 'p2', 'upsert updates keys');

// Reassign endpoint to user B (device takeover via service role upsert)
await mod.upsertPushSubscription(userB, payload, admin);
assert(store.get(endpoint).user_id === userB, 'endpoint reassigned to B');
assert(store.size === 1, 'still one row');

const revokedMissing = await mod.revokePushSubscription(userA, endpoint, admin);
assert(revokedMissing == null, 'A cannot revoke B subscription');

const revoked = await mod.revokePushSubscription(userB, endpoint, admin);
assert(revoked && revoked.is_active === false && revoked.revoked_at, 'B soft-revoke');

// status after revoke: activeCount 0 for B
const statusB = await mod.getPushSubscriptionStatus(userB, admin);
assert(statusB.subscribed === false && statusB.activeCount === 0, 'status inactive after revoke');
assert(statusB.vapidConfigured === true, 'vapidConfigured from env');
assert(!JSON.stringify(statusB).includes('p256dh'), 'status has no p256dh');
console.log('PASS: upsert / revoke / status mocks');

// user_id never taken from body — parseSubscribePayload has no user_id field used
assert(!('user_id' in parsed), 'parsed payload has no user_id');
console.log('PASS: user_id not accepted from client payload parser');

console.log('ALL PUSH SUBSCRIBE API TESTS PASSED');

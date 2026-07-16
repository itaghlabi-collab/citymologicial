/**
 * Tests API Push de test (étape 6) — sans envoi FCM réel.
 * Usage: node scripts/test-push-test-api.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import webpush from 'web-push';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

function assertIncludes(src, needle, label) {
  assert(src.includes(needle), `${label} must include ${JSON.stringify(needle)}`);
}

function assertNotIncludes(src, needle, label) {
  assert(!src.includes(needle), `${label} must NOT include ${JSON.stringify(needle)}`);
}

const prev = {
  VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
  VAPID_SUBJECT: process.env.VAPID_SUBJECT,
};

function restoreEnv() {
  for (const [k, v] of Object.entries(prev)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

const generated = webpush.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = generated.publicKey;
process.env.VAPID_PRIVATE_KEY = generated.privateKey;
process.env.VAPID_SUBJECT = 'mailto:test@citymoapp.com';

try {
  const mod = await import(pathToFileURL(path.join(root, 'lib/webPushSendVercel.mjs')).href);

  // --- payload fixe ---
  const payload = mod.buildTestPushPayload();
  assert(payload.title === 'CITYMO TEST', 'title');
  assert(
    payload.body === 'Votre configuration Web Push fonctionne correctement.',
    'body',
  );
  assert(payload.tag === 'test', 'tag');
  assert(payload.action_url === '/dashboard', 'action_url');
  assert(payload.data?.type === 'test', 'data.type');
  assert(payload.icon && payload.badge, 'icon/badge');
  console.log('PASS: buildTestPushPayload');
  console.log('PAYLOAD:', JSON.stringify(payload, null, 2));

  // --- toWebPushSubscription ---
  const sub = mod.toWebPushSubscription({
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
    p256dh: 'p256',
    auth_key: 'auth',
  });
  assert(sub.endpoint.includes('fcm'), 'endpoint');
  assert(sub.keys.p256dh === 'p256' && sub.keys.auth === 'auth', 'keys');
  console.log('PASS: toWebPushSubscription');

  // --- fetchLatestActiveSubscription (mock) ---
  const userId = 'user-test';
  const row = {
    id: 'sub-1',
    user_id: userId,
    endpoint: 'https://fcm.googleapis.com/fcm/send/device',
    p256dh: 'p256dh',
    auth_key: 'authkey',
    device_name: 'Pixel',
    browser: 'Chrome',
    platform: 'Android',
    is_active: true,
    updated_at: '2026-07-16T00:00:00Z',
  };

  const mockAdmin = {
    from() {
      const api = {
        select() { return api; },
        eq() { return api; },
        order() {
          return Promise.resolve({ data: [row], error: null });
        },
        update() { return api; },
      };
      return api;
    },
  };

  const latest = await mod.fetchLatestActiveSubscription(userId, mockAdmin);
  assert(latest?.id === 'sub-1', 'latest subscription');
  console.log('PASS: fetchLatestActiveSubscription');

  // --- isolation sources ---
  const apiSrc = fs.readFileSync(path.join(root, 'api/push/test.js'), 'utf8');
  const helperSrc = fs.readFileSync(path.join(root, 'lib/webPushSendVercel.mjs'), 'utf8');
  const notifSrc = fs.readFileSync(path.join(root, 'src/services/notifications/notifications.js'), 'utf8');
  const centerSrc = fs.readFileSync(
    path.join(root, 'src/components/notifications/NotificationCenter.jsx'),
    'utf8',
  );

  assertIncludes(apiSrc, 'sendTestPushToUser', 'api/test');
  assertIncludes(apiSrc, 'requireAuthenticatedUser', 'auth required');
  assertIncludes(helperSrc, 'webpush.sendNotification', 'uses web-push');
  assertIncludes(helperSrc, 'CITYMO TEST', 'test title');
  assertNotIncludes(helperSrc, 'createNotification', 'no createNotification');
  assertNotIncludes(helperSrc, 'NotificationCenter', 'no NotificationCenter');
  assertNotIncludes(apiSrc, 'createNotification', 'api no createNotification');
  assertNotIncludes(notifSrc, 'webPushSendVercel', 'notifications untouched');
  assertNotIncludes(notifSrc, '/push/test', 'notifications untouched');
  assertNotIncludes(centerSrc, '/push/test', 'NotificationCenter untouched');
  assertNotIncludes(centerSrc, 'requestTestPush', 'NotificationCenter untouched');

  const vercel = fs.readFileSync(path.join(root, 'vercel.json'), 'utf8');
  assertIncludes(vercel, 'api/push/test.js', 'vercel route');

  const clientSrc = fs.readFileSync(path.join(root, 'src/pwa/pushClient.js'), 'utf8');
  assertIncludes(clientSrc, '/push/test', 'client can call test');
  assertIncludes(clientSrc, 'requestTestPush', 'requestTestPush export');

  const uiSrc = fs.readFileSync(
    path.join(root, 'src/components/settings/PushNotificationSettings.jsx'),
    'utf8',
  );
  assertIncludes(uiSrc, 'Envoyer une notification de test', 'test button');

  console.log('PASS: API + isolation + UI trigger');
  console.log('ALL PUSH TEST API CHECKS PASSED');
} finally {
  restoreEnv();
}

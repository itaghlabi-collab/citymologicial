/**
 * Tests fan-out Web Push métier (étape 7) — sans FCM réel.
 * Usage: node scripts/test-push-deliver-business.mjs
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

  const notifRow = {
    id: 'notif-1',
    recipient_user_id: 'user-recipient',
    title: 'Demande chantier',
    message: 'Nouvelle demande de matériel',
    type: 'site_material_request',
    priority: 'high',
    entity_id: 'entity-1',
    action_url: 'module:besoins-projet',
    created_by: 'user-creator',
  };

  const payload = mod.buildPayloadFromNotificationRow(notifRow);
  assert(payload.title === 'Demande chantier', 'title from notification');
  assert(payload.body === 'Nouvelle demande de matériel', 'body = message');
  assert(payload.tag === 'site_material_request', 'tag = type');
  assert(payload.action_url === 'module:besoins-projet', 'action_url');
  assert(payload.url === 'module:besoins-projet', 'url');
  assert(payload.icon === '/icons/icon-192.png', 'default icon');
  assert(payload.badge === '/icons/icon-192.png', 'default badge');
  assert(payload.data.id === 'notif-1', 'data.id');
  assert(payload.data.type === 'site_material_request', 'data.type');
  assert(payload.data.entity_id === 'entity-1', 'data.entity_id');
  assert(payload.data.priority === 'high', 'data.priority');
  assert(payload.data.recipient_user_id === 'user-recipient', 'data.recipient');
  assert(payload.data.action_url === 'module:besoins-projet', 'data.action_url');
  console.log('PASS: buildPayloadFromNotificationRow');
  console.log('PAYLOAD:', JSON.stringify(payload, null, 2));

  // --- mock admin + deliver ---
  const subs = [
    {
      id: 'sub-a',
      user_id: 'user-recipient',
      endpoint: 'https://fcm.googleapis.com/fcm/send/a',
      p256dh: 'p1',
      auth_key: 'a1',
      is_active: true,
      updated_at: '2026-07-16T01:00:00Z',
    },
    {
      id: 'sub-b',
      user_id: 'user-recipient',
      endpoint: 'https://fcm.googleapis.com/fcm/send/b',
      p256dh: 'p2',
      auth_key: 'a2',
      is_active: true,
      updated_at: '2026-07-16T00:00:00Z',
    },
  ];

  let revokeCalls = 0;
  const mockAdmin = {
    from(table) {
      const api = {
        select() { return api; },
        eq() { return api; },
        order() { return api; },
        update() {
          revokeCalls += 1;
          return api;
        },
        async maybeSingle() {
          if (table === 'notifications') {
            return { data: notifRow, error: null };
          }
          return { data: null, error: null };
        },
        then(resolve) {
          // for .select().eq().eq().order() chain returning array
          return Promise.resolve(resolve({ data: table === 'push_subscriptions' ? subs : [], error: null }));
        },
      };
      // Make thenable for await admin.from().select()... without maybeSingle
      api.eq = function eq() { return api; };
      api.order = function order() { return api; };
      return api;
    },
  };

  // Override fetchActiveSubscriptionsForUser path: supabase chain isn't fully thenable
  // Use a dedicated mock that matches our helper's call pattern
  const mockAdmin2 = {
    from(table) {
      if (table === 'notifications') {
        return {
          select() {
            return {
              eq() {
                return {
                  async maybeSingle() {
                    return { data: notifRow, error: null };
                  },
                };
              },
            };
          },
        };
      }
      if (table === 'push_subscriptions') {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      order() {
                        return Promise.resolve({ data: subs, error: null });
                      },
                    };
                  },
                  update() {
                    return {
                      eq() {
                        return {
                          eq() {
                            return Promise.resolve({ data: null, error: null });
                          },
                        };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }
      return {
        select() { return { eq() { return { async maybeSingle() { return { data: null, error: null }; } }; } }; },
      };
    },
  };

  // Stub webpush.sendNotification to avoid real network
  const originalSend = webpush.sendNotification;
  let sendCalls = 0;
  webpush.sendNotification = async () => {
    sendCalls += 1;
    return { statusCode: 201 };
  };

  try {
    const delivered = await mod.deliverPushForExistingNotification(
      'notif-1',
      'user-creator',
      mockAdmin2,
    );
    assert(delivered.success === true, 'deliver success');
    assert(delivered.sent === 2, `sent both devices, got ${delivered.sent}`);
    assert(delivered.failed === 0, 'no failures');
    assert(delivered.payload.title === 'Demande chantier', 'payload echoed');
    assert(sendCalls === 2, `web-push called twice, got ${sendCalls}`);
    console.log('PASS: deliver to all active subscriptions');

    // wrong caller → 403
    let denied = false;
    try {
      await mod.deliverPushForExistingNotification('notif-1', 'other-user', mockAdmin2);
    } catch (e) {
      denied = e.status === 403;
    }
    assert(denied, 'wrong created_by → 403');
    console.log('PASS: refuses wrong caller');

    // 410 revokes
    sendCalls = 0;
    webpush.sendNotification = async () => {
      sendCalls += 1;
      const err = new Error('Gone');
      err.statusCode = 410;
      throw err;
    };
    const dead = await mod.deliverPushForExistingNotification(
      'notif-1',
      'user-creator',
      mockAdmin2,
    );
    assert(dead.sent === 0 && dead.failed === 2, '410 counted as failed');
    console.log('PASS: 410 soft-revoke path');
  } finally {
    webpush.sendNotification = originalSend;
  }

  // --- source isolation ---
  const notifSrc = fs.readFileSync(path.join(root, 'src/services/notifications/notifications.js'), 'utf8');
  const dispatchSrc = fs.readFileSync(path.join(root, 'src/services/notifications/webPushDispatch.js'), 'utf8');
  const deliverApi = fs.readFileSync(path.join(root, 'api/push/deliver.js'), 'utf8');
  const centerSrc = fs.readFileSync(
    path.join(root, 'src/components/notifications/NotificationCenter.jsx'),
    'utf8',
  );
  const eventsSrc = fs.readFileSync(
    path.join(root, 'src/services/notifications/notificationEvents.js'),
    'utf8',
  );

  assertIncludes(notifSrc, 'dispatchWebPushForNotification', 'hooked after create');
  assertIncludes(notifSrc, 'enqueueSecondaryChannels', 'shared secondary channels');
  assertIncludes(dispatchSrc, '/push/deliver', 'client calls deliver');
  assertIncludes(deliverApi, 'deliverPushForExistingNotification', 'API uses helper');
  assertNotIncludes(notifSrc, 'createPushNotification', 'no parallel API');
  assertNotIncludes(notifSrc, 'pushEvents', 'no pushEvents');
  assertNotIncludes(dispatchSrc, 'createNotification', 'dispatch does not create notifs');
  assertNotIncludes(centerSrc, 'dispatchWebPushForNotification', 'NotificationCenter untouched');
  assertNotIncludes(centerSrc, '/push/deliver', 'NotificationCenter untouched');
  assertNotIncludes(eventsSrc, 'dispatchWebPushForNotification', 'notificationEvents untouched');
  assertNotIncludes(eventsSrc, '/push/deliver', 'notificationEvents untouched');

  const vercel = fs.readFileSync(path.join(root, 'vercel.json'), 'utf8');
  assertIncludes(vercel, 'api/push/deliver.js', 'vercel route');

  console.log('PASS: wiring + isolation');
  console.log('ALL PUSH DELIVER BUSINESS CHECKS PASSED');
} finally {
  restoreEnv();
}

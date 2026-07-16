/**
 * Tests parsing payload Push SW (étape 5).
 * Usage: node scripts/test-sw-push-handlers.mjs
 */

import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const mod = await import(pathToFileURL(path.join(root, 'src/pwa/swPushPayload.js')).href);

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

// defaults
const empty = mod.parsePushPayload(null);
assert(empty.title === 'CITYMO' && empty.body.includes('notification'), 'defaults');
assert(empty.icon.includes('icon-192'), 'default icon');

// ERP-like payload
const erp = mod.parsePushPayload(JSON.stringify({
  title: 'Devis prêts à valider',
  body: 'La demande DA-2026-099 dispose de devis fournisseurs à comparer.',
  url: 'module:demandes-achat',
  tag: 'purchase_request-abc',
  data: {
    notificationId: 'n1',
    type: 'purchase_request',
    entityId: 'abc',
    priority: 'high',
  },
}));
assert(erp.title === 'Devis prêts à valider', 'title');
assert(erp.body.includes('DA-2026-099'), 'body');
assert(erp.tag === 'purchase_request-abc', 'tag');
assert(erp.data.notificationId === 'n1', 'data passthrough');

const origin = 'https://www.citymoapp.com';
assert(
  mod.resolvePushOpenUrl('module:demandes-achat', origin)
    === 'https://www.citymoapp.com/?module=demandes-achat',
  'module: → query',
);
assert(
  mod.resolvePushOpenUrl('/?module=taches', origin)
    === 'https://www.citymoapp.com/?module=taches',
  'relative query',
);
assert(
  mod.resolvePushOpenUrl('https://www.citymoapp.com/?module=conges', origin)
    .includes('module=conges'),
  'absolute same origin',
);
assert(mod.resolvePushOpenUrl('', origin) === 'https://www.citymoapp.com/', 'empty → home');
console.log('PASS: parsePushPayload + resolvePushOpenUrl');

// Source guards
const sw = fs.readFileSync(path.join(root, 'src/sw.js'), 'utf8');
assert(sw.includes("addEventListener('push'"), 'sw has push');
assert(sw.includes("addEventListener('notificationclick'"), 'sw has notificationclick');
assert(sw.includes('showNotification'), 'sw showNotification');
assert(sw.includes('clients.matchAll'), 'sw matchAll');
assert(sw.includes('openWindow'), 'sw openWindow');
assert(sw.includes('CITYMO_PUSH_NAVIGATE'), 'sw postMessage type');
assert(sw.includes('SKIP_WAITING'), 'sw keeps SKIP_WAITING');
assert(sw.includes('NetworkOnly'), 'sw keeps NetworkOnly');
assert(!/\.from\(['"]notifications['"]\)/.test(sw), 'sw no notifications table access');
assert(!sw.includes('createNotification'), 'sw no createNotification');
assert(!sw.includes('notifyUser'), 'sw no notifyUser');
assert(!sw.includes('getSupabase'), 'sw no supabase client');
assert(!sw.includes('SUPABASE_SERVICE_ROLE'), 'sw no service role');
assert(!sw.includes('/api/push/send'), 'sw no send API');
assert(!sw.includes('/api/push/subscribe'), 'sw no subscribe API');

const notif = fs.readFileSync(path.join(root, 'src/services/notifications/notifications.js'), 'utf8');
assert(!notif.includes('showNotification'), 'notifications.js unchanged for SW');
assert(!notif.includes('CITYMO_PUSH_NAVIGATE'), 'notifications.js no push navigate');

const center = fs.readFileSync(path.join(root, 'src/components/notifications/NotificationCenter.jsx'), 'utf8');
assert(!center.includes('CITYMO_PUSH_NAVIGATE'), 'NotificationCenter untouched');

console.log('PASS: SW source + isolation');
console.log('ALL SW PUSH HANDLER TESTS PASSED');

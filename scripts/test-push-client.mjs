/**
 * Tests helpers push client (étape 4) — analyse source + conversion VAPID.
 * Usage: node scripts/test-push-client.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = Buffer.from(base64, 'base64');
  return new Uint8Array(raw);
}

const sample = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib27_1';
const bytes = urlBase64ToUint8Array(sample);
if (!(bytes instanceof Uint8Array) || bytes.length < 8) {
  console.error('FAIL: urlBase64ToUint8Array');
  process.exit(1);
}
console.log('PASS: urlBase64ToUint8Array');

const clientSrc = fs.readFileSync(path.join(root, 'src/pwa/pushClient.js'), 'utf8');
const hookSrc = fs.readFileSync(path.join(root, 'src/pwa/usePushNotifications.js'), 'utf8');
const uiSrc = fs.readFileSync(path.join(root, 'src/components/settings/PushNotificationSettings.jsx'), 'utf8');
const modalSrc = fs.readFileSync(path.join(root, 'src/components/settings/MesNotificationsModal.jsx'), 'utf8');
const menuSrc = fs.readFileSync(path.join(root, 'src/components/dashboard/UserProfileMenu.jsx'), 'utf8');
const swSrc = fs.readFileSync(path.join(root, 'src/sw.js'), 'utf8');
const notifSrc = fs.readFileSync(path.join(root, 'src/services/notifications/notifications.js'), 'utf8');
const centerSrc = fs.readFileSync(path.join(root, 'src/components/notifications/NotificationCenter.jsx'), 'utf8');

function assertIncludes(src, needle, label) {
  if (!src.includes(needle)) {
    console.error('FAIL:', label, 'missing', needle);
    process.exit(1);
  }
}
function assertNotIncludes(src, needle, label) {
  if (src.includes(needle)) {
    console.error('FAIL:', label, 'must not contain', needle);
    process.exit(1);
  }
}

assertIncludes(clientSrc, 'Notification.requestPermission()', 'requestPermission in client');
assertIncludes(clientSrc, 'userVisibleOnly: true', 'subscribe options');
assertIncludes(clientSrc, 'applicationServerKey', 'vapid key');
assertIncludes(clientSrc, '/push/subscribe', 'subscribe API');
assertIncludes(clientSrc, '/push/unsubscribe', 'unsubscribe API');
assertIncludes(clientSrc, 'readPushActivationState', 'status read');
assertNotIncludes(clientSrc, 'localStorage.setItem', 'no PushSubscription in localStorage');
assertNotIncludes(clientSrc, 'VAPID_PRIVATE', 'no private key');

const enableIdx = clientSrc.indexOf('export async function enablePushNotifications');
const beforeEnable = clientSrc.slice(0, enableIdx);
const enableFn = clientSrc.slice(enableIdx);
if (!enableFn.includes('Notification.requestPermission()')) {
  console.error('FAIL: requestPermission not inside enablePushNotifications');
  process.exit(1);
}
if (beforeEnable.includes('Notification.requestPermission()')) {
  console.error('FAIL: requestPermission called outside enable');
  process.exit(1);
}
if (clientSrc.includes('export async function readPushActivationState')
  && clientSrc.slice(
    clientSrc.indexOf('export async function readPushActivationState'),
    clientSrc.indexOf('export async function readPushActivationState') + 800,
  ).includes('requestPermission')) {
  console.error('FAIL: readPushActivationState must not request permission');
  process.exit(1);
}
console.log('PASS: permission only on enable()');

assertIncludes(hookSrc, 'L’abonnement n’a pas pu être confirmé', 'no false success');
assertIncludes(uiSrc, 'Activer', 'UI enable');
assertIncludes(uiSrc, 'Désactiver', 'UI disable');
assertIncludes(uiSrc, 'Notifications Web Push', 'UI title');
assertIncludes(uiSrc, 'Activées sur cet appareil', 'UI active state');
assertIncludes(uiSrc, 'Dernière synchronisation', 'UI sync');
assertIncludes(uiSrc, 'Navigateur incompatible', 'UI incompatible');
assertIncludes(uiSrc, 'Autorisation refusée', 'UI denied');
assertIncludes(modalSrc, 'Mes notifications', 'modal title');
assertIncludes(menuSrc, 'MesNotificationsModal', 'menu wires modal');
assertIncludes(menuSrc, 'setShowNotificationsSettings(true)', 'opens settings');

if (!/addEventListener\(\s*['"]push['"]/.test(swSrc)
  || !/addEventListener\(\s*['"]notificationclick['"]/.test(swSrc)) {
  console.error('FAIL: SW must expose push + notificationclick (étape 5)');
  process.exit(1);
}
console.log('PASS: SW push listeners present');

assertNotIncludes(notifSrc, 'push_subscriptions', 'notifications.js untouched');
assertNotIncludes(notifSrc, 'enablePushNotifications', 'notifications.js untouched');
assertNotIncludes(centerSrc, 'enablePushNotifications', 'NotificationCenter untouched');
assertNotIncludes(centerSrc, 'pushClient', 'NotificationCenter untouched');

console.log('PASS: UI / menu / isolation checks');
console.log('ALL PUSH CLIENT STEP-4 CHECKS PASSED');

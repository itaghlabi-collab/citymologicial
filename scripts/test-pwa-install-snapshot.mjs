/**
 * Régression : Object.is(getSnapshot(), getSnapshot()) === true
 * tant que l'état du store n'a pas changé.
 *
 * Usage: node scripts/test-pwa-install-snapshot.mjs
 */

import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

// Minimal browser globals for the PWA install module
const store = new Map();
globalThis.sessionStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
};

Object.defineProperty(globalThis, 'window', {
  value: {
    matchMedia: () => ({ matches: false }),
    addEventListener() {},
    removeEventListener() {},
  },
  configurable: true,
});

try {
  Object.defineProperty(globalThis, 'navigator', {
    value: {},
    configurable: true,
  });
} catch {
  /* navigator may be non-configurable — safeStandalone still works */
}

const mod = await import(pathToFileURL(path.join(root, 'src/pwa/pwaInstall.js')).href);

mod.__testResetPwaInstallStore();
mod.initPwaInstall();

const a = mod.getPwaInstallState();
const b = mod.getPwaInstallState();
if (!Object.is(a, b)) {
  console.error('FAIL: getSnapshot not stable when idle');
  process.exit(1);
}
console.log('PASS: idle snapshot stable', Object.is(a, b));

const changed = mod.__testSetDeferredPrompt({
  preventDefault() {},
  prompt: async () => {},
  userChoice: Promise.resolve({ outcome: 'dismissed' }),
});
if (!changed) {
  console.error('FAIL: expected snapshot change after deferred prompt');
  process.exit(1);
}
const c = mod.getPwaInstallState();
const d = mod.getPwaInstallState();
if (!Object.is(c, d)) {
  console.error('FAIL: snapshot unstable after single change');
  process.exit(1);
}
if (Object.is(a, c)) {
  console.error('FAIL: snapshot did not change after deferred prompt');
  process.exit(1);
}
if (!c.canInstall || !c.showBanner || !c.showButton) {
  console.error('FAIL: expected installable flags after deferred prompt', c);
  process.exit(1);
}
console.log('PASS: after change, snapshot replaced once then stable');

mod.dismissInstallBannerForSession();
const e = mod.getPwaInstallState();
const f = mod.getPwaInstallState();
if (!Object.is(e, f)) {
  console.error('FAIL: unstable after dismiss');
  process.exit(1);
}
if (e.showBanner !== false || e.showButton !== true) {
  console.error('FAIL: later should hide banner only', e);
  process.exit(1);
}
console.log('PASS: Plus tard hides banner, keeps button');

console.log('ALL SNAPSHOT REGRESSION TESTS PASSED');

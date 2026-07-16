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
    value: { userAgent: 'Mozilla/5.0 (Linux; Android 13) Chrome/120.0.0.0 Mobile', platform: 'Linux armv8l', maxTouchPoints: 1 },
    configurable: true,
  });
} catch {
  /* navigator may be non-configurable */
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
if (a.showIosHelp) {
  console.error('FAIL: Android UA should not show iOS help', a);
  process.exit(1);
}
if (!a.showBrowserHelp || a.canInstall || a.showButton) {
  console.error('FAIL: Android idle without deferredPrompt should show browser help', a);
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
if (!c.canInstall || !c.showBanner || !c.showButton || c.showIosHelp || c.showBrowserHelp) {
  console.error('FAIL: expected Android installable flags', c);
  process.exit(1);
}
console.log('PASS: after Android prompt, snapshot stable');

mod.dismissInstallBannerForSession();
const e = mod.getPwaInstallState();
if (e.showBanner !== false || e.showButton !== true) {
  console.error('FAIL: later should hide banner only', e);
  process.exit(1);
}
console.log('PASS: Plus tard hides banner, keeps button');

// iOS path: reset prompt, force iOS UA if possible
mod.__testResetPwaInstallStore();
try {
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      platform: 'iPhone',
      maxTouchPoints: 5,
      standalone: false,
    },
    configurable: true,
  });
} catch {
  console.log('SKIP: cannot redefine navigator for iOS simulation');
}
mod.initPwaInstall();
mod.__testForceCommit();
const ios = mod.getPwaInstallState();
const ios2 = mod.getPwaInstallState();
if (!Object.is(ios, ios2)) {
  console.error('FAIL: iOS snapshot unstable');
  process.exit(1);
}
if (Object.defineProperty && ios.showIosHelp !== undefined) {
  if (!ios.showIosHelp || !ios.showBanner || ios.showButton || ios.canInstall || ios.showBrowserHelp) {
    // If navigator redefine failed earlier, skip assertion
    const ua = globalThis.navigator?.userAgent || '';
    if (/iPhone/i.test(ua)) {
      console.error('FAIL: expected iOS help banner flags', ios);
      process.exit(1);
    }
  } else {
    console.log('PASS: iOS help banner flags');
  }
}

console.log('ALL SNAPSHOT REGRESSION TESTS PASSED');

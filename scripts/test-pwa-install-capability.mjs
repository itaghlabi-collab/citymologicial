/**
 * Tests : installation pilotée uniquement par l'état réel du store.
 * Usage: node scripts/test-pwa-install-capability.mjs
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

function setupWindow() {
  Object.defineProperty(globalThis, 'window', {
    value: {
      matchMedia: () => ({ matches: false }),
      addEventListener() {},
      removeEventListener() {},
      location: { href: 'https://citymoapp.com/' },
    },
    configurable: true,
  });
}

function setAndroidNavigator() {
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      userAgent: 'Mozilla/5.0 (Linux; Android 13) Chrome/120.0.0.0 Mobile',
      platform: 'Linux armv8l',
      maxTouchPoints: 5,
      clipboard: { writeText: async () => {} },
    },
    configurable: true,
  });
}

setupWindow();
setAndroidNavigator();

const mod = await import(pathToFileURL(path.join(root, 'src/pwa/pwaInstall.js')).href);

// --- isDeferredPromptUsable : 3 conditions ---
if (!mod.isDeferredPromptUsable({
  prompt: async () => {},
  userChoice: Promise.resolve({ outcome: 'dismissed' }),
})) {
  console.error('FAIL: valid deferred prompt should be usable');
  process.exit(1);
}
if (mod.isDeferredPromptUsable(null)) {
  console.error('FAIL: null should not be usable');
  process.exit(1);
}
if (mod.isDeferredPromptUsable({ userChoice: {} })) {
  console.error('FAIL: missing prompt() should not be usable');
  process.exit(1);
}
if (mod.isDeferredPromptUsable({ prompt: async () => {} })) {
  console.error('FAIL: missing userChoice should not be usable');
  process.exit(1);
}
if (mod.isDeferredPromptUsable({
  prompt: 'not-a-function',
  userChoice: {},
})) {
  console.error('FAIL: non-function prompt should not be usable');
  process.exit(1);
}
console.log('PASS: isDeferredPromptUsable()');

// --- Chrome Android: prompt() once ---
mod.__testResetPwaInstallStore();
setupWindow();
setAndroidNavigator();

let chromePromptCalls = 0;
mod.__testSetDeferredPrompt({
  preventDefault() {},
  prompt: async () => { chromePromptCalls += 1; },
  userChoice: Promise.resolve({ outcome: 'dismissed' }),
});

if (mod.getInstallAction() !== 'native') {
  console.error('FAIL: usable prompt should yield native action');
  process.exit(1);
}

const chromeResult = await mod.promptInstall();
if (chromePromptCalls !== 1) {
  console.error('FAIL: Chrome should call prompt() once, got', chromePromptCalls);
  process.exit(1);
}
if (chromeResult.outcome !== 'dismissed') {
  console.error('FAIL: Chrome expected dismissed', chromeResult);
  process.exit(1);
}
console.log('PASS: Chrome Android — prompt() once');

// --- Android sans deferredPrompt : aide navigateur ---
mod.__testResetPwaInstallStore();
setupWindow();
setAndroidNavigator();
mod.__testForceCommit();

const noPromptState = mod.getPwaInstallState();
if (!noPromptState.showBrowserHelp || noPromptState.canInstall) {
  console.error('FAIL: Android without deferredPrompt should show browser help', noPromptState);
  process.exit(1);
}
if (mod.getInstallAction() !== 'browser') {
  console.error('FAIL: expected browser action without prompt');
  process.exit(1);
}
const noPromptResult = await mod.promptInstall();
if (noPromptResult.outcome !== 'unavailable') {
  console.error('FAIL: promptInstall without prompt should be unavailable', noPromptResult);
  process.exit(1);
}
console.log('PASS: Android without deferredPrompt — browser help');

// --- événement invalide (sans prompt()) : jamais prompt() ---
mod.__testResetPwaInstallStore();
setupWindow();
setAndroidNavigator();

mod.__testSetDeferredPrompt({
  preventDefault() {},
  userChoice: Promise.resolve({ outcome: 'accepted' }),
});

const invalidState = mod.getPwaInstallState();
if (invalidState.canInstall || !invalidState.showBrowserHelp) {
  console.error('FAIL: invalid prompt should show browser help, not native install', invalidState);
  process.exit(1);
}
const invalidResult = await mod.promptInstall();
if (invalidResult.outcome !== 'unavailable') {
  console.error('FAIL: invalid prompt must never call prompt()', { invalidResult });
  process.exit(1);
}
console.log('PASS: invalid deferredPrompt — no prompt() call');

// --- copyCurrentPageUrl ---
const copied = { value: '' };
Object.defineProperty(globalThis, 'navigator', {
  value: {
    maxTouchPoints: 5,
    clipboard: { writeText: async (t) => { copied.value = t; } },
  },
  configurable: true,
});
const copyOk = await mod.copyCurrentPageUrl();
if (!copyOk || copied.value !== 'https://citymoapp.com/') {
  console.error('FAIL: copyCurrentPageUrl', { copyOk, copied: copied.value });
  process.exit(1);
}
console.log('PASS: copyCurrentPageUrl');

console.log('ALL INSTALL CAPABILITY TESTS PASSED');

/**
 * Tests configuration VAPID (étape 1) — sans réseau.
 * Usage: node scripts/test-vapid-config.mjs
 */

import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import webpush from 'web-push';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const generated = webpush.generateVAPIDKeys();

// Snapshot env
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

try {
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
  delete process.env.VAPID_SUBJECT;

  const mod = await import(pathToFileURL(path.join(root, 'lib/vapidConfigVercel.mjs')).href);

  // --- non configuré ---
  if (mod.isVapidConfigured()) {
    console.error('FAIL: should not be configured without env');
    process.exit(1);
  }
  let threw = false;
  try {
    mod.buildVapidPublicKeyResponse();
  } catch (e) {
    threw = e.status === 503;
  }
  if (!threw) {
    console.error('FAIL: missing public key should throw 503');
    process.exit(1);
  }
  console.log('PASS: missing VAPID → 503');

  // --- configuré ---
  process.env.VAPID_PUBLIC_KEY = generated.publicKey;
  process.env.VAPID_PRIVATE_KEY = generated.privateKey;
  process.env.VAPID_SUBJECT = 'mailto:test@citymoapp.com';

  if (!mod.isVapidConfigured()) {
    console.error('FAIL: should be configured with env');
    process.exit(1);
  }

  const pub = mod.buildVapidPublicKeyResponse();
  if (pub.publicKey !== generated.publicKey || !pub.configured) {
    console.error('FAIL: public response mismatch', pub);
    process.exit(1);
  }
  if ('privateKey' in pub || JSON.stringify(pub).includes(generated.privateKey)) {
    console.error('FAIL: private key leaked in public response');
    process.exit(1);
  }
  console.log('PASS: public response contains only publicKey');

  const creds = mod.getVapidCredentials();
  if (creds.privateKey !== generated.privateKey || creds.publicKey !== generated.publicKey) {
    console.error('FAIL: credentials mismatch');
    process.exit(1);
  }
  if (creds.subject !== 'mailto:test@citymoapp.com') {
    console.error('FAIL: subject mismatch', creds.subject);
    process.exit(1);
  }
  console.log('PASS: server credentials include private key (server-only helper)');

  // --- défaut subject ---
  delete process.env.VAPID_SUBJECT;
  const creds2 = mod.getVapidCredentials();
  if (!String(creds2.subject).startsWith('mailto:')) {
    console.error('FAIL: default subject should be mailto:', creds2.subject);
    process.exit(1);
  }
  console.log('PASS: default VAPID_SUBJECT');

  console.log('ALL VAPID CONFIG TESTS PASSED');
} finally {
  restoreEnv();
}

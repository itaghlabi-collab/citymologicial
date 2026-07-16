/**
 * Génère une paire de clés VAPID (à coller dans les variables d'environnement serveur).
 * N'écrit aucun fichier. Ne committez jamais les clés affichées.
 *
 * Usage: node scripts/generate-vapid-keys.mjs
 */

import webpush from 'web-push';

const keys = webpush.generateVAPIDKeys();

console.log(`
CITYMO — Clés VAPID générées
============================
À configurer UNIQUEMENT côté serveur (Vercel / Railway), JAMAIS en VITE_* :

VAPID_PUBLIC_KEY=${keys.publicKey}
VAPID_PRIVATE_KEY=${keys.privateKey}
VAPID_SUBJECT=mailto:noreply@citymoapp.com

Règles :
- VAPID_PRIVATE_KEY = secret serveur uniquement
- VAPID_PUBLIC_KEY  = exposée via GET /api/push/vapid-public-key
- Ne pas committer ces valeurs dans git
`);

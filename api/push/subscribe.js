/**
 * POST /api/push/subscribe
 * Enregistre / met à jour un abonnement Web Push pour l'utilisateur JWT.
 * Upsert sur endpoint. Ne déclenche aucun envoi de notification.
 */
import {
  requireAuthenticatedUser,
  parseSubscribePayload,
  upsertPushSubscription,
  sanitizeSubscriptionRow,
} from '../../lib/pushSubscriptionsVercel.mjs';
import { isVapidConfigured } from '../../lib/vapidConfigVercel.mjs';

export const config = { maxDuration: 15 };

function readBody(req) {
  if (req.body == null) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body || '{}');
    } catch {
      return {};
    }
  }
  return req.body;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée.' });
  }

  try {
    if (!isVapidConfigured()) {
      return res.status(503).json({ error: 'Notifications push non configurées sur le serveur.' });
    }

    const user = await requireAuthenticatedUser(req);
    const payload = parseSubscribePayload(readBody(req));
    const row = await upsertPushSubscription(user.id, payload);

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: true,
      subscription: sanitizeSubscriptionRow(row),
    });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Erreur serveur.' });
  }
}

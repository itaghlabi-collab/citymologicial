/**
 * DELETE /api/push/unsubscribe
 * Révoque l'abonnement Push de l'utilisateur authentifié (endpoint fourni).
 * Soft-revoke : is_active=false, revoked_at=now().
 */
import {
  requireAuthenticatedUser,
  parseUnsubscribePayload,
  revokePushSubscription,
  sanitizeSubscriptionRow,
} from '../../lib/pushSubscriptionsVercel.mjs';

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
  if (req.method !== 'DELETE' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée.' });
  }

  try {
    const user = await requireAuthenticatedUser(req);
    const { endpoint } = parseUnsubscribePayload(readBody(req), req.query || {});
    const row = await revokePushSubscription(user.id, endpoint);

    if (!row) {
      return res.status(404).json({ error: 'Abonnement introuvable pour cet utilisateur.' });
    }

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

/**
 * GET /api/push/status
 * Statut d'abonnement Push pour l'utilisateur JWT (sans clés sensibles).
 */
import {
  requireAuthenticatedUser,
  getPushSubscriptionStatus,
} from '../../lib/pushSubscriptionsVercel.mjs';

export const config = { maxDuration: 15 };

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Méthode non autorisée.' });
  }

  try {
    const user = await requireAuthenticatedUser(req);
    const status = await getPushSubscriptionStatus(user.id);

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(status);
  } catch (err) {
    const statusCode = err.status || 500;
    return res.status(statusCode).json({ error: err.message || 'Erreur serveur.' });
  }
}

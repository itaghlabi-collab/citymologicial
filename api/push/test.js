/**
 * POST /api/push/test
 * Envoie une notification Web Push de test à un abonnement actif de l'utilisateur JWT.
 * Canal d'affichage uniquement — hors NotificationCenter / hors événements ERP.
 */
import { requireAuthenticatedUser } from '../../lib/pushSubscriptionsVercel.mjs';
import { isVapidConfigured } from '../../lib/vapidConfigVercel.mjs';
import { sendTestPushToUser } from '../../lib/webPushSendVercel.mjs';

export const config = { maxDuration: 20 };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée.' });
  }

  try {
    if (!isVapidConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Notifications push non configurées sur le serveur.',
      });
    }

    const user = await requireAuthenticatedUser(req);
    const result = await sendTestPushToUser(user.id);

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      success: true,
      payload: result.payload,
      subscriptionId: result.subscriptionId,
      endpointHost: result.endpointHost,
      deviceName: result.deviceName,
      browser: result.browser,
      platform: result.platform,
      statusCode: result.statusCode,
    });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({
      success: false,
      error: err.message || 'Erreur serveur.',
      details: err.details || undefined,
    });
  }
}

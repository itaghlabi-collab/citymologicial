/**
 * POST /api/push/deliver
 * Diffuse une notification ERP déjà créée (public.notifications) via Web Push.
 * Aucune création de notification — aucun moteur métier parallèle.
 */
import { requireAuthenticatedUser } from '../../lib/pushSubscriptionsVercel.mjs';
import { deliverPushForExistingNotification } from '../../lib/webPushSendVercel.mjs';

export const config = { maxDuration: 30 };

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
    return res.status(405).json({ success: false, error: 'Méthode non autorisée.' });
  }

  try {
    const user = await requireAuthenticatedUser(req);
    const body = readBody(req);
    const notificationId = typeof body.notificationId === 'string'
      ? body.notificationId.trim()
      : '';

    if (!notificationId) {
      return res.status(400).json({ success: false, error: 'notificationId requis.' });
    }

    const result = await deliverPushForExistingNotification(notificationId, user.id);

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(result);
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({
      success: false,
      error: err.message || 'Erreur serveur.',
    });
  }
}

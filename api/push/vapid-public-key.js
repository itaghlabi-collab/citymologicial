/**
 * GET /api/push/vapid-public-key
 * Retourne uniquement la clé publique VAPID (jamais la clé privée).
 * Session Supabase requise (utilisateur ERP connecté).
 */
import { verifySupabaseAccessTokenVercel } from '../../lib/verifySupabaseTokenVercel.mjs';
import { buildVapidPublicKeyResponse } from '../../lib/vapidConfigVercel.mjs';

export const config = { maxDuration: 10 };

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Méthode non autorisée.' });
  }

  const header = req.headers.authorization || req.headers.Authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    return res.status(401).json({ error: 'Session requise.' });
  }

  try {
    const clientApiKey = req.headers.apikey || req.headers.Apikey || '';
    const user = await verifySupabaseAccessTokenVercel(token, clientApiKey);
    if (!user?.id) {
      return res.status(401).json({ error: 'Session invalide.' });
    }

    const body = buildVapidPublicKeyResponse();
    // Double contrôle : aucune clé privée dans la réponse
    if (Object.prototype.hasOwnProperty.call(body, 'privateKey')
      || Object.prototype.hasOwnProperty.call(body, 'VAPID_PRIVATE_KEY')) {
      return res.status(500).json({ error: 'Réponse VAPID invalide.' });
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(body);
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Erreur serveur.' });
  }
}

/**
 * GET /api/projects/for-select — Liste projets pour dropdowns Achats/Finance.
 * Contourne la RLS projects pour les rôles Achats (ex. Laila WOTFI) via service_role.
 */
import { verifySupabaseAccessTokenVercel } from '../../lib/verifySupabaseTokenVercel.mjs';
import { getSupabaseAdmin } from '../../lib/supabaseAdminVercel.mjs';

export const config = { maxDuration: 30 };

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

    const admin = getSupabaseAdmin();
    const { data: profile } = await admin
      .from('profiles')
      .select('statut')
      .eq('id', user.id)
      .maybeSingle();

    if (profile?.statut && String(profile.statut).toLowerCase() !== 'actif') {
      return res.status(403).json({ error: 'Compte désactivé.' });
    }

    const { data, error } = await admin
      .from('projects')
      .select('id, ref, nom, client_nom, statut, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[projects/for-select]', error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ projects: data || [] });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Erreur serveur.' });
  }
}

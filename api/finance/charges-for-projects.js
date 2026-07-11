/**
 * GET /api/finance/charges-for-projects — Dépenses générales liées à un projet (service_role).
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
      .from('finance_charges')
      .select('id, project_id, projet_lie, date_charge, libelle, categorie, fournisseur, montant, mode_paiement, statut, ref_charge, commentaire')
      .or('project_id.not.is.null,projet_lie.not.is.null')
      .order('date_charge', { ascending: false });

    if (error) {
      console.error('[charges-for-projects]', error);
      return res.status(500).json({ error: error.message });
    }

    const charges = (data || []).filter((c) => c.project_id || String(c.projet_lie || '').trim());
    return res.status(200).json({ charges });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Erreur serveur.' });
  }
}

/**
 * Authentification Supabase JWT + vérification Super Admin.
 */
const { getSupabaseAnon, getSupabaseAdmin } = require('../lib/supabaseAdmin');

const SUPER_ADMIN_EMAILS = [
  'selim.moumni@citymo.ma',
  'selim.moumni@gmail.com',
];

async function requireSupabaseSuperAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentification Supabase requise.' });
  }

  const token = header.slice(7);
  try {
    const anon = getSupabaseAnon();
    const { data: { user }, error } = await anon.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: 'Session Supabase invalide ou expirée.' });
    }

    const admin = getSupabaseAdmin();
    const { data: profile } = await admin
      .from('profiles')
      .select('id, email, role, statut')
      .eq('id', user.id)
      .maybeSingle();

    const email = (user.email || profile?.email || '').toLowerCase();
    const role = (profile?.role || '').toLowerCase().replace(/\s+/g, '_');
    const isSuper = SUPER_ADMIN_EMAILS.includes(email) || role === 'super_admin';

    if (!isSuper) {
      return res.status(403).json({ error: 'Accès réservé aux Super Admin.' });
    }

    if (profile?.statut && profile.statut !== 'actif') {
      return res.status(403).json({ error: 'Compte désactivé.' });
    }

    req.user = {
      id: user.id,
      email,
      role: profile?.role || 'super_admin',
      nom: profile?.nom || email,
    };
    next();
  } catch (err) {
    console.error('[supabaseAuth]', err.message);
    return res.status(500).json({ error: 'Erreur vérification authentification.' });
  }
}

module.exports = { requireSupabaseSuperAdmin };

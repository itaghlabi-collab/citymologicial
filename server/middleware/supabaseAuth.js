/**
 * Authentification Supabase JWT + vérification Super Admin.
 */
const { getSupabaseAdmin } = require('../lib/supabaseAdmin');
const { verifySupabaseAccessToken } = require('../lib/verifySupabaseToken');

const SUPER_ADMIN_EMAILS = [
  'selim.moumni@citymo.ma',
  'selim.moumni@gmail.com',
];

function isSuperAdminUser(user, profile) {
  const email = (user.email || profile?.email || '').toLowerCase();
  const role = (profile?.role || '').toLowerCase().replace(/\s+/g, '_');
  const roleCode = (profile?.erp_roles?.code || '').toLowerCase();
  return SUPER_ADMIN_EMAILS.includes(email)
    || role === 'super_admin'
    || roleCode === 'super_admin'
    || profile?.erp_roles?.est_admin === true;
}

function extractBearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  const alt = req.headers['x-supabase-token'];
  return typeof alt === 'string' ? alt.trim() : '';
}

async function requireSupabaseSuperAdmin(req, res, next) {
  const token = extractBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentification Supabase requise.' });
  }

  let admin;
  try {
    admin = getSupabaseAdmin();
  } catch (configErr) {
    console.error('[supabaseAuth] config:', configErr.message);
    return res.status(503).json({
      error: 'API sauvegardes non configurée sur Railway.',
      detail: configErr.message,
    });
  }

  try {
    let user;
    try {
      user = await verifySupabaseAccessToken(token);
    } catch (authErr) {
      console.error('[supabaseAuth] token:', authErr.message);
      return res.status(401).json({ error: 'Session Supabase invalide ou expirée.' });
    }

    if (!user?.id) {
      return res.status(401).json({ error: 'Session Supabase invalide ou expirée.' });
    }

    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('id, email, role, statut, nom, erp_roles ( code, est_admin )')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      console.error('[supabaseAuth] profile:', profileError.message);
      return res.status(500).json({ error: 'Erreur lecture profil utilisateur.' });
    }

    if (!isSuperAdminUser(user, profile)) {
      return res.status(403).json({ error: 'Accès réservé aux Super Admin.' });
    }

    if (profile?.statut && profile.statut !== 'actif') {
      return res.status(403).json({ error: 'Compte désactivé.' });
    }

    req.user = {
      id: user.id,
      email: (user.email || profile?.email || '').toLowerCase(),
      role: profile?.role || profile?.erp_roles?.code || 'super_admin',
      nom: profile?.nom || user.email || '',
    };
    next();
  } catch (err) {
    console.error('[supabaseAuth]', err.message);
    return res.status(500).json({ error: 'Erreur vérification authentification.' });
  }
}

module.exports = { requireSupabaseSuperAdmin };

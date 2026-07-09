/**
 * Authentification Supabase JWT + vérification Super Admin.
 */
const crypto = require('crypto');
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

function authHeaderDebug(req) {
  const auth = req.headers.authorization || req.headers.Authorization || '';
  const alt = req.headers['x-supabase-token'];
  return {
    authorizationReceived: Boolean(auth),
    authorizationBearer: auth.startsWith('Bearer '),
    xSupabaseTokenReceived: Boolean(alt),
    vercelProxyUserId: req.headers['x-citymo-verified-user-id'] || null,
    authorizationLength: auth.length,
    xSupabaseTokenLength: typeof alt === 'string' ? alt.length : 0,
  };
}

function verifyVercelProxyUserId(req) {
  const userId = req.headers['x-citymo-verified-user-id'];
  const sig = req.headers['x-citymo-proxy-sig'];
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!userId || !sig || !key) return null;
  const expected = crypto.createHmac('sha256', key).update(String(userId)).digest('hex');
  if (sig !== expected) {
    console.error('[supabaseAuth] proxy sig mismatch pour user', userId);
    return null;
  }
  return String(userId);
}

async function loadVerifiedUser(admin, user) {
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, email, role, statut, nom, erp_roles ( code, est_admin )')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    console.error('[supabaseAuth] profile:', profileError.message);
    throw Object.assign(new Error('Erreur lecture profil utilisateur.'), { status: 500 });
  }

  if (!isSuperAdminUser(user, profile)) {
    throw Object.assign(new Error('Accès réservé aux Super Admin.'), { status: 403 });
  }

  if (profile?.statut && profile.statut !== 'actif') {
    throw Object.assign(new Error('Compte désactivé.'), { status: 403 });
  }

  return {
    id: user.id,
    email: (user.email || profile?.email || '').toLowerCase(),
    role: profile?.role || profile?.erp_roles?.code || 'super_admin',
    nom: profile?.nom || user.email || '',
  };
}

async function requireSupabaseSuperAdmin(req, res, next) {
  const headerDebug = authHeaderDebug(req);
  console.info('[supabaseAuth:debug] headers', headerDebug);

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
    const proxyUserId = verifyVercelProxyUserId(req);
    if (proxyUserId) {
      console.info('[supabaseAuth:debug] auth via proxy Vercel', { userId: proxyUserId });
      const { data: { user }, error } = await admin.auth.admin.getUserById(proxyUserId);
      if (error || !user) {
        console.error('[supabaseAuth] proxy getUserById:', error?.message);
        return res.status(401).json({ error: 'Session Supabase invalide ou expirée.' });
      }
      req.user = await loadVerifiedUser(admin, user);
      return next();
    }

    const token = extractBearerToken(req);
    if (!token) {
      console.error('[supabaseAuth:debug] rejet — aucun token');
      return res.status(401).json({ error: 'Authentification Supabase requise.' });
    }

    let user;
    try {
      user = await verifySupabaseAccessToken(token, headerDebug);
    } catch (authErr) {
      console.error('[supabaseAuth:debug] rejet final JWT:', authErr.message);
      return res.status(401).json({ error: 'Session Supabase invalide ou expirée.' });
    }

    if (!user?.id) {
      return res.status(401).json({ error: 'Session Supabase invalide ou expirée.' });
    }

    req.user = await loadVerifiedUser(admin, user);
    next();
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error('[supabaseAuth]', err.message);
    return res.status(500).json({ error: 'Erreur vérification authentification.' });
  }
}

module.exports = { requireSupabaseSuperAdmin };

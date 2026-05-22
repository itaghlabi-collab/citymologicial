/**
 * CITYMO ERP – JWT Authentication & Role Guard middleware
 *
 * Usage:
 *   const { requireAuth, requireRole } = require('./middleware/auth');
 *
 *   router.get('/protected', requireAuth, handler);
 *   router.delete('/admin-only', requireAuth, requireRole('admin'), handler);
 *   router.post('/commercial', requireAuth, requireRole(['admin','commercial']), handler);
 */
const jwt = require('jsonwebtoken');

const JWT_SECRET  = process.env.JWT_SECRET  || 'citymo_erp_secret_change_in_production';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '8h';

/* ─────────────────────────────────────────────────────────────────────────────
   Token generation helper (used by /api/auth/login)
───────────────────────────────────────────────────────────────────────────── */
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

/* ─────────────────────────────────────────────────────────────────────────────
   requireAuth — validates Bearer JWT, populates req.user
───────────────────────────────────────────────────────────────────────────── */
function requireAuth(req, res, next) {
  const header = req.headers['authorization'] || '';
  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentification requise. Fournissez un token Bearer.' });
  }

  const token = header.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { id, email, role, department_id, nom }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expire. Veuillez vous reconnecter.' });
    }
    return res.status(401).json({ error: 'Token invalide.' });
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   requireRole — restricts access to one or more roles
   Pass a single role string or an array of allowed roles.
   Roles: 'admin' | 'commercial' | 'marketing'
───────────────────────────────────────────────────────────────────────────── */
function requireRole(roles) {
  const allowed = Array.isArray(roles) ? roles : [roles];
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Non authentifie.' });
    }
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({
        error: `Acces refuse. Role requis: ${allowed.join(' ou ')}. Votre role: ${req.user.role}.`,
      });
    }
    next();
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
   filterByDept — injects department_id filter for non-admin users
   Call AFTER requireAuth. Adds req.deptFilter = { clause, param } or null.
───────────────────────────────────────────────────────────────────────────── */
function filterByDept(req, _res, next) {
  if (req.user && req.user.role !== 'admin' && req.user.department_id) {
    req.deptFilter = req.user.department_id;
  } else {
    req.deptFilter = null; // admin sees all departments
  }
  next();
}

module.exports = { signToken, requireAuth, requireRole, filterByDept, JWT_SECRET };

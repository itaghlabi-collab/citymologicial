/**
 * CITYMO ERP – Authentication routes
 *
 * POST /api/auth/login   → { email, password } → { token, user }
 * GET  /api/auth/me      → requireAuth          → current user profile
 * PUT  /api/auth/change-password → requireAuth  → change own password
 */
const express  = require('express');
const bcrypt   = require('bcryptjs');
const router   = express.Router();
const db       = require('../db/connection');
const { signToken, requireAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

/* ── POST /login ─────────────────────────────────────────────────────────── */
router.post('/login', validate(['email', 'password']), (req, res) => {
  const { email, password } = req.body;

  const user = db.prepare(`
    SELECT id, nom, email, role, department_id, password_hash
    FROM users WHERE email = ?
  `).get(email.toLowerCase().trim());

  if (!user) {
    return res.status(401).json({ error: 'Email ou mot de passe incorrect.' });
  }

  const valid = bcrypt.compareSync(password, user.password_hash || '');
  if (!valid) {
    return res.status(401).json({ error: 'Email ou mot de passe incorrect.' });
  }

  const token = signToken({
    id:            user.id,
    nom:           user.nom,
    email:         user.email,
    role:          user.role,
    department_id: user.department_id,
  });

  res.json({
    token,
    user: {
      id:            user.id,
      nom:           user.nom,
      email:         user.email,
      role:          user.role,
      department_id: user.department_id,
    },
  });
});

/* ── GET /me ─────────────────────────────────────────────────────────────── */
router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare(`
    SELECT id, nom, email, role, department_id, created_at
    FROM users WHERE id = ?
  `).get(req.user.id);

  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
  res.json(user);
});

/* ── PUT /change-password ────────────────────────────────────────────────── */
router.put('/change-password', requireAuth, validate(['current_password', 'new_password']), (req, res) => {
  const { current_password, new_password } = req.body;

  const user = db.prepare('SELECT id, password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });

  const valid = bcrypt.compareSync(current_password, user.password_hash || '');
  if (!valid) {
    return res.status(400).json({ error: 'Mot de passe actuel incorrect.' });
  }

  if (new_password.length < 6) {
    return res.status(400).json({ error: 'Le nouveau mot de passe doit contenir au moins 6 caracteres.' });
  }

  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.user.id);
  res.json({ message: 'Mot de passe modifie avec succes.' });
});

module.exports = router;

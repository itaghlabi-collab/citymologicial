/**
 * CITYMO ERP – Notifications routes
 * GET /api/notifications          ?user_id= &lu=
 * PUT /api/notifications/:id/read
 */
const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');

// ── GET all ──────────────────────────────────────────────────────────────────
// Non-admin users only see their own notifications; admin can filter by ?user_id=
router.get('/', (req, res) => {
  const clauses = [];
  const params  = [];

  // Scope to current user unless admin requesting specific user
  const targetUserId = (req.user && req.user.role !== 'admin')
    ? req.user.id
    : (req.query.user_id !== undefined ? req.query.user_id : undefined);

  if (targetUserId !== undefined) { clauses.push('user_id = ?'); params.push(targetUserId); }
  if (req.query.lu !== undefined) { clauses.push('lu = ?');      params.push(req.query.lu === 'true' ? 1 : 0); }

  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
  const rows = db.prepare(`SELECT * FROM notifications ${where} ORDER BY created_at DESC LIMIT 100`).all(...params);
  res.json(rows);
});

// ── PUT mark as read ─────────────────────────────────────────────────────────
router.put('/:id/read', (req, res) => {
  const row = db.prepare('SELECT id FROM notifications WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Notification introuvable' });
  db.prepare('UPDATE notifications SET lu = 1 WHERE id = ?').run(req.params.id);
  res.json(db.prepare('SELECT * FROM notifications WHERE id = ?').get(req.params.id));
});

// ── PUT mark all as read ──────────────────────────────────────────────────────
router.put('/read-all', (req, res) => {
  const { user_id } = req.body;
  if (user_id) {
    db.prepare('UPDATE notifications SET lu = 1 WHERE user_id = ?').run(user_id);
  } else {
    db.prepare('UPDATE notifications SET lu = 1').run();
  }
  res.json({ message: 'Toutes les notifications marquees comme lues' });
});

module.exports = router;

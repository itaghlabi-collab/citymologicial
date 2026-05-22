/**
 * CITYMO ERP – Comptes Rendus routes
 * POST   /api/comptes-rendus
 * GET    /api/comptes-rendus   ?assigne_id= &date_from= &date_to=
 * GET    /api/comptes-rendus/:id
 * PUT    /api/comptes-rendus/:id
 * DELETE /api/comptes-rendus/:id
 */
const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');
const { validate } = require('../middleware/validate');

function now() { return new Date().toISOString(); }

// ── GET all ──────────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const clauses = [];
  const params  = [];
  if (req.query.assigne_id)    { clauses.push('cr.assigne_id = ?');    params.push(req.query.assigne_id); }
  if (req.query.prospect_id)   { clauses.push('cr.prospect_id = ?');   params.push(req.query.prospect_id); }
  if (req.query.department_id) { clauses.push('cr.department_id = ?'); params.push(req.query.department_id); }
  if (req.query.date_from)     { clauses.push('cr.date >= ?');         params.push(req.query.date_from); }
  if (req.query.date_to)       { clauses.push('cr.date <= ?');         params.push(req.query.date_to); }
  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
  const rows = db.prepare(`
    SELECT cr.*, p.nom AS prospect_nom, u.nom AS assigne_nom, r.titre AS rdv_titre
    FROM comptes_rendus cr
    LEFT JOIN prospects p ON p.id = cr.prospect_id
    LEFT JOIN users     u ON u.id = cr.assigne_id
    LEFT JOIN rdv       r ON r.id = cr.rdv_id
    ${where}
    ORDER BY cr.date DESC
  `).all(...params);
  res.json(rows);
});

// ── GET one ──────────────────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const row = db.prepare(`
    SELECT cr.*, p.nom AS prospect_nom, u.nom AS assigne_nom
    FROM comptes_rendus cr
    LEFT JOIN prospects p ON p.id = cr.prospect_id
    LEFT JOIN users     u ON u.id = cr.assigne_id
    WHERE cr.id = ?
  `).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Compte rendu introuvable' });
  res.json(row);
});

// ── POST create ──────────────────────────────────────────────────────────────
router.post('/', validate(['rdv_id', 'date']), (req, res) => {
  const rdvRow = db.prepare('SELECT * FROM rdv WHERE id = ?').get(req.body.rdv_id);
  if (!rdvRow) return res.status(400).json({ error: 'RDV introuvable' });
  const { rdv_id, prospect_id, resume, decision, prochaine_action, assigne_id, date } = req.body;
  const result = db.prepare(`
    INSERT INTO comptes_rendus (rdv_id, prospect_id, resume, decision, prochaine_action, assigne_id, date, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(rdv_id, prospect_id || rdvRow.prospect_id, resume || null, decision || null,
      prochaine_action || null, assigne_id || rdvRow.assigne_id, date, now(), now());
  res.status(201).json(db.prepare('SELECT * FROM comptes_rendus WHERE id = ?').get(result.lastInsertRowid));
});

// ── PUT update ───────────────────────────────────────────────────────────────
router.put('/:id', (req, res) => {
  const row = db.prepare('SELECT id FROM comptes_rendus WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Compte rendu introuvable' });
  const { resume, decision, prochaine_action, assigne_id, date } = req.body;
  db.prepare(`
    UPDATE comptes_rendus SET resume=?, decision=?, prochaine_action=?, assigne_id=?, date=?, updated_at=?
    WHERE id=?
  `).run(resume || null, decision || null, prochaine_action || null, assigne_id || null, date, now(), req.params.id);
  res.json(db.prepare('SELECT * FROM comptes_rendus WHERE id = ?').get(req.params.id));
});

// ── DELETE ───────────────────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const row = db.prepare('SELECT id FROM comptes_rendus WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Compte rendu introuvable' });
  db.prepare('DELETE FROM comptes_rendus WHERE id = ?').run(req.params.id);
  res.json({ message: 'Compte rendu supprime' });
});

module.exports = router;

/**
 * CITYMO ERP – Actions Marketing routes
 * POST   /api/actions-marketing
 * GET    /api/actions-marketing   ?statut= &canal= &responsable_id= &date_from= &date_to=
 * PUT    /api/actions-marketing/:id
 * DELETE /api/actions-marketing/:id
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
  if (req.query.statut)          { clauses.push('statut = ?');         params.push(req.query.statut); }
  if (req.query.canal)           { clauses.push('canal = ?');          params.push(req.query.canal); }
  if (req.query.responsable_id)  { clauses.push('responsable_id = ?'); params.push(req.query.responsable_id); }
  if (req.query.department_id)   { clauses.push('department_id = ?');  params.push(req.query.department_id); }
  if (req.query.date_from)       { clauses.push('date_debut >= ?');    params.push(req.query.date_from); }
  if (req.query.date_to)         { clauses.push('date_debut <= ?');    params.push(req.query.date_to); }
  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
  const rows = db.prepare(`SELECT * FROM actions_marketing ${where} ORDER BY created_at DESC`).all(...params);
  res.json(rows);
});

// ── POST create ──────────────────────────────────────────────────────────────
router.post('/', validate(['titre', 'type']), (req, res) => {
  const { titre, type, budget, date_debut, priorite, statut, responsable_id, canal } = req.body;
  const result = db.prepare(`
    INSERT INTO actions_marketing (titre, type, budget, date_debut, priorite, statut, responsable_id, canal, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(titre, type, budget || 0, date_debut || null, priorite || 'normale',
      statut || 'en_attente', responsable_id || null, canal || 'autre', now(), now());
  res.status(201).json(db.prepare('SELECT * FROM actions_marketing WHERE id = ?').get(result.lastInsertRowid));
});

// ── PUT update ───────────────────────────────────────────────────────────────
router.put('/:id', (req, res) => {
  const row = db.prepare('SELECT id FROM actions_marketing WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Action marketing introuvable' });
  const { titre, type, budget, date_debut, priorite, statut, responsable_id, canal } = req.body;
  db.prepare(`
    UPDATE actions_marketing
    SET titre=?, type=?, budget=?, date_debut=?, priorite=?, statut=?, responsable_id=?, canal=?, updated_at=?
    WHERE id=?
  `).run(titre, type, budget || 0, date_debut || null, priorite || 'normale',
      statut || 'en_attente', responsable_id || null, canal || 'autre', now(), req.params.id);
  res.json(db.prepare('SELECT * FROM actions_marketing WHERE id = ?').get(req.params.id));
});

// ── DELETE ───────────────────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const row = db.prepare('SELECT id FROM actions_marketing WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Action marketing introuvable' });
  db.prepare('DELETE FROM actions_marketing WHERE id = ?').run(req.params.id);
  res.json({ message: 'Action marketing supprimee' });
});

module.exports = router;

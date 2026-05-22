/**
 * CITYMO ERP – Depenses (Commercial & Marketing) routes
 * POST   /api/depenses
 * GET    /api/depenses   ?type= &department_id= &date_from= &date_to=
 * PUT    /api/depenses/:id
 * DELETE /api/depenses/:id
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
  if (req.query.type)          { clauses.push('type = ?');          params.push(req.query.type); }
  if (req.query.department_id) { clauses.push('department_id = ?'); params.push(req.query.department_id); }
  if (req.query.date_from)     { clauses.push('date >= ?');         params.push(req.query.date_from); }
  if (req.query.date_to)       { clauses.push('date <= ?');         params.push(req.query.date_to); }
  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
  const rows = db.prepare(`SELECT * FROM depenses ${where} ORDER BY date DESC`).all(...params);
  res.json(rows);
});

// ── POST create ──────────────────────────────────────────────────────────────
router.post('/', validate(['intitule', 'type', 'montant', 'date']), (req, res) => {
  const { intitule, type, montant, date, reference_id, fichier_url, commentaire, department_id } = req.body;
  const result = db.prepare(`
    INSERT INTO depenses (intitule, type, montant, date, reference_id, fichier_url, commentaire, department_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(intitule, type, Number(montant), date, reference_id || null, fichier_url || null,
      commentaire || null, department_id || null, now(), now());
  res.status(201).json(db.prepare('SELECT * FROM depenses WHERE id = ?').get(result.lastInsertRowid));
});

// ── PUT update ───────────────────────────────────────────────────────────────
router.put('/:id', (req, res) => {
  const row = db.prepare('SELECT id FROM depenses WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Depense introuvable' });
  const { intitule, type, montant, date, reference_id, fichier_url, commentaire, department_id } = req.body;
  db.prepare(`
    UPDATE depenses SET intitule=?, type=?, montant=?, date=?, reference_id=?,
      fichier_url=?, commentaire=?, department_id=?, updated_at=?
    WHERE id=?
  `).run(intitule, type, Number(montant), date, reference_id || null, fichier_url || null,
      commentaire || null, department_id || null, now(), req.params.id);
  res.json(db.prepare('SELECT * FROM depenses WHERE id = ?').get(req.params.id));
});

// ── DELETE ───────────────────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const row = db.prepare('SELECT id FROM depenses WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Depense introuvable' });
  db.prepare('DELETE FROM depenses WHERE id = ?').run(req.params.id);
  res.json({ message: 'Depense supprimee' });
});

module.exports = router;

/**
 * CITYMO ERP – Propositions Marketing routes
 * POST   /api/propositions
 * GET    /api/propositions   ?statut= &prospect_id=
 * PUT    /api/propositions/:id
 * DELETE /api/propositions/:id
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
  if (req.query.statut)      { clauses.push('pm.statut = ?');      params.push(req.query.statut); }
  if (req.query.prospect_id) { clauses.push('pm.prospect_id = ?'); params.push(req.query.prospect_id); }
  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
  const rows = db.prepare(`
    SELECT pm.*, p.nom AS prospect_nom
    FROM propositions_marketing pm
    LEFT JOIN prospects p ON p.id = pm.prospect_id
    ${where}
    ORDER BY pm.created_at DESC
  `).all(...params);
  res.json(rows);
});

// ── GET one ──────────────────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const row = db.prepare(`
    SELECT pm.*, p.nom AS prospect_nom
    FROM propositions_marketing pm
    LEFT JOIN prospects p ON p.id = pm.prospect_id
    WHERE pm.id = ?
  `).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Proposition introuvable' });
  row.files = db.prepare('SELECT * FROM propositions_files WHERE proposition_id = ?').all(row.id);
  res.json(row);
});

// ── POST create ──────────────────────────────────────────────────────────────
router.post('/', validate(['titre']), (req, res) => {
  const { titre, prospect_id, objectif, description, budget_estime, statut } = req.body;
  const result = db.prepare(`
    INSERT INTO propositions_marketing (titre, prospect_id, objectif, description, budget_estime, statut, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(titre, prospect_id || null, objectif || null, description || null,
      Number(budget_estime) || 0, statut || 'brouillon', now(), now());
  res.status(201).json(db.prepare('SELECT * FROM propositions_marketing WHERE id = ?').get(result.lastInsertRowid));
});

// ── POST add file ─────────────────────────────────────────────────────────────
router.post('/:id/files', validate(['file_url']), (req, res) => {
  const propRow = db.prepare('SELECT id FROM propositions_marketing WHERE id = ?').get(req.params.id);
  if (!propRow) return res.status(404).json({ error: 'Proposition introuvable' });
  const result = db.prepare('INSERT INTO propositions_files (proposition_id, file_url) VALUES (?, ?)').run(req.params.id, req.body.file_url);
  res.status(201).json(db.prepare('SELECT * FROM propositions_files WHERE id = ?').get(result.lastInsertRowid));
});

// ── PUT update ───────────────────────────────────────────────────────────────
router.put('/:id', (req, res) => {
  const row = db.prepare('SELECT id FROM propositions_marketing WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Proposition introuvable' });
  const { titre, prospect_id, objectif, description, budget_estime, statut } = req.body;
  db.prepare(`
    UPDATE propositions_marketing
    SET titre=?, prospect_id=?, objectif=?, description=?, budget_estime=?, statut=?, updated_at=?
    WHERE id=?
  `).run(titre, prospect_id || null, objectif || null, description || null,
      Number(budget_estime) || 0, statut || 'brouillon', now(), req.params.id);
  res.json(db.prepare('SELECT * FROM propositions_marketing WHERE id = ?').get(req.params.id));
});

// ── DELETE ───────────────────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const row = db.prepare('SELECT id FROM propositions_marketing WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Proposition introuvable' });
  db.prepare('DELETE FROM propositions_marketing WHERE id = ?').run(req.params.id);
  res.json({ message: 'Proposition supprimee' });
});

module.exports = router;

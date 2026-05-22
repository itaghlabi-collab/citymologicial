/**
 * CITYMO ERP – Devis (Commercial) routes
 * POST   /api/devis
 * GET    /api/devis          ?statut= &prospect_id= &assigne_id= &date_from= &date_to=
 * GET    /api/devis/:id
 * PUT    /api/devis/:id
 * DELETE /api/devis/:id
 *
 * Business logic:
 *   - On PUT: if statut changes, update updated_at
 *   - CRON (in jobs/cronJobs.js) checks devis not updated for 48h → notification
 */
const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');
const { validate } = require('../middleware/validate');

function now() { return new Date().toISOString(); }

function buildWhere(query) {
  const clauses = [];
  const params  = [];
  if (query.statut)        { clauses.push('d.statut = ?');        params.push(query.statut); }
  if (query.prospect_id)   { clauses.push('d.prospect_id = ?');   params.push(query.prospect_id); }
  if (query.assigne_id)    { clauses.push('d.assigne_id = ?');    params.push(query.assigne_id); }
  if (query.type_projet)   { clauses.push('d.type_projet = ?');   params.push(query.type_projet); }
  if (query.department_id) { clauses.push('d.department_id = ?'); params.push(query.department_id); }
  if (query.date_from)     { clauses.push('d.created_at >= ?');   params.push(query.date_from); }
  if (query.date_to)       { clauses.push('d.created_at <= ?');   params.push(query.date_to + 'T23:59:59'); }
  return { where: clauses.length ? 'WHERE ' + clauses.join(' AND ') : '', params };
}

// ── GET all ──────────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const { where, params } = buildWhere(req.query);
  const rows = db.prepare(`
    SELECT d.*, p.nom AS prospect_nom, p.telephone AS prospect_tel, u.nom AS assigne_nom
    FROM devis d
    LEFT JOIN prospects p ON p.id = d.prospect_id
    LEFT JOIN users     u ON u.id = d.assigne_id
    ${where}
    ORDER BY d.created_at DESC
  `).all(...params);
  res.json(rows);
});

// ── GET one ──────────────────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const row = db.prepare(`
    SELECT d.*, p.nom AS prospect_nom, u.nom AS assigne_nom
    FROM devis d
    LEFT JOIN prospects p ON p.id = d.prospect_id
    LEFT JOIN users     u ON u.id = d.assigne_id
    WHERE d.id = ?
  `).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Devis introuvable' });
  row.files = db.prepare('SELECT * FROM devis_files WHERE devis_id = ?').all(row.id);
  res.json(row);
});

// ── POST create ──────────────────────────────────────────────────────────────
router.post('/', validate(['prospect_id', 'type_projet', 'source']), (req, res) => {
  const { prospect_id, type_projet, source, assigne_id, statut, commentaire } = req.body;
  // Verify prospect exists
  const prospect = db.prepare('SELECT id FROM prospects WHERE id = ?').get(prospect_id);
  if (!prospect) return res.status(400).json({ error: 'Prospect introuvable' });

  const result = db.prepare(`
    INSERT INTO devis (prospect_id, type_projet, source, assigne_id, statut, commentaire, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(prospect_id, type_projet, source, assigne_id || null, statut || 'en_attente', commentaire || null, now(), now());

  const created = db.prepare('SELECT * FROM devis WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(created);
});

// ── POST add file to devis ────────────────────────────────────────────────────
router.post('/:id/files', validate(['file_url', 'type']), (req, res) => {
  const devisRow = db.prepare('SELECT id FROM devis WHERE id = ?').get(req.params.id);
  if (!devisRow) return res.status(404).json({ error: 'Devis introuvable' });
  const { file_url, type } = req.body;
  const result = db.prepare('INSERT INTO devis_files (devis_id, file_url, type) VALUES (?, ?, ?)').run(req.params.id, file_url, type);
  res.status(201).json(db.prepare('SELECT * FROM devis_files WHERE id = ?').get(result.lastInsertRowid));
});

// ── PUT update ───────────────────────────────────────────────────────────────
router.put('/:id', (req, res) => {
  const row = db.prepare('SELECT id FROM devis WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Devis introuvable' });
  const { prospect_id, type_projet, source, assigne_id, statut, commentaire } = req.body;
  db.prepare(`
    UPDATE devis SET prospect_id=?, type_projet=?, source=?, assigne_id=?, statut=?, commentaire=?, updated_at=?
    WHERE id=?
  `).run(prospect_id, type_projet, source, assigne_id || null, statut || 'en_attente', commentaire || null, now(), req.params.id);
  res.json(db.prepare('SELECT * FROM devis WHERE id = ?').get(req.params.id));
});

// ── DELETE ───────────────────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const row = db.prepare('SELECT id FROM devis WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Devis introuvable' });
  db.prepare('DELETE FROM devis WHERE id = ?').run(req.params.id);
  res.json({ message: 'Devis supprime' });
});

module.exports = router;

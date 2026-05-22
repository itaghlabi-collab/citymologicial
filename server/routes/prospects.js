/**
 * CITYMO ERP – Prospects routes
 * POST   /api/prospects
 * GET    /api/prospects          ?statut= &type= &assigne_id= &date_from= &date_to=
 * GET    /api/prospects/:id
 * PUT    /api/prospects/:id
 * DELETE /api/prospects/:id
 */
const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');
const { validate } = require('../middleware/validate');

// ── Helpers ──────────────────────────────────────────────────────────────────
function now() { return new Date().toISOString(); }

function applyFilters(baseWhere, params, query) {
  const clauses = [...baseWhere];
  if (query.type)          { clauses.push("type = ?");          params.push(query.type); }
  if (query.department_id) { clauses.push("department_id = ?"); params.push(query.department_id); }
  if (query.date_from)     { clauses.push("created_at >= ?");   params.push(query.date_from); }
  if (query.date_to)       { clauses.push("created_at <= ?");   params.push(query.date_to + 'T23:59:59'); }
  return clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
}

// ── GET all ──────────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const params = [];
  const where  = applyFilters([], params, req.query);
  const rows   = db.prepare(`SELECT * FROM prospects ${where} ORDER BY created_at DESC`).all(...params);
  res.json(rows);
});

// ── GET one ──────────────────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM prospects WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Prospect introuvable' });
  // Attach related devis
  row.devis = db.prepare('SELECT * FROM devis WHERE prospect_id = ?').all(row.id);
  res.json(row);
});

// ── POST create ──────────────────────────────────────────────────────────────
router.post('/', validate(['type', 'nom', 'telephone', 'type_projet']), (req, res) => {
  const { type, nom, prenom, email, telephone, fonction, secteur, niveau_decisionnel, type_projet, action, commentaire } = req.body;
  const result = db.prepare(`
    INSERT INTO prospects (type, nom, prenom, email, telephone, fonction, secteur,
      niveau_decisionnel, type_projet, action, commentaire, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(type, nom, prenom || null, email || null, telephone, fonction || null, secteur || null,
      niveau_decisionnel || null, type_projet, action || null, commentaire || null, now(), now());
  const created = db.prepare('SELECT * FROM prospects WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(created);
});

// ── PUT update ───────────────────────────────────────────────────────────────
router.put('/:id', (req, res) => {
  const row = db.prepare('SELECT id FROM prospects WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Prospect introuvable' });
  const { type, nom, prenom, email, telephone, fonction, secteur, niveau_decisionnel, type_projet, action, commentaire } = req.body;
  db.prepare(`
    UPDATE prospects SET type=?, nom=?, prenom=?, email=?, telephone=?, fonction=?,
      secteur=?, niveau_decisionnel=?, type_projet=?, action=?, commentaire=?, updated_at=?
    WHERE id=?
  `).run(type, nom, prenom || null, email || null, telephone, fonction || null, secteur || null,
      niveau_decisionnel || null, type_projet, action || null, commentaire || null, now(), req.params.id);
  res.json(db.prepare('SELECT * FROM prospects WHERE id = ?').get(req.params.id));
});

// ── DELETE ───────────────────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const row = db.prepare('SELECT id FROM prospects WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Prospect introuvable' });
  db.prepare('DELETE FROM prospects WHERE id = ?').run(req.params.id);
  res.json({ message: 'Prospect supprime' });
});

module.exports = router;

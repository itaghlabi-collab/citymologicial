/**
 * CITYMO ERP – RDV (Planning) routes
 * POST   /api/rdv
 * GET    /api/rdv          ?statut= &prospect_id= &assigne_id= &date_from= &date_to=
 * GET    /api/rdv/:id
 * PUT    /api/rdv/:id       → auto-creates compte_rendu if statut = 'realise'
 * DELETE /api/rdv/:id
 */
const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');
const { validate } = require('../middleware/validate');

function now()     { return new Date().toISOString(); }
function todayISO(){ return new Date().toISOString().slice(0, 10); }

function buildWhere(query) {
  const clauses = [];
  const params  = [];
  if (query.statut)        { clauses.push('r.statut = ?');        params.push(query.statut); }
  if (query.prospect_id)   { clauses.push('r.prospect_id = ?');   params.push(query.prospect_id); }
  if (query.assigne_id)    { clauses.push('r.assigne_id = ?');    params.push(query.assigne_id); }
  if (query.department_id) { clauses.push('r.department_id = ?'); params.push(query.department_id); }
  if (query.date_from)     { clauses.push('r.date >= ?');         params.push(query.date_from); }
  if (query.date_to)       { clauses.push('r.date <= ?');         params.push(query.date_to + 'T23:59:59'); }
  return { where: clauses.length ? 'WHERE ' + clauses.join(' AND ') : '', params };
}

// ── GET all ──────────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const { where, params } = buildWhere(req.query);
  const rows = db.prepare(`
    SELECT r.*, p.nom AS prospect_nom, u.nom AS assigne_nom
    FROM rdv r
    LEFT JOIN prospects p ON p.id = r.prospect_id
    LEFT JOIN users     u ON u.id = r.assigne_id
    ${where}
    ORDER BY r.date DESC
  `).all(...params);
  res.json(rows);
});

// ── GET one ──────────────────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const row = db.prepare(`
    SELECT r.*, p.nom AS prospect_nom, u.nom AS assigne_nom
    FROM rdv r
    LEFT JOIN prospects p ON p.id = r.prospect_id
    LEFT JOIN users     u ON u.id = r.assigne_id
    WHERE r.id = ?
  `).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'RDV introuvable' });
  row.files = db.prepare('SELECT * FROM rdv_files WHERE rdv_id = ?').all(row.id);
  row.compte_rendu = db.prepare('SELECT * FROM comptes_rendus WHERE rdv_id = ?').get(row.id) || null;
  res.json(row);
});

// ── POST create ──────────────────────────────────────────────────────────────
router.post('/', validate(['titre', 'date']), (req, res) => {
  const { titre, type_rdv, date, lieu, prospect_id, assigne_id, statut, notes, actions_suivantes } = req.body;
  const result = db.prepare(`
    INSERT INTO rdv (titre, type_rdv, date, lieu, prospect_id, assigne_id, statut, notes, actions_suivantes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(titre, type_rdv || null, date, lieu || null, prospect_id || null, assigne_id || null,
      statut || 'prevu', notes || null, actions_suivantes || null, now(), now());
  const created = db.prepare('SELECT * FROM rdv WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(created);
});

// ── POST add file ─────────────────────────────────────────────────────────────
router.post('/:id/files', validate(['file_url']), (req, res) => {
  const rdvRow = db.prepare('SELECT id FROM rdv WHERE id = ?').get(req.params.id);
  if (!rdvRow) return res.status(404).json({ error: 'RDV introuvable' });
  const result = db.prepare('INSERT INTO rdv_files (rdv_id, file_url) VALUES (?, ?)').run(req.params.id, req.body.file_url);
  res.status(201).json(db.prepare('SELECT * FROM rdv_files WHERE id = ?').get(result.lastInsertRowid));
});

// ── PUT update ────────────────────────────────────────────────────────────────
router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM rdv WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'RDV introuvable' });

  const { titre, type_rdv, date, lieu, prospect_id, assigne_id, statut, notes, actions_suivantes } = req.body;
  db.prepare(`
    UPDATE rdv SET titre=?, type_rdv=?, date=?, lieu=?, prospect_id=?, assigne_id=?,
      statut=?, notes=?, actions_suivantes=?, updated_at=?
    WHERE id=?
  `).run(titre, type_rdv || null, date, lieu || null, prospect_id || null, assigne_id || null,
      statut || 'prevu', notes || null, actions_suivantes || null, now(), req.params.id);

  // ── Business logic: auto-create compte rendu when statut = 'realise' ──────
  if (statut === 'realise' && existing.statut !== 'realise') {
    const already = db.prepare('SELECT id FROM comptes_rendus WHERE rdv_id = ?').get(req.params.id);
    if (!already) {
      db.prepare(`
        INSERT INTO comptes_rendus (rdv_id, prospect_id, resume, date, assigne_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(req.params.id, prospect_id || existing.prospect_id, 'Compte rendu genere automatiquement.',
          todayISO(), assigne_id || existing.assigne_id, now(), now());
    }
  }

  const updated = db.prepare('SELECT * FROM rdv WHERE id = ?').get(req.params.id);
  updated.compte_rendu = db.prepare('SELECT * FROM comptes_rendus WHERE rdv_id = ?').get(req.params.id) || null;
  res.json(updated);
});

// ── DELETE ───────────────────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const row = db.prepare('SELECT id FROM rdv WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'RDV introuvable' });
  db.prepare('DELETE FROM rdv WHERE id = ?').run(req.params.id);
  res.json({ message: 'RDV supprime' });
});

module.exports = router;

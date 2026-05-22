/**
 * CITYMO ERP – Existing module routes (HR, Projects, Finance, Stock, etc.)
 * These preserve all previously expected API endpoints that the frontend api.js uses.
 */
const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');

function now() { return new Date().toISOString(); }

// ═══════════════════════════════════════════════════════════════════
// EMPLOYEES
// ═══════════════════════════════════════════════════════════════════
router.get('/employees', (req, res) => {
  const rows = db.prepare('SELECT * FROM employees ORDER BY nom').all();
  res.json(rows);
});

router.post('/employees', (req, res) => {
  const { prenom, nom, email, poste, departement_id, telephone, dateEmbauche, salaire } = req.body;
  if (!prenom || !nom) return res.status(400).json({ error: 'prenom et nom sont requis' });
  const result = db.prepare(`
    INSERT INTO employees (prenom, nom, email, poste, departement_id, telephone, date_embauche, salaire, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(prenom, nom, email || null, poste || null, departement_id || null, telephone || null, dateEmbauche || null, Number(salaire) || 0, now(), now());
  res.status(201).json(db.prepare('SELECT * FROM employees WHERE id = ?').get(result.lastInsertRowid));
});

// ═══════════════════════════════════════════════════════════════════
// CLIENTS
// ═══════════════════════════════════════════════════════════════════
router.get('/clients', (req, res) => {
  res.json(db.prepare('SELECT * FROM clients ORDER BY nom').all());
});

router.post('/clients', (req, res) => {
  const { nom, email, telephone, ville } = req.body;
  if (!nom) return res.status(400).json({ error: 'nom est requis' });
  const result = db.prepare('INSERT INTO clients (nom, email, telephone, ville) VALUES (?, ?, ?, ?)').run(nom, email || null, telephone || null, ville || null);
  res.status(201).json(db.prepare('SELECT * FROM clients WHERE id = ?').get(result.lastInsertRowid));
});

// ═══════════════════════════════════════════════════════════════════
// PROJECTS
// ═══════════════════════════════════════════════════════════════════
router.get('/projects', (req, res) => {
  const rows = db.prepare(`
    SELECT p.*, d.nom AS departement_nom, d.code AS departement_code
    FROM projects p LEFT JOIN departments d ON d.id = p.departement_id
    ORDER BY p.created_at DESC
  `).all();
  res.json(rows);
});

router.post('/projects', (req, res) => {
  const { nom, client, budget, dateDebut, dateFin, statut, description, departement_id } = req.body;
  if (!nom) return res.status(400).json({ error: 'nom est requis' });
  const result = db.prepare(`
    INSERT INTO projects (nom, client, budget, date_debut, date_fin, statut, description, departement_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(nom, client || null, Number(budget) || 0, dateDebut || null, dateFin || null, statut || 'Debut', description || null, departement_id || null, now(), now());
  res.status(201).json(db.prepare('SELECT * FROM projects WHERE id = ?').get(result.lastInsertRowid));
});

// ═══════════════════════════════════════════════════════════════════
// QUOTES (devis CRM)
// ═══════════════════════════════════════════════════════════════════
router.get('/quotes', (req, res) => {
  res.json(db.prepare('SELECT * FROM quotes ORDER BY created_at DESC').all());
});

router.post('/quotes', (req, res) => {
  const { client, montant, statut, date } = req.body;
  const result = db.prepare('INSERT INTO quotes (client, montant, statut, date) VALUES (?, ?, ?, ?)').run(client || null, Number(montant) || 0, statut || 'En attente', date || null);
  res.status(201).json(db.prepare('SELECT * FROM quotes WHERE id = ?').get(result.lastInsertRowid));
});

// ═══════════════════════════════════════════════════════════════════
// INVOICES
// ═══════════════════════════════════════════════════════════════════
router.get('/invoices', (req, res) => {
  res.json(db.prepare('SELECT * FROM invoices ORDER BY created_at DESC').all());
});

router.post('/invoices', (req, res) => {
  const { client, montant, statut, date } = req.body;
  const result = db.prepare('INSERT INTO invoices (client, montant, statut, date) VALUES (?, ?, ?, ?)').run(client || null, Number(montant) || 0, statut || 'En attente', date || null);
  res.status(201).json(db.prepare('SELECT * FROM invoices WHERE id = ?').get(result.lastInsertRowid));
});

// ═══════════════════════════════════════════════════════════════════
// EXPENSES (charges comptabilite)
// ═══════════════════════════════════════════════════════════════════
router.get('/expenses', (req, res) => {
  const rows = db.prepare(`
    SELECT e.*, d.code AS departement_code, d.nom AS departement_nom
    FROM expenses e LEFT JOIN departments d ON d.id = e.departement_id
    ORDER BY e.created_at DESC
  `).all();
  res.json(rows);
});

router.post('/expenses', (req, res) => {
  const { libelle, montant, categorie, departement_id, date, statut } = req.body;
  if (!libelle) return res.status(400).json({ error: 'libelle est requis' });
  const result = db.prepare(`
    INSERT INTO expenses (libelle, montant, categorie, departement_id, date, statut, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(libelle, Number(montant) || 0, categorie || null, departement_id || null, date || null, statut || 'En attente', now(), now());
  res.status(201).json(db.prepare('SELECT * FROM expenses WHERE id = ?').get(result.lastInsertRowid));
});

// ═══════════════════════════════════════════════════════════════════
// PAYMENT ORDERS
// ═══════════════════════════════════════════════════════════════════
router.get('/payment-orders', (req, res) => {
  res.json(db.prepare('SELECT * FROM payment_orders ORDER BY created_at DESC').all());
});

// ═══════════════════════════════════════════════════════════════════
// WORKERS / OUVRIERS
// ═══════════════════════════════════════════════════════════════════
router.get('/workers', (req, res) => {
  res.json(db.prepare('SELECT * FROM workers ORDER BY nom').all());
});

router.post('/workers', (req, res) => {
  const { prenom, nom, telephone, cin, fonction, tarif } = req.body;
  if (!prenom || !nom) return res.status(400).json({ error: 'prenom et nom sont requis' });
  const result = db.prepare('INSERT INTO workers (prenom, nom, telephone, cin, fonction, tarif) VALUES (?, ?, ?, ?, ?, ?)').run(prenom, nom, telephone || null, cin || null, fonction || null, Number(tarif) || 0);
  res.status(201).json(db.prepare('SELECT * FROM workers WHERE id = ?').get(result.lastInsertRowid));
});

// ═══════════════════════════════════════════════════════════════════
// LEAVE REQUESTS
// ═══════════════════════════════════════════════════════════════════
router.get('/leave-requests', (req, res) => {
  res.json(db.prepare('SELECT * FROM leave_requests ORDER BY created_at DESC').all());
});

router.post('/leave-requests', (req, res) => {
  const { employe, type, dateDebut, dateFin, dateRetour, jours, raison } = req.body;
  if (!employe) return res.status(400).json({ error: 'employe est requis' });
  const result = db.prepare(`
    INSERT INTO leave_requests (employe, type, date_debut, date_fin, date_retour, jours, raison)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(employe, type || null, dateDebut || null, dateFin || null, dateRetour || null, Number(jours) || 0, raison || null);
  res.status(201).json(db.prepare('SELECT * FROM leave_requests WHERE id = ?').get(result.lastInsertRowid));
});

// ═══════════════════════════════════════════════════════════════════
// PROSPECTS (alias – same as /api/prospects but at /api/prospects path via existing router)
// ═══════════════════════════════════════════════════════════════════
router.get('/prospects', (req, res) => {
  res.json(db.prepare('SELECT * FROM prospects ORDER BY created_at DESC').all());
});

// ═══════════════════════════════════════════════════════════════════
// TASKS
// ═══════════════════════════════════════════════════════════════════
router.get('/tasks', (req, res) => {
  res.json([]);  // Tasks are managed client-side; placeholder for future DB storage
});

// ═══════════════════════════════════════════════════════════════════
// MEETINGS (rdv alias)
// ═══════════════════════════════════════════════════════════════════
router.get('/meetings', (req, res) => {
  res.json(db.prepare('SELECT * FROM rdv ORDER BY date DESC').all());
});

// ═══════════════════════════════════════════════════════════════════
// PRODUCTS / STOCK
// ═══════════════════════════════════════════════════════════════════
router.get('/products', (req, res) => {
  res.json(db.prepare('SELECT * FROM products ORDER BY nom').all());
});

// ═══════════════════════════════════════════════════════════════════
// PURCHASE ORDERS
// ═══════════════════════════════════════════════════════════════════
router.get('/purchase-orders', (req, res) => {
  res.json(db.prepare('SELECT * FROM purchase_orders ORDER BY created_at DESC').all());
});

// ═══════════════════════════════════════════════════════════════════
// DEPARTMENTS (read-only list for dropdowns)
// ═══════════════════════════════════════════════════════════════════
router.get('/departments', (req, res) => {
  res.json(db.prepare('SELECT * FROM departments ORDER BY id').all());
});

module.exports = router;

/**
 * CITYMO ERP – Dashboard / reporting endpoint
 * GET /api/dashboard/commercial
 *
 * Returns:
 *  nb_prospects, nb_devis_attente, nb_rdv_today, nb_actions_actives, total_depenses
 */
const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');

router.get('/commercial', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);

  // Non-admin users see only their department's data
  const deptId = (req.user && req.user.role !== 'admin') ? req.user.department_id : null;
  const deptClause = deptId ? ' AND department_id = ?' : '';
  const deptParams = deptId ? [deptId] : [];

  const nb_prospects = db.prepare(`SELECT COUNT(*) AS n FROM prospects WHERE 1=1${deptClause}`).get(...deptParams).n;

  const nb_devis_attente = db.prepare(
    `SELECT COUNT(*) AS n FROM devis WHERE statut = 'en_attente'${deptClause}`
  ).get(...deptParams).n;

  const nb_rdv_today = deptId
    ? db.prepare("SELECT COUNT(*) AS n FROM rdv WHERE date LIKE ? AND statut NOT IN ('annule','reporte') AND department_id = ?").get(today + '%', deptId).n
    : db.prepare("SELECT COUNT(*) AS n FROM rdv WHERE date LIKE ? AND statut NOT IN ('annule','reporte')").get(today + '%').n;

  const nb_actions_actives = deptId
    ? db.prepare("SELECT COUNT(*) AS n FROM actions_marketing WHERE statut IN ('en_cours','valide') AND department_id = ?").get(deptId).n
    : db.prepare("SELECT COUNT(*) AS n FROM actions_marketing WHERE statut IN ('en_cours','valide')").get().n;

  const total_depenses = deptId
    ? db.prepare('SELECT COALESCE(SUM(montant), 0) AS total FROM depenses WHERE department_id = ?').get(deptId).total
    : db.prepare('SELECT COALESCE(SUM(montant), 0) AS total FROM depenses').get().total;

  // Notifications for current user (or all if admin)
  const notifWhere = (req.user && req.user.role !== 'admin') ? 'WHERE lu = 0 AND user_id = ?' : 'WHERE lu = 0';
  const notifParams = (req.user && req.user.role !== 'admin') ? [req.user.id] : [];
  const nb_notifications_unread = db.prepare(`SELECT COUNT(*) AS n FROM notifications ${notifWhere}`).get(...notifParams).n;

  // Recent prospects (last 5, scoped to dept if non-admin)
  const recent_prospects = deptId
    ? db.prepare('SELECT id, nom, prenom, type_projet, created_at FROM prospects WHERE department_id = ? ORDER BY created_at DESC LIMIT 5').all(deptId)
    : db.prepare('SELECT id, nom, prenom, type_projet, created_at FROM prospects ORDER BY created_at DESC LIMIT 5').all();

  // Devis by status breakdown (scoped to dept if non-admin)
  const devis_stats = deptId
    ? db.prepare("SELECT statut, COUNT(*) AS n FROM devis WHERE department_id = ? GROUP BY statut").all(deptId)
    : db.prepare("SELECT statut, COUNT(*) AS n FROM devis GROUP BY statut").all();

  res.json({
    nb_prospects,
    nb_devis_attente,
    nb_rdv_today,
    nb_actions_actives,
    total_depenses,
    nb_notifications_unread,
    recent_prospects,
    devis_stats,
  });
});

module.exports = router;

/**
 * CITYMO ERP – Background CRON jobs
 *
 * Job 1 (every hour): scan devis not updated for > 48h with statut='en_attente'
 *         → create a notification for the assigned commercial
 *
 * Job 2 (daily at 08:00): scan RDV scheduled for today → remind assigned user
 */

const cron = require('node-cron');
const db   = require('../db/connection');

function now() { return new Date().toISOString(); }

/* ─────────────────────────────────────────────────────────────────────────────
   Job 1 – Devis stagnants (> 48 h sans mise à jour, statut = en_attente)
   Schedule: every full hour
───────────────────────────────────────────────────────────────────────────── */
function checkStaleDevis() {
  try {
    const threshold = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    // Find devis en_attente not updated for more than 48 hours
    const staleDevis = db.prepare(`
      SELECT d.id, d.numero, d.assigne_id, d.prospect_id, d.updated_at,
             p.nom AS prospect_nom
      FROM devis d
      LEFT JOIN prospects p ON p.id = d.prospect_id
      WHERE d.statut = 'en_attente'
        AND d.updated_at < ?
    `).all(threshold);

    for (const devis of staleDevis) {
      // Avoid duplicate notifications: check if one already exists for this devis in the last 24h
      const recent = db.prepare(`
        SELECT id FROM notifications
        WHERE type = 'devis_stagnant'
          AND reference_id = ?
          AND created_at > ?
      `).get(devis.id, new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      if (!recent) {
        db.prepare(`
          INSERT INTO notifications (user_id, type, message, reference_id, lu, created_at)
          VALUES (?, 'devis_stagnant', ?, ?, 0, ?)
        `).run(
          devis.assigne_id || null,
          `Le devis ${devis.numero} pour "${devis.prospect_nom || 'Prospect inconnu'}" est en attente depuis plus de 48h sans modification.`,
          devis.id,
          now()
        );
      }
    }

    if (staleDevis.length > 0) {
      console.log(`[CRON devis_stagnant] ${staleDevis.length} devis stagnant(s) détecté(s) — ${new Date().toLocaleString('fr-DZ')}`);
    }
  } catch (err) {
    console.error('[CRON devis_stagnant] Erreur:', err.message);
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   Job 2 – Rappel RDV du jour (quotidien à 08:00)
───────────────────────────────────────────────────────────────────────────── */
function remindTodayRDV() {
  try {
    const today = new Date().toISOString().slice(0, 10);

    const rdvToday = db.prepare(`
      SELECT r.id, r.titre, r.date, r.assigne_id,
             p.nom AS prospect_nom
      FROM rdv r
      LEFT JOIN prospects p ON p.id = r.prospect_id
      WHERE r.date LIKE ?
        AND r.statut NOT IN ('annule', 'reporte', 'realise')
    `).all(today + '%');

    for (const rdv of rdvToday) {
      // Only create if no reminder already exists today for this rdv
      const alreadySent = db.prepare(`
        SELECT id FROM notifications
        WHERE type = 'rdv_rappel'
          AND reference_id = ?
          AND created_at > ?
      `).get(rdv.id, today + 'T00:00:00.000Z');

      if (!alreadySent) {
        db.prepare(`
          INSERT INTO notifications (user_id, type, message, reference_id, lu, created_at)
          VALUES (?, 'rdv_rappel', ?, ?, 0, ?)
        `).run(
          rdv.assigne_id || null,
          `Rappel : vous avez un RDV aujourd'hui — "${rdv.titre}" avec ${rdv.prospect_nom || 'un prospect'} (${new Date(rdv.date).toLocaleTimeString('fr-DZ', { hour: '2-digit', minute: '2-digit' })}).`,
          rdv.id,
          now()
        );
      }
    }

    if (rdvToday.length > 0) {
      console.log(`[CRON rdv_rappel] ${rdvToday.length} rappel(s) RDV envoyé(s) — ${new Date().toLocaleString('fr-DZ')}`);
    }
  } catch (err) {
    console.error('[CRON rdv_rappel] Erreur:', err.message);
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   Register all CRON schedules
───────────────────────────────────────────────────────────────────────────── */
function startCronJobs() {
  // Every hour at minute 0
  cron.schedule('0 * * * *', checkStaleDevis, {
    scheduled: true,
    timezone: 'Africa/Algiers',
  });

  // Every day at 08:00
  cron.schedule('0 8 * * *', remindTodayRDV, {
    scheduled: true,
    timezone: 'Africa/Algiers',
  });

  console.log('[CRON] Jobs planifiés: devis_stagnant (toutes les heures) + rdv_rappel (quotidien 08:00)');

  // Run devis check immediately on startup to catch any backlog
  checkStaleDevis();
}

module.exports = { startCronJobs, checkStaleDevis, remindTodayRDV };

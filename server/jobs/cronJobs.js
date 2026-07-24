/**
 * CITYMO ERP – Background CRON jobs
 *
 * Job 1 (every hour): scan devis not updated for > 48h with statut='en_attente'
 *         → create a notification for the assigned commercial
 *
 * Job 2 (daily at 08:00): scan RDV scheduled for today → remind assigned user
 *
 * Job 3 (hourly :15): poll erp_backup_schedules dues — exécute AU PLUS une fois
 *         par période (quotidienne:YYYY-MM-DD), avance toujours next_run_at.
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

    const staleDevis = db.prepare(`
      SELECT d.id, d.numero, d.assigne_id, d.prospect_id, d.updated_at,
             p.nom AS prospect_nom
      FROM devis d
      LEFT JOIN prospects p ON p.id = d.prospect_id
      WHERE d.statut = 'en_attente'
        AND d.updated_at < ?
    `).all(threshold);

    for (const devis of staleDevis) {
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
   Job 3 – Sauvegardes ERP planifiées (poll horaire, exécution 1× / période)
───────────────────────────────────────────────────────────────────────────── */
async function updateScheduleSafe(sb, id, fields) {
  const { error } = await sb.from('erp_backup_schedules').update(fields).eq('id', id);
  if (!error) return;
  // Colonnes optionnelles absentes (migration non appliquée) → fallback minimal
  const minimal = {
    last_run_at: fields.last_run_at,
    next_run_at: fields.next_run_at,
  };
  const { error: e2 } = await sb.from('erp_backup_schedules').update(minimal).eq('id', id);
  if (e2) console.error('[CRON backups] update schedule:', e2.message);
}

async function runScheduledBackups() {
  try {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return;

    const { getSupabaseAdmin } = require('../lib/supabaseAdmin');
    const { runBackup } = require('../services/backup/backupService');
    const {
      computeNextRun,
      schedulePeriodKey,
      MAX_NETWORK_RETRIES,
      networkRetryDelayMs,
    } = require('../services/backup/backupSchedule');
    const { classifyDriveError } = require('../services/backup/googleDriveErrors');
    const { sanitizeErrorForUser } = require('../services/backup/backupUserMessages');
    const { assertNoConcurrentBackup } = require('../services/backup/backupJobRunner');

    const sb = getSupabaseAdmin();
    const nowIso = new Date().toISOString();

    const { data: schedules, error } = await sb
      .from('erp_backup_schedules')
      .select('*')
      .eq('enabled', true)
      .lte('next_run_at', nowIso);

    if (error || !schedules?.length) return;

    for (const schedule of schedules) {
      const periodKey = schedulePeriodKey(schedule.planification, new Date());
      let nextRun = computeNextRun(schedule.planification);
      let failures = Number(schedule.consecutive_failures) || 0;
      let lastErrorCode = null;
      let lastErrorUser = null;

      try {
        // Anti-doublon : déjà exécuté pour cette période
        if (schedule.last_period_key === periodKey) {
          await updateScheduleSafe(sb, schedule.id, {
            next_run_at: nextRun.toISOString(),
          });
          console.log(`[CRON backups] skip doublon ${periodKey}`);
          continue;
        }

        // Doublon via journal erp_backups
        const { data: existing } = await sb
          .from('erp_backups')
          .select('id, statut')
          .eq('schedule_period_key', periodKey)
          .in('statut', ['succes', 'succes_partiel', 'en_cours'])
          .limit(1);

        if (existing?.length) {
          await updateScheduleSafe(sb, schedule.id, {
            last_period_key: periodKey,
            next_run_at: nextRun.toISOString(),
            consecutive_failures: 0,
          });
          console.log(`[CRON backups] skip existant ${periodKey}`);
          continue;
        }

        try {
          await assertNoConcurrentBackup();
        } catch (lockErr) {
          console.warn(`[CRON backups] reporté (concurrence): ${lockErr.message}`);
          continue;
        }

        await runBackup({
          type: schedule.backup_type,
          planification: schedule.planification,
          description: schedule.notes || `Sauvegarde planifiée (${schedule.planification})`,
          actor: { id: schedule.created_by, email: 'cron@citymo.ma', nom: 'Planificateur ERP' },
          schedulePeriodKey: periodKey,
        });

        failures = 0;
        await updateScheduleSafe(sb, schedule.id, {
          last_run_at: nowIso,
          next_run_at: nextRun.toISOString(),
          last_period_key: periodKey,
          consecutive_failures: 0,
          last_error_code: null,
          last_error_user_message: null,
        });

        console.log(`[CRON backups] ${schedule.planification} ${schedule.backup_type} OK (${periodKey})`);
      } catch (err) {
        const classified = classifyDriveError(err);
        const sanitized = sanitizeErrorForUser(err);
        lastErrorCode = classified.reconnectRequired ? classified.code : sanitized.code;
        lastErrorUser = sanitized.userMessage;
        failures += 1;

        if (classified.reconnectRequired) {
          nextRun = computeNextRun(schedule.planification);
        } else if (classified.retryable && failures < MAX_NETWORK_RETRIES) {
          nextRun = new Date(Date.now() + networkRetryDelayMs(failures));
        } else {
          nextRun = computeNextRun(schedule.planification);
          failures = 0;
        }

        await updateScheduleSafe(sb, schedule.id, {
          last_run_at: nowIso,
          next_run_at: nextRun.toISOString(),
          last_period_key: classified.reconnectRequired || failures === 0
            ? periodKey
            : schedule.last_period_key,
          consecutive_failures: failures,
          last_error_code: lastErrorCode,
          last_error_user_message: lastErrorUser,
        });

        console.error(`[CRON backups] schedule ${schedule.id}:`, sanitized.userMessage);
      }
    }
  } catch (err) {
    console.error('[CRON backups] Erreur:', err.message);
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   Register all CRON schedules
───────────────────────────────────────────────────────────────────────────── */
function startCronJobs() {
  cron.schedule('0 * * * *', checkStaleDevis, {
    scheduled: true,
    timezone: 'Africa/Algiers',
  });

  cron.schedule('0 8 * * *', remindTodayRDV, {
    scheduled: true,
    timezone: 'Africa/Algiers',
  });

  // Poll horaires :15 — l’exécution réelle est 1×/période (voir last_period_key)
  cron.schedule('15 * * * *', runScheduledBackups, {
    scheduled: true,
    timezone: 'Africa/Algiers',
  });

  const { reconcileStuckBackups } = require('../services/backup/backupJobRunner');
  cron.schedule('*/5 * * * *', () => {
    reconcileStuckBackups().catch((err) => {
      console.error('[CRON backups reconcile]', err.message);
    });
  }, {
    scheduled: true,
    timezone: 'Africa/Algiers',
  });

  console.log('[CRON] Jobs planifiés: devis_stagnant + rdv_rappel + backups ERP + reconcile backups');

  checkStaleDevis();
}

module.exports = { startCronJobs, checkStaleDevis, remindTodayRDV, runScheduledBackups };

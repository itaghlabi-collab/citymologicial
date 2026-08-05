/**
 * Agrégat santé sauvegardes — indicateurs verts / oranges / rouges (sans secrets).
 */
const { getSupabaseAdmin } = require('../../lib/supabaseAdmin');
const { getBackupEnvironmentStatus, testSupabaseConnection } = require('./backupEnvCheck');
const { getDriveStatePublic } = require('./googleDriveAuthState');
const { isGoogleDriveEnabled } = require('./googleDriveConfig');
const { getRedirectUri } = require('./googleDriveOAuth');
const { scheduleHour, scheduleMinute } = require('./backupSchedule');

const LEVEL = {
  OK: 'ok',
  WARN: 'warn',
  ERROR: 'error',
  UNKNOWN: 'unknown',
};

function levelMeta(level) {
  const map = {
    ok: { color: 'green', label: 'OK' },
    warn: { color: 'orange', label: 'Attention' },
    error: { color: 'red', label: 'Erreur' },
    unknown: { color: 'grey', label: 'Inconnu' },
  };
  return map[level] || map.unknown;
}

function fmtFr(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString('fr-FR', { timeZone: 'Africa/Algiers' });
  } catch {
    return String(iso);
  }
}

function ageHours(iso) {
  if (!iso) return null;
  return (Date.now() - new Date(iso).getTime()) / 3_600_000;
}

async function getBackupHealthDashboard() {
  const env = getBackupEnvironmentStatus();
  const driveState = await getDriveStatePublic();
  const sb = getSupabaseAdmin();
  const checkedAt = new Date().toISOString();

  // ── Supabase ─────────────────────────────────────────────────────────────
  let supabaseOk = false;
  let supabaseError = null;
  try {
    await testSupabaseConnection();
    supabaseOk = true;
  } catch (err) {
    supabaseError = err.message;
  }

  let supabaseLevel = LEVEL.ERROR;
  let supabaseSummary = 'Connexion Supabase impossible';
  if (supabaseOk && env.supabase.service_role_configured) {
    supabaseLevel = LEVEL.OK;
    supabaseSummary = `Connecté — ${env.supabase.url_host || 'host OK'}`;
  } else if (supabaseOk && !env.supabase.service_role_configured) {
    supabaseLevel = LEVEL.WARN;
    supabaseSummary = 'Connecté mais service_role manquant';
  } else if (!env.supabase.url_configured) {
    supabaseSummary = 'URL Supabase non configurée';
  }

  // ── Google Drive ─────────────────────────────────────────────────────────
  const reconnect = driveState.reconnect_required || driveState.status === 'reconnect_required';
  const driveEnabled = isGoogleDriveEnabled();
  let driveLevel = LEVEL.UNKNOWN;
  let driveSummary = 'Non configuré';

  if (!driveEnabled && !env.google_drive.enabled_flag) {
    driveLevel = LEVEL.WARN;
    driveSummary = 'Google Drive désactivé';
  } else if (reconnect) {
    driveLevel = LEVEL.ERROR;
    driveSummary = driveState.last_error_user_message
      || 'Google Drive déconnecté — reconnexion nécessaire';
  } else if (driveState.status === 'error') {
    driveLevel = LEVEL.ERROR;
    driveSummary = driveState.last_error_user_message
      || 'Erreur OAuth Google Drive';
  } else if (driveState.status === 'pending_validation') {
    driveLevel = LEVEL.WARN;
    driveSummary = 'Validation OAuth en cours…';
  } else if (driveState.status === 'active' && driveEnabled) {
    driveLevel = LEVEL.OK;
    driveSummary = 'Connexion active';
  } else if (driveState.status === 'disconnected') {
    driveLevel = LEVEL.WARN;
    driveSummary = 'Déconnecté volontairement';
  } else if (env.google_drive.enabled_flag && !driveEnabled) {
    driveLevel = LEVEL.ERROR;
    driveSummary = 'Activé mais configuration incomplète';
  } else {
    driveLevel = LEVEL.WARN;
    driveSummary = `État : ${driveState.status || 'inconnu'}`;
  }

  // ── Scheduler ────────────────────────────────────────────────────────────
  let schedules = [];
  try {
    const { data, error } = await sb
      .from('erp_backup_schedules')
      .select('id, planification, enabled, next_run_at, last_run_at, last_period_key, consecutive_failures, last_error_code, last_error_user_message')
      .eq('enabled', true)
      .order('next_run_at', { ascending: true });
    if (!error) schedules = data || [];
  } catch {
    schedules = [];
  }

  const nextSchedule = schedules[0] || null;
  const now = Date.now();
  let schedulerLevel = LEVEL.WARN;
  let schedulerSummary = 'Aucune planification active';

  if (schedules.length > 0) {
    const overdue = schedules.some((s) => s.next_run_at && new Date(s.next_run_at).getTime() < now - 2 * 3_600_000);
    const failing = schedules.some((s) => (Number(s.consecutive_failures) || 0) > 0);
    const driveFail = schedules.some((s) => /invalid_grant|reconnect/i.test(String(s.last_error_code || s.last_error_user_message || '')));

    if (driveFail || (failing && overdue)) {
      schedulerLevel = LEVEL.ERROR;
      schedulerSummary = nextSchedule?.last_error_user_message
        || 'Planification en erreur — vérifier Drive / journaux';
    } else if (failing || overdue) {
      schedulerLevel = LEVEL.WARN;
      schedulerSummary = overdue
        ? 'Exécution en retard'
        : `Échecs consécutifs : ${nextSchedule?.consecutive_failures || 0}`;
    } else {
      schedulerLevel = LEVEL.OK;
      schedulerSummary = `${schedules.length} planification(s) active(s)`;
    }
  }

  // ── Dernière sauvegarde ──────────────────────────────────────────────────
  let lastBackup = null;
  try {
    const { data } = await sb
      .from('erp_backups')
      .select('id, ref, statut, created_at, user_message, error_message, drive_synced, drive_sync_error, file_path, taille_bytes')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    lastBackup = data || null;
  } catch {
    lastBackup = null;
  }

  let lastLevel = LEVEL.UNKNOWN;
  let lastSummary = 'Aucune sauvegarde';
  if (lastBackup) {
    const age = ageHours(lastBackup.created_at);
    if (lastBackup.statut === 'succes') {
      lastLevel = age != null && age > 36 ? LEVEL.WARN : LEVEL.OK;
      lastSummary = age != null && age > 36
        ? `Succès — il y a ${Math.round(age)} h (ancien)`
        : `Succès — ${lastBackup.ref}`;
    } else if (lastBackup.statut === 'succes_partiel') {
      lastLevel = LEVEL.WARN;
      lastSummary = lastBackup.user_message || `Succès partiel — ${lastBackup.ref}`;
    } else if (lastBackup.statut === 'en_cours') {
      lastLevel = LEVEL.WARN;
      lastSummary = `En cours — ${lastBackup.ref}`;
    } else if (lastBackup.statut === 'erreur') {
      lastLevel = LEVEL.ERROR;
      lastSummary = lastBackup.user_message
        || (lastBackup.error_message?.slice(0, 120))
        || `Erreur — ${lastBackup.ref}`;
    }
  }

  // ── Erreurs récentes (24 h) ──────────────────────────────────────────────
  let recentErrors = [];
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data } = await sb
      .from('erp_backups')
      .select('id, ref, created_at, user_message, error_message, error_code, statut')
      .in('statut', ['erreur', 'succes_partiel'])
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(5);
    recentErrors = (data || []).map((r) => ({
      ref: r.ref,
      statut: r.statut,
      at: r.created_at,
      at_label: fmtFr(r.created_at),
      message: r.user_message
        || (r.error_message && /invalid_grant/i.test(r.error_message)
          ? 'Google Drive déconnecté — reconnexion nécessaire'
          : (r.error_message || '').slice(0, 140)),
      code: r.error_code || null,
    }));
  } catch {
    recentErrors = [];
  }

  // ── Santé globale ────────────────────────────────────────────────────────
  const indicators = [supabaseLevel, driveLevel, schedulerLevel, lastLevel];
  let overall = LEVEL.OK;
  if (indicators.includes(LEVEL.ERROR)) overall = LEVEL.ERROR;
  else if (indicators.includes(LEVEL.WARN) || indicators.includes(LEVEL.UNKNOWN)) overall = LEVEL.WARN;

  const hour = scheduleHour();
  const minute = String(scheduleMinute()).padStart(2, '0');

  return {
    checked_at: checkedAt,
    checked_at_label: fmtFr(checkedAt),
    overall: {
      level: overall,
      ...levelMeta(overall),
      summary: overall === LEVEL.OK
        ? 'Système de sauvegarde opérationnel'
        : overall === LEVEL.WARN
          ? 'Attention — action recommandée'
          : 'Incident — intervention requise',
    },
    supabase: {
      level: supabaseLevel,
      ...levelMeta(supabaseLevel),
      summary: supabaseSummary,
      host: env.supabase.url_host || null,
      connection_ok: supabaseOk,
      service_role_configured: env.supabase.service_role_configured,
      bucket: env.storage?.bucket || 'citymo-backups',
      error: supabaseError,
    },
    google_drive: {
      level: driveLevel,
      ...levelMeta(driveLevel),
      summary: driveSummary,
      enabled: driveEnabled,
      status: driveState.status,
      reconnect_required: Boolean(reconnect),
      folder_id: driveState.folder_id || env.google_drive.folder_id || null,
      last_check_at: driveState.last_check_at,
      last_check_label: fmtFr(driveState.last_check_at),
      last_success_at: driveState.last_success_at,
      last_success_label: fmtFr(driveState.last_success_at),
      last_error_user_message: driveState.last_error_user_message || null,
      oauth_redirect_configured: Boolean(getRedirectUri()),
      oauth_refresh_source: driveState.oauth_refresh_source || null,
    },
    scheduler: {
      level: schedulerLevel,
      ...levelMeta(schedulerLevel),
      summary: schedulerSummary,
      poll_cron: '15 * * * *',
      timezone: 'Africa/Algiers',
      run_time: `${hour}:${minute}`,
      max_network_retries: Number(process.env.BACKUP_SCHEDULE_MAX_RETRIES) || 3,
      active_count: schedules.length,
      next_run_at: nextSchedule?.next_run_at || null,
      next_run_label: fmtFr(nextSchedule?.next_run_at),
      next_planification: nextSchedule?.planification || null,
      last_run_at: nextSchedule?.last_run_at || null,
      last_run_label: fmtFr(nextSchedule?.last_run_at),
      last_period_key: nextSchedule?.last_period_key || null,
      consecutive_failures: Number(nextSchedule?.consecutive_failures) || 0,
      last_error_user_message: nextSchedule?.last_error_user_message || null,
      schedules: schedules.map((s) => ({
        planification: s.planification,
        next_run_at: s.next_run_at,
        next_run_label: fmtFr(s.next_run_at),
        last_run_at: s.last_run_at,
        consecutive_failures: Number(s.consecutive_failures) || 0,
      })),
    },
    last_backup: {
      level: lastLevel,
      ...levelMeta(lastLevel),
      summary: lastSummary,
      ref: lastBackup?.ref || null,
      statut: lastBackup?.statut || null,
      created_at: lastBackup?.created_at || null,
      created_at_label: fmtFr(lastBackup?.created_at),
      drive_synced: Boolean(lastBackup?.drive_synced),
      has_file: Boolean(lastBackup?.file_path),
      user_message: lastBackup?.user_message || null,
    },
    recent_errors: recentErrors,
    actions_suggested: buildSuggestedActions({
      overall,
      reconnect,
      supabaseOk,
      schedules,
      lastBackup,
      recentErrors,
    }),
  };
}

function buildSuggestedActions({ overall, reconnect, supabaseOk, schedules, lastBackup, recentErrors }) {
  const actions = [];
  if (!supabaseOk) {
    actions.push({
      id: 'check_supabase',
      priority: 'high',
      label: 'Vérifier la connexion Supabase / service_role sur Railway',
      actionable: false,
    });
  }
  if (reconnect) {
    actions.push({
      id: 'reconnect_drive',
      priority: 'high',
      label: 'Reconnecter Google Drive',
      actionable: true,
    });
  }
  if (!schedules.length) {
    actions.push({
      id: 'create_schedule',
      priority: 'medium',
      label: 'Créer une planification quotidienne',
      actionable: false,
    });
  }
  if (lastBackup?.statut === 'erreur') {
    actions.push({
      id: 'run_manual_backup',
      priority: 'high',
      label: 'Relancer une sauvegarde manuelle',
      actionable: false,
    });
  }
  if (lastBackup?.statut === 'succes_partiel') {
    actions.push({
      id: 'fix_drive_rerun',
      priority: 'medium',
      label: 'Corriger Drive puis relancer pour une copie complète',
      actionable: false,
    });
  }
  if (recentErrors.length >= 3) {
    actions.push({
      id: 'cleanup_failed',
      priority: 'medium',
      label: 'Nettoyer les tentatives échouées sans fichier',
      actionable: true,
    });
  }
  if (overall === 'ok' && !actions.length) {
    actions.push({ id: 'none', priority: 'low', label: 'Aucune action — système sain', actionable: false });
  }
  return actions;
}

module.exports = {
  getBackupHealthDashboard,
  LEVEL,
};

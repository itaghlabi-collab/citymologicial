/**
 * Planification sauvegardes — période unique + next_run (Africa/Algiers).
 */
const MAX_NETWORK_RETRIES = Number(process.env.BACKUP_SCHEDULE_MAX_RETRIES) || 3;

function scheduleHour() {
  const h = Number(process.env.BACKUP_SCHEDULE_HOUR);
  return Number.isFinite(h) ? Math.min(23, Math.max(0, h)) : 3;
}

function scheduleMinute() {
  const m = Number(process.env.BACKUP_SCHEDULE_MINUTE);
  return Number.isFinite(m) ? Math.min(59, Math.max(0, m)) : 15;
}

/** Date calendaire YYYY-MM-DD en fuseau Africa/Algiers. */
function algiersDateKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Algiers',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Clé unique anti-doublon : planification + période.
 * quotidienne:2026-07-24 | hebdomadaire:2026-W30 | mensuelle:2026-07
 */
function schedulePeriodKey(planification, date = new Date()) {
  const plan = String(planification || '').toLowerCase();
  const day = algiersDateKey(date);

  if (plan === 'quotidienne') return `quotidienne:${day}`;

  if (plan === 'hebdomadaire') {
    const d = new Date(`${day}T12:00:00+01:00`);
    const oneJan = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil((((d - oneJan) / 86400000) + oneJan.getDay() + 1) / 7);
    return `hebdomadaire:${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
  }

  if (plan === 'mensuelle') return `mensuelle:${day.slice(0, 7)}`;

  return `${plan || 'manuelle'}:${day}`;
}

/**
 * Prochaine exécution à BACKUP_SCHEDULE_HOUR:MINUTE (défaut 03:15) Africa/Algiers.
 * Approximation : calcule en heure locale du process ; Railway doit être TZ Africa/Algiers
 * ou UTC — on force via offset Europe/Algiers (UTC+1 sans DST historique, +1/+0 selon année).
 */
function computeNextRun(planification, fromDate = new Date()) {
  const plan = String(planification || '').toLowerCase();
  const hour = scheduleHour();
  const minute = scheduleMinute();

  // Construire « aujourd'hui à H:M » en Algiers via format parts
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Algiers',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(fromDate);
  const get = (t) => Number(parts.find((p) => p.type === t)?.value);
  const y = get('year');
  const mo = get('month');
  const d = get('day');

  // Timestamp approximatif : Algiers ≈ UTC+1
  const makeUtcApprox = (yy, mm, dd, hh, mi) => new Date(Date.UTC(yy, mm - 1, dd, hh - 1, mi, 0));

  let next = makeUtcApprox(y, mo, d, hour, minute);

  if (plan === 'quotidienne') {
    if (next <= fromDate) next = makeUtcApprox(y, mo, d + 1, hour, minute);
  } else if (plan === 'hebdomadaire') {
    // Dimanche suivant à H:M
    const dowParts = new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Algiers', weekday: 'short' }).format(fromDate);
    const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const dow = map[dowParts] ?? fromDate.getUTCDay();
    let add = (7 - dow) % 7;
    if (add === 0 && next <= fromDate) add = 7;
    if (add === 0 && next > fromDate) add = 0;
    else if (next <= fromDate && add === 0) add = 7;
    next = makeUtcApprox(y, mo, d + (add || (next <= fromDate ? 7 : 0)), hour, minute);
    if (next <= fromDate) next = makeUtcApprox(y, mo, d + 7, hour, minute);
  } else if (plan === 'mensuelle') {
    next = makeUtcApprox(y, mo, 1, hour, minute);
    if (next <= fromDate) next = makeUtcApprox(y, mo + 1, 1, hour, minute);
  } else if (next <= fromDate) {
    next = makeUtcApprox(y, mo, d + 1, hour, minute);
  }

  return next;
}

function networkRetryDelayMs(attempt) {
  // 15 min, 30 min, 60 min
  const mins = [15, 30, 60][Math.min(Math.max(attempt - 1, 0), 2)];
  return mins * 60 * 1000;
}

module.exports = {
  MAX_NETWORK_RETRIES,
  scheduleHour,
  scheduleMinute,
  algiersDateKey,
  schedulePeriodKey,
  computeNextRun,
  networkRetryDelayMs,
};

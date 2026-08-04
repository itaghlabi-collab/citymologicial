/** Clé session : un nouveau build a été détecté (HTML/JS réseau plus récent). */
export const UPDATE_AVAILABLE_KEY = 'citymo_update_available';
export const SNOOZE_KEY = 'citymo_pwa_update_snooze_until';
export const SNOOZE_MS = 30 * 60 * 1000;

export function markUpdateAvailable(buildId) {
  try {
    sessionStorage.setItem(UPDATE_AVAILABLE_KEY, String(buildId || '1'));
  } catch {
    /* ignore */
  }
}

export function clearUpdateAvailable() {
  try {
    sessionStorage.removeItem(UPDATE_AVAILABLE_KEY);
  } catch {
    /* ignore */
  }
}

export function hasUpdateAvailable() {
  try {
    return Boolean(sessionStorage.getItem(UPDATE_AVAILABLE_KEY));
  } catch {
    return false;
  }
}

export function readSnoozeUntil() {
  try {
    const raw = sessionStorage.getItem(SNOOZE_KEY);
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export function writeSnooze() {
  try {
    sessionStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
  } catch {
    /* ignore */
  }
}

export function clearSnooze() {
  try {
    sessionStorage.removeItem(SNOOZE_KEY);
  } catch {
    /* ignore */
  }
}

export function isSnoozed() {
  return Date.now() < readSnoozeUntil();
}

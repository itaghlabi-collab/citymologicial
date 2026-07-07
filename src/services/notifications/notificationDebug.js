/**
 * notificationDebug.js — Logs temporaires diagnostic notifications
 * Activer en prod : localStorage.setItem('citymo_notif_debug', '1')
 */
export function isNotificationDebugEnabled() {
  try {
    return import.meta.env.DEV || localStorage.getItem('citymo_notif_debug') === '1';
  } catch {
    return Boolean(import.meta.env?.DEV);
  }
}

export function logNotificationDebug(label, payload) {
  if (!isNotificationDebugEnabled()) return;
  console.log(`[CITYMO:notifications] ${label}`, payload);
}

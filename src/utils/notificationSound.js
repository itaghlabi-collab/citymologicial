/**
 * Son des notifications CITYMO — muet pour tous les utilisateurs et toutes les sessions
 * (ordinateur, mobile, PWA). Persiste après rechargement et reconnexion.
 * Les exports restent en no-op pour ne pas changer les points d'appel.
 */

export function playNotificationSound() {}

export function unlockNotificationSound() {}

export function initNotificationSoundUnlock() {
  return () => {};
}

export function isNotificationSoundUnlocked() {
  return false;
}

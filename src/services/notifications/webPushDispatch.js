/**
 * Déclenche la diffusion Web Push d'une notification ERP déjà persistée.
 * Fire-and-forget depuis le service notifications — n'altère jamais le flux métier.
 */
import { ENV, resolveApiBaseUrl } from '../../config/env';
import { getAuthToken } from '../auth';

/**
 * @param {{ id?: string, recipientUserId?: string } | null} notification
 */
export async function dispatchWebPushForNotification(notification) {
  const notificationId = notification?.id;
  if (!notificationId || !notification?.recipientUserId) return null;

  const token = await getAuthToken();
  if (!token) return null;

  const base = resolveApiBaseUrl().replace(/\/+$/, '');
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  if (ENV.SUPABASE_ANON_KEY) headers.apikey = ENV.SUPABASE_ANON_KEY;

  const res = await fetch(`${base}/push/deliver`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ notificationId }),
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const err = new Error(data?.error || `Échec diffusion Push (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

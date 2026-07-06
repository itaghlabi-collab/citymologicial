/**
 * whatsappNotifications.js — Structure WhatsApp (envoi futur via API officielle)
 * Ne pas envoyer automatiquement sans configuration provider.
 */
import { getSupabase } from '../../lib/supabase';

const LOG_TABLE = 'whatsapp_notification_log';

async function resolveUserPhone(userId) {
  if (!userId) return null;
  const sb = getSupabase();
  const { data: profile } = await sb
    .from('profiles')
    .select('email, whatsapp_enabled')
    .eq('id', userId)
    .maybeSingle();
  if (!profile?.whatsapp_enabled) return null;

  const { data: employee } = await sb
    .from('employees')
    .select('telephone')
    .ilike('email', profile.email || '')
    .maybeSingle();

  return employee?.telephone || null;
}

/**
 * Enregistre une notification WhatsApp en file d'attente (aucun envoi réel).
 */
export async function queueWhatsappNotification({ notificationId, userId, title, message }) {
  if (!userId) return null;
  const phone = await resolveUserPhone(userId);
  if (!phone) {
    const { data } = await getSupabase()
      .from(LOG_TABLE)
      .insert([{
        notification_id: notificationId,
        user_id: userId,
        phone_number: null,
        message: [title, message].filter(Boolean).join('\n'),
        status: 'skipped',
        error_message: 'WhatsApp désactivé ou numéro absent',
      }])
      .select()
      .single();
    return data;
  }

  const { data, error } = await getSupabase()
    .from(LOG_TABLE)
    .insert([{
      notification_id: notificationId,
      user_id: userId,
      phone_number: phone,
      message: [title, message].filter(Boolean).join('\n'),
      status: 'pending',
      provider: null,
    }])
    .select()
    .single();

  if (error) {
    console.warn('[CITYMO] queueWhatsappNotification', error);
    return null;
  }
  return data;
}

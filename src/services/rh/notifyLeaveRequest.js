/**
 * notifyLeaveRequest.js — Alerte email nouvelle demande de congé.
 *
 * Destinataire : secret Supabase LEAVE_NOTIFY_TO uniquement (Edge Function).
 * Setup : voir supabase/functions/notify-leave-request/README.md
 */
import { getSupabase } from '../../lib/supabase';

function toNotifyPayload(leave) {
  return {
    id: leave?.id,
    employe_label: leave?.employe_label || leave?.employe,
    type: leave?.type,
    date_debut: leave?.date_debut || leave?.dateDebut,
    date_fin: leave?.date_fin || leave?.dateFin,
    date_retour: leave?.date_retour || leave?.dateRetour,
    jours: leave?.jours,
    raison: leave?.raison,
    statut: leave?.statut || leave?._statut || 'En attente',
  };
}

export async function notifySuperAdminLeaveRequest(leave) {
  const payload = {
    leave: toNotifyPayload(leave),
  };

  if (import.meta.env.DEV) {
    console.info('[CITYMO] notify-leave-request invoke (no notifyTo in payload)', {
      keys: Object.keys(payload),
      leaveId: payload.leave?.id,
    });
  }

  try {
    const { data, error } = await getSupabase().functions.invoke('notify-leave-request', {
      body: payload,
    });

    if (error) throw error;

    if (data && data.ok === false) {
      throw new Error(data.error || 'Erreur envoi email');
    }

    if (data?.simulated) {
      console.log('[CITYMO] notify-leave-request (simulation — configurez RESEND_API_KEY)', {
        to: data.to,
        subject: data.subject,
        leave: payload.leave,
      });
      return { success: true, simulated: true, data };
    }

    if (import.meta.env.DEV) {
      console.info('[CITYMO] notify-leave-request OK', {
        to: data?.to,
        resendId: data?.resendId,
      });
    }

    return { success: true, data };
  } catch (err) {
    console.log('[CITYMO] notify-leave-request (fallback — email non envoyé)', {
      leave: payload.leave,
      error: err?.message || String(err),
    });
    return { success: false, fallback: true, error: err?.message || String(err) };
  }
}

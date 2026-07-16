/**
 * Section UI — activation Web Push sur cet appareil.
 */
import { Bell, BellOff, Loader2, Smartphone } from 'lucide-react';
import { usePushNotifications } from '../../pwa/usePushNotifications';

function statusLabel(state) {
  if (state.loading) return 'Vérification…';
  if (state.permission === 'unsupported') {
    return 'Navigateur incompatible';
  }
  if (state.permission === 'ios_needs_install') {
    return 'Application non installée sur iPhone';
  }
  if (state.permission === 'denied') {
    return 'Autorisation refusée';
  }
  if (state.active) return 'Notifications activées';
  return 'Notifications non activées';
}

function helpText(state) {
  if (state.permission === 'unsupported') {
    return 'Ce navigateur ne prend pas en charge les notifications Web Push.';
  }
  if (state.permission === 'ios_needs_install') {
    return 'Sur iPhone / iPad, ajoutez CITYMO à l’écran d’accueil (Partager → Ajouter à l’écran d’accueil), ouvrez l’application depuis l’icône, puis revenez ici pour activer les notifications.';
  }
  if (state.permission === 'denied') {
    return 'Les notifications sont bloquées dans les réglages de votre navigateur.';
  }
  return 'Recevez les notifications CITYMO sur cet appareil, même lorsque l’application est fermée.';
}

export default function PushNotificationSettings() {
  const push = usePushNotifications();

  const canEnable = !push.loading
    && !push.busy
    && !push.active
    && push.permission !== 'unsupported'
    && push.permission !== 'ios_needs_install'
    && push.permission !== 'denied';

  const canDisable = !push.loading && !push.busy && push.active;

  return (
    <section className="push-notif-settings" aria-labelledby="push-notif-title">
      <div className="push-notif-settings__head">
        <Smartphone size={18} aria-hidden />
        <div>
          <h3 id="push-notif-title" className="push-notif-settings__title">
            Notifications sur cet appareil
          </h3>
          <p className="push-notif-settings__desc">{helpText(push)}</p>
        </div>
      </div>

      <div className="push-notif-settings__status" role="status">
        {push.loading ? (
          <Loader2 size={14} className="push-notif-settings__spin" aria-hidden />
        ) : push.active ? (
          <Bell size={14} aria-hidden />
        ) : (
          <BellOff size={14} aria-hidden />
        )}
        <span>{statusLabel(push)}</span>
      </div>

      {push.error && (
        <p className="push-notif-settings__error" role="alert">{push.error}</p>
      )}
      {!push.error && push.message && (
        <p className="push-notif-settings__ok">{push.message}</p>
      )}

      <div className="push-notif-settings__actions">
        {canEnable && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={push.busy}
            onClick={() => { push.enable(); }}
          >
            {push.busy ? 'Activation…' : 'Activer les notifications'}
          </button>
        )}
        {canDisable && (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={push.busy}
            onClick={() => { push.disable(); }}
          >
            {push.busy ? 'Désactivation…' : 'Désactiver les notifications'}
          </button>
        )}
        {canDisable && (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={push.busy}
            onClick={() => { push.sendTest(); }}
          >
            {push.busy ? 'Envoi…' : 'Envoyer une notification de test'}
          </button>
        )}
      </div>
    </section>
  );
}

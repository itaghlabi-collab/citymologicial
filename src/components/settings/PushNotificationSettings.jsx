/**
 * Section UI — activation Web Push sur cet appareil.
 * Logique inchangée : enable / disable / sendTest via usePushNotifications.
 */
import { useEffect, useState } from 'react';
import { Bell, Loader2 } from 'lucide-react';
import { usePushNotifications } from '../../pwa/usePushNotifications';

function formatSyncTime(date) {
  if (!date) return '—';
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(date);
  } catch {
    return date.toLocaleString('fr-FR');
  }
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
  const [lastSyncAt, setLastSyncAt] = useState(null);

  useEffect(() => {
    if (!push.loading) setLastSyncAt(new Date());
  }, [push.loading, push.active]);

  const canEnable = !push.loading
    && !push.busy
    && !push.active
    && push.permission !== 'unsupported'
    && push.permission !== 'ios_needs_install'
    && push.permission !== 'denied';

  const canDisable = !push.loading && !push.busy && push.active;
  const blocked = push.permission === 'unsupported'
    || push.permission === 'ios_needs_install'
    || push.permission === 'denied';

  return (
    <section className="push-notif-settings" aria-labelledby="push-notif-title">
      <div className="push-notif-settings__row">
        <div className="push-notif-settings__label">
          <span className="push-notif-settings__emoji" aria-hidden>🔔</span>
          <div>
            <h3 id="push-notif-title" className="push-notif-settings__title">
              Notifications Web Push
            </h3>
            <p className="push-notif-settings__desc">{helpText(push)}</p>
          </div>
        </div>

        <div className="push-notif-settings__switch-wrap">
          {push.loading ? (
            <span className="push-notif-settings__busy" aria-live="polite">
              <Loader2 size={16} className="push-notif-settings__spin" aria-hidden />
            </span>
          ) : push.active ? (
            <span className="push-notif-settings__badge push-notif-settings__badge--on">
              Activé
            </span>
          ) : (
            <button
              type="button"
              className="btn btn-primary push-notif-settings__activate"
              disabled={!canEnable || push.busy}
              onClick={() => { push.enable(); }}
            >
              {push.busy ? 'Activation…' : 'Activer'}
            </button>
          )}
        </div>
      </div>

      {push.error && (
        <p className="push-notif-settings__error" role="alert">{push.error}</p>
      )}
      {!push.error && push.message && (
        <p className="push-notif-settings__ok">{push.message}</p>
      )}

      {!push.loading && (
        <ul className="push-notif-settings__meta" aria-label="État des notifications">
          <li>
            <span className="push-notif-settings__dot" aria-hidden>•</span>
            {push.active
              ? 'Activées sur cet appareil'
              : blocked
                ? statusBlockedLabel(push.permission)
                : 'Non activées sur cet appareil'}
          </li>
          <li>
            <span className="push-notif-settings__dot" aria-hidden>•</span>
            Dernière synchronisation
            {' '}
            <time dateTime={lastSyncAt ? lastSyncAt.toISOString() : undefined}>
              {formatSyncTime(lastSyncAt)}
            </time>
          </li>
          {canDisable && (
            <li className="push-notif-settings__meta-actions">
              <span className="push-notif-settings__dot" aria-hidden>•</span>
              <button
                type="button"
                className="push-notif-settings__link"
                disabled={push.busy}
                onClick={() => { push.disable(); }}
              >
                {push.busy ? 'Désactivation…' : 'Désactiver'}
              </button>
            </li>
          )}
        </ul>
      )}

      {canDisable && (
        <div className="push-notif-settings__actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={push.busy}
            onClick={() => { push.sendTest(); }}
          >
            {push.busy ? 'Envoi…' : 'Envoyer une notification de test'}
          </button>
        </div>
      )}

      {push.active && (
        <p className="push-notif-settings__hint-active">
          <Bell size={14} aria-hidden />
          Les alertes ERP continuent d’apparaître aussi dans le centre de notifications.
        </p>
      )}
    </section>
  );
}

function statusBlockedLabel(permission) {
  if (permission === 'denied') return 'Autorisation refusée par le navigateur';
  if (permission === 'ios_needs_install') return 'Installation PWA requise sur iPhone';
  if (permission === 'unsupported') return 'Navigateur incompatible';
  return 'Non activées sur cet appareil';
}

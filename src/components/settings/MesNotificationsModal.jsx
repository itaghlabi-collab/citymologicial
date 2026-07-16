/**
 * Modal « Mes notifications » — réglages Push appareil (pas le centre in-app).
 */
import { X, Bell } from 'lucide-react';
import PushNotificationSettings from './PushNotificationSettings';

export default function MesNotificationsModal({ onClose, onOpenCenter }) {
  return (
    <div className="user-profile-overlay" onClick={onClose} role="presentation">
      <div
        className="card user-profile-modal user-profile-modal--sm mes-notifications-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="mes-notifications-title"
      >
        <div className="flex-between" style={{ marginBottom: 16 }}>
          <h2
            id="mes-notifications-title"
            style={{
              fontFamily: 'var(--font-head)',
              fontWeight: 800,
              fontSize: '1rem',
              margin: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Bell size={18} /> Mes notifications
          </h2>
          <button type="button" onClick={onClose} className="btn btn-ghost btn-sm" aria-label="Fermer">
            <X size={18} />
          </button>
        </div>

        <PushNotificationSettings />

        <div className="mes-notifications-modal__footer">
          <p className="mes-notifications-modal__hint">
            Les alertes déjà reçues restent disponibles dans le centre de notifications (icône cloche).
          </p>
          {typeof onOpenCenter === 'function' && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                onClose();
                onOpenCenter();
              }}
            >
              Ouvrir le centre de notifications
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

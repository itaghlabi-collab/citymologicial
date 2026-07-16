/**
 * UserProfileMenu.jsx — Menu déroulant profil (header)
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  User, Settings, KeyRound, Bell, LogOut, ChevronDown,
} from 'lucide-react';
import { isSuperAdmin } from '../../services/rh/isSuperAdmin';
import { ROUTES } from '../../config/routes';
import UserProfileModal from './UserProfileModal';
import ChangePasswordModal from './ChangePasswordModal';
import MesNotificationsModal from '../settings/MesNotificationsModal';

function roleLabel(role) {
  if (!role) return 'Utilisateur';
  return String(role).replace(/_/g, ' ');
}

export default function UserProfileMenu({ user, onLogout, onNavigate }) {
  const [open, setOpen] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showNotificationsSettings, setShowNotificationsSettings] = useState(false);
  const rootRef = useRef(null);
  const admin = isSuperAdmin(user);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return undefined;
    function onDocClick(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) close();
    }
    function onKey(e) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  function handleAction(id) {
    close();
    switch (id) {
      case 'profile':
        setShowProfile(true);
        break;
      case 'account':
      case 'settings':
        onNavigate?.(admin ? ROUTES.UTILISATEURS : ROUTES.DASHBOARD);
        break;
      case 'password':
        setShowPassword(true);
        break;
      case 'notifications':
        setShowNotificationsSettings(true);
        break;
      case 'logout':
        onLogout?.();
        break;
      default:
        break;
    }
  }

  const initials = user?.initiales || user?.nom?.split(' ').map((n) => n[0]).slice(0, 2).join('') || '?';

  const menuItems = [
    { id: 'profile', label: 'Voir mon profil', icon: User },
    ...(admin ? [
      { id: 'account', label: 'Mon compte', icon: User },
      { id: 'settings', label: 'Paramètres', icon: Settings },
    ] : []),
    { id: 'password', label: 'Changer mot de passe', icon: KeyRound },
    { id: 'notifications', label: 'Mes notifications', icon: Bell },
    { id: 'logout', label: 'Se déconnecter', icon: LogOut, danger: true },
  ];

  return (
    <>
      <div className="user-profile-menu" ref={rootRef}>
        <button
          type="button"
          className={'header-avatar user-profile-trigger' + (open ? ' is-open' : '')}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-haspopup="menu"
          title={user?.nom}
        >
          <span>{initials}</span>
          <ChevronDown size={12} className="user-profile-chevron" aria-hidden />
        </button>

        {open && (
          <div className="user-profile-dropdown" role="menu">
            <div className="user-profile-dropdown-head">
              <div className="user-profile-dropdown-avatar">{initials}</div>
              <div className="user-profile-dropdown-meta">
                <strong>{user?.nom}</strong>
                <span>{user?.email}</span>
                <span className="user-profile-dropdown-role">{roleLabel(user?.role)}</span>
              </div>
            </div>
            <div className="user-profile-dropdown-divider" />
            {menuItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  className={'user-profile-dropdown-item' + (item.danger ? ' is-danger' : '')}
                  onClick={() => handleAction(item.id)}
                >
                  <Icon size={15} />
                  {item.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {showProfile && (
        <UserProfileModal user={user} onClose={() => setShowProfile(false)} />
      )}
      {showPassword && (
        <ChangePasswordModal onClose={() => setShowPassword(false)} />
      )}
      {showNotificationsSettings && (
        <MesNotificationsModal
          onClose={() => setShowNotificationsSettings(false)}
          onOpenCenter={() => {
            window.dispatchEvent(new CustomEvent('citymo:open-notifications'));
          }}
        />
      )}
    </>
  );
}

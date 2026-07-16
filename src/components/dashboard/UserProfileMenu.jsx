/**
 * UserProfileMenu.jsx — Menu déroulant profil (header)
 */
import { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
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

function isMobileHeader() {
  try {
    return window.matchMedia('(max-width: 768px)').matches;
  } catch {
    return false;
  }
}

function profileDebugLog(event, detail) {
  try {
    if (import.meta.env?.DEV) {
      // eslint-disable-next-line no-console
      console.info('[CITYMO profile]', event, detail);
    }
  } catch {
    /* ignore */
  }
}

export default function UserProfileMenu({ user, onLogout, onNavigate }) {
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(isMobileHeader);
  const [menuCoords, setMenuCoords] = useState({ top: 0, right: 10 });
  const [showProfile, setShowProfile] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showNotificationsSettings, setShowNotificationsSettings] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const ignoreOutsideUntilRef = useRef(0);
  const admin = isSuperAdmin(user);

  const close = useCallback(() => {
    profileDebugLog('close', { mobile });
    setOpen(false);
  }, [mobile]);

  useEffect(() => {
    try {
      const mq = window.matchMedia('(max-width: 768px)');
      const onChange = () => setMobile(mq.matches);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    } catch {
      return undefined;
    }
  }, []);

  useLayoutEffect(() => {
    if (!open || !mobile || !triggerRef.current) return undefined;

    function updateCoords() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setMenuCoords({
        top: rect.bottom + 8,
        right: Math.max(10, window.innerWidth - rect.right),
      });
    }

    updateCoords();
    window.addEventListener('resize', updateCoords);
    window.addEventListener('scroll', updateCoords, true);
    return () => {
      window.removeEventListener('resize', updateCoords);
      window.removeEventListener('scroll', updateCoords, true);
    };
  }, [open, mobile]);

  useEffect(() => {
    if (!open || mobile) return undefined;

    function onDocPointerDown(e) {
      if (Date.now() < ignoreOutsideUntilRef.current) return;
      if (rootRef.current && !rootRef.current.contains(e.target)) close();
    }
    function onKey(e) {
      if (e.key === 'Escape') close();
    }

    const timer = window.setTimeout(() => {
      document.addEventListener('pointerdown', onDocPointerDown);
    }, 0);
    document.addEventListener('keydown', onKey);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('pointerdown', onDocPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, mobile, close]);

  useEffect(() => {
    if (!open || !mobile) return undefined;
    function onKey(e) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, mobile, close]);

  const toggleOpen = useCallback((source) => {
    setOpen((wasOpen) => {
      const next = !wasOpen;
      if (next) {
        ignoreOutsideUntilRef.current = Date.now() + 400;
      }
      profileDebugLog('tap', { source, next, mobile });
      if (import.meta.env?.DEV && triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        const x = Math.round(rect.left + rect.width / 2);
        const y = Math.round(rect.top + rect.height / 2);
        const top = document.elementFromPoint(x, y);
        profileDebugLog('elementFromPoint', {
          x,
          y,
          top: top ? `${top.tagName}${top.id ? `#${top.id}` : ''}` : null,
          avatarHit: top === triggerRef.current || triggerRef.current.contains(top),
        });
      }
      return next;
    });
  }, [mobile]);

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

  const dropdown = open ? (
    <div
      className={'user-profile-dropdown' + (mobile ? ' user-profile-dropdown--portaled' : '')}
      role="menu"
      style={mobile ? {
        top: `${menuCoords.top}px`,
        right: `${menuCoords.right}px`,
      } : undefined}
      onPointerDown={(e) => e.stopPropagation()}
    >
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
  ) : null;

  const mobilePortal = mobile && open && typeof document !== 'undefined'
    ? createPortal(
      <>
        <div
          className="user-profile-menu-backdrop"
          aria-hidden="true"
          onPointerDown={(e) => {
            if (Date.now() < ignoreOutsideUntilRef.current) return;
            e.stopPropagation();
            close();
          }}
        />
        {dropdown}
      </>,
      document.body,
    )
    : null;

  return (
    <>
      <div className="user-profile-menu" ref={rootRef}>
        <button
          ref={triggerRef}
          type="button"
          className={'header-avatar user-profile-trigger' + (open ? ' is-open' : '')}
          onPointerDown={(e) => {
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleOpen('click');
          }}
          aria-expanded={open}
          aria-haspopup="menu"
          title={user?.nom}
        >
          <span>{initials}</span>
          <ChevronDown size={12} className="user-profile-chevron" aria-hidden />
        </button>

        {!mobile && dropdown}
      </div>

      {mobilePortal}

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

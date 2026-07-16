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

/** Mobile / tactile : portal + menu fixed (responsive, PWA, téléphone). */
function detectCompactHeader() {
  try {
    return window.matchMedia('(max-width: 768px), (hover: none) and (pointer: coarse)').matches;
  } catch {
    return false;
  }
}

export default function UserProfileMenu({ user, onLogout, onNavigate }) {
  const [open, setOpen] = useState(false);
  const [compact, setCompact] = useState(() => detectCompactHeader());
  const [menuCoords, setMenuCoords] = useState({ top: 0, right: 10 });
  const [showProfile, setShowProfile] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showNotificationsSettings, setShowNotificationsSettings] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const ignoreOutsideUntilRef = useRef(0);
  const lastToggleAtRef = useRef(0);
  const admin = isSuperAdmin(user);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    try {
      const mq = window.matchMedia('(max-width: 768px), (hover: none) and (pointer: coarse)');
      const onChange = () => setCompact(mq.matches);
      onChange();
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    } catch {
      return undefined;
    }
  }, []);

  useLayoutEffect(() => {
    if (!open || !compact || !triggerRef.current) return undefined;

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
  }, [open, compact]);

  useEffect(() => {
    if (!open || compact) return undefined;

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
  }, [open, compact, close]);

  useEffect(() => {
    if (!open || !compact) return undefined;
    function onKey(e) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, compact, close]);

  const toggleOpen = useCallback(() => {
    const now = Date.now();
    if (now - lastToggleAtRef.current < 280) return;
    lastToggleAtRef.current = now;

    setOpen((wasOpen) => {
      const next = !wasOpen;
      if (next) {
        ignoreOutsideUntilRef.current = Date.now() + 450;
      }
      return next;
    });
  }, []);

  const onTriggerActivate = useCallback((e) => {
    if (e.type === 'pointerup' && e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
    if (e.type === 'keydown') e.preventDefault();
    e.stopPropagation();
    toggleOpen();
  }, [toggleOpen]);

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
      className={'user-profile-dropdown' + (compact ? ' user-profile-dropdown--portaled' : '')}
      role="menu"
      style={compact ? {
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

  const mobilePortal = compact && open && typeof document !== 'undefined'
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
          onPointerUp={onTriggerActivate}
          onKeyDown={onTriggerActivate}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label="Menu profil"
          title={user?.nom}
        >
          <span className="user-profile-trigger__initials">{initials}</span>
          <ChevronDown size={12} className="user-profile-chevron" aria-hidden />
        </button>

        {!compact && dropdown}
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

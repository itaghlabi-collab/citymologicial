/**
 * NotificationCenter.jsx — Cloche + panneau notifications ERP
 */
import { useState, useRef, useEffect } from 'react';
import {
  Bell, X, CheckCheck, Wallet, ListTodo, Calendar, FileText,
  ShoppingCart, AlertTriangle, Info, ExternalLink, Users,
} from 'lucide-react';
import { useNotifications } from '../../hooks/useNotifications';
import { parseActionUrl } from '../../services/notifications/notifications';

const TYPE_ICONS = {
  payment: Wallet,
  task: ListTodo,
  cash_review: Wallet,
  leave_request: Calendar,
  purchase_request: ShoppingCart,
  resource_request: Users,
  site_material_request: ShoppingCart,
  document: FileText,
  system: Info,
};

const PRIORITY_CLASS = {
  urgent: 'notif-priority-urgent',
  high: 'notif-priority-high',
  normal: 'notif-priority-normal',
  low: 'notif-priority-low',
};

function formatWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('fr-MA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function NotificationCenter({ user, onNavigate }) {
  const { items, unreadCount, loading, markRead, markAllRead } = useNotifications(user);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('all');
  const wrapRef = useRef(null);

  useEffect(() => {
    function onDocClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  useEffect(() => {
    function openFromMenu() { setOpen(true); }
    window.addEventListener('citymo:open-notifications', openFromMenu);
    return () => window.removeEventListener('citymo:open-notifications', openFromMenu);
  }, []);

  const filtered = items.filter((n) => {
    if (filter === 'unread') return !n.isRead;
    if (filter === 'urgent') return n.priority === 'urgent' || n.priority === 'high';
    return true;
  });

  async function handleOpenItem(n) {
    if (!n.isRead) await markRead(n.id);
    const mod = parseActionUrl(n.actionUrl);
    if (mod && onNavigate) {
      onNavigate(mod);
      setOpen(false);
    }
  }

  return (
    <div className="notif-center-wrap" ref={wrapRef}>
      <button
        type="button"
        className="icon-btn notif-bell-btn"
        aria-label="Notifications"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="notif-count-badge">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="notif-backdrop-mobile" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="notif-panel" role="dialog" aria-label="Centre de notifications">
            <div className="notif-panel-header">
              <div>
                <strong>Notifications</strong>
                {unreadCount > 0 && (
                  <span className="notif-panel-unread">{unreadCount} non lue{unreadCount > 1 ? 's' : ''}</span>
                )}
              </div>
              <div className="notif-panel-actions">
                {unreadCount > 0 && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={markAllRead} title="Tout marquer comme lu">
                    <CheckCheck size={14} /> Tout lu
                  </button>
                )}
                <button type="button" className="icon-btn" onClick={() => setOpen(false)} aria-label="Fermer">
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="notif-filters">
              {[
                { id: 'all', label: 'Toutes' },
                { id: 'unread', label: 'Non lues' },
                { id: 'urgent', label: 'Urgentes' },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`notif-filter-btn ${filter === f.id ? 'active' : ''}`}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="notif-list">
              {loading && <div className="notif-empty">Chargement…</div>}
              {!loading && filtered.length === 0 && (
                <div className="notif-empty">Aucune notification</div>
              )}
              {filtered.map((n) => {
                const Icon = TYPE_ICONS[n.type] || Info;
                const prioCls = PRIORITY_CLASS[n.priority] || PRIORITY_CLASS.normal;
                return (
                  <div
                    key={n.id}
                    className={`notif-item ${n.isRead ? 'is-read' : 'is-unread'} ${prioCls}`}
                  >
                    <div className="notif-item-icon">
                      <Icon size={16} />
                      {(n.priority === 'urgent' || n.priority === 'high') && (
                        <AlertTriangle size={10} className="notif-item-alert" />
                      )}
                    </div>
                    <div className="notif-item-body">
                      <div className="notif-item-title">{n.title}</div>
                      <div className="notif-item-message">{n.message}</div>
                      <div className="notif-item-meta">
                        <span>{formatWhen(n.createdAt)}</span>
                        <span className={`notif-prio-tag ${prioCls}`}>{n.priority}</span>
                      </div>
                      <div className="notif-item-actions">
                        {!n.isRead && (
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => markRead(n.id)}>
                            Marquer lu
                          </button>
                        )}
                        {n.actionUrl && (
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleOpenItem(n)}>
                            <ExternalLink size={12} /> Voir détail
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

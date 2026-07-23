import { useEffect, useRef, useState } from 'react';
import {
  AppNotification,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
} from '@/lib/api/api';
import { sounds } from '@/lib/audio/sounds';
import { DynamicIcon } from '@/lib/core/icons';
import Portal from '@/components/common/Portal';

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'الآن';
  if (minutes < 60) return `منذ ${minutes} د`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `منذ ${hours} س`;
  const days = Math.floor(hours / 24);
  return `منذ ${days} ي`;
}

// جرس الإشعارات جنب زرار القائمة (Menu Bar) — بيعرض كل الإشعارات والرسائل
// الجاية من الموقع (تذكيرات مهام استحقت، أو رسائل من الأدمن)، مع بادج
// بعدد غير المقروء. بيستقصي كل 20 ثانية عشان البادج يفضل محدّث حتى لو
// المستخدم مفتحش القائمة نفسها.
export default function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const prevUnread = useRef(0);

  async function load() {
    try {
      const data = await getNotifications();
      setNotifications(data.notifications);
      if (data.unreadCount > prevUnread.current) sounds.notify();
      prevUnread.current = data.unreadCount;
      setUnreadCount(data.unreadCount);
    } catch {
      // تجميلي بس — فشل مؤقت في الاستقصاء مش لازم يعطّل الشاشة
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const interval = window.setInterval(load, 20000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      const insideTrigger = wrapRef.current?.contains(target);
      const insidePanel = panelRef.current?.contains(target);
      if (!insideTrigger && !insidePanel) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  async function handleOpenNotification(n: AppNotification) {
    if (!n.isRead) {
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
      setUnreadCount((c) => Math.max(0, c - 1));
      prevUnread.current = Math.max(0, prevUnread.current - 1);
      try {
        await markNotificationRead(n.id);
      } catch {
        // مش لازم نرجّع الحالة لو فشل — هيتصحح تلقائيًا في الاستقصاء الجاي
      }
    }
  }

  async function handleMarkAllRead() {
    if (unreadCount === 0) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
    prevUnread.current = 0;
    try {
      await markAllNotificationsRead();
    } catch {
      load();
    }
  }

  async function handleDelete(id: string) {
    const wasUnread = notifications.find((n) => n.id === id)?.isRead === false;
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    if (wasUnread) {
      setUnreadCount((c) => Math.max(0, c - 1));
      prevUnread.current = Math.max(0, prevUnread.current - 1);
    }
    try {
      await deleteNotification(id);
    } catch {
      load();
    }
  }

  return (
    <div className="notifications-bell-wrap" ref={wrapRef}>
      <button
        className={`icon-btn hamburger-btn notifications-bell-btn ${unreadCount > 0 ? 'has-unread' : ''}`}
        onClick={() => setOpen((o) => !o)}
        type="button"
        title="الإشعارات"
        aria-label="فتح الإشعارات"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <DynamicIcon name="bell" size={18} />
      </button>
      {unreadCount > 0 && (
        <span className="notifications-bell-badge" aria-hidden="true">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}

      {open && (
        <Portal>
          <div className="notifications-panel-overlay" onClick={() => setOpen(false)}>
            <div
              ref={panelRef}
              className="notifications-panel"
              style={{
                position: 'fixed',
                top: wrapRef.current ? wrapRef.current.getBoundingClientRect().bottom + 8 : 60,
                left: wrapRef.current ? wrapRef.current.getBoundingClientRect().left : undefined,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="notifications-panel-header">
                <h3>الإشعارات</h3>
                {unreadCount > 0 && (
                  <button type="button" className="small" onClick={handleMarkAllRead}>
                    تعليم الكل كمقروء
                  </button>
                )}
              </div>

              <div className="notifications-panel-list">
                {loading && <p className="empty">جارِ التحميل...</p>}
                {!loading && notifications.length === 0 && <p className="empty">مفيش إشعارات لسه</p>}
                {!loading &&
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      className={`notification-row ${n.isRead ? '' : 'unread'}`}
                      onClick={() => handleOpenNotification(n)}
                    >
                      <span className="notification-row-icon" aria-hidden="true">
                        <DynamicIcon name={n.source === 'ADMIN' ? 'megaphone' : 'bell'} size={14} />
                      </span>
                      <div className="notification-row-text">
                        <span className="notification-row-title">{n.title}</span>
                        <span className="notification-row-body">{n.body}</span>
                        <span className="notification-row-time">{timeAgo(n.createdAt)}</span>
                      </div>
                      <button
                        type="button"
                        className="notification-row-delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(n.id);
                        }}
                        aria-label="حذف الإشعار"
                      >
                        <DynamicIcon name="x" size={12} />
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </Portal>
      )}
    </div>
  );
}

import { useEffect, useRef } from 'react';
import { PushSupportState } from '../lib/push';
import { DynamicIcon } from '../lib/icons';

interface Props {
  open: boolean;
  onClose: () => void;
  isAdmin: boolean;
  archiveCount: number;
  muted: boolean;
  pushState: PushSupportState;
  onOpenDashboard: () => void;
  onOpenArchive: () => void;
  onOpenLifeAreas: () => void;
  onOpenRecurring: () => void;
  onOpenSiteSettings: () => void;
  onToggleMute: () => void;
  onTogglePush: () => void;
  onRequestLogout: () => void;
}

// قائمة جانبية (Hamburger Menu) بتجمع كل روابط وإعدادات الحساب في مكان واحد
// منظم، بدل ما تتفرق كأزرار مكدسة في الهيدر. بتتفتح/تتقفل بأنيميشن انزلاق
// وبتقفل تلقائيًا بالنقر برّاها أو بمفتاح Escape.
export default function SideMenu({
  open,
  onClose,
  isAdmin,
  archiveCount,
  muted,
  pushState,
  onOpenDashboard,
  onOpenArchive,
  onOpenLifeAreas,
  onOpenRecurring,
  onOpenSiteSettings,
  onToggleMute,
  onTogglePush,
  onRequestLogout,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    // نمنع سكرول الصفحة اللي وراء القائمة وهي متفتحة
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // فوكس أول عنصر قابل للتفاعل جوه القائمة عشان يبقى سهل الوصول بلوحة المفاتيح
    const firstFocusable = panelRef.current?.querySelector<HTMLElement>('button');
    firstFocusable?.focus();
    return () => {
      window.removeEventListener('keydown', handleKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  function go(action: () => void) {
    action();
    onClose();
  }

  return (
    <>
      <div
        className={`side-menu-overlay ${open ? 'open' : ''}`}
        onClick={onClose}
        aria-hidden={!open}
      />
      <div
        ref={panelRef}
        className={`side-menu-panel ${open ? 'open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="القائمة الجانبية"
        aria-hidden={!open}
      >
        <div className="side-menu-header">
          <span className="side-menu-title">القائمة</span>
          <button className="icon-btn side-menu-close" onClick={onClose} type="button" aria-label="إغلاق القائمة">
            <DynamicIcon name="x" size={16} />
          </button>
        </div>

        <nav className="side-menu-nav">
          {isAdmin && (
            <button className="side-menu-item" type="button" onClick={() => go(onOpenDashboard)}>
              <DynamicIcon name="sliders" size={18} className="side-menu-item-icon" />
              <span className="side-menu-item-label">لوحة التحكم</span>
              <span className="side-menu-item-arrow" aria-hidden="true">‹</span>
            </button>
          )}

          <button className="side-menu-item" type="button" onClick={() => go(onOpenArchive)}>
            <DynamicIcon name="archive" size={18} className="side-menu-item-icon" />
            <span className="side-menu-item-label">الأرشيف</span>
            {archiveCount > 0 && <span className="side-menu-item-badge">{archiveCount}</span>}
            <span className="side-menu-item-arrow" aria-hidden="true">‹</span>
          </button>

          <button className="side-menu-item" type="button" onClick={() => go(onOpenLifeAreas)}>
            <DynamicIcon name="compass" size={18} className="side-menu-item-icon" />
            <span className="side-menu-item-label">مجالات الحياة</span>
            <span className="side-menu-item-arrow" aria-hidden="true">‹</span>
          </button>

          <button className="side-menu-item" type="button" onClick={() => go(onOpenRecurring)}>
            <DynamicIcon name="repeat" size={18} className="side-menu-item-icon" />
            <span className="side-menu-item-label">المهام المتكررة</span>
            <span className="side-menu-item-arrow" aria-hidden="true">‹</span>
          </button>

          {isAdmin && (
            <button className="side-menu-item" type="button" onClick={() => go(onOpenSiteSettings)}>
              <DynamicIcon name="settings" size={18} className="side-menu-item-icon" />
              <span className="side-menu-item-label">إعدادات الموقع</span>
              <span className="side-menu-item-arrow" aria-hidden="true">‹</span>
            </button>
          )}

          <div className="side-menu-divider" role="separator" />

          {pushState !== 'unsupported' && (
            <button
              className="side-menu-item side-menu-toggle-item"
              type="button"
              onClick={onTogglePush}
              aria-pressed={pushState === 'subscribed'}
            >
              <DynamicIcon name={pushState === 'subscribed' ? 'bell' : 'bell-off'} size={18} className="side-menu-item-icon" />
              <span className="side-menu-item-label">تفعيل إشعارات الجهاز</span>
              <span className={`side-menu-switch ${pushState === 'subscribed' ? 'on' : ''}`} aria-hidden="true">
                <span className="side-menu-switch-knob" />
              </span>
            </button>
          )}

          <button
            className="side-menu-item side-menu-toggle-item"
            type="button"
            onClick={onToggleMute}
            aria-pressed={!muted}
          >
            <DynamicIcon name={muted ? 'volume-off' : 'volume-high'} size={18} className="side-menu-item-icon" />
            <span className="side-menu-item-label">تشغيل/إيقاف الأصوات</span>
            <span className={`side-menu-switch ${!muted ? 'on' : ''}`} aria-hidden="true">
              <span className="side-menu-switch-knob" />
            </span>
          </button>

          <div className="side-menu-divider" role="separator" />

          <button className="side-menu-item side-menu-item-danger" type="button" onClick={() => go(onRequestLogout)}>
            <DynamicIcon name="log-out" size={18} className="side-menu-item-icon" />
            <span className="side-menu-item-label">تسجيل الخروج</span>
          </button>
        </nav>
      </div>
    </>
  );
}

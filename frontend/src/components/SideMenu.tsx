import { useEffect, useRef, useState } from 'react';
import { PushSupportState } from '../lib/push';
import { DynamicIcon } from '../lib/icons';
import { useTheme } from '../lib/theme';

type ArchiveTab = 'completed' | 'overdue';

interface Props {
  open: boolean;
  onClose: () => void;
  isAdmin: boolean;
  currentView?: string;
  archiveCount: number;
  // صفحة الأرشيف الفرعية الحالية (منجزة/متأخرة) — بتتحدد لون العنصر الفرعي
  // النشط في القائمة، ولتحديد الصفحة اللي هتتفتح لو اتضغط على السطر
  // الرئيسي "الأرشيف" مباشرة من غير ما يفتح القائمة الفرعية.
  archiveTab: ArchiveTab;
  muted: boolean;
  pushState: PushSupportState;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  undoRedoBusy: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onOpenDashboard: () => void;
  onOpenArchive: () => void;
  // فتح صفحة فرعية محددة من صفحتي الأرشيف مباشرة من القائمة الجانبية.
  onOpenArchiveTab: (tab: ArchiveTab) => void;
  onOpenLifeAreas: () => void;
  onOpenRecurring: () => void;
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
  currentView,
  archiveCount,
  archiveTab,
  muted,
  pushState,
  canUndo,
  canRedo,
  undoLabel,
  redoLabel,
  undoRedoBusy,
  onUndo,
  onRedo,
  onOpenDashboard,
  onOpenArchive,
  onOpenArchiveTab,
  onOpenLifeAreas,
  onOpenRecurring,
  onToggleMute,
  onTogglePush,
  onRequestLogout,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [theme, toggleTheme] = useTheme();
  const isDark = theme === 'dark';
  // القائمة الفرعية لصفحتي الأرشيف (منجزة/متأخرة) — بتتفتح بضغط السهم، وبتفضل
  // مفتوحة تلقائيًا وانت في شاشة الأرشيف عشان تشوف مباشرة الصفحة النشطة.
  const [archiveExpanded, setArchiveExpanded] = useState(currentView === 'archive');
  useEffect(() => {
    if (currentView === 'archive') setArchiveExpanded(true);
  }, [currentView]);

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
          {/* إجراءات سريعة (تراجع/إعادة) — نُقلت هنا من جنب زرار القائمة في
              الهيدر عشان تتجمّع كل أدوات التحكم في مكان واحد منظم، بأزرار
              أكبر وأوضح من غير ما تزاحم الهيدر. القائمة بتفضل مفتوحة بعد
              الضغط عشان المستخدم يقدر يكرر تراجع/إعادة أكتر من مرة لو
              محتاج، من غير ما تتقفل من أول ضغطة. */}
          <div className="side-menu-quick-actions">
            <button
              className="side-menu-quick-btn"
              type="button"
              onClick={onUndo}
              disabled={!canUndo || undoRedoBusy}
              title={canUndo ? `تراجع: ${undoLabel}` : 'لا يوجد ما يمكن التراجع عنه'}
              aria-label="تراجع"
            >
              <DynamicIcon name="undo" size={22} className="side-menu-quick-icon" />
              <span className="side-menu-quick-label">تراجع</span>
            </button>
            <button
              className="side-menu-quick-btn"
              type="button"
              onClick={onRedo}
              disabled={!canRedo || undoRedoBusy}
              title={canRedo ? `إعادة: ${redoLabel}` : 'لا يوجد ما يمكن إعادته'}
              aria-label="إعادة"
            >
              <DynamicIcon name="redo" size={22} className="side-menu-quick-icon" />
              <span className="side-menu-quick-label">إعادة</span>
            </button>
          </div>

          <div className="side-menu-divider" role="separator" />

          {isAdmin && (
            <button
              className={`side-menu-item ${currentView === 'admin' ? 'active' : ''}`}
              type="button"
              onClick={() => go(onOpenDashboard)}
              aria-current={currentView === 'admin' ? 'page' : undefined}
            >
              <DynamicIcon name="sliders" size={18} className="side-menu-item-icon" />
              <span className="side-menu-item-label">لوحة التحكم</span>
              <DynamicIcon name="chevron-left" size={16} className="side-menu-item-arrow" aria-hidden />
            </button>
          )}

          <div className="side-menu-group">
            <div className={`side-menu-item side-menu-item-parent ${currentView === 'archive' ? 'active' : ''}`}>
              <button
                className="side-menu-item-main"
                type="button"
                onClick={() => go(onOpenArchive)}
                aria-current={currentView === 'archive' ? 'page' : undefined}
              >
                <DynamicIcon name="archive" size={18} className="side-menu-item-icon" />
                <span className="side-menu-item-label">الأرشيف</span>
                {archiveCount > 0 && <span className="side-menu-item-badge">{archiveCount}</span>}
              </button>
              <button
                className="side-menu-item-expand"
                type="button"
                onClick={() => setArchiveExpanded((v) => !v)}
                aria-expanded={archiveExpanded}
                aria-controls="side-menu-archive-submenu"
                aria-label={archiveExpanded ? 'إخفاء صفحات الأرشيف' : 'عرض صفحات الأرشيف'}
              >
                <DynamicIcon
                  name="chevron-down"
                  size={16}
                  className={`side-menu-item-arrow ${archiveExpanded ? 'expanded' : ''}`}
                  aria-hidden
                />
              </button>
            </div>

            <div className={`side-menu-submenu-wrap ${archiveExpanded ? 'open' : ''}`}>
              <div className="side-menu-submenu-inner">
                <div
                  id="side-menu-archive-submenu"
                  className="side-menu-submenu"
                  role="group"
                  aria-label="صفحات الأرشيف"
                  aria-hidden={!archiveExpanded}
                >
                  <button
                    className={`side-menu-subitem ${currentView === 'archive' && archiveTab === 'completed' ? 'active' : ''}`}
                    type="button"
                    tabIndex={archiveExpanded ? 0 : -1}
                    onClick={() => go(() => onOpenArchiveTab('completed'))}
                    aria-current={currentView === 'archive' && archiveTab === 'completed' ? 'page' : undefined}
                  >
                    <DynamicIcon name="check-circle" size={15} className="side-menu-subitem-icon" />
                    <span className="side-menu-item-label">المهام المنجزة</span>
                  </button>
                  <button
                    className={`side-menu-subitem ${currentView === 'archive' && archiveTab === 'overdue' ? 'active' : ''}`}
                    type="button"
                    tabIndex={archiveExpanded ? 0 : -1}
                    onClick={() => go(() => onOpenArchiveTab('overdue'))}
                    aria-current={currentView === 'archive' && archiveTab === 'overdue' ? 'page' : undefined}
                  >
                    <DynamicIcon name="alert" size={15} className="side-menu-subitem-icon" />
                    <span className="side-menu-item-label">المهام المتأخرة</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <button
            className={`side-menu-item ${currentView === 'lifeAreas' ? 'active' : ''}`}
            type="button"
            onClick={() => go(onOpenLifeAreas)}
            aria-current={currentView === 'lifeAreas' ? 'page' : undefined}
          >
            <DynamicIcon name="compass" size={18} className="side-menu-item-icon" />
            <span className="side-menu-item-label">مجالات الحياة</span>
            <DynamicIcon name="chevron-left" size={16} className="side-menu-item-arrow" aria-hidden />
          </button>

          <button
            className={`side-menu-item ${currentView === 'recurring' ? 'active' : ''}`}
            type="button"
            onClick={() => go(onOpenRecurring)}
            aria-current={currentView === 'recurring' ? 'page' : undefined}
          >
            <DynamicIcon name="repeat" size={18} className="side-menu-item-icon" />
            <span className="side-menu-item-label">المهام المتكررة</span>
            <DynamicIcon name="chevron-left" size={16} className="side-menu-item-arrow" aria-hidden />
          </button>

          <div className="side-menu-divider" role="separator" />

          <button
            className="side-menu-item side-menu-toggle-item"
            type="button"
            onClick={toggleTheme}
            aria-pressed={isDark}
          >
            <span className="side-menu-item-icon theme-icon-stack" aria-hidden="true">
              <DynamicIcon name="sun" size={18} className="theme-icon theme-icon-sun" />
              <DynamicIcon name="moon" size={18} className="theme-icon theme-icon-moon" />
            </span>
            <span className="side-menu-item-label">الوضع الداكن</span>
            <span className={`side-menu-switch side-menu-switch-theme ${isDark ? 'on' : ''}`} aria-hidden="true">
              <span className="side-menu-switch-knob">
                <DynamicIcon name="sun" size={10} className="knob-icon knob-icon-sun" />
                <DynamicIcon name="moon" size={10} className="knob-icon knob-icon-moon" />
              </span>
            </span>
          </button>

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

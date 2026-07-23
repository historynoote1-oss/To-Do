import { DynamicIcon } from '../lib/icons';
import { hapticSelection, hapticImpact } from '../lib/nativeShell';
import type { ViewName } from '../lib/routes';

interface Props {
  activeView: ViewName;
  menuOpen: boolean;
  onNavigate: (view: ViewName) => void;
  onQuickAdd: () => void;
  onOpenMenu: () => void;
}

// شريط تبويبات سفلي ثابت — النمط القياسي لأي تطبيق موبايل احترافي للشاشات
// اللي المستخدم بيزورها كل يوم، بدل ما يكون مضطر يفتح قائمة همبرجر جانبية
// حتى عشان يرجع لصفحة المهام الرئيسية. القائمة الجانبية (SideMenu) لسه
// موجودة وشغالة زي ما هي لباقي الصفحات الثانوية (الأرشيف، مجالات الحياة،
// الإعدادات، إلخ) — الشريط ده مكمّل ليها مش بديل عنها.
//
// زرار "إضافة" في النص مرتفع شوية وبتصميم مختلف (دائرة بارزة) عن قصد —
// نفس فكرة زرار الكاميرا في تطبيقات التواصل، بيوضح إنه الفعل الأساسي
// (Primary Action) للتطبيق ككل مش مجرد تبويب زي باقي التبويبات.
const TABS: { view: ViewName; icon: string; label: string }[] = [
  { view: 'todos', icon: 'clipboard-list', label: 'المهام' },
  { view: 'goalMap', icon: 'route', label: 'الأهداف' },
];

const TABS_AFTER_ADD: { view: ViewName; icon: string; label: string }[] = [
  { view: 'pomodoro', icon: 'timer', label: 'التركيز' },
];

export default function BottomTabBar({ activeView, menuOpen, onNavigate, onQuickAdd, onOpenMenu }: Props) {
  function go(view: ViewName) {
    if (view !== activeView) {
      void hapticSelection();
      onNavigate(view);
    }
  }

  return (
    <nav className="bottom-tab-bar" aria-label="التنقل الرئيسي">
      {TABS.map((tab) => (
        <button
          key={tab.view}
          type="button"
          className={`bottom-tab-btn ${activeView === tab.view ? 'active' : ''}`}
          onClick={() => go(tab.view)}
          aria-current={activeView === tab.view ? 'page' : undefined}
        >
          <DynamicIcon name={tab.icon as any} size={22} />
          <span>{tab.label}</span>
        </button>
      ))}

      <button
        type="button"
        className="bottom-tab-add"
        onClick={() => {
          void hapticImpact('medium');
          onQuickAdd();
        }}
        aria-label="إضافة مهمة"
        title="إضافة مهمة"
      >
        <DynamicIcon name="plus" size={24} />
      </button>

      {TABS_AFTER_ADD.map((tab) => (
        <button
          key={tab.view}
          type="button"
          className={`bottom-tab-btn ${activeView === tab.view ? 'active' : ''}`}
          onClick={() => go(tab.view)}
          aria-current={activeView === tab.view ? 'page' : undefined}
        >
          <DynamicIcon name={tab.icon as any} size={22} />
          <span>{tab.label}</span>
        </button>
      ))}

      <button
        type="button"
        className={`bottom-tab-btn ${menuOpen ? 'active' : ''}`}
        onClick={() => {
          void hapticSelection();
          onOpenMenu();
        }}
        aria-haspopup="true"
        aria-expanded={menuOpen}
      >
        <DynamicIcon name="menu" size={22} />
        <span>القائمة</span>
      </button>
    </nav>
  );
}

import { DynamicIcon } from '@/utils/icons';
import { hapticSelection } from '@/utils/nativeShell';
import type { ViewName } from '@/services/routes';

interface Props {
  activeView: ViewName;
  menuOpen: boolean;
  onNavigate: (view: ViewName) => void;
  onOpenMenu: () => void;
}

// شريط تبويبات سفلي ثابت — النمط القياسي لأي تطبيق موبايل احترافي للشاشات
// اللي المستخدم بيزورها كل يوم، بدل ما يكون مضطر يفتح قائمة همبرجر جانبية
// حتى عشان يرجع لصفحة المهام الرئيسية. القائمة الجانبية (SideMenu) لسه
// موجودة وشغالة زي ما هي لباقي الصفحات الثانوية (الأرشيف، مجالات الحياة،
// إلخ) — الشريط ده مكمّل ليها مش بديل عنها.
//
// الترتيب من اليمين للشمال (أول عنصر في المصفوفة = أقصى اليمين لأن الصفحة
// RTL بالكامل): الإعدادات ← الأهداف ← الرئيسية ← مشغل القرآن، وبعدين زرار
// "القائمة" في الأقصى الشمال منفصل زي ما كان.
const TABS: { view: ViewName; icon: string; label: string }[] = [
  { view: 'settings', icon: 'settings', label: 'الإعدادات' },
  { view: 'goalMap', icon: 'route', label: 'الأهداف' },
  { view: 'todos', icon: 'home', label: 'الرئيسية' },
  { view: 'player', icon: 'book-open', label: 'مشغّل القرآن' },
];

export default function BottomTabBar({ activeView, menuOpen, onNavigate, onOpenMenu }: Props) {
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

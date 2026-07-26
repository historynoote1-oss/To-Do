// منطق التوجيه (routing) الخاص بالتطبيق — خريطة كل شاشة/تبويب لمساره في
// الرابط، ودالة قراءة الرابط الحالي وتحويله لحالة الشاشة المطابقة.
// اتنقل هنا من App.tsx لأنه منطق "خالص" (pure) مفيهوش أي state أو تأثير
// جانبي، فمفيش داعي يتحشر جوه المكوّن الرئيسي — وده كمان بيخلّي App.tsx
// أخف وأسهل قراءة، وده الملف ده سهل اختباره لوحده لو حبينا نضيف اختبارات
// بعدين.

import type { AdminTab } from '@/pages/admin/AdminDashboard';

export type ViewName =
  | 'todos'
  | 'admin'
  | 'profile'
  | 'lifeAreas'
  | 'player'
  | 'pomodoro'
  | 'goalMap'
  | 'prayerTimes'
  | 'settings';

// خريطة كل شاشة لمسارها في الـ URL — ده اللي بيخلي كل قسم في الموقع يكون
// ليه رابط فعلي (بدل ما الرابط يفضل ثابت دايمًا على الصفحة الرئيسية)، فيبقى
// ممكن تشارك رابط مباشر لأي قسم، وزرار رجوع المتصفح يشتغل بشكل طبيعي.
export const VIEW_PATHS: Record<ViewName, string> = {
  todos: '/',
  admin: '/admin',
  profile: '/profile',
  lifeAreas: '/life-areas',
  player: '/player',
  pomodoro: '/pomodoro',
  goalMap: '/goals',
  prayerTimes: '/prayer-times',
  settings: '/settings',
};

export const PATH_VIEWS: Record<string, ViewName> = Object.fromEntries(
  Object.entries(VIEW_PATHS).map(([viewName, path]) => [path, viewName])
) as Record<string, ViewName>;

// نفس فكرة VIEW_PATHS بالظبط، لكن لتبويبات لوحة الإدارة الداخلية — كل
// تبويب (نظرة عامة، تحليلات، مستخدمين...) بقى ليه رابط فرعي تحت /admin
// بدل ما كل التبويبات تشترك في نفس رابط /admin الثابت.
export const ADMIN_TAB_PATHS: Record<AdminTab, string> = {
  overview: '/admin',
  analytics: '/admin/analytics',
  users: '/admin/users',
  content: '/admin/content',
  settings: '/admin/settings',
};

export const ADMIN_PATH_TABS: Record<string, AdminTab> = Object.fromEntries(
  Object.entries(ADMIN_TAB_PATHS).map(([tabName, path]) => [path, tabName])
) as Record<string, AdminTab>;

// بيقرأ الرابط الحالي ويرجّع الشاشة الرئيسية + تبويب الإدارة (لو الشاشة
// إدارة) + صفحة الأرشيف الفرعية (لو الشاشة أرشيف) المطابقين له. مركزي عشان
// يُستخدم مع التحميل الأول ومع popstate.
// "عمق" كل شاشة — بيُستخدم بس عشان نقرر اتجاه حركة الانتقال (المرحلة 4):
// الشاشة الرئيسية (`todos`) هي الجذر (عمق 0)، وكل شاشة تانية بتتفتح منها
// أو من القائمة الجانبية هي "أعمق" (عمق 1). مش محتاجين تدرّج أكتر من كده
// دلوقتي لأن كل الشاشات الفرعية بترجع لـ`todos` مباشرة (`onBack`)، مفيش
// تداخل تلات مستويات فعلي في الوقت الحالي.
export function getViewDepth(view: ViewName): number {
  return view === 'todos' ? 0 : 1;
}

export function resolveFromPath(): { view: ViewName; adminTab: AdminTab } {
  const path = window.location.pathname;
  if (path in ADMIN_PATH_TABS) {
    return { view: 'admin', adminTab: ADMIN_PATH_TABS[path] };
  }
  return { view: PATH_VIEWS[path] ?? 'todos', adminTab: 'overview' };
}

// مجالات الحياة (Life Areas) — على عكس priority.ts و category.ts (قيم ثابتة
// معروفة مقدمًا)، المجالات هنا ديناميكية بالكامل وبيعرّفها المستخدم بنفسه:
// اسم حر + لون + أيقونة (إيموجي أو صورة مرفوعة). الملف ده بيوفر بس القيم
// المشتركة اللي بتساعد الواجهة تفضل متسقة بصريًا (لوحة ألوان مقترحة،
// إيموجيهات مقترحة، ودالة تحويل اللون لخلفية شفافة زي فلسفة category.ts).

export interface LifeAreaStats {
  totalLists: number;
  completedLists: number;
  totalItems: number;
  doneItems: number;
  completionRate: number;
}

export interface LifeAreaData {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  imageUrl: string | null;
  position: number;
  createdAt?: string;
  updatedAt?: string;
  stats: LifeAreaStats;
}

// لوحة ألوان مقترحة عشان المستخدم ميحتاجش يفتح color-picker من غير داعي —
// لسه يقدر يختار لون حر تمامًا لو حاب (input type="color" في نفس الواجهة).
export const LIFE_AREA_COLORS = [
  '#1d6f73', // أخضر مزرق (هوية الموقع الأساسية)
  '#6b5fd1', // بنفسجي
  '#a85c1e', // برتقالي محروق
  '#8a6a10', // ذهبي
  '#c1443a', // أحمر مرجاني
  '#2e8b57', // أخضر
  '#2f6fb0', // أزرق
  '#b5468b', // فوشيا
  '#4a5568', // رمادي أنثراسايت
  '#0f9b8e', // تركواز
];

// أيقونات إيموجي مقترحة تغطي أكتر جوانب الحياة شيوعًا — مجرد اقتراحات
// سريعة، والمستخدم يقدر يكتب أي إيموجي أو يرفع صورة بدلها.
export const LIFE_AREA_ICON_PRESETS = [
  '💼', '💪', '❤️', '👨‍👩‍👧‍👦', '📚', '💰',
  '🧘', '🎯', '🏠', '✈️', '🎨', '🙏',
  '🌱', '⚽', '🎵', '💻', '🍎', '📈',
];

export const DEFAULT_LIFE_AREA_COLOR = LIFE_AREA_COLORS[0];
export const DEFAULT_LIFE_AREA_ICON = '🏷️';

function clampChannel(n: number) {
  return Math.min(255, Math.max(0, n));
}

// بتحوّل لون hex (#rrggbb) لخلفية شفافة خفيفة (rgba) بنفس فلسفة category.ts
// (bg اللي بيتحط كخلفية الشارة)، عشان أي لون يختاره المستخدم بحرية يفضل
// متسق بصريًا مع باقي شارات الموقع.
export function hexToSoftBg(hex: string | null | undefined, alpha = 0.14): string {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return 'var(--surface-2)';
  const r = clampChannel(parseInt(hex.slice(1, 3), 16));
  const g = clampChannel(parseInt(hex.slice(3, 5), 16));
  const b = clampChannel(parseInt(hex.slice(5, 7), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

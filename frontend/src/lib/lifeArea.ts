// مجالات الحياة (Life Areas) — على عكس priority.ts و category.ts (قيم ثابتة
// معروفة مقدمًا)، المجالات هنا ديناميكية بالكامل وبيعرّفها المستخدم بنفسه:
// اسم حر + لون + أيقونة (Lucide فقط، بدون إيموجي، أو صورة مرفوعة). الملف
// ده بيوفر بس القيم المشتركة اللي بتساعد الواجهة تفضل متسقة بصريًا (لوحة
// ألوان مقترحة مقسّمة لعائلات، أيقونات مقترحة، ودوال تحويل اللون لخلفية
// شفافة/تدرج لوني زي فلسفة category.ts).

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
// اللوحة متقسّمة لعائلات لونية متناسقة (كل عائلة درجات متدرجة من نفس
// الطيف) عشان الاختيار يبقى أسهل بصريًا وأي لون يقع عليه المستخدم يفضل
// "حديث ومتناسق" مع هوية الموقع، مش لون عشوائي منفرد.
export const LIFE_AREA_COLOR_GROUPS: { label: string; colors: string[] }[] = [
  {
    label: 'أخضر وتركواز',
    colors: ['#1d6f73', '#0f9b8e', '#0d9488', '#059669', '#16a34a', '#2e8b57', '#15803d', '#4d7c0f'],
  },
  {
    label: 'أزرق وسماوي',
    colors: ['#2f6fb0', '#0284c7', '#0369a1', '#2563eb', '#3b82f6', '#0891b2', '#155e75', '#1e40af'],
  },
  {
    label: 'بنفسجي وموف',
    colors: ['#6b5fd1', '#7c3aed', '#8b5cf6', '#6d28d9', '#a855f7', '#9333ea', '#5b21b6', '#4c1d95'],
  },
  {
    label: 'وردي وفوشيا',
    colors: ['#b5468b', '#db2777', '#e11d48', '#be185d', '#ec4899', '#f43f5e', '#c026d3', '#9d174d'],
  },
  {
    label: 'أحمر وبرتقالي',
    colors: ['#c1443a', '#dc2626', '#b91c1c', '#ea580c', '#c2410c', '#f97316', '#9a3412', '#ef4444'],
  },
  {
    label: 'ذهبي وأصفر',
    colors: ['#8a6a10', '#a16207', '#ca8a04', '#eab308', '#d97706', '#b45309', '#92400e', '#78350f'],
  },
  {
    label: 'رمادي ومحايد',
    colors: ['#4a5568', '#334155', '#475569', '#57534e', '#64748b', '#3f3f46', '#1f2937', '#292524'],
  },
];

// نسخة مسطّحة من كل الألوان أعلاه — للتوافق مع أي كود قديم بيتوقع مصفوفة
// واحدة (وده كان شكل الثابت الأصلي قبل التقسيم لعائلات).
export const LIFE_AREA_COLORS = LIFE_AREA_COLOR_GROUPS.flatMap((g) => g.colors);

// أيقونات مقترحة (مفاتيح Lucide، شوف lib/icons.tsx) — دي المصدر الوحيد
// للأيقونة دلوقتي (تم إلغاء إدخال الإيموجي الحر بالكامل)، وبتغطي أوسع
// نطاق ممكن من جوانب الحياة: شغل، رياضة، صحة، عائلة، تعلّم، مال، سفر،
// هوايات، روحانيات، وغيرها. المستخدم البديل الوحيد لو حاب شكل مختلف
// تمامًا هو رفع صورة مخصصة كأيقونة.
export const LIFE_AREA_ICON_PRESETS = [
  'briefcase', 'building', 'laptop', 'graduation-cap', 'book-open', 'brain',
  'dumbbell', 'activity', 'bike', 'stethoscope', 'heart', 'smile',
  'users', 'baby', 'home', 'paw-print', 'hand-heart', 'sunrise',
  'wallet', 'piggy-bank', 'landmark', 'trending-up', 'shopping-bag', 'gift',
  'plane', 'globe', 'mountain', 'waves', 'car', 'camera',
  'palette', 'paintbrush', 'music', 'mic', 'gamepad', 'puzzle',
  'sprout', 'leaf', 'flower', 'coffee', 'utensils', 'shirt',
  'target', 'trophy', 'sparkles', 'star',
];

export const DEFAULT_LIFE_AREA_COLOR = LIFE_AREA_COLORS[0];
export const DEFAULT_LIFE_AREA_ICON = 'tag';

function clampChannel(n: number) {
  return Math.min(255, Math.max(0, n));
}

function hexToRgb(hex: string): [number, number, number] | null {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
  return [
    clampChannel(parseInt(hex.slice(1, 3), 16)),
    clampChannel(parseInt(hex.slice(3, 5), 16)),
    clampChannel(parseInt(hex.slice(5, 7), 16)),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => clampChannel(Math.round(n)).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// بتفتّح أو بتغمّق لون hex بنسبة معيّنة (amount موجب = أفتح، سالب = أغمق)
// — مستخدمة لتوليد تدرج (gradient) تلقائي من لون واحد بس يختاره المستخدم،
// من غير ما نحتاج نخزّن أي قيمة إضافية في قاعدة البيانات.
function shade(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const [r, g, b] = rgb;
  const mix = (channel: number) =>
    amount >= 0 ? channel + (255 - channel) * amount : channel * (1 + amount);
  return rgbToHex(mix(r), mix(g), mix(b));
}

// بتحوّل لون hex (#rrggbb) لخلفية شفافة خفيفة (rgba) بنفس فلسفة category.ts
// (bg اللي بيتحط كخلفية الشارة)، عشان أي لون يختاره المستخدم بحرية يفضل
// متسق بصريًا مع باقي شارات الموقع.
export function hexToSoftBg(hex: string | null | undefined, alpha = 0.14): string {
  const rgb = hex ? hexToRgb(hex) : null;
  if (!rgb) return 'var(--surface-2)';
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

// بتولّد تدرج لوني (CSS linear-gradient) حديث من لون واحد فقط — بيتحط
// كخلفية "شارة" الأيقونة (glyph) في كل حتة بالموقع، عشان الشكل يبقى غني
// بصريًا (تدرجات) من غير ما نحتاج نخزّن أكتر من لون واحد لكل مجال.
export function hexToGradient(hex: string | null | undefined, angle = 135): string {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) {
    return 'linear-gradient(135deg, var(--surface-3), var(--surface-2))';
  }
  const light = shade(hex, 0.16);
  const dark = shade(hex, -0.18);
  return `linear-gradient(${angle}deg, ${light}, ${dark})`;
}

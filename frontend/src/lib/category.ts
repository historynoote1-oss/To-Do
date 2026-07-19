// تصنيف المهام الرئيسية — يومية/أسبوعية/شهرية/سنوية. نفس فلسفة priority.ts:
// مصدر واحد للألوان والتسميات يستخدمه كل من الشارة القابلة للنقر وشريط
// الاختيار المضغوط عند الإنشاء، عشان الشكل يفضل موحّد في كل الموقع.

export type CategoryKey = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export interface CategoryDef {
  key: CategoryKey;
  label: string;
  short: string;
  icon: string;
  color: string;
  bg: string;
  // الوصف اللي بيظهر تحت التصنيف في قائمة الاختيار، بيوضّح "بتظهر فين".
  hint: string;
}

export const CATEGORIES: CategoryDef[] = [
  {
    key: 'DAILY',
    label: 'يومية',
    short: 'يومية',
    icon: 'calendar',
    color: '#1d6f73',
    bg: 'rgba(29, 111, 115, 0.12)',
    hint: 'بتظهر ضمن مهام اليوم',
  },
  {
    key: 'WEEKLY',
    label: 'أسبوعية',
    short: 'أسبوعية',
    icon: 'calendar-days',
    color: '#6b5fd1',
    bg: 'rgba(107, 95, 209, 0.12)',
    hint: 'بتظهر ضمن مهام الأسبوع',
  },
  {
    key: 'MONTHLY',
    label: 'شهرية',
    short: 'شهرية',
    icon: 'calendar-range',
    color: '#a85c1e',
    bg: 'rgba(168, 92, 30, 0.14)',
    hint: 'بتظهر ضمن مهام الشهر',
  },
  {
    key: 'YEARLY',
    label: 'سنوية',
    short: 'سنوية',
    icon: 'trophy',
    color: '#8a6a10',
    bg: 'rgba(138, 106, 16, 0.14)',
    hint: 'بتحدد لها سنة مستهدفة بدقة',
  },
];

export const CATEGORY_MAP: Record<CategoryKey, CategoryDef> = CATEGORIES.reduce(
  (acc, c) => ({ ...acc, [c.key]: c }),
  {} as Record<CategoryKey, CategoryDef>
);

export function categoryOf(key?: string | null): CategoryDef | null {
  if (!key) return null;
  return CATEGORY_MAP[key as CategoryKey] || null;
}

// ===== خريطة الأهداف الهرمية (سنوي ← شهري ← أسبوعي ← يومي) =====
// نفس منطق backend/src/routes/lists.ts (PARENT_CATEGORY_OF) وعن قصد: كل
// تصنيف غير سنوي لازم "هدف أب" من التصنيف الأعلى مباشرة. الهدف السنوي هو
// قمة الهرم ومالوش أب. مصدر واحد للحقيقة عشان الويزارد يبني نفس القرارات
// اللي السيرفر هيتحقق منها بالظبط.
export const PARENT_CATEGORY_OF: Partial<Record<CategoryKey, CategoryKey>> = {
  MONTHLY: 'YEARLY',
  WEEKLY: 'MONTHLY',
  DAILY: 'WEEKLY',
};

// العكس: بيوصف لكل تصنيف "التصنيف الابن" اللي بينقسم له — بيُستخدم لما
// نضيف "هدف فرعي" مباشرة من كارت هدف موجود (سنوي → شهري → أسبوعي → يومي).
export const CHILD_CATEGORY_OF: Partial<Record<CategoryKey, CategoryKey>> = {
  YEARLY: 'MONTHLY',
  MONTHLY: 'WEEKLY',
  WEEKLY: 'DAILY',
};

export function requiresParentGoal(category?: CategoryKey | null): boolean {
  return !!category && !!PARENT_CATEGORY_OF[category];
}

export function goalLabelFor(category?: CategoryKey | null): string {
  const def = categoryOf(category);
  return def ? `الهدف ${def.label === 'يومية' ? 'اليومي' : def.label === 'أسبوعية' ? 'الأسبوعي' : def.label === 'شهرية' ? 'الشهري' : 'السنوي'}` : 'الهدف';
}

// ===== تسميات خانات التقويم الهرمي (شهر/أسبوع/يوم) =====
// مصدر واحد مشترك بين ويزارد الإنشاء/التعديل (AddTaskModal، خطوة "الموعد")
// و"خريطة العرض الكاملة" (GoalMap.tsx، شبكة الأشهر/الأسابيع/الأيام) —
// عشان الرقم/الاسم المكتوب في الاتنين يفضل متطابق بالظبط دايمًا.
export const MONTH_NAMES = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];
export const WEEK_LABELS = ['الأسبوع الأول', 'الأسبوع الثاني', 'الأسبوع الثالث', 'الأسبوع الرابع', 'الأسبوع الخامس'];
// السبت = 0 لحد الجمعة = 6 (بداية الأسبوع العربي المعتادة).
export const DAY_OF_WEEK_NAMES = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];

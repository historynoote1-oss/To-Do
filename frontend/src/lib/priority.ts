// إعدادات الأولوية المشتركة — نفس القيم دي بتتستخدم في المهام الرئيسية
// والمهام الفرعية على حد سواء، عشان يكون شكل وسلوك الأولوية موحّد في كل الموقع.

export type PriorityKey = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface PriorityDef {
  key: PriorityKey;
  label: string;
  short: string;
  color: string;
  bg: string;
  glow: string;
  level: number; // 0..4 لعدد "الأعمدة" المضيئة في الأيقونة
}

// القيمة "بدون" (NONE) اتشالت من كل شاشات الاختيار (منتقي الإنشاء وقوائم
// التغيير والفلاتر) بناءً على طلب إزالة الخيارات الافتراضية غير المطلوبة —
// المستخدم دلوقتي لازم يختار أولوية فعلية. لسه محتفظين بتعريفها جوه
// ALL_PRIORITIES/PRIORITY_MAP عشان أي مهمة قديمة اتخزنت بأولوية NONE قبل
// التحديث تفضل بتترسم بشكلها الصحيح بدل ما تكسر الواجهة.
const ALL_PRIORITIES: PriorityDef[] = [
  { key: 'NONE', label: 'بدون', short: 'بدون', color: '#5b6478', bg: 'rgba(91,100,120,0.12)', glow: 'rgba(91,100,120,0.0)', level: 0 },
  { key: 'LOW', label: 'منخفضة', short: 'منخفضة', color: '#3d6fbf', bg: 'rgba(61,111,191,0.12)', glow: 'rgba(61,111,191,0.35)', level: 1 },
  { key: 'MEDIUM', label: 'متوسطة', short: 'متوسطة', color: '#8a6a10', bg: 'rgba(138,106,16,0.14)', glow: 'rgba(138,106,16,0.4)', level: 2 },
  { key: 'HIGH', label: 'مرتفعة', short: 'مرتفعة', color: '#a85c1e', bg: 'rgba(168,92,30,0.16)', glow: 'rgba(168,92,30,0.45)', level: 3 },
  { key: 'CRITICAL', label: 'حرجة', short: 'حرجة', color: '#c13327', bg: 'rgba(193,51,39,0.18)', glow: 'rgba(193,51,39,0.5)', level: 4 },
];

// القائمة اللي بتتستخدم فعليًا في كل منتقيات/قوائم الاختيار الظاهرة للمستخدم
// (PriorityPicker، PriorityBadge، فلتر الأولوية) — من غير "بدون".
export const PRIORITIES: PriorityDef[] = ALL_PRIORITIES.filter((p) => p.key !== 'NONE');

export const PRIORITY_MAP: Record<PriorityKey, PriorityDef> = ALL_PRIORITIES.reduce(
  (acc, p) => ({ ...acc, [p.key]: p }),
  {} as Record<PriorityKey, PriorityDef>
);

export function priorityOf(key?: string | null): PriorityDef {
  return PRIORITY_MAP[(key as PriorityKey) || 'NONE'] || PRIORITY_MAP.NONE;
}

// ترتيب الأولوية من الأعلى للأقل — يفيد في فرز المهام حسب الأهمية.
export function priorityWeight(key?: string | null): number {
  return priorityOf(key).level;
}

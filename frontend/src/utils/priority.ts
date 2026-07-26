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
  { key: 'NONE', label: 'غير محددة', short: 'غير محددة', color: '#766a92', bg: 'rgba(118,106,146,0.14)', glow: 'rgba(118,106,146,0.0)', level: 0 },
  { key: 'LOW', label: 'منخفضة', short: 'منخفضة', color: '#0ea5e9', bg: 'rgba(14,165,233,0.13)', glow: 'rgba(14,165,233,0.38)', level: 1 },
  { key: 'MEDIUM', label: 'متوسطة', short: 'متوسطة', color: '#f0b429', bg: 'rgba(240,180,41,0.16)', glow: 'rgba(240,180,41,0.42)', level: 2 },
  { key: 'HIGH', label: 'مرتفعة', short: 'مرتفعة', color: '#e879f9', bg: 'rgba(232,121,249,0.16)', glow: 'rgba(232,121,249,0.46)', level: 3 },
  { key: 'CRITICAL', label: 'حرجة', short: 'حرجة', color: '#fb7185', bg: 'rgba(251,113,133,0.18)', glow: 'rgba(251,113,133,0.5)', level: 4 },
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

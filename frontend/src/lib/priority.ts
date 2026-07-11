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

export const PRIORITIES: PriorityDef[] = [
  { key: 'NONE', label: 'بدون', short: 'بدون', color: '#8b93a7', bg: 'rgba(139,147,167,0.14)', glow: 'rgba(139,147,167,0.0)', level: 0 },
  { key: 'LOW', label: 'منخفضة', short: 'منخفضة', color: '#5db3e0', bg: 'rgba(93,179,224,0.14)', glow: 'rgba(93,179,224,0.35)', level: 1 },
  { key: 'MEDIUM', label: 'متوسطة', short: 'متوسطة', color: '#e8c34d', bg: 'rgba(232,195,77,0.16)', glow: 'rgba(232,195,77,0.4)', level: 2 },
  { key: 'HIGH', label: 'مرتفعة', short: 'مرتفعة', color: '#e8873d', bg: 'rgba(232,135,61,0.18)', glow: 'rgba(232,135,61,0.45)', level: 3 },
  { key: 'CRITICAL', label: 'حرجة', short: 'حرجة', color: '#f0554a', bg: 'rgba(240,85,74,0.2)', glow: 'rgba(240,85,74,0.55)', level: 4 },
];

export const PRIORITY_MAP: Record<PriorityKey, PriorityDef> = PRIORITIES.reduce(
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

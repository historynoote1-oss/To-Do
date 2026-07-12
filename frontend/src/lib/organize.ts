// نظام التنظيم الجديد — بديل نظام الفلاتر القديم بالكامل.
// بدل ما المستخدم يفلتر يدويًا كل مرة، المهام بتترتب وتتجمّع تلقائيًا:
// 1) قسم "عاجل الآن" في الأعلى: أولوية حرجة/مرتفعة أو مواعيد استحقاق قريبة.
// 2) بعده تجميع حسب مجال الحياة (بالترتيب اللي رتّبه المستخدم)، وأي مهمة
//    من غير مجال بتترصّ في قسم "بدون مجال" في الآخر.
// 3) جوه كل قسم، المهام مرتبة تلقائيًا: الأولوية الأعلى الأول، وبعدين
//    أقرب موعد استحقاق، عشان الوصول لأي حاجة يبقى في ثواني من غير فلترة.

import { LifeAreaData } from './lifeArea';
import { priorityWeight } from './priority';

export const NO_LIFE_AREA_GROUP = '__none__';
const URGENT_WINDOW_MS = 24 * 60 * 60 * 1000; // يوم قدام يعتبر "عاجل" لو له موعد استحقاق

export interface MinimalItem {
  isDone: boolean;
  dueDate?: string | null;
  priority?: string | null;
}

export interface MinimalList {
  id: string;
  priority?: string | null;
  lifeAreaId?: string | null;
  items: MinimalItem[];
}

// أقرب موعد استحقاق لمهمة فرعية لسه مش خلصانة داخل المهمة الرئيسية —
// null لو مفيش مواعيد مضبوطة أصلًا.
export function earliestDueDate(list: MinimalList): number | null {
  const times = list.items
    .filter((i) => !i.isDone && i.dueDate)
    .map((i) => new Date(i.dueDate as string).getTime())
    .filter((t) => !Number.isNaN(t));
  if (times.length === 0) return null;
  return Math.min(...times);
}

export function isListDone(list: MinimalList): boolean {
  return list.items.length > 0 && list.items.every((i) => i.isDone);
}

export function isOverdue(list: MinimalList, now: number = Date.now()): boolean {
  const d = earliestDueDate(list);
  return d !== null && d < now;
}

// مهمة رئيسية بتتحسب "عاجلة" لو أولويتها حرجة/مرتفعة، أو عندها موعد
// استحقاق متأخر أو خلال 24 ساعة جاية — ومش مكتملة بالكامل أصلًا.
export function isUrgent(list: MinimalList, now: number = Date.now()): boolean {
  if (isListDone(list)) return false;
  if (list.priority === 'CRITICAL' || list.priority === 'HIGH') return true;
  const d = earliestDueDate(list);
  if (d === null) return false;
  return d <= now + URGENT_WINDOW_MS;
}

function compareLists(a: MinimalList, b: MinimalList, now: number): number {
  const doneA = isListDone(a);
  const doneB = isListDone(b);
  if (doneA !== doneB) return doneA ? 1 : -1; // المكتملة بالكامل تتنحّي لآخر القسم

  const pw = priorityWeight(b.priority) - priorityWeight(a.priority);
  if (pw !== 0) return pw;

  const da = earliestDueDate(a);
  const db = earliestDueDate(b);
  if (da !== null && db !== null) return da - db;
  if (da !== null) return -1;
  if (db !== null) return 1;
  return 0;
}

export function sortLists<T extends MinimalList>(lists: T[], now: number = Date.now()): T[] {
  return [...lists].sort((a, b) => compareLists(a, b, now));
}

export interface LifeAreaGroup<T> {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  imageUrl: string | null;
  lists: T[];
}

// بتجمّع المهام الرئيسية حسب مجال الحياة (بترتيب المجالات اللي المستخدم
// ظبطه بنفسه)، وبترجع بس المجالات اللي فيها مهام فعلًا — من غير أقسام
// فاضية تشوّش الشاشة. قسم "بدون مجال" بيتحط آخر حاجة لو موجود.
export function groupByLifeArea<T extends MinimalList>(lists: T[], lifeAreas: LifeAreaData[]): LifeAreaGroup<T>[] {
  const byArea = new Map<string, T[]>();
  const noArea: T[] = [];

  for (const l of lists) {
    if (l.lifeAreaId) {
      const arr = byArea.get(l.lifeAreaId) || [];
      arr.push(l);
      byArea.set(l.lifeAreaId, arr);
    } else {
      noArea.push(l);
    }
  }

  const groups: LifeAreaGroup<T>[] = [];
  for (const area of lifeAreas) {
    const items = byArea.get(area.id);
    if (items && items.length > 0) {
      groups.push({
        id: area.id,
        name: area.name,
        color: area.color,
        icon: area.icon,
        imageUrl: area.imageUrl,
        lists: sortLists(items),
      });
    }
  }

  if (noArea.length > 0) {
    groups.push({
      id: NO_LIFE_AREA_GROUP,
      name: 'بدون مجال',
      color: '#5b6478',
      icon: 'tag',
      imageUrl: null,
      lists: sortLists(noArea),
    });
  }

  return groups;
}

// أهم N مهمة محتاجة انتباه فوري، بترتيب الأولوية والاستحقاق — القسم ده
// بيوفّر "وصول لأي مهمة خلال ثوانٍ" من غير ما يحتاج المستخدم يدوّر.
export function urgentLists<T extends MinimalList>(lists: T[], limit = 6, now: number = Date.now()): T[] {
  return sortLists(
    lists.filter((l) => isUrgent(l, now)),
    now
  ).slice(0, limit);
}

// نفس منطق فرز المهام الرئيسية، بس للمهام الفرعية جوه مهمة واحدة: غير
// المكتملة أولًا (الأولوية الأعلى فالأقرب استحقاقًا)، وبعدين المكتملة.
export function sortItems<T extends MinimalItem>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.isDone !== b.isDone) return a.isDone ? 1 : -1;
    const pw = priorityWeight(b.priority) - priorityWeight(a.priority);
    if (pw !== 0) return pw;
    const da = a.dueDate ? new Date(a.dueDate).getTime() : null;
    const db = b.dueDate ? new Date(b.dueDate).getTime() : null;
    if (da !== null && db !== null) return da - db;
    if (da !== null) return -1;
    if (db !== null) return 1;
    return 0;
  });
}

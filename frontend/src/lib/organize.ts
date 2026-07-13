// نظام التنظيم الجديد — بديل نظام الفلاتر القديم بالكامل.
// بدل ما المستخدم يفلتر يدويًا كل مرة، المهام بتترتب وتتجمّع تلقائيًا:
// 1) تجميع حسب مجال الحياة (بالترتيب اللي رتّبه المستخدم)، وأي مهمة
//    من غير مجال بتترصّ في قسم "بدون مجال" في الآخر.
// 2) جوه كل قسم، المهام مرتبة تلقائيًا: الأولوية الأعلى الأول، وبعدين
//    أقرب موعد استحقاق، عشان الوصول لأي حاجة يبقى في ثواني من غير فلترة.

import { LifeAreaData } from './lifeArea';
import { priorityWeight, PRIORITIES, PriorityKey } from './priority';
import { CATEGORIES, CategoryKey } from './category';

export const NO_LIFE_AREA_GROUP = '__none__';

export interface MinimalItem {
  isDone: boolean;
  dueDate?: string | null;
  priority?: string | null;
}

export interface MinimalList {
  id: string;
  priority?: string | null;
  category?: string | null;
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
      name: 'عام',
      color: '#5b6478',
      icon: 'tag',
      imageUrl: null,
      lists: sortLists(noArea),
    });
  }

  return groups;
}

// نفس منطق فرز المهام الرئيسية، بس للمهام الفرعية جوه مهمة واحدة: غير
// المكتملة أولًا (الأولوية الأعلى فالأقرب استحقاقًا)، وبعدين المكتملة.
export const NO_CATEGORY_GROUP = '__no_category__';

export interface PriorityGroup<T> {
  key: string;
  label: string;
  color: string;
  lists: T[];
}

export interface CategoryGroup<T> {
  key: string;
  label: string;
  icon: string;
  color: string;
  count: number;
  priorityGroups: PriorityGroup<T>[];
}

export interface HierarchicalLifeAreaGroup<T> {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  imageUrl: string | null;
  count: number;
  categoryGroups: CategoryGroup<T>[];
}

// بيقسّم مهام مجال حياة واحد لمستويين إضافيين جوه بعض: التصنيف
// (يومية/أسبوعية/...) وبعده الأولوية — عشان الوصول لأي مهمة يبقى
// بضغطتين بدل التمرير على عشرات الكروت. الأقسام الفاضية بتتشال تلقائيًا.
function buildCategoryGroups<T extends MinimalList & { category?: string | null }>(lists: T[]): CategoryGroup<T>[] {
  const byCategory = new Map<string, T[]>();
  const noCategory: T[] = [];

  for (const l of lists) {
    if (l.category) {
      const arr = byCategory.get(l.category) || [];
      arr.push(l);
      byCategory.set(l.category, arr);
    } else {
      noCategory.push(l);
    }
  }

  const groups: CategoryGroup<T>[] = [];
  for (const cat of CATEGORIES) {
    const items = byCategory.get(cat.key);
    if (items && items.length > 0) {
      groups.push({
        key: cat.key,
        label: cat.label,
        icon: cat.icon,
        color: cat.color,
        count: items.length,
        priorityGroups: buildPriorityGroups(items),
      });
    }
  }

  if (noCategory.length > 0) {
    groups.push({
      key: NO_CATEGORY_GROUP,
      label: 'بدون تصنيف',
      icon: 'tag',
      color: '#5b6478',
      count: noCategory.length,
      priorityGroups: buildPriorityGroups(noCategory),
    });
  }

  return groups;
}

function buildPriorityGroups<T extends MinimalList>(lists: T[]): PriorityGroup<T>[] {
  const byPriority = new Map<string, T[]>();
  for (const l of lists) {
    const key = (l.priority as PriorityKey) || 'NONE';
    const arr = byPriority.get(key) || [];
    arr.push(l);
    byPriority.set(key, arr);
  }

  const order = [...PRIORITIES].reverse(); // حرجة أولًا لآخر منخفضة
  const groups: PriorityGroup<T>[] = [];
  for (const p of order) {
    const items = byPriority.get(p.key);
    if (items && items.length > 0) {
      groups.push({ key: p.key, label: p.label, color: p.color, lists: sortLists(items) });
    }
  }
  const noneItems = byPriority.get('NONE');
  if (noneItems && noneItems.length > 0) {
    groups.push({ key: 'NONE', label: 'بدون أولوية', color: '#5b6478', lists: sortLists(noneItems) });
  }
  return groups;
}

// المستوى الهرمي الكامل: مجال الحياة ← التصنيف ← الأولوية ← المهام.
// بيستخدم نفس ترتيب مجالات الحياة اللي ظبطها المستخدم، وبيسيب "بدون
// مجال" في الآخر زي groupByLifeArea تمامًا.
export function groupHierarchical<T extends MinimalList & { category?: string | null }>(
  lists: T[],
  lifeAreas: LifeAreaData[]
): HierarchicalLifeAreaGroup<T>[] {
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

  const groups: HierarchicalLifeAreaGroup<T>[] = [];
  for (const area of lifeAreas) {
    const items = byArea.get(area.id);
    if (items && items.length > 0) {
      groups.push({
        id: area.id,
        name: area.name,
        color: area.color,
        icon: area.icon,
        imageUrl: area.imageUrl,
        count: items.length,
        categoryGroups: buildCategoryGroups(items),
      });
    }
  }

  if (noArea.length > 0) {
    groups.push({
      id: NO_LIFE_AREA_GROUP,
      name: 'عام',
      color: '#5b6478',
      icon: 'tag',
      imageUrl: null,
      count: noArea.length,
      categoryGroups: buildCategoryGroups(noArea),
    });
  }

  return groups;
}

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

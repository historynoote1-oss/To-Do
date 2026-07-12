// نظام الفلترة المتقدم — مستوحى من فلسفة Notion/Todoist: كل بُعد فلترة
// (تصنيف/مجال حياة/أولوية) بيقبل اختيار متعدد (OR جوه نفس البُعد)، وكل
// الأبعاد مع بعض بتتجمّع بـ AND. الفلاتر المخصصة بتتحفظ محليًا لكل مستخدم
// عشان تفضل خاصة بيه على نفس الجهاز، وتقدر تتطبق تاني بضغطة واحدة.

import { CategoryKey } from './category';
import { PriorityKey } from './priority';

export type StatusFilter = 'all' | 'active';
export type DatePreset = 'ANY' | 'TODAY' | 'WEEK' | 'OVERDUE' | 'NO_DATE';

// قيمة خاصة بتمثل "بدون مجال حياة" جوه مصفوفة lifeAreaIds، لأن الـ id
// الحقيقي دايمًا string عشوائي من قاعدة البيانات ومينفعش يتلخبط بيه.
export const NO_LIFE_AREA = '__NONE__';

export interface FilterCriteria {
  status: StatusFilter;
  categories: CategoryKey[];
  targetYear: number;
  lifeAreaIds: string[];
  priorities: PriorityKey[];
  datePreset: DatePreset;
}

export function defaultFilters(): FilterCriteria {
  return {
    status: 'all',
    categories: [],
    targetYear: new Date().getFullYear(),
    lifeAreaIds: [],
    priorities: [],
    datePreset: 'ANY',
  };
}

export interface MinimalItem {
  isDone: boolean;
  dueDate?: string | null;
}

export interface MinimalList {
  category?: string | null;
  targetYear?: number | null;
  lifeAreaId?: string | null;
  priority?: string;
  items: MinimalItem[];
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function matchesDate(list: MinimalList, preset: DatePreset, now: Date): boolean {
  if (preset === 'ANY') return true;

  const dated = list.items.filter((i) => i.dueDate);

  if (preset === 'NO_DATE') {
    return list.items.length === 0 || dated.length === 0;
  }

  if (preset === 'TODAY') {
    return dated.some((i) => isSameDay(new Date(i.dueDate as string), now));
  }

  if (preset === 'WEEK') {
    const weekAhead = new Date(now);
    weekAhead.setDate(weekAhead.getDate() + 7);
    return dated.some((i) => {
      const d = new Date(i.dueDate as string);
      return d >= now && d <= weekAhead;
    });
  }

  if (preset === 'OVERDUE') {
    return dated.some((i) => !i.isDone && new Date(i.dueDate as string) < now);
  }

  return true;
}

// المُسند الأساسي: بيرجع true لو القائمة مطابقة لكل الفلاتر المفعّلة حاليًا.
// بُعد فاضي (مصفوفة طولها 0) معناه "من غير قيد" على البُعد ده.
export function matchesFilters(list: MinimalList, f: FilterCriteria, now: Date = new Date()): boolean {
  if (f.status === 'active') {
    const isDone = list.items.length > 0 && list.items.every((i) => i.isDone);
    if (isDone) return false;
  }

  if (f.categories.length > 0) {
    if (!list.category || !f.categories.includes(list.category as CategoryKey)) return false;
    if (list.category === 'YEARLY' && f.categories.includes('YEARLY') && list.targetYear !== f.targetYear) {
      return false;
    }
  }

  if (f.lifeAreaIds.length > 0) {
    const wantsNone = f.lifeAreaIds.includes(NO_LIFE_AREA);
    const hasArea = !!list.lifeAreaId;
    const matchesSpecific = hasArea && f.lifeAreaIds.includes(list.lifeAreaId as string);
    const matchesNone = !hasArea && wantsNone;
    if (!matchesSpecific && !matchesNone) return false;
  }

  if (f.priorities.length > 0) {
    if (!f.priorities.includes((list.priority as PriorityKey) || 'NONE')) return false;
  }

  if (!matchesDate(list, f.datePreset, now)) return false;

  return true;
}

export function countActiveDimensions(f: FilterCriteria): number {
  let n = 0;
  if (f.status !== 'all') n++;
  if (f.categories.length > 0) n++;
  if (f.lifeAreaIds.length > 0) n++;
  if (f.priorities.length > 0) n++;
  if (f.datePreset !== 'ANY') n++;
  return n;
}

export function isDefaultFilters(f: FilterCriteria): boolean {
  return countActiveDimensions(f) === 0;
}

export function sameCriteria(a: FilterCriteria, b: FilterCriteria): boolean {
  return (
    a.status === b.status &&
    a.datePreset === b.datePreset &&
    a.targetYear === b.targetYear &&
    sameSet(a.categories, b.categories) &&
    sameSet(a.lifeAreaIds, b.lifeAreaIds) &&
    sameSet(a.priorities, b.priorities)
  );
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

// ===== الفلاتر المخصصة المحفوظة =====

export interface SavedFilter {
  id: string;
  name: string;
  criteria: FilterCriteria;
  createdAt: number;
}

function storageKey(username: string): string {
  return `savedFilters:${username}`;
}

export function getSavedFilters(username: string): SavedFilter[] {
  try {
    const raw = window.localStorage.getItem(storageKey(username));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function persistSavedFilters(username: string, filters: SavedFilter[]) {
  try {
    window.localStorage.setItem(storageKey(username), JSON.stringify(filters));
  } catch {
    // التخزين المحلي تحسيني بس (زي الثيم وكتم الصوت) — لو فشل (مساحة ممتلئة
    // مثلًا) منسيبش الميزة الأساسية تتعطل بسببه.
  }
}

export function addSavedFilter(username: string, name: string, criteria: FilterCriteria): SavedFilter[] {
  const list = getSavedFilters(username);
  const entry: SavedFilter = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim(),
    criteria,
    createdAt: Date.now(),
  };
  const next = [...list, entry];
  persistSavedFilters(username, next);
  return next;
}

export function removeSavedFilter(username: string, id: string): SavedFilter[] {
  const next = getSavedFilters(username).filter((f) => f.id !== id);
  persistSavedFilters(username, next);
  return next;
}

export const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  ANY: 'أي وقت',
  TODAY: 'اليوم',
  WEEK: 'خلال أسبوع',
  OVERDUE: 'متأخرة',
  NO_DATE: 'بدون تاريخ',
};

// ترتيب المهام: الأولوية الأعلى الأول، وبعدين أقرب موعد استحقاق. المهام
// المكتملة بالكامل بتتنحّي لآخر القائمة.

import { priorityWeight } from '@/utils/priority';

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
  targetYear?: number | null;
  items: MinimalItem[];
}

export function isListDone(list: MinimalList): boolean {
  return list.items.length > 0 && list.items.every((i) => i.isDone);
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

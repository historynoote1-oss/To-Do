// ===== القوائم (الأهداف) =====

import { API_URL, authHeaders, fetchWithRetry, handle, localDateKey } from './core';

export async function getLists() {
  const res = await fetchWithRetry(`${API_URL}/api/lists`, { headers: authHeaders() });
  return handle(res);
}

export async function createList(
  title: string,
  priority?: string,
  category?: string | null,
  targetYear?: number | null,
  lifeAreaId?: string | null,
  startTime?: string | null,
  endTime?: string | null,
  parentGoalId?: string | null,
  targetMonth?: number | null,
  targetWeek?: number | null,
  targetDayOfWeek?: number | null
) {
  const res = await fetch(`${API_URL}/api/lists`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      title,
      priority,
      category,
      targetYear,
      lifeAreaId,
      startTime,
      endTime,
      parentGoalId,
      targetMonth,
      targetWeek,
      targetDayOfWeek,
    }),
  });
  return handle(res);
}

export async function updateList(
  id: string,
  data: {
    title?: string;
    priority?: string;
    startTime?: string | null;
    endTime?: string | null;
    category?: string | null;
    targetYear?: number | null;
    targetMonth?: number | null;
    targetWeek?: number | null;
    targetDayOfWeek?: number | null;
    lifeAreaId?: string | null;
    parentGoalId?: string | null;
  }
) {
  const res = await fetch(`${API_URL}/api/lists/${id}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  return handle(res);
}

// ===== خريطة الأهداف الهرمية =====
// بترجع الأهداف المرشحة تتربط كـ"أب" لتصنيف معيّن (مثلاً كل الأهداف
// الشهرية النشطة لو category = 'WEEKLY') — بتُستخدم في خطوة "الهدف الأب"
// جوه ويزارد الإنشاء/التعديل. excludeId بيمنع ظهور الهدف نفسه كخيار لأبوه
// وقت التعديل.
export interface GoalOption {
  id: string;
  title: string;
  category: string | null;
  targetYear: number | null;
  targetMonth?: number | null;
  targetWeek?: number | null;
  targetDayOfWeek?: number | null;
}

export async function getGoalOptions(category: string, excludeId?: string): Promise<GoalOption[]> {
  const params = new URLSearchParams({ category });
  if (excludeId) params.set('excludeId', excludeId);
  const res = await fetch(`${API_URL}/api/lists/goal-options?${params.toString()}`, { headers: authHeaders() });
  return handle(res);
}

// تأكيد/إلغاء تأكيد الإنجاز النهائي للمهمة الرئيسية (مربع الـ Check في
// الكارت) — منفصل تمامًا عن تعليم المهام الفرعية. confirmListDone بيرفض
// الطلب من السيرفر لو لسه فيه مهام فرعية غير منجزة.
export async function confirmListDone(id: string) {
  const res = await fetch(`${API_URL}/api/lists/${id}/confirm-done`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ localDate: localDateKey() }),
  });
  return handle(res);
}

export async function unconfirmListDone(id: string) {
  const res = await fetch(`${API_URL}/api/lists/${id}/unconfirm-done`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return handle(res);
}

// ===== حذف هدف بكل تبعياته (خريطة العرض الكاملة) =====
// حذف نهائي فوري (بيمسح الهدف وكل الأهداف الفرعية تحته على كل المستويات)
// — محمي بكلمة مرور الحساب، شوف middleware/requireAccountPassword في
// الباك إند.
export async function deleteListCascade(id: string, password: string) {
  const res = await fetch(`${API_URL}/api/lists/${id}/delete-cascade`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ password }),
  });
  return handle(res);
}

export async function deleteList(id: string) {
  const res = await fetch(`${API_URL}/api/lists/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  return handle(res);
}

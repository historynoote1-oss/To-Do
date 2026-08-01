// ===== المهام الفرعية (Items) =====

import { API_URL, authHeaders, handle } from './core';

export async function addItem(listId: string, content: string, priority?: string) {
  const res = await fetch(`${API_URL}/api/items`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ listId, content, priority }),
  });
  return handle(res);
}

export async function toggleItem(id: string, isDone: boolean) {
  const res = await fetch(`${API_URL}/api/items/${id}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ isDone }),
  });
  return handle(res);
}

export async function updateItemContent(id: string, content: string) {
  const res = await fetch(`${API_URL}/api/items/${id}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ content }),
  });
  return handle(res);
}

export async function updateItemDueDate(id: string, dueDate: string | null) {
  const res = await fetch(`${API_URL}/api/items/${id}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ dueDate }),
  });
  return handle(res);
}

export async function deleteItem(id: string) {
  const res = await fetch(`${API_URL}/api/items/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  return handle(res);
}

// بيحدّث ترتيب أكتر من مهمة فرعية دفعة واحدة (بعد إعادة ترتيب من نافذة
// تعديل المهمة مثلًا) — كل عنصر بياخد position جديد حسب مكانه في المصفوفة.
export async function reorderItems(items: { id: string; position: number }[]) {
  const res = await fetch(`${API_URL}/api/items-reorder`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ items }),
  });
  return handle(res);
}

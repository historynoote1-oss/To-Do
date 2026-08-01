// ===== لوحة التحكم: إدارة المحتوى (قوائم/مهام كل المستخدمين) =====

import { API_URL, authHeaders, handle } from '../core';

export interface AdminListEntry {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  archiveReason: 'COMPLETED' | 'OVERDUE';
  pendingRestoreAt: string | null;
  user: { id: string; username: string };
  _count: { items: number };
}

export interface AdminListsPage {
  lists: AdminListEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function getAdminLists(
  params: { q?: string; status?: 'active' | 'archived' | 'overdue' | ''; page?: number; pageSize?: number } = {}
) {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  if (params.status) qs.set('status', params.status);
  qs.set('page', String(params.page || 1));
  qs.set('pageSize', String(params.pageSize || 20));
  const res = await fetch(`${API_URL}/api/admin/content/lists?${qs.toString()}`, { headers: authHeaders() });
  return handle(res) as Promise<AdminListsPage>;
}

export async function updateAdminList(id: string, title: string) {
  const res = await fetch(`${API_URL}/api/admin/content/lists/${id}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ title }),
  });
  return handle(res);
}

export async function deleteAdminList(id: string, adminPassword: string) {
  const res = await fetch(`${API_URL}/api/admin/content/lists/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
    body: JSON.stringify({ adminPassword }),
  });
  return handle(res);
}

// استرجاع مهمة "متأخرة" اتؤرشفت تلقائيًا — ممنوع على المستخدم نفسه، الأدمن
// بس يقدر يعمله (شوف POST /lists/:id/restore-overdue في routes/adminContent.ts).
export async function restoreAdminOverdueList(id: string, adminPassword: string) {
  const res = await fetch(`${API_URL}/api/admin/content/lists/${id}/restore-overdue`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ adminPassword }),
  });
  return handle(res);
}

export interface AdminItemEntry {
  id: string;
  content: string;
  isDone: boolean;
  priority: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  list: { id: string; title: string; user: { id: string; username: string } };
}

export interface AdminItemsPage {
  items: AdminItemEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function getAdminItems(
  params: { q?: string; priority?: string; status?: 'done' | 'pending' | ''; page?: number; pageSize?: number } = {}
) {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  if (params.priority) qs.set('priority', params.priority);
  if (params.status) qs.set('status', params.status);
  qs.set('page', String(params.page || 1));
  qs.set('pageSize', String(params.pageSize || 20));
  const res = await fetch(`${API_URL}/api/admin/content/items?${qs.toString()}`, { headers: authHeaders() });
  return handle(res) as Promise<AdminItemsPage>;
}

export async function updateAdminItem(
  id: string,
  data: { content?: string; isDone?: boolean; priority?: string; dueDate?: string | null }
) {
  const res = await fetch(`${API_URL}/api/admin/content/items/${id}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  return handle(res);
}

export async function deleteAdminItem(id: string, adminPassword: string) {
  const res = await fetch(`${API_URL}/api/admin/content/items/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
    body: JSON.stringify({ adminPassword }),
  });
  return handle(res);
}

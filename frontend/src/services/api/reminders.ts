// ===== التذكيرات =====

import { API_URL, authHeaders, fetchWithRetry, handle } from './core';

export interface Reminder {
  id: string;
  userId: string;
  listId: string | null;
  itemId: string | null;
  mode: 'CUSTOM' | 'BEFORE_DUE';
  offsetMinutes: number | null;
  remindAt: string;
  message: string | null;
  isSent: boolean;
  sentAt: string | null;
  createdAt: string;
}

export async function getReminders(filter: { listId?: string; itemId?: string }) {
  const params = new URLSearchParams();
  if (filter.itemId) params.set('itemId', filter.itemId);
  else if (filter.listId) params.set('listId', filter.listId);
  const res = await fetch(`${API_URL}/api/reminders?${params.toString()}`, { headers: authHeaders() });
  return handle(res) as Promise<Reminder[]>;
}

export async function getDueReminders() {
  const res = await fetchWithRetry(`${API_URL}/api/reminders/due`, { headers: authHeaders() });
  return handle(res) as Promise<Reminder[]>;
}

export async function createReminder(data: {
  listId?: string;
  itemId?: string;
  mode: 'CUSTOM' | 'BEFORE_DUE';
  remindAt?: string;
  offsetMinutes?: number;
  message?: string;
}) {
  const res = await fetch(`${API_URL}/api/reminders`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  return handle(res) as Promise<Reminder>;
}

export async function updateReminder(
  id: string,
  data: { remindAt?: string; offsetMinutes?: number; message?: string }
) {
  const res = await fetch(`${API_URL}/api/reminders/${id}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  return handle(res) as Promise<Reminder>;
}

export async function deleteReminder(id: string) {
  const res = await fetch(`${API_URL}/api/reminders/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  return handle(res);
}

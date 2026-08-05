// ===== إشعارات الموقع (Inbox) =====

import { API_URL, authHeaders, handle } from './core';

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  source: 'ADMIN' | 'SYSTEM';
  url: string | null;
  isRead: boolean;
  createdAt: string;
}

export async function getNotifications(): Promise<{ notifications: AppNotification[]; unreadCount: number }> {
  const res = await fetch(`${API_URL}/api/notifications`, { headers: authHeaders() });
  return handle(res);
}

export async function markNotificationRead(id: string) {
  const res = await fetch(`${API_URL}/api/notifications/${id}/read`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return handle(res);
}

export async function markAllNotificationsRead() {
  const res = await fetch(`${API_URL}/api/notifications/read-all`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return handle(res);
}

export async function deleteNotification(id: string) {
  const res = await fetch(`${API_URL}/api/notifications/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  return handle(res);
}

export async function sendAdminNotification(data: {
  title: string;
  body: string;
  username?: string;
  adminPassword: string;
}): Promise<{ success: true; count: number }> {
  const res = await fetch(`${API_URL}/api/admin/content/notifications/send`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  return handle(res);
}

// ===== لوحة التحكم: إدارة المستخدمين =====

import { API_URL, authHeaders, handle, notifySessionExpired, SessionExpiredError } from '../core';

export interface AdminUsersPage {
  users: AdminUserEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AdminUserEntry {
  id: string;
  username: string;
  isAdmin: boolean;
  isActive: boolean;
  legacyAccount: boolean;
  mustRehabilitate: boolean;
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  lastLoginUserAgent: string | null;
  failedLoginAttempts: number;
  lockedUntil: string | null;
  createdAt: string;
  _count: { lists: number };
}

export async function getAdminUsers(params: { q?: string; page?: number; pageSize?: number } = {}) {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  qs.set('page', String(params.page || 1));
  qs.set('pageSize', String(params.pageSize || 20));
  const res = await fetch(`${API_URL}/api/admin/users?${qs.toString()}`, { headers: authHeaders() });
  return handle(res) as Promise<AdminUsersPage>;
}

export function exportAdminUsersUrl(q?: string) {
  const qs = new URLSearchParams();
  if (q) qs.set('q', q);
  return `${API_URL}/api/admin/users/export?${qs.toString()}`;
}

export async function downloadAdminUsersCsv(q?: string) {
  const res = await fetch(exportAdminUsersUrl(q), { headers: authHeaders() });
  if (!res.ok) {
    if (res.status === 401) {
      notifySessionExpired();
      throw new SessionExpiredError('انتهت صلاحية جلستك');
    }
    throw new Error('تعذّر تصدير الملف');
  }
  return res.blob();
}

export async function deleteAdminUser(id: string, adminPassword: string) {
  const res = await fetch(`${API_URL}/api/admin/users/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
    body: JSON.stringify({ adminPassword }),
  });
  return handle(res);
}

export async function suspendAdminUser(id: string, adminPassword: string) {
  const res = await fetch(`${API_URL}/api/admin/users/${id}/suspend`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ adminPassword }),
  });
  return handle(res);
}

export async function forceLogoutAdminUser(id: string, adminPassword: string) {
  const res = await fetch(`${API_URL}/api/admin/users/${id}/force-logout`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ adminPassword }),
  });
  return handle(res);
}

export async function resetAdminUserPassword(id: string, adminPassword: string) {
  const res = await fetch(`${API_URL}/api/admin/users/${id}/reset-password`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ adminPassword }),
  });
  return handle(res);
}

export async function unlockAdminUser(id: string, adminPassword: string) {
  const res = await fetch(`${API_URL}/api/admin/users/${id}/unlock`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ adminPassword }),
  });
  return handle(res);
}

export interface AdminAuditLogPage {
  logs: LogEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  availableActions: string[];
}

export interface LogEntry {
  id: string;
  adminUsername: string;
  targetUsername: string | null;
  action: string;
  ip: string | null;
  createdAt: string;
}

export async function getAdminAuditLog(
  params: { adminUsername?: string; action?: string; page?: number; pageSize?: number } = {}
) {
  const qs = new URLSearchParams();
  if (params.adminUsername) qs.set('adminUsername', params.adminUsername);
  if (params.action) qs.set('action', params.action);
  qs.set('page', String(params.page || 1));
  qs.set('pageSize', String(params.pageSize || 50));
  const res = await fetch(`${API_URL}/api/admin/audit-log?${qs.toString()}`, { headers: authHeaders() });
  return handle(res) as Promise<AdminAuditLogPage>;
}

export async function downloadAdminAuditLogCsv(params: { adminUsername?: string; action?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.adminUsername) qs.set('adminUsername', params.adminUsername);
  if (params.action) qs.set('action', params.action);
  const res = await fetch(`${API_URL}/api/admin/audit-log/export?${qs.toString()}`, { headers: authHeaders() });
  if (!res.ok) {
    if (res.status === 401) {
      notifySessionExpired();
      throw new SessionExpiredError('انتهت صلاحية جلستك');
    }
    throw new Error('تعذّر تصدير الملف');
  }
  return res.blob();
}

export async function updateAdminUser(
  id: string,
  data: { username?: string; isAdmin?: boolean },
  adminPassword: string
) {
  const res = await fetch(`${API_URL}/api/admin/users/${id}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ ...data, adminPassword }),
  });
  return handle(res);
}

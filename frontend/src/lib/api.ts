const API_URL = import.meta.env.VITE_API_URL as string;

function getToken() {
  return localStorage.getItem('token');
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${getToken()}`,
  };
}

async function handle(res: Response) {
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `خطأ (${res.status})`);
  }
  return res.json();
}

export async function register(username: string, password: string) {
  const res = await fetch(`${API_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  return handle(res);
}

export async function login(username: string, password: string) {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  return handle(res);
}

// ===== التحقق بخطوتين (2FA) =====

export async function verifyLoginTwoFactor(pendingToken: string, code: string) {
  const res = await fetch(`${API_URL}/api/auth/2fa/verify-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pendingToken, code }),
  });
  return handle(res);
}

export async function getTwoFactorStatus(): Promise<{
  twoFactorEnabled: boolean;
  twoFactorEnabledAt: string | null;
}> {
  const res = await fetch(`${API_URL}/api/auth/2fa/status`, { headers: authHeaders() });
  return handle(res);
}

export async function setupTwoFactor(): Promise<{ secret: string; qrDataUrl: string }> {
  const res = await fetch(`${API_URL}/api/auth/2fa/setup`, { method: 'POST', headers: authHeaders() });
  return handle(res);
}

export async function enableTwoFactor(code: string): Promise<{ success: true; recoveryCodes: string[] }> {
  const res = await fetch(`${API_URL}/api/auth/2fa/enable`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ code }),
  });
  return handle(res);
}

export async function disableTwoFactor(password: string, code: string) {
  const res = await fetch(`${API_URL}/api/auth/2fa/disable`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ password, code }),
  });
  return handle(res);
}

export async function getLists() {
  const res = await fetch(`${API_URL}/api/lists`, { headers: authHeaders() });
  return handle(res);
}

export async function createList(title: string, priority?: string) {
  const res = await fetch(`${API_URL}/api/lists`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ title, priority }),
  });
  return handle(res);
}

export async function updateList(id: string, data: { title?: string; priority?: string }) {
  const res = await fetch(`${API_URL}/api/lists/${id}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(data),
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

export async function updateItemPriority(id: string, priority: string) {
  const res = await fetch(`${API_URL}/api/items/${id}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ priority }),
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

export async function deleteItem(id: string) {
  const res = await fetch(`${API_URL}/api/items/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  return handle(res);
}

export async function getAdminStats() {
  const res = await fetch(`${API_URL}/api/admin/stats`, { headers: authHeaders() });
  return handle(res);
}

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
  if (!res.ok) throw new Error('تعذّر تصدير الملف');
  return res.blob();
}

export async function getAdminUserDetail(id: string) {
  const res = await fetch(`${API_URL}/api/admin/users/${id}`, { headers: authHeaders() });
  return handle(res);
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
  if (!res.ok) throw new Error('تعذّر تصدير الملف');
  return res.blob();
}

export async function getAdminGrowthStats(): Promise<{ days: { date: string; count: number }[] }> {
  const res = await fetch(`${API_URL}/api/admin/stats/growth`, { headers: authHeaders() });
  return handle(res);
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

// ===== لوحة التحكم: التحليلات =====

export type AnalyticsRange = '7d' | '30d' | '90d' | '365d';

export interface TimeseriesPoint {
  date: string;
  count: number;
}

export interface AdminTimeseries {
  range: number;
  users: TimeseriesPoint[];
  itemsCreated: TimeseriesPoint[];
  itemsCompleted: TimeseriesPoint[];
}

export async function getAdminTimeseries(range: AnalyticsRange): Promise<AdminTimeseries> {
  const res = await fetch(`${API_URL}/api/admin/analytics/timeseries?range=${range}`, {
    headers: authHeaders(),
  });
  return handle(res);
}

export interface AdminDistribution {
  priority: { NONE: number; LOW: number; MEDIUM: number; HIGH: number; CRITICAL: number };
  completionRate: number;
  avgItemsPerList: number;
  avgListsPerUser: number;
  emptyLists: number;
  totalItems: number;
  doneItems: number;
  totalLists: number;
  totalUsers: number;
}

export async function getAdminDistribution(): Promise<AdminDistribution> {
  const res = await fetch(`${API_URL}/api/admin/analytics/distribution`, { headers: authHeaders() });
  return handle(res);
}

export interface AdminTopUser {
  id: string;
  username: string;
  createdAt: string;
  lastLoginAt: string | null;
  listsCount: number;
  itemsCount: number;
}

export async function getAdminTopUsers(): Promise<{ users: AdminTopUser[] }> {
  const res = await fetch(`${API_URL}/api/admin/analytics/top-users`, { headers: authHeaders() });
  return handle(res);
}

// ===== لوحة التحكم: إدارة المحتوى (قوائم/مهام كل المستخدمين) =====

export interface AdminListEntry {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
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

export async function getAdminLists(params: { q?: string; page?: number; pageSize?: number } = {}) {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
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

// ===== لوحة التحكم: إعدادات الموقع =====

export interface SiteSettings {
  siteName: string;
  registrationEnabled: string;
  maintenanceMode: string;
  maintenanceMessage: string;
  maxListsPerUser: string;
  maxItemsPerList: string;
  announcementBanner: string;
  [key: string]: string;
}

export async function getAdminSettings(): Promise<{ settings: SiteSettings }> {
  const res = await fetch(`${API_URL}/api/admin/settings`, { headers: authHeaders() });
  return handle(res);
}

export async function updateAdminSettings(settings: Partial<SiteSettings>, adminPassword: string) {
  const res = await fetch(`${API_URL}/api/admin/settings`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ settings, adminPassword }),
  });
  return handle(res) as Promise<{ settings: SiteSettings }>;
}

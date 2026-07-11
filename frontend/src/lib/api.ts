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

export async function createList(title: string) {
  const res = await fetch(`${API_URL}/api/lists`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ title }),
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

export async function addItem(listId: string, content: string) {
  const res = await fetch(`${API_URL}/api/items`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ listId, content }),
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

// ===== Updates (سجل التحديثات) =====

export interface UpdateEntry {
  id: string;
  version: string | null;
  emoji: string;
  title: string;
  features: string[];
  howToTitle: string | null;
  howToSteps: string[];
  authorName: string;
  pinned: boolean;
  isPublished?: boolean;
  publishedAt: string;
}

export interface UpdatesCursor {
  cursorId: string;
  cursorDate: string;
}

export interface UpdatesPage {
  items: UpdateEntry[];
  nextCursor: UpdatesCursor | null;
}

export async function getPinnedUpdates(): Promise<UpdateEntry[]> {
  const res = await fetch(`${API_URL}/api/updates/pinned`);
  return handle(res);
}

export async function getUpdates(params: {
  q?: string;
  limit?: number;
  cursor?: UpdatesCursor | null;
}): Promise<UpdatesPage> {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.cursor) {
    qs.set('cursorId', params.cursor.cursorId);
    qs.set('cursorDate', params.cursor.cursorDate);
  }
  const res = await fetch(`${API_URL}/api/updates?${qs.toString()}`);
  return handle(res);
}

// ===== Admin: إدارة التحديثات =====

export interface AdminUpdateEntry extends UpdateEntry {
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUpdatesPage {
  items: AdminUpdateEntry[];
  nextCursor: UpdatesCursor | null;
}

export async function getAdminUpdates(params: {
  q?: string;
  status?: 'all' | 'published' | 'draft' | 'pinned';
  limit?: number;
  cursor?: UpdatesCursor | null;
}): Promise<AdminUpdatesPage> {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  if (params.status) qs.set('status', params.status);
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.cursor) {
    qs.set('cursorId', params.cursor.cursorId);
    qs.set('cursorDate', params.cursor.cursorDate);
  }
  const res = await fetch(`${API_URL}/api/admin/updates?${qs.toString()}`, { headers: authHeaders() });
  return handle(res);
}

export async function getAdminUpdatesStats() {
  const res = await fetch(`${API_URL}/api/admin/updates/stats`, { headers: authHeaders() });
  return handle(res);
}

export interface UpdateFormData {
  version?: string | null;
  emoji?: string;
  title: string;
  features?: string[];
  howToTitle?: string | null;
  howToSteps?: string[];
  authorName?: string;
  pinned?: boolean;
  isPublished?: boolean;
  publishedAt?: string;
}

export async function createAdminUpdate(data: UpdateFormData): Promise<AdminUpdateEntry> {
  const res = await fetch(`${API_URL}/api/admin/updates`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  return handle(res);
}

export async function updateAdminUpdate(id: string, data: Partial<UpdateFormData>): Promise<AdminUpdateEntry> {
  const res = await fetch(`${API_URL}/api/admin/updates/${id}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  return handle(res);
}

export async function togglePinAdminUpdate(id: string): Promise<AdminUpdateEntry> {
  const res = await fetch(`${API_URL}/api/admin/updates/${id}/pin`, {
    method: 'PATCH',
    headers: authHeaders(),
  });
  return handle(res);
}

export async function togglePublishAdminUpdate(id: string): Promise<AdminUpdateEntry> {
  const res = await fetch(`${API_URL}/api/admin/updates/${id}/publish`, {
    method: 'PATCH',
    headers: authHeaders(),
  });
  return handle(res);
}

export async function deleteAdminUpdate(id: string, adminPassword: string) {
  const res = await fetch(`${API_URL}/api/admin/updates/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
    body: JSON.stringify({ adminPassword }),
  });
  return handle(res);
}

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

export async function getAdminUsers() {
  const res = await fetch(`${API_URL}/api/admin/users`, { headers: authHeaders() });
  return handle(res);
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

export async function getAdminAuditLog() {
  const res = await fetch(`${API_URL}/api/admin/audit-log`, { headers: authHeaders() });
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

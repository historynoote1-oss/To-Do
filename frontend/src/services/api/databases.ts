// ===== قواعد البيانات المخصصة (Databases) — المرحلة 1: View جدول واحد =====

import { API_URL, authHeaders, fetchWithRetry, handle } from './core';

export type DatabasePropertyType = 'text' | 'number' | 'select' | 'multiSelect' | 'date' | 'checkbox' | 'relation';

export interface DatabasePropertyOption {
  value: string;
  color: string;
}

export interface DatabaseProperty {
  id: string;
  name: string;
  type: DatabasePropertyType;
  options: DatabasePropertyOption[];
  position: number;
  // ===== المرحلة 4: Relations بين قواعد بيانات مختلفة =====
  // لخصائص من نوع relation بس — القاعدة الهدف اللي الخاصية دي بتربط بصفوفها.
  relatedDatabaseId: string | null;
  relatedDatabaseName: string | null;
  relatedDatabaseIcon: string | null;
  relatedDatabaseColor: string | null;
}

export type DatabaseViewType = 'table' | 'board';

export interface DatabaseSummary {
  id: string;
  name: string;
  icon: string | null;
  color: string;
  lifeAreaId: string | null;
  position: number;
  // نوع العرض الافتراضي (جدول أو كانبان) وخاصية التجميع لو كانبان — المرحلة 2.
  viewType: DatabaseViewType;
  boardGroupById: string | null;
  createdAt: string;
  updatedAt: string;
  properties: DatabaseProperty[];
}

export interface DatabaseLinkedTask {
  id: string;
  title: string;
  confirmedDone: boolean;
  archivedAt: string | null;
}

export interface DatabaseRow {
  id: string;
  position: number;
  createdAt: string;
  updatedAt: string;
  // خرائط propertyId -> قيمته لهذا الصف (undefined/null يعني الخانة فاضية)
  values: Record<string, unknown>;
  // المرحلة 3: المهمة الفعلية اللي الصف ده اتحول ليها، لو فيه
  linkedTask: DatabaseLinkedTask | null;
  // المرحلة 4: عنوان مختصر متولّد تلقائيًا من قيم الصف — مستخدم في عرض
  // الصفوف المرتبطة (relation) في قواعد بيانات تانية.
  label?: string;
}

export interface DatabaseDetail extends DatabaseSummary {
  rows: DatabaseRow[];
}

export async function getDatabases(lifeAreaId?: string): Promise<DatabaseSummary[]> {
  const query = lifeAreaId ? `?lifeAreaId=${encodeURIComponent(lifeAreaId)}` : '';
  const res = await fetchWithRetry(`${API_URL}/api/databases${query}`, { headers: authHeaders() });
  return handle(res);
}

export async function getDatabase(id: string): Promise<DatabaseDetail> {
  const res = await fetchWithRetry(`${API_URL}/api/databases/${id}`, { headers: authHeaders() });
  return handle(res);
}

export async function createDatabase(data: { name: string; icon?: string | null; color?: string; lifeAreaId?: string | null }): Promise<DatabaseSummary> {
  const res = await fetch(`${API_URL}/api/databases`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  return handle(res);
}

export async function updateDatabase(
  id: string,
  data: {
    name?: string;
    icon?: string | null;
    color?: string;
    lifeAreaId?: string | null;
    viewType?: DatabaseViewType;
    boardGroupById?: string | null;
  }
): Promise<DatabaseSummary> {
  const res = await fetch(`${API_URL}/api/databases/${id}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  return handle(res);
}

export async function deleteDatabase(id: string) {
  const res = await fetch(`${API_URL}/api/databases/${id}`, { method: 'DELETE', headers: authHeaders() });
  return handle(res);
}

export async function addProperty(
  databaseId: string,
  data: { name: string; type: DatabasePropertyType; options?: DatabasePropertyOption[]; relatedDatabaseId?: string }
): Promise<DatabaseProperty> {
  const res = await fetch(`${API_URL}/api/databases/${databaseId}/properties`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  return handle(res);
}

export async function updateProperty(
  databaseId: string,
  propertyId: string,
  data: { name?: string; options?: DatabasePropertyOption[] }
): Promise<DatabaseProperty> {
  const res = await fetch(`${API_URL}/api/databases/${databaseId}/properties/${propertyId}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  return handle(res);
}

export async function deleteProperty(databaseId: string, propertyId: string) {
  const res = await fetch(`${API_URL}/api/databases/${databaseId}/properties/${propertyId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  return handle(res);
}

export async function reorderProperties(databaseId: string, orderedIds: string[]) {
  const res = await fetch(`${API_URL}/api/databases/${databaseId}/properties/reorder`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ orderedIds }),
  });
  return handle(res);
}

export async function addRow(databaseId: string, values: Record<string, unknown> = {}): Promise<DatabaseRow> {
  const res = await fetch(`${API_URL}/api/databases/${databaseId}/rows`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ values }),
  });
  return handle(res);
}

export async function updateRow(databaseId: string, rowId: string, values: Record<string, unknown>): Promise<DatabaseRow> {
  const res = await fetch(`${API_URL}/api/databases/${databaseId}/rows/${rowId}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ values }),
  });
  return handle(res);
}

export async function deleteRow(databaseId: string, rowId: string) {
  const res = await fetch(`${API_URL}/api/databases/${databaseId}/rows/${rowId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  return handle(res);
}

export async function reorderRows(databaseId: string, orderedIds: string[]) {
  const res = await fetch(`${API_URL}/api/databases/${databaseId}/rows/reorder`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ orderedIds }),
  });
  return handle(res);
}

// ===== المرحلة 3: تحويل صف لمهمة فعلية / فك الربط =====
export async function convertRowToTask(databaseId: string, rowId: string): Promise<DatabaseRow> {
  const res = await fetch(`${API_URL}/api/databases/${databaseId}/rows/${rowId}/convert-to-task`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return handle(res);
}

export async function unlinkRowTask(databaseId: string, rowId: string): Promise<DatabaseRow> {
  const res = await fetch(`${API_URL}/api/databases/${databaseId}/rows/${rowId}/unlink-task`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return handle(res);
}

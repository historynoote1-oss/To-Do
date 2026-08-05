// ===== قواعد البيانات المخصصة (Databases) — المرحلة 1: View جدول واحد =====

import { API_URL, authHeaders, fetchWithRetry, handle } from './core';

export type DatabasePropertyType =
  | 'text'
  | 'number'
  | 'select'
  | 'multiSelect'
  | 'date'
  | 'checkbox'
  | 'relation'
  | 'rollup';

export interface DatabasePropertyOption {
  value: string;
  color: string;
}

// ===== المرحلة 5: إعدادات خاصية Rollup =====
export type RollupAggregation = 'count' | 'sum' | 'average' | 'min' | 'max' | 'showValues';

export interface RollupConfig {
  relationPropertyId: string;
  targetPropertyId: string | null;
  aggregation: RollupAggregation;
}

export interface DatabaseProperty {
  id: string;
  name: string;
  type: DatabasePropertyType;
  options: DatabasePropertyOption[];
  rollupConfig: RollupConfig | null;
  position: number;
  // ===== المرحلة 4: Relations بين قواعد بيانات مختلفة =====
  // لخصائص من نوع relation بس — القاعدة الهدف اللي الخاصية دي بتربط بصفوفها.
  relatedDatabaseId: string | null;
  relatedDatabaseName: string | null;
  relatedDatabaseIcon: string | null;
  relatedDatabaseColor: string | null;
}

export type DatabaseViewType = 'table' | 'board' | 'calendar';

// ===== المرحلة 5: Views متعددة محفوظة =====
export type FilterOperator =
  | 'contains'
  | 'equals'
  | 'notEquals'
  | 'isEmpty'
  | 'isNotEmpty'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'before'
  | 'after';

export interface DatabaseFilter {
  propertyId: string;
  operator: FilterOperator;
  value?: unknown;
}

export interface DatabaseSort {
  propertyId: string;
  direction: 'asc' | 'desc';
}

export interface DatabaseSavedView {
  id: string;
  name: string;
  type: DatabaseViewType;
  boardGroupById: string | null;
  calendarDateById: string | null;
  filters: DatabaseFilter[];
  sorts: DatabaseSort[];
  position: number;
}

export interface DatabaseSummary {
  id: string;
  name: string;
  icon: string | null;
  color: string;
  lifeAreaId: string | null;
  position: number;
  // نوع العرض الافتراضي (جدول أو كانبان) وخاصية التجميع لو كانبان — المرحلة 2.
  // (لسه موجودين لأسباب توافق قديمة؛ المصدر الحقيقي دلوقتي هو الـ views)
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
  // ===== المرحلة 5: الربط ثنائي الاتجاه — مين بيشاور على الصف ده من قواعد
  // بيانات تانية (read-only، القيمة الحقيقية متخزنة في القاعدة المصدر) =====
  reverseRelations: DatabaseReverseRelation[];
}

export interface DatabaseReverseRelation {
  propertyId: string;
  propertyName: string;
  sourceDatabaseId: string;
  sourceDatabaseName: string;
  rows: { id: string; label?: string }[];
}

export interface DatabaseReverseRelationDescriptor {
  propertyId: string;
  propertyName: string;
  sourceDatabaseId: string;
  sourceDatabaseName: string;
  sourceDatabaseIcon: string | null;
  sourceDatabaseColor: string | null;
}

export interface DatabaseDetail extends DatabaseSummary {
  rows: DatabaseRow[];
  reverseRelationDescriptors: DatabaseReverseRelationDescriptor[];
  views: DatabaseSavedView[];
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
  data: {
    name: string;
    type: DatabasePropertyType;
    options?: DatabasePropertyOption[];
    relatedDatabaseId?: string;
    rollupConfig?: RollupConfig;
  }
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
  data: { name?: string; options?: DatabasePropertyOption[]; rollupConfig?: RollupConfig }
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

// ===================================================================
// ===== المرحلة 5: Views متعددة محفوظة (Table/Board/Calendar) =====
// ===================================================================

export async function getViews(databaseId: string): Promise<DatabaseSavedView[]> {
  const res = await fetchWithRetry(`${API_URL}/api/databases/${databaseId}/views`, { headers: authHeaders() });
  return handle(res);
}

export async function createView(databaseId: string, data: { name: string; type: DatabaseViewType }): Promise<DatabaseSavedView> {
  const res = await fetch(`${API_URL}/api/databases/${databaseId}/views`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  return handle(res);
}

export async function updateView(
  databaseId: string,
  viewId: string,
  data: {
    name?: string;
    type?: DatabaseViewType;
    boardGroupById?: string | null;
    calendarDateById?: string | null;
    filters?: DatabaseFilter[];
    sorts?: DatabaseSort[];
  }
): Promise<DatabaseSavedView> {
  const res = await fetch(`${API_URL}/api/databases/${databaseId}/views/${viewId}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  return handle(res);
}

export async function deleteView(databaseId: string, viewId: string) {
  const res = await fetch(`${API_URL}/api/databases/${databaseId}/views/${viewId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  return handle(res);
}

export async function reorderViews(databaseId: string, orderedIds: string[]) {
  const res = await fetch(`${API_URL}/api/databases/${databaseId}/views/reorder`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ orderedIds }),
  });
  return handle(res);
}

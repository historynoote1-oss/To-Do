// ===== لوحة التحكم: التحليلات =====

import { API_URL, authHeaders, handle } from '../core';

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

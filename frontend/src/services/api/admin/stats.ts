// ===== لوحة التحكم: نظرة عامة =====

import { API_URL, authHeaders, handle } from '../core';

export async function getAdminStats() {
  const res = await fetch(`${API_URL}/api/admin/stats`, { headers: authHeaders() });
  return handle(res);
}

export async function getAdminGrowthStats(): Promise<{ days: { date: string; count: number }[] }> {
  const res = await fetch(`${API_URL}/api/admin/stats/growth`, { headers: authHeaders() });
  return handle(res);
}

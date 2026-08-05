// ===== الاستريك (أيام الإنجاز المتتالية) =====

import { API_URL, authHeaders, fetchWithRetry, handle, localDateKey } from './core';

export async function getStreak(): Promise<{ current: number }> {
  const res = await fetchWithRetry(`${API_URL}/api/streak?date=${localDateKey()}`, { headers: authHeaders() });
  return handle(res);
}

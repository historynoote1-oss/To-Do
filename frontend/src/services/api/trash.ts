// ===== سلة المحذوفات المؤقتة (Trash) — حذف سنة كاملة من خريطة الأهداف =====

import { API_URL, authHeaders, handle } from './core';

export interface TrashedYear {
  year: number;
  trashedAt: string;
  expiresAt: string;
  daysLeft: number;
  totalGoals: number;
  counts: { YEARLY: number; MONTHLY: number; WEEKLY: number; DAILY: number };
}

export async function getTrash(): Promise<TrashedYear[]> {
  const res = await fetch(`${API_URL}/api/trash`, { headers: authHeaders() });
  return handle(res);
}

export async function trashYear(year: number) {
  const res = await fetch(`${API_URL}/api/trash/years/${year}`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return handle(res);
}

export async function restoreTrashedYear(year: number) {
  const res = await fetch(`${API_URL}/api/trash/years/${year}/restore`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return handle(res);
}

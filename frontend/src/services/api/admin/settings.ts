// ===== لوحة التحكم: إعدادات الموقع =====

import { API_URL, authHeaders, handle } from '../core';

export interface SiteSettings {
  siteName: string;
  registrationEnabled: string;
  maintenanceMode: string;
  maintenanceMessage: string;
  maintenanceEmoji: string;
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

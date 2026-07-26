// ===== حالة الموقع العامة (وضع الصيانة) =====

import { API_URL, handle } from './core';

export interface SiteStatus {
  siteName: string;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  maintenanceEmoji: string;
  registrationEnabled: boolean;
  announcementBanner: string;
}

export async function getSiteStatus(): Promise<SiteStatus> {
  const res = await fetch(`${API_URL}/api/site/status`);
  return handle(res, false);
}

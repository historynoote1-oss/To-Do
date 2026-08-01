// ===== الملف الشخصي =====

import { API_URL, authHeaders, authHeadersNoContentType, handle } from './core';

export interface ProfileData {
  username: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  legacyAccount: boolean;
}

// صور الأفتار بترجع من السيرفر كمسار نسبي (مثلًا /uploads/avatars/xxx.jpg)،
// فلازم نضيف رابط السيرفر نفسه قبلها عشان نقدر نعرضها في <img>.
export function resolveAvatarUrl(avatarUrl: string | null | undefined): string | null {
  if (!avatarUrl) return null;
  if (/^https?:\/\//.test(avatarUrl)) return avatarUrl;
  return `${API_URL}${avatarUrl}`;
}

export interface ProfileStats {
  totalLists: number;
  completedLists: number;
  totalItems: number;
  doneItems: number;
  completionRate: number;
  priority: { NONE: number; LOW: number; MEDIUM: number; HIGH: number; CRITICAL: number };
}

export interface ProfileResponse {
  profile: ProfileData;
  stats: ProfileStats;
}

export async function getProfile(): Promise<ProfileResponse> {
  const res = await fetch(`${API_URL}/api/profile`, { headers: authHeaders() });
  return handle(res);
}

export async function updateProfile(data: {
  displayName?: string | null;
  bio?: string | null;
}): Promise<{ profile: ProfileData }> {
  const res = await fetch(`${API_URL}/api/profile`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  return handle(res);
}

// بيرفع صورة الأفتار الجديدة كـ multipart/form-data ويرجع الملف الشخصي
// محدّث بمسار الصورة الجديدة.
export async function uploadAvatar(file: File): Promise<{ profile: ProfileData }> {
  const formData = new FormData();
  formData.append('avatar', file);
  const res = await fetch(`${API_URL}/api/profile/avatar`, {
    method: 'POST',
    headers: authHeadersNoContentType(),
    body: formData,
  });
  return handle(res);
}

// بيشيل صورة الأفتار الحالية ويرجّع العرض لحرف اسمك الأول بدلها.
export async function removeAvatar(): Promise<{ profile: ProfileData }> {
  const res = await fetch(`${API_URL}/api/profile/avatar`, {
    method: 'DELETE',
    headers: authHeadersNoContentType(),
  });
  return handle(res);
}

export async function changeOwnPassword(
  currentPassword: string,
  newPassword: string,
  confirmNewPassword: string
): Promise<{ token: string; message: string }> {
  const res = await fetch(`${API_URL}/api/profile/change-password`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ currentPassword, newPassword, confirmNewPassword }),
  });
  return handle(res);
}

export async function regenerateOwnRecoveryCode(currentPassword: string): Promise<{ recoveryCode: string }> {
  const res = await fetch(`${API_URL}/api/profile/regenerate-recovery-code`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ currentPassword }),
  });
  return handle(res);
}

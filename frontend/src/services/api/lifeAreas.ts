// ===== مجالات الحياة (Life Areas) =====

import { LifeAreaData } from '@/utils/lifeArea';
import { API_URL, authHeaders, authHeadersNoContentType, fetchWithRetry, handle } from './core';

export async function getLifeAreas(): Promise<LifeAreaData[]> {
  const res = await fetchWithRetry(`${API_URL}/api/life-areas`, { headers: authHeaders() });
  return handle(res);
}

export async function createLifeArea(data: {
  name: string;
  color?: string;
  icon?: string | null;
  // parentId: مررها لو المجال الجديد ده مجال فرعي تابع لمجال موجود —
  // سيبها من غير تحديد (أو null) عشان يتنشئ كمجال جذري.
  parentId?: string | null;
}): Promise<LifeAreaData> {
  const res = await fetch(`${API_URL}/api/life-areas`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  return handle(res);
}

export async function updateLifeArea(
  id: string,
  data: { name?: string; color?: string; icon?: string | null; parentId?: string | null }
): Promise<LifeAreaData> {
  const res = await fetch(`${API_URL}/api/life-areas/${id}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  return handle(res);
}

export async function deleteLifeArea(id: string) {
  const res = await fetch(`${API_URL}/api/life-areas/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  return handle(res);
}

// orderedIds: كل الإخوة (نفس parentId) بالترتيب الجديد الكامل. parentId:
// null (أو تسيبها) لإعادة ترتيب المجالات الجذرية، أو ID مجال أب لإعادة
// ترتيب فروعه المباشرة بس.
export async function reorderLifeAreas(orderedIds: string[], parentId: string | null = null) {
  const res = await fetch(`${API_URL}/api/life-areas/reorder`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ orderedIds, parentId }),
  });
  return handle(res);
}

// بيرفع صورة أيقونة مخصصة لمجال حياة كـ multipart/form-data.
export async function uploadLifeAreaIcon(id: string, file: File): Promise<LifeAreaData> {
  const formData = new FormData();
  formData.append('icon', file);
  const res = await fetch(`${API_URL}/api/life-areas/${id}/icon-image`, {
    method: 'POST',
    headers: authHeadersNoContentType(),
    body: formData,
  });
  return handle(res);
}

export async function removeLifeAreaIcon(id: string): Promise<LifeAreaData> {
  const res = await fetch(`${API_URL}/api/life-areas/${id}/icon-image`, {
    method: 'DELETE',
    headers: authHeadersNoContentType(),
  });
  return handle(res);
}

// صور أيقونات المجالات بترجع من السيرفر كمسار نسبي زي الأفتار بالظبط.
export function resolveLifeAreaImageUrl(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null;
  if (/^https?:\/\//.test(imageUrl)) return imageUrl;
  return `${API_URL}${imageUrl}`;
}

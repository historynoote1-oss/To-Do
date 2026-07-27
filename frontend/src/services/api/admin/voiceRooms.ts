// ===== لوحة التحكم: إدارة الغرف الصوتية =====

import { API_URL, authHeaders, handle } from '../core';

export interface VoiceRoomMemberEntry {
  userId: string;
  username: string;
  grantedByUsername: string | null;
  createdAt: string;
  role: 'member' | 'moderator' | 'admin';
  isMuted: boolean;
  isBanned: boolean;
}

export interface AdminVoiceRoomEntry {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  chatLocked: boolean;
  members: VoiceRoomMemberEntry[];
}

export async function getAdminVoiceRooms(): Promise<AdminVoiceRoomEntry[]> {
  const res = await fetch(`${API_URL}/api/admin/voice-rooms`, { headers: authHeaders() });
  const data = await handle(res);
  return data.rooms;
}

export async function createAdminVoiceRoom(name: string, description?: string): Promise<AdminVoiceRoomEntry> {
  const res = await fetch(`${API_URL}/api/admin/voice-rooms`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ name, description }),
  });
  const data = await handle(res);
  return data.room;
}

export async function updateAdminVoiceRoom(
  roomId: string,
  patch: { name?: string; description?: string },
): Promise<{ id: string; name: string; description: string | null }> {
  const res = await fetch(`${API_URL}/api/admin/voice-rooms/${roomId}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(patch),
  });
  const data = await handle(res);
  return data.room;
}

export async function deleteAdminVoiceRoom(roomId: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/admin/voice-rooms/${roomId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  await handle(res);
}

export async function grantVoiceRoomAccess(roomId: string, username: string): Promise<VoiceRoomMemberEntry> {
  const res = await fetch(`${API_URL}/api/admin/voice-rooms/${roomId}/access`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ username }),
  });
  const data = await handle(res);
  return data.access;
}

export async function revokeVoiceRoomAccess(roomId: string, userId: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/admin/voice-rooms/${roomId}/access/${userId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  await handle(res);
}

// "طرد" — فصل حي بس، من غير سحب الصلاحية (يقدر يرجع يدخل على طول).
export async function kickVoiceRoomMember(roomId: string, userId: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/admin/voice-rooms/${roomId}/access/${userId}/kick`, {
    method: 'POST',
    headers: authHeaders(),
  });
  await handle(res);
}

// "حظر" — أدوم، بيتسجّل في القاعدة ومايقدرش يرجع لحد ما يتفك عنه صراحة.
export async function setVoiceRoomMemberBanned(roomId: string, userId: string, banned: boolean): Promise<void> {
  const res = await fetch(`${API_URL}/api/admin/voice-rooms/${roomId}/access/${userId}/ban`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ banned }),
  });
  await handle(res);
}

// كتم/فك كتم عضو في شات الغرفة دي بس.
export async function setVoiceRoomMemberMuted(roomId: string, userId: string, muted: boolean): Promise<void> {
  const res = await fetch(`${API_URL}/api/admin/voice-rooms/${roomId}/access/${userId}/mute`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ muted }),
  });
  await handle(res);
}

// ترقية/تنزيل دور عضو جوه الغرفة دي (member / moderator / admin).
export async function setVoiceRoomMemberRole(
  roomId: string,
  userId: string,
  role: 'member' | 'moderator' | 'admin',
): Promise<void> {
  const res = await fetch(`${API_URL}/api/admin/voice-rooms/${roomId}/access/${userId}/role`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ role }),
  });
  await handle(res);
}

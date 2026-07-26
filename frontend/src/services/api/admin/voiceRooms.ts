// ===== لوحة التحكم: إدارة الغرف الصوتية =====

import { API_URL, authHeaders, handle } from '../core';

export interface VoiceRoomMemberEntry {
  userId: string;
  username: string;
  grantedByUsername: string | null;
  createdAt: string;
}

export interface AdminVoiceRoomEntry {
  id: string;
  name: string;
  createdAt: string;
  members: VoiceRoomMemberEntry[];
}

export async function getAdminVoiceRooms(): Promise<AdminVoiceRoomEntry[]> {
  const res = await fetch(`${API_URL}/api/admin/voice-rooms`, { headers: authHeaders() });
  const data = await handle(res);
  return data.rooms;
}

export async function createAdminVoiceRoom(name: string): Promise<AdminVoiceRoomEntry> {
  const res = await fetch(`${API_URL}/api/admin/voice-rooms`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ name }),
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

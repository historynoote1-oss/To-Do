// ===== الغرف الصوتية — طلبات المستخدم العادي =====
// قائمة الغرف بس (بيانات ثابتة/نادرة التغيير) بتيجي من هنا عن طريق REST.
// كل حاجة "حيّة" (شات، أعضاء متواجدين، تلاوة شغّالة) بتيجي عن طريق
// الـ socket مباشرة (شوف hooks/voiceRoomSocket.tsx)، مش من هنا.

import { API_URL, authHeaders, handle } from './core';

export interface VoiceRoomSummary {
  id: string;
  name: string;
  createdAt: string;
}

export async function getVoiceRooms(): Promise<VoiceRoomSummary[]> {
  const res = await fetch(`${API_URL}/api/voice-rooms`, { headers: authHeaders() });
  const data = await handle(res);
  return data.rooms;
}

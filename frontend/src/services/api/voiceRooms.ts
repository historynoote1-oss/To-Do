// ===== الغرف الصوتية — طلبات المستخدم العادي =====
// قائمة الغرف بس (بيانات ثابتة/نادرة التغيير) بتيجي من هنا عن طريق REST.
// كل حاجة "حيّة" (شات، أعضاء متواجدين، تلاوة شغّالة) بتيجي عن طريق
// الـ socket مباشرة (شوف hooks/voiceRoomSocket.tsx)، مش من هنا.

import { API_URL, authHeaders, handle } from './core';
import type { VoiceRoomMember } from '@/hooks/voiceRoomSocket';

export interface VoiceRoomSummary {
  id: string;
  name: string;
  createdAt: string;
  // لقطة (snapshot) من الأعضاء المتواجدين فعليًا وقت تحميل القائمة — بتتحدّث
  // حيًا بعد كده عن طريق useVoiceRoomsPreview (اشتراك socket على الغرفة من
  // غير ما ننضم ليها فعليًا).
  members: VoiceRoomMember[];
}

export async function getVoiceRooms(): Promise<VoiceRoomSummary[]> {
  const res = await fetch(`${API_URL}/api/voice-rooms`, { headers: authHeaders() });
  const data = await handle(res);
  return data.rooms;
}

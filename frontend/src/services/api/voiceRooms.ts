// ===== الغرف الصوتية — طلبات المستخدم العادي =====
// قائمة الغرف بس (بيانات ثابتة/نادرة التغيير) بتيجي من هنا عن طريق REST.
// كل حاجة "حيّة" (شات، أعضاء متواجدين، تلاوة شغّالة) بتيجي عن طريق
// الـ socket مباشرة (شوف hooks/voiceRoomSocket.tsx)، مش من هنا.

import { API_URL, authHeaders, authHeadersNoContentType, handle } from './core';
import type { VoiceRoomMember } from '@/hooks/voiceRoomSocket';

export interface VoiceRoomSummary {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  // لقطة (snapshot) من الأعضاء المتواجدين فعليًا وقت تحميل القائمة — بتتحدّث
  // حيًا بعد كده عن طريق useVoiceRoomsPreview (اشتراك socket على الغرفة من
  // غير ما ننضم ليها فعليًا).
  members: VoiceRoomMember[];
  // لحظة أول ما دخل عضو الغرفة وهي فاضية — بيتستخدم يعرض عدّاد "شغالة من
  // قد إيه" فوق الغرفة، ويختفي (null) لو الغرفة فاضية دلوقتي.
  sessionStartedAtMs: number | null;
}

export async function getVoiceRooms(): Promise<VoiceRoomSummary[]> {
  const res = await fetch(`${API_URL}/api/voice-rooms`, { headers: authHeaders() });
  const data = await handle(res);
  return data.rooms;
}

export interface VoiceRoomAttachment {
  url: string;
  type: 'image' | 'video' | 'audio' | 'file';
  name: string | null;
  mime: string | null;
  size: number | null;
}

// رفع مرفق (صورة/فيديو/رسالة صوتية/ملف) عشان يتبعت بعدين في شات الغرفة عن
// طريق الـ socket (شوف hooks/voiceRoomSession.tsx -> sendAttachment).
export async function uploadVoiceRoomAttachment(roomId: string, file: File): Promise<VoiceRoomAttachment> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_URL}/api/voice-rooms/${roomId}/attachments`, {
    method: 'POST',
    headers: authHeadersNoContentType(),
    body: form,
  });
  const data = await handle(res);
  return data.attachment;
}

// ===== ملف توافق قديم =====
// المنطق الفعلي اتنقل لـ hooks/voiceRoomSession.tsx (جلسة مركزية بتفضل
// شغالة حتى لو المستخدم اتنقّل بين صفحات الموقع — شوف الشرح هناك). الملف
// ده بقى مجرد إعادة تصدير عشان أي ملفات قديمة بتستورد الأنواع (types) من
// هنا تفضل شغالة من غير ما نضطر نعدّل كل مكان بيستوردها.
export type {
  VoiceRoomMessage,
  VoiceRoomMember,
  VoiceRoomPlayback,
} from '@/hooks/voiceRoomSession';
export { useVoiceRoomsPreview } from '@/hooks/voiceRoomSession';

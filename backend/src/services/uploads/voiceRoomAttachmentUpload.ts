import fs from 'fs';
import path from 'path';
import multer from 'multer';

// ============================================================================
// مرفقات شات الغرف الصوتية (صور / فيديوهات / رسائل صوتية / ملفات عامة)
// ----------------------------------------------------------------------------
// تخزين محلي بسيط على القرص (زي أفتار المستخدم قبل ما يتفعّل Cloudinary).
// كل مرفق بيتحفظ باسم فريد (roomId-timestamp-random) عشان منعرفش نخمّن
// أسامي ملفات بعض، وبيتقدّم لاحقًا كـ static file تحت /uploads/voice-room-attachments.
// ============================================================================

export const VOICE_ROOM_ATTACHMENT_DIR = path.join(process.cwd(), 'uploads', 'voice-room-attachments');
fs.mkdirSync(VOICE_ROOM_ATTACHMENT_DIR, { recursive: true });

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25 ميجابايت

const ALLOWED_MIME_PREFIXES = ['image/', 'video/', 'audio/'];
// امتدادات مسموحة لأي نوع ملف عام تاني (مستندات مثلًا)
const ALLOWED_GENERIC_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/zip',
  'text/plain',
]);

function fileFilter(_req: unknown, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  const isMediaType = ALLOWED_MIME_PREFIXES.some((prefix) => file.mimetype.startsWith(prefix));
  if (isMediaType || ALLOWED_GENERIC_MIME.has(file.mimetype)) {
    cb(null, true);
    return;
  }
  cb(new Error('نوع الملف ده مش مدعوم'));
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, VOICE_ROOM_ATTACHMENT_DIR),
  filename: (req: any, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    const uniqueName = `${req.params.roomId || 'room'}-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
    cb(null, uniqueName);
  },
});

export const voiceRoomAttachmentUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_ATTACHMENT_BYTES },
}).single('file');

// بيحدد نوع المرفق العام (اللي هيتحط في VoiceRoomMessage.attachmentType) من
// الـ mimetype بتاعه، عشان الواجهة تعرف تعرضه إزاي (صورة/فيديو/صوت/ملف).
export function resolveAttachmentType(mimetype: string): 'image' | 'video' | 'audio' | 'file' {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  if (mimetype.startsWith('audio/')) return 'audio';
  return 'file';
}

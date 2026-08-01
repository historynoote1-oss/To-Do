import { Router } from 'express';
import multer from 'multer';
import { prisma } from '../config/prisma';
import { AuthRequest } from '../middleware/verifyUser';
import { getRoomMembersSnapshot, getRoomSessionStart } from '../realtime/voiceRooms';
import { voiceRoomAttachmentUpload, resolveAttachmentType } from '../services/uploads/voiceRoomAttachmentUpload';

const router = Router();

// قائمة الغرف الصوتية اللي المستخدم الحالي عنده صلاحية دخول ليها (الأدمن
// بيشوف كل الغرف مباشرة من غير الحاجة لصف VoiceRoomAccess). بيترجع كمان
// "لقطة" من الأعضاء المتواجدين فعليًا دلوقتي في كل غرفة (زي قايمة الأعضاء
// اللي بتظهر تحت الروم الصوتي في ديسكورد من برا قبل ما تدخله) — التحديث
// الحي بعد كده بييجي عن طريق الـ socket (شوف realtime/voiceRooms.ts).
router.get('/', async (req: AuthRequest, res) => {
  const rooms = req.isAdmin
    ? await prisma.voiceRoom.findMany({ orderBy: { createdAt: 'desc' } })
    : await prisma.voiceRoom.findMany({
        where: { access: { some: { userId: req.userId } } },
        orderBy: { createdAt: 'desc' },
      });

  res.json({
    rooms: rooms.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description || null,
      createdAt: r.createdAt,
      maxMembers: r.maxMembers,
      members: getRoomMembersSnapshot(r.id),
      sessionStartedAtMs: getRoomSessionStart(r.id),
    })),
  });
});

// رفع مرفق (صورة/فيديو/رسالة صوتية/ملف) عشان يتبعت في شات غرفة صوتية.
// لازم يكون معاه صلاحية دخول الغرفة دي (أو يبقى أدمن). بيرجّع رابط الملف
// وبيانات كافية عشان الفرونت إند يبعتها مع الرسالة عن طريق الـ socket.
router.post('/:roomId/attachments', async (req: AuthRequest, res) => {
  const room = await prisma.voiceRoom.findUnique({ where: { id: req.params.roomId } });
  if (!room) return res.status(404).json({ error: 'الغرفة دي مش موجودة' });

  if (!req.isAdmin) {
    const access = await prisma.voiceRoomAccess.findUnique({
      where: { roomId_userId: { roomId: room.id, userId: req.userId! } },
    });
    if (!access || access.isBanned) return res.status(403).json({ error: 'مالكش صلاحية دخول الغرفة دي' });
  }

  voiceRoomAttachmentUpload(req, res, (err: unknown) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'الملف كبير جدًا (الحد الأقصى 25 ميجا)' });
      }
      const message = err instanceof Error ? err.message : 'تعذّر رفع الملف';
      return res.status(400).json({ error: message });
    }
    if (!req.file) return res.status(400).json({ error: 'اختار ملف الأول' });

    res.status(201).json({
      attachment: {
        url: `/uploads/voice-room-attachments/${req.file.filename}`,
        type: resolveAttachmentType(req.file.mimetype),
        name: req.file.originalname,
        mime: req.file.mimetype,
        size: req.file.size,
      },
    });
  });
});

export default router;

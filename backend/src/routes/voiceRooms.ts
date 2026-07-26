import { Router } from 'express';
import { prisma } from '../config/prisma';
import { AuthRequest } from '../middleware/verifyUser';

const router = Router();

// قائمة الغرف الصوتية اللي المستخدم الحالي عنده صلاحية دخول ليها (الأدمن
// بيشوف كل الغرف مباشرة من غير الحاجة لصف VoiceRoomAccess). الحالة الحيّة
// (مين متواجد، وهي شغّالة إيه) بتتجاب فعليًا وقت الانضمام عن طريق الـ
// socket (شوف realtime/voiceRooms.ts)، مش هنا.
router.get('/', async (req: AuthRequest, res) => {
  const rooms = req.isAdmin
    ? await prisma.voiceRoom.findMany({ orderBy: { createdAt: 'desc' } })
    : await prisma.voiceRoom.findMany({
        where: { access: { some: { userId: req.userId } } },
        orderBy: { createdAt: 'desc' },
      });

  res.json({ rooms: rooms.map((r) => ({ id: r.id, name: r.name, createdAt: r.createdAt })) });
});

export default router;

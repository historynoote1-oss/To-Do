import { Router } from 'express';
import { prisma } from '../config/prisma';
import { AuthRequest } from '../middleware/verifyUser';
import { getRoomMembersSnapshot } from '../realtime/voiceRooms';

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
      createdAt: r.createdAt,
      members: getRoomMembersSnapshot(r.id),
    })),
  });
});

export default router;

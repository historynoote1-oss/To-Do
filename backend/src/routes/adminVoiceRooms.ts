import { Router } from 'express';
import { prisma } from '../config/prisma';
import { AuthRequest } from '../middleware/verifyUser';
import { kickUserFromRoom } from '../realtime/voiceRooms';

const router = Router();

// عرض كل الغرف الصوتية مع أعضاء كل غرفة (مين معاه صلاحية دخول ليها).
router.get('/', async (_req, res) => {
  const rooms = await prisma.voiceRoom.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      access: {
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, username: true } } },
      },
    },
  });

  res.json({
    rooms: rooms.map((r) => ({
      id: r.id,
      name: r.name,
      createdAt: r.createdAt,
      members: r.access.map((a) => ({
        userId: a.user.id,
        username: a.user.username,
        grantedByUsername: a.grantedByUsername,
        createdAt: a.createdAt,
      })),
    })),
  });
});

router.post('/', async (req: AuthRequest, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (!name) return res.status(400).json({ error: 'لازم تكتب اسم للغرفة' });
  if (name.length > 60) return res.status(400).json({ error: 'اسم الغرفة طويل جدًا' });

  const room = await prisma.voiceRoom.create({ data: { name, createdById: req.userId } });
  res.status(201).json({ room: { id: room.id, name: room.name, createdAt: room.createdAt, members: [] } });
});

router.delete('/:roomId', async (req, res) => {
  const room = await prisma.voiceRoom.findUnique({ where: { id: req.params.roomId } });
  if (!room) return res.status(404).json({ error: 'الغرفة دي مش موجودة' });
  await prisma.voiceRoom.delete({ where: { id: room.id } });
  res.json({ ok: true });
});

// منح صلاحية دخول لعضو معيّن (بالاسم) — العضو ده هو الوحيد اللي هيقدر
// ينضم للغرفة دي بعد كده (غير الأدمن، اللي بيدخل أي غرفة تلقائيًا).
router.post('/:roomId/access', async (req: AuthRequest, res) => {
  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  if (!username) return res.status(400).json({ error: 'اكتب اسم المستخدم' });

  const room = await prisma.voiceRoom.findUnique({ where: { id: req.params.roomId } });
  if (!room) return res.status(404).json({ error: 'الغرفة دي مش موجودة' });

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) return res.status(404).json({ error: 'مفيش مستخدم بالاسم ده' });

  const admin = await prisma.user.findUnique({ where: { id: req.userId }, select: { username: true } });

  try {
    const access = await prisma.voiceRoomAccess.create({
      data: { roomId: room.id, userId: user.id, grantedByUsername: admin?.username || null },
    });
    res.status(201).json({
      access: {
        userId: user.id,
        username: user.username,
        grantedByUsername: access.grantedByUsername,
        createdAt: access.createdAt,
      },
    });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return res.status(409).json({ error: 'المستخدم ده معاه صلاحية دخول للغرفة دي أصلًا' });
    }
    throw err;
  }
});

// سحب صلاحية دخول عضو — لو كان متواجد في الغرفة دلوقتي فعليًا، بيتطرد
// فورًا من الاتصال الحي (شوف kickUserFromRoom في realtime/voiceRooms.ts).
router.delete('/:roomId/access/:userId', async (req, res) => {
  const { roomId, userId } = req.params;
  await prisma.voiceRoomAccess.deleteMany({ where: { roomId, userId } });
  kickUserFromRoom(roomId, userId);
  res.json({ ok: true });
});

export default router;

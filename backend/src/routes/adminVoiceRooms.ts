import { Router } from 'express';
import { prisma } from '../config/prisma';
import { AuthRequest } from '../middleware/verifyUser';
import { kickUserFromRoom, applyMemberModeration } from '../realtime/voiceRooms';

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
      description: r.description || null,
      createdAt: r.createdAt,
      chatLocked: r.chatLocked,
      members: r.access.map((a) => ({
        userId: a.user.id,
        username: a.user.username,
        grantedByUsername: a.grantedByUsername,
        createdAt: a.createdAt,
        role: a.role,
        isMuted: a.isMuted,
        isBanned: a.isBanned,
      })),
    })),
  });
});

router.post('/', async (req: AuthRequest, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
  if (!name) return res.status(400).json({ error: 'لازم تكتب اسم للغرفة' });
  if (name.length > 60) return res.status(400).json({ error: 'اسم الغرفة طويل جدًا' });
  if (description.length > 200) return res.status(400).json({ error: 'الوصف طويل جدًا' });

  const room = await prisma.voiceRoom.create({
    data: { name, description: description || null, createdById: req.userId },
  });
  res.status(201).json({
    room: { id: room.id, name: room.name, description: room.description || null, createdAt: room.createdAt, members: [] },
  });
});

// تعديل اسم/وصف غرفة موجودة — بيتطبّق فورًا لكل حد فاتحها دلوقتي (شوف
// broadcast في realtime/voiceRooms.ts لو حابب تبعت تحديث حي في المرحلة الجاية).
router.patch('/:roomId', async (req: AuthRequest, res) => {
  const room = await prisma.voiceRoom.findUnique({ where: { id: req.params.roomId } });
  if (!room) return res.status(404).json({ error: 'الغرفة دي مش موجودة' });

  const data: { name?: string; description?: string | null } = {};
  if (typeof req.body?.name === 'string') {
    const name = req.body.name.trim();
    if (!name) return res.status(400).json({ error: 'لازم تكتب اسم للغرفة' });
    if (name.length > 60) return res.status(400).json({ error: 'اسم الغرفة طويل جدًا' });
    data.name = name;
  }
  if (typeof req.body?.description === 'string') {
    const description = req.body.description.trim();
    if (description.length > 200) return res.status(400).json({ error: 'الوصف طويل جدًا' });
    data.description = description || null;
  }

  const updated = await prisma.voiceRoom.update({ where: { id: room.id }, data });
  res.json({ room: { id: updated.id, name: updated.name, description: updated.description || null } });
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
// ده هو "منع عضو": بيسحب الصلاحية بالكامل (يقدر ياخدها تاني بعدين لو الأدمن
// حب يسمحله من جديد بأمر منح الصلاحية العادي).
router.delete('/:roomId/access/:userId', async (req, res) => {
  const { roomId, userId } = req.params;
  await prisma.voiceRoomAccess.deleteMany({ where: { roomId, userId } });
  kickUserFromRoom(roomId, userId);
  res.json({ ok: true });
});

// "طرد عضو" — يطرده من الاتصال الحي دلوقتي بس (مايسحبش صلاحية الدخول
// بتاعته)؛ يقدر يرجع يدخل تاني على طول أي وقت.
router.post('/:roomId/access/:userId/kick', async (req, res) => {
  const { roomId, userId } = req.params;
  const access = await prisma.voiceRoomAccess.findUnique({ where: { roomId_userId: { roomId, userId } } });
  if (!access) return res.status(404).json({ error: 'العضو ده مالوش صلاحية دخول الغرفة دي أصلًا' });
  applyMemberModeration(roomId, userId, { kick: true });
  res.json({ ok: true });
});

// "حظر عضو" — أدوم من الطرد ومن سحب الصلاحية: بيتسجّل في القاعدة (isBanned)
// فحتى لو الأدمن منحه صلاحية دخول تانية بعدين، هيفضل ممنوع لحد ما حد يفكّ
// الحظر صراحة (banned: false). بيطرده من الاتصال الحي فورًا لو كان متواجد.
router.patch('/:roomId/access/:userId/ban', async (req: AuthRequest, res) => {
  const { roomId, userId } = req.params;
  const banned = Boolean(req.body?.banned);

  const access = await prisma.voiceRoomAccess.findUnique({ where: { roomId_userId: { roomId, userId } } });
  if (!access) return res.status(404).json({ error: 'العضو ده مالوش صلاحية دخول الغرفة دي أصلًا' });

  await prisma.voiceRoomAccess.update({ where: { id: access.id }, data: { isBanned: banned } });
  if (banned) applyMemberModeration(roomId, userId, { kick: true });
  res.json({ ok: true, isBanned: banned });
});

// كتم/فك كتم عضو في شات الغرفة دي بس — يقدر يفضل متواجد ويسمع، بس مايقدرش
// يكتب رسايل لحد ما الأدمن يفك الكتم عنه.
router.patch('/:roomId/access/:userId/mute', async (req: AuthRequest, res) => {
  const { roomId, userId } = req.params;
  const muted = Boolean(req.body?.muted);

  const access = await prisma.voiceRoomAccess.findUnique({ where: { roomId_userId: { roomId, userId } } });
  if (!access) return res.status(404).json({ error: 'العضو ده مالوش صلاحية دخول الغرفة دي أصلًا' });

  await prisma.voiceRoomAccess.update({ where: { id: access.id }, data: { isMuted: muted } });
  applyMemberModeration(roomId, userId, { isMuted: muted });
  res.json({ ok: true, isMuted: muted });
});

// ترقية/تنزيل دور عضو جوه الغرفة دي بالذات: member (عادي) / moderator
// (مشرف — يتحكم في الشات بس) / admin (أدمن كامل الصلاحيات جوه الغرفة دي،
// من غير ما يبقى أدمن عام على التطبيق كله). بيتطبّق فورًا لو متواجد دلوقتي.
router.patch('/:roomId/access/:userId/role', async (req: AuthRequest, res) => {
  const { roomId, userId } = req.params;
  const role = typeof req.body?.role === 'string' ? req.body.role : '';
  if (!['member', 'moderator', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'الدور غير معروف' });
  }

  const access = await prisma.voiceRoomAccess.findUnique({ where: { roomId_userId: { roomId, userId } } });
  if (!access) return res.status(404).json({ error: 'العضو ده مالوش صلاحية دخول الغرفة دي أصلًا' });

  await prisma.voiceRoomAccess.update({ where: { id: access.id }, data: { role } });
  applyMemberModeration(roomId, userId, { role: role as 'member' | 'moderator' | 'admin' });
  res.json({ ok: true, role });
});

export default router;

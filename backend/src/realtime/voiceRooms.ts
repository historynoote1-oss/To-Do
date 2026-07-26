// ===== الغرف الصوتية — الطبقة الحيّة (Socket.IO) =====
// كل الحالة "اللحظية" لغرفة صوتية (مين متواجد دلوقتي، وهي شغّالة تلاوة
// إيه دلوقتي) بتتخزّن هنا في الذاكرة بس (Map عادية) — مش في القاعدة، لأنها
// حالة مؤقتة مالهاش داعي تتحفظ لو السيرفر اتعمله restart. الرسائل نفسها
// (الشات) بتتحفظ في القاعدة (VoiceRoomMessage) عشان لو عضو دخل الغرفة
// بعد ما فاته جزء من الكلام يلاقي آخر الرسايل.
//
// الدخول للغرفة محصور: لازم يبقى عندك صف VoiceRoomAccess (أو تبقى أدمن).
// أمر "شغل ...." بيتفحص إنه من أدمن فعلي بس (isAdmin بييجي من التوكن نفسه
// اللي اتحقق منه وقت الاتصال، مش من أي حاجة العميل بيبعتها).

import { Server, Socket } from 'socket.io';
import { prisma } from '../config/prisma';
import { verifyToken } from '../services/auth';
import { searchQuranVideos, QuranSearchError } from '../services/quranSearch';

interface AuthedSocket extends Socket {
  userId: string;
  username: string;
  isAdmin: boolean;
  avatarUrl: string | null;
  currentRoomId: string | null;
}

interface RoomPlaybackState {
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
  // وقت بدء التشغيل (Date.now())، عشان أي عضو ينضم متأخر يقدر يحسب من أي
  // ثانية يبدأ يسمع بالظبط (تزامن تقريبي بين كل الأعضاء).
  startedAtMs: number;
  query: string;
}

interface RoomMemberInfo {
  userId: string;
  username: string;
  isAdmin: boolean;
  avatarUrl: string | null;
}

// roomId -> حالة التشغيل الحالية (لو مفيش، الغرفة ساكتة حاليًا)
const roomPlayback = new Map<string, RoomPlaybackState>();
// roomId -> (socketId -> بيانات العضو) — Map داخلية عشان لو نفس المستخدم
// فاتح أكتر من تبويب/جهاز نعرف نفرّق بينهم، ونجمعهم وقت العرض للواجهة.
const roomMembers = new Map<string, Map<string, RoomMemberInfo>>();

// أمر الأدمن بيتكتب "شغل ...." أو "شغّل ...." (بتشديد أو من غيره) — بنشيل
// أي شدة (تشكيل) من النص الأول قبل المطابقة عشان الاتنين يشتغلوا بنفس الشكل.
function stripTashkeel(text: string): string {
  return text.replace(/[\u064B-\u065F\u0670]/g, '');
}

function matchPlayCommand(rawText: string): string | null {
  const normalized = stripTashkeel(rawText.trim());
  const match = normalized.match(/^شغل\s+(.+)$/);
  return match ? match[1].trim() : null;
}

function serializeMembers(roomId: string): RoomMemberInfo[] {
  const map = roomMembers.get(roomId);
  if (!map) return [];
  const seen = new Set<string>();
  const list: RoomMemberInfo[] = [];
  for (const member of map.values()) {
    if (seen.has(member.userId)) continue;
    seen.add(member.userId);
    list.push(member);
  }
  return list;
}

function serializeMessage(message: {
  id: string;
  roomId: string;
  userId: string | null;
  username: string;
  isAdmin: boolean;
  body: string;
  isSystem: boolean;
  createdAt: Date;
}) {
  return {
    id: message.id,
    userId: message.userId,
    username: message.username,
    isAdmin: message.isAdmin,
    body: message.body,
    isSystem: message.isSystem,
    createdAt: message.createdAt.toISOString(),
  };
}

async function createSystemMessage(roomId: string, body: string) {
  const saved = await prisma.voiceRoomMessage.create({
    data: { roomId, userId: null, username: 'النظام', isAdmin: false, body, isSystem: true },
  });
  return serializeMessage(saved);
}

function watchRoomName(roomId: string): string {
  return `watch:${roomId}`;
}

// بيُستخدم من مسار REST (routes/voiceRooms.ts) عشان صفحة قايمة الغرف تقدر
// تعرض مين متواجد فعليًا في كل غرفة *من غير ما تنضم*، بالظبط زي قايمة
// الأعضاء اللي بتظهر تحت كل روم صوتي في ديسكورد من برا قبل ما تدخله.
// بيبعت قايمة الأعضاء المحدّثة لكل من: (1) الأعضاء الفعليين جوه الغرفة،
// و(2) أي حد فاتح صفحة قايمة الغرف وعامل "مراقبة" لعدد/صور أعضاء الغرفة دي
// من غير ما يكون داخلها فعليًا (زي قايمة الأعضاء اللي بتظهر تحت الروم في
// ديسكورد من برا).
function broadcastMembers(io: Server, roomId: string) {
  const members = serializeMembers(roomId);
  io.to(roomId).emit('voiceRoom:members', members);
  io.to(watchRoomName(roomId)).emit('voiceRoom:watchMembers', { roomId, members });
}

export function getRoomMembersSnapshot(roomId: string): RoomMemberInfo[] {
  return serializeMembers(roomId);
}

let ioRef: Server | null = null;

export function initVoiceRoomsSocket(io: Server) {
  ioRef = io;

  // بيتحقق من التوكن قبل ما يسمح بأي اتصال أصلًا — نفس فحص verifyUser.ts
  // بالظبط (مراجعة القاعدة، تفعيل الحساب، tokenVersion)، عشان توكن قديم
  // أو حساب متعلّق ميقدرش يفتح اتصال حي حتى لو عدّى فحص الـ REST.
  io.use(async (socket, next) => {
    try {
      const token =
        (typeof socket.handshake.auth?.token === 'string' && socket.handshake.auth.token) ||
        (socket.handshake.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (!token) return next(new Error('unauthorized'));

      const payload = verifyToken(token);
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { id: true, username: true, isAdmin: true, isActive: true, tokenVersion: true, avatarUrl: true },
      });
      if (!user || !user.isActive || user.tokenVersion !== payload.tokenVersion) {
        return next(new Error('unauthorized'));
      }

      const authed = socket as AuthedSocket;
      authed.userId = user.id;
      authed.username = user.username;
      authed.isAdmin = user.isAdmin;
      authed.avatarUrl = user.avatarUrl || null;
      authed.currentRoomId = null;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const authed = socket as AuthedSocket;

    socket.on('voiceRoom:join', async (roomId: unknown, ack?: (res: any) => void) => {
      try {
        if (typeof roomId !== 'string' || !roomId) {
          return ack?.({ error: 'الغرفة دي مش موجودة' });
        }

        const room = await prisma.voiceRoom.findUnique({ where: { id: roomId } });
        if (!room) return ack?.({ error: 'الغرفة دي مش موجودة' });

        if (!authed.isAdmin) {
          const access = await prisma.voiceRoomAccess.findUnique({
            where: { roomId_userId: { roomId, userId: authed.userId } },
          });
          if (!access) return ack?.({ error: 'مالكش صلاحية دخول الغرفة دي' });
        }

        if (authed.currentRoomId && authed.currentRoomId !== roomId) {
          await leaveCurrentRoom(io, authed);
        }

        authed.currentRoomId = roomId;
        socket.join(roomId);
        if (!roomMembers.has(roomId)) roomMembers.set(roomId, new Map());
        roomMembers.get(roomId)!.set(socket.id, {
          userId: authed.userId,
          username: authed.username,
          isAdmin: authed.isAdmin,
          avatarUrl: authed.avatarUrl,
        });

        const recentMessages = await prisma.voiceRoomMessage.findMany({
          where: { roomId },
          orderBy: { createdAt: 'desc' },
          take: 50,
        });

        ack?.({
          room: { id: room.id, name: room.name },
          messages: recentMessages.reverse().map(serializeMessage),
          playback: roomPlayback.get(roomId) || null,
          members: serializeMembers(roomId),
        });

        broadcastMembers(io, roomId);
        const sysMsg = await createSystemMessage(roomId, `${authed.username} دخل الغرفة`);
        socket.to(roomId).emit('voiceRoom:message', sysMsg);
      } catch (err) {
        console.error('voiceRoom:join failed:', err);
        ack?.({ error: 'حصل خطأ، حاول تاني' });
      }
    });

    socket.on('voiceRoom:watch', async (roomIds: unknown, ack?: (res: any) => void) => {
      try {
        const ids = Array.isArray(roomIds) ? roomIds.filter((id): id is string => typeof id === 'string') : [];
        const members: Record<string, RoomMemberInfo[]> = {};
        for (const roomId of ids) {
          if (!authed.isAdmin) {
            const access = await prisma.voiceRoomAccess.findUnique({
              where: { roomId_userId: { roomId, userId: authed.userId } },
            });
            if (!access) continue;
          }
          socket.join(watchRoomName(roomId));
          members[roomId] = serializeMembers(roomId);
        }
        ack?.({ members });
      } catch (err) {
        console.error('voiceRoom:watch failed:', err);
        ack?.({ error: 'حصل خطأ، حاول تاني' });
      }
    });

    socket.on('voiceRoom:unwatch', (roomIds: unknown) => {
      const ids = Array.isArray(roomIds) ? roomIds.filter((id): id is string => typeof id === 'string') : [];
      for (const roomId of ids) socket.leave(watchRoomName(roomId));
    });

    socket.on('voiceRoom:leave', async (_payload: unknown, ack?: (res: any) => void) => {
      await leaveCurrentRoom(io, authed);
      ack?.({ ok: true });
    });

    socket.on('voiceRoom:message', async (rawBody: unknown, ack?: (res: any) => void) => {
      try {
        const roomId = authed.currentRoomId;
        if (!roomId) return ack?.({ error: 'لسه مادخلتش أي غرفة' });

        const text = typeof rawBody === 'string' ? rawBody.trim() : '';
        if (!text) return ack?.({ error: 'اكتب رسالة الأول' });
        if (text.length > 500) return ack?.({ error: 'الرسالة طويلة جدًا' });

        const playQuery = authed.isAdmin ? matchPlayCommand(text) : null;
        if (playQuery) {
          try {
            const results = await searchQuranVideos(playQuery);
            const top = results[0];
            if (!top) {
              return ack?.({ error: 'مفيش نتايج لتلاوة بالكلمة دي' });
            }
            const state: RoomPlaybackState = {
              videoId: top.videoId,
              title: top.title,
              channel: top.channel,
              thumbnail: top.thumbnail,
              startedAtMs: Date.now(),
              query: playQuery,
            };
            roomPlayback.set(roomId, state);
            io.to(roomId).emit('voiceRoom:playback', state);
            const sysMsg = await createSystemMessage(roomId, `▶️ الأدمن شغّل تلاوة: ${top.title}`);
            io.to(roomId).emit('voiceRoom:message', sysMsg);
            return ack?.({ ok: true });
          } catch (err) {
            const message = err instanceof QuranSearchError ? err.message : 'تعذّر التشغيل، حاول تاني';
            return ack?.({ error: message });
          }
        }

        const saved = await prisma.voiceRoomMessage.create({
          data: { roomId, userId: authed.userId, username: authed.username, isAdmin: authed.isAdmin, body: text, isSystem: false },
        });
        const serialized = serializeMessage(saved);
        io.to(roomId).emit('voiceRoom:message', serialized);
        ack?.({ ok: true });
      } catch (err) {
        console.error('voiceRoom:message failed:', err);
        ack?.({ error: 'حصل خطأ، حاول تاني' });
      }
    });

    socket.on('disconnect', () => {
      leaveCurrentRoom(io, authed).catch((err) => console.error('voiceRoom disconnect cleanup failed:', err));
    });
  });
}

async function leaveCurrentRoom(io: Server, authed: AuthedSocket) {
  const roomId = authed.currentRoomId;
  if (!roomId) return;
  authed.currentRoomId = null;

  const members = roomMembers.get(roomId);
  members?.delete(authed.id);
  if (members && members.size === 0) {
    roomMembers.delete(roomId);
    // الغرفة فضيت خالص — التلاوة الشغّالة بتفضل "محفوظة" في الذاكرة لسه
    // (لو حد رجع دخل تاني هيلاقيها شغّالة من نفس المكان)، مش بنمسحها هنا.
  }

  authed.leave(roomId);
  broadcastMembers(io, roomId);
  try {
    const sysMsg = await createSystemMessage(roomId, `${authed.username} خرج من الغرفة`);
    io.to(roomId).emit('voiceRoom:message', sysMsg);
  } catch (err) {
    console.error('voiceRoom leave system message failed:', err);
  }
}

// بيُستخدم من مسار الأدمن (adminVoiceRooms.ts) لما الأدمن يسحب صلاحية دخول
// عضو معيّن — لو العضو ده متواجد فعليًا في الغرفة دلوقتي، بنطرده فورًا من
// الاتصال الحي (حتى لو محسّش إنه اتطرد إلا لما يحاول يبعت رسالة تانية).
export function kickUserFromRoom(roomId: string, userId: string) {
  if (!ioRef) return;
  const members = roomMembers.get(roomId);
  if (!members) return;

  for (const [socketId, info] of members.entries()) {
    if (info.userId !== userId) continue;
    const socket = ioRef.sockets.sockets.get(socketId) as AuthedSocket | undefined;
    if (socket) {
      socket.emit('voiceRoom:kicked');
      socket.leave(roomId);
      socket.currentRoomId = null;
    }
    members.delete(socketId);
  }

  if (members.size === 0) roomMembers.delete(roomId);
  broadcastMembers(ioRef, roomId);
}

// ===== الغرف الصوتية — الطبقة الحيّة (Socket.IO) =====
// كل الحالة "اللحظية" لغرفة صوتية (مين متواجد دلوقتي، الطابور، التلاوة
// الشغّالة دلوقتي...) بتتخزّن هنا في الذاكرة بس (Map عادية) — مش في القاعدة،
// لأنها حالة مؤقتة مالهاش داعي تتحفظ لو السيرفر اتعمله restart. الرسائل
// نفسها (الشات) بتتحفظ في القاعدة (VoiceRoomMessage) عشان لو عضو دخل الغرفة
// بعد ما فاته جزء من الكلام يلاقي آخر الرسايل.
//
// الدخول للغرفة محصور: لازم يبقى عندك صف VoiceRoomAccess (أو تبقى أدمن).
// أمر "شغل ...." وكل أوامر التحكم في مشغّل القرآن بتتفحص إنها من أدمن فعلي
// بس (isAdmin بييجي من التوكن نفسه اللي اتحقق منه وقت الاتصال).

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
  // دور العضو ده جوه الغرفة الحالية بالذات (مش الحساب العام) — بيتحدّث وقت
  // الدخول من VoiceRoomAccess.role، وبيتحدّث حي لو الأدمن غيّره وهو متواجد.
  roomRole: 'member' | 'moderator' | 'admin';
  // كتم في الشات جوه الغرفة الحالية بس (مش كتم عام على الحساب).
  roomMuted: boolean;
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
  paused: boolean;
  // وقت آخر مرة اتوقّف فيها التشغيل (لو paused=true)، ومجموع كل فترات
  // الوقف السابقة — عشان حساب "الثانية الحالية" يفضل مظبوط حتى بعد كذا
  // إيقاف/استكمال.
  pausedAtMs: number | null;
  accumulatedPauseMs: number;
}

interface RoomMemberInfo {
  userId: string;
  username: string;
  isAdmin: boolean;
  isModerator?: boolean;
  isMuted?: boolean;
  avatarUrl: string | null;
  isBot?: boolean;
}

// أدمن فعلي جوه الغرفة دي: إما أدمن عام على التطبيق، أو أدمن مخصوص للغرفة
// دي بس (رقّاه أدمن عام). المشرف (moderator) درجة أقل: يقدر يتحكم في
// الشات (تثبيت/حذف/قفل/مسح) لكن مش يتحكم في مشغّل القرآن ولا يرقّي حد.
function isEffectiveAdmin(authed: AuthedSocket): boolean {
  return authed.isAdmin || authed.roomRole === 'admin';
}

function isEffectiveModerator(authed: AuthedSocket): boolean {
  return isEffectiveAdmin(authed) || authed.roomRole === 'moderator';
}

const QURAN_BOT_ID = 'quran-bot';
const QURAN_BOT_USERNAME = 'مشغّل القرآن';
const BOT_IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 دقايق

// roomId -> حالة التشغيل الحالية (لو مفيش، الغرفة ساكتة حاليًا)
const roomPlayback = new Map<string, RoomPlaybackState>();
// roomId -> قائمة الانتظار (تلاوات جاية بعد الحالية)
const roomQueue = new Map<string, RoomPlaybackState[]>();
// roomId -> آخر التلاوات اللي اتشغّلت (عشان زرار "السابق")
const roomHistory = new Map<string, RoomPlaybackState[]>();
// roomId -> هل وضع التكرار مفعّل
const roomRepeat = new Map<string, boolean>();
// roomId -> هل وضع العشوائي مفعّل
const roomShuffle = new Map<string, boolean>();
// roomId -> هل بوت "مشغّل القرآن" داخل الغرفة دلوقتي كعضو ظاهر
const roomBotPresent = new Set<string>();
// roomId -> مؤقّت الخروج التلقائي للبوت (بعد ٥ دقايق خمول)
const roomBotTimers = new Map<string, NodeJS.Timeout>();
// roomId -> (socketId -> بيانات العضو) — Map داخلية عشان لو نفس المستخدم
// فاتح أكتر من تبويب/جهاز نعرف نفرّق بينهم، ونجمعهم وقت العرض للواجهة.
const roomMembers = new Map<string, Map<string, RoomMemberInfo>>();
// roomId -> لحظة أول ما دخل عضو الغرفة وهي فاضية (Date.now()). بيتمسح أول
// ما الغرفة تفضى تاني، عشان لو رجعوا يدخلوا يبدأ العدّاد من الأول زي ما
// طلب بالظبط. بيُستخدم يعرض "من قد إيه الغرفة دي شغالة" فوق وجوه الروم.
const roomSessionStart = new Map<string, number>();
// roomId -> هل الشات مقفول حاليًا (الأدمن بس يقدر يكتب لو مقفول)
const roomChatLocked = new Map<string, boolean>();

export function getRoomSessionStart(roomId: string): number | null {
  return roomSessionStart.get(roomId) ?? null;
}

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

// بيدوّر على أي @اسم_مستخدم جوه نص الرسالة، ويرجّع بس الأسماء اللي فعلًا
// أعضاء متواجدين في الغرفة دلوقتي (عشان منشن لاسم غلط أو مش موجود مايتحطش).
function extractMentions(text: string, roomId: string): string[] {
  const tokens = text.match(/@([\p{L}\p{N}_.-]{2,32})/gu);
  if (!tokens) return [];
  const knownUsernames = new Set(serializeMembers(roomId).map((m) => m.username));
  const found = new Set<string>();
  for (const token of tokens) {
    const name = token.slice(1);
    if (knownUsernames.has(name)) found.add(name);
  }
  return Array.from(found);
}

function serializeMembers(roomId: string): RoomMemberInfo[] {
  const map = roomMembers.get(roomId);
  const seen = new Set<string>();
  const list: RoomMemberInfo[] = [];
  if (map) {
    for (const member of map.values()) {
      if (seen.has(member.userId)) continue;
      seen.add(member.userId);
      list.push(member);
    }
  }
  if (roomBotPresent.has(roomId)) {
    list.push({ userId: QURAN_BOT_ID, username: QURAN_BOT_USERNAME, isAdmin: false, avatarUrl: null, isBot: true });
  }
  return list;
}

function countHumanMembers(roomId: string): number {
  const map = roomMembers.get(roomId);
  if (!map) return 0;
  const seen = new Set<string>();
  for (const member of map.values()) seen.add(member.userId);
  return seen.size;
}

async function serializeReactions(messageIds: string[]) {
  const result = new Map<string, { emoji: string; count: number; mine: string[] }[]>();
  if (messageIds.length === 0) return result;
  const rows = await prisma.voiceRoomMessageReaction.findMany({ where: { messageId: { in: messageIds } } });
  const byMessage = new Map<string, Map<string, { emoji: string; count: number; usernames: string[] }>>();
  for (const row of rows) {
    if (!byMessage.has(row.messageId)) byMessage.set(row.messageId, new Map());
    const group = byMessage.get(row.messageId)!;
    if (!group.has(row.emoji)) group.set(row.emoji, { emoji: row.emoji, count: 0, usernames: [] });
    const entry = group.get(row.emoji)!;
    entry.count += 1;
    entry.usernames.push(row.username);
  }
  for (const [messageId, group] of byMessage.entries()) {
    result.set(messageId, Array.from(group.values()).map((g) => ({ emoji: g.emoji, count: g.count, mine: g.usernames })));
  }
  return result;
}

function serializeMessage(
  message: {
    id: string;
    roomId: string;
    userId: string | null;
    username: string;
    isAdmin: boolean;
    body: string;
    isSystem: boolean;
    isPinned: boolean;
    isDeleted: boolean;
    mentions: string | null;
    attachmentUrl: string | null;
    attachmentType: string | null;
    attachmentName: string | null;
    attachmentMime: string | null;
    attachmentSize: number | null;
    replyToId: string | null;
    createdAt: Date;
  },
  extras?: {
    reactions?: { emoji: string; count: number; mine: string[] }[];
    replyTo?: { id: string; username: string; body: string; isSystem: boolean; isDeleted: boolean } | null;
  },
) {
  return {
    id: message.id,
    userId: message.userId,
    username: message.username,
    isAdmin: message.isAdmin,
    body: message.isDeleted ? '' : message.body,
    isSystem: message.isSystem,
    isPinned: message.isPinned,
    isDeleted: message.isDeleted,
    mentions: message.mentions ? (JSON.parse(message.mentions) as string[]) : [],
    attachment:
      !message.isDeleted && message.attachmentUrl
        ? {
            url: message.attachmentUrl,
            type: message.attachmentType,
            name: message.attachmentName,
            mime: message.attachmentMime,
            size: message.attachmentSize,
          }
        : null,
    replyTo: message.isDeleted ? null : extras?.replyTo || null,
    reactions: extras?.reactions || [],
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
function broadcastMembers(io: Server, roomId: string) {
  const members = serializeMembers(roomId);
  const sessionStartedAtMs = roomSessionStart.get(roomId) ?? null;
  io.to(roomId).emit('voiceRoom:members', members);
  io.to(roomId).emit('voiceRoom:session', { sessionStartedAtMs });
  io.to(watchRoomName(roomId)).emit('voiceRoom:watchMembers', { roomId, members, sessionStartedAtMs });
}

export function getRoomMembersSnapshot(roomId: string): RoomMemberInfo[] {
  return serializeMembers(roomId);
}

function serializeQueueState(roomId: string) {
  return {
    playback: roomPlayback.get(roomId) || null,
    queue: roomQueue.get(roomId) || [],
    repeat: roomRepeat.get(roomId) || false,
    shuffle: roomShuffle.get(roomId) || false,
  };
}

function broadcastQueueState(io: Server, roomId: string) {
  io.to(roomId).emit('voiceRoom:queue', serializeQueueState(roomId));
}

// ===== دورة حياة بوت "مشغّل القرآن" (يدخل/يخرج زي أي عضو) =====
function ensureBotPresent(io: Server, roomId: string) {
  if (roomBotPresent.has(roomId)) return;
  roomBotPresent.add(roomId);
  broadcastMembers(io, roomId);
  createSystemMessage(roomId, `🎙️ ${QURAN_BOT_USERNAME} دخل الغرفة`).then((sysMsg) => {
    io.to(roomId).emit('voiceRoom:message', sysMsg);
  });
}

function removeBotFromRoom(io: Server, roomId: string) {
  if (!roomBotPresent.has(roomId)) return;
  roomBotPresent.delete(roomId);
  roomPlayback.delete(roomId);
  roomQueue.delete(roomId);
  roomHistory.delete(roomId);
  roomRepeat.delete(roomId);
  roomShuffle.delete(roomId);
  broadcastMembers(io, roomId);
  broadcastQueueState(io, roomId);
  createSystemMessage(roomId, `👋 ${QURAN_BOT_USERNAME} خرج من الغرفة (مفيش تلاوات تانية)`).then((sysMsg) => {
    io.to(roomId).emit('voiceRoom:message', sysMsg);
  });
}

// بيتنادى بعد أي تغيير (دخول/خروج عضو، تشغيل/إيقاف تلاوة) عشان يقرر هل
// البوت المفروض يبدأ عدّاد الخروج التلقائي (٥ دقايق) ولا يلغيه.
function evaluateBotLifecycle(io: Server, roomId: string) {
  if (!roomBotPresent.has(roomId)) return;

  const humanCount = countHumanMembers(roomId);
  const queue = roomQueue.get(roomId) || [];
  const current = roomPlayback.get(roomId);
  const isIdle = !current && queue.length === 0;
  const shouldCountdown = humanCount === 0 || isIdle;

  const existingTimer = roomBotTimers.get(roomId);
  if (shouldCountdown) {
    if (existingTimer) return; // العدّاد شغّال بالفعل
    const timer = setTimeout(() => {
      roomBotTimers.delete(roomId);
      const h2 = countHumanMembers(roomId);
      const q2 = roomQueue.get(roomId) || [];
      const c2 = roomPlayback.get(roomId);
      if (h2 === 0 || (!c2 && q2.length === 0)) {
        removeBotFromRoom(io, roomId);
      }
    }, BOT_IDLE_TIMEOUT_MS);
    roomBotTimers.set(roomId, timer);
  } else if (existingTimer) {
    clearTimeout(existingTimer);
    roomBotTimers.delete(roomId);
  }
}

// بيشغّل أول عنصر في الطابور (أو عنصر عشوائي لو وضع العشوائي مفعّل)، ولو
// الطابور فاضي بيسيب الغرفة "ساكتة" (roomPlayback يتمسح).
function playNextInQueue(io: Server, roomId: string) {
  const queue = roomQueue.get(roomId) || [];
  if (queue.length === 0) {
    roomPlayback.delete(roomId);
    broadcastQueueState(io, roomId);
    evaluateBotLifecycle(io, roomId);
    return;
  }

  const shuffle = roomShuffle.get(roomId) || false;
  const index = shuffle ? Math.floor(Math.random() * queue.length) : 0;
  const [next] = queue.splice(index, 1);
  roomQueue.set(roomId, queue);
  roomPlayback.set(roomId, next);

  io.to(roomId).emit('voiceRoom:playback', next);
  broadcastQueueState(io, roomId);
  createSystemMessage(roomId, `▶️ دلوقتي بيتشغّل: ${next.title}`).then((sysMsg) => {
    io.to(roomId).emit('voiceRoom:message', sysMsg);
  });
  evaluateBotLifecycle(io, roomId);
}

function pushToHistory(roomId: string, state: RoomPlaybackState) {
  const history = roomHistory.get(roomId) || [];
  history.push(state);
  if (history.length > 20) history.shift();
  roomHistory.set(roomId, history);
}

function advanceToNext(io: Server, roomId: string, reason: 'ended' | 'skipped' | 'stopped') {
  const current = roomPlayback.get(roomId);
  if (current) {
    if (reason !== 'stopped') pushToHistory(roomId, current);
    if (reason === 'ended' && roomRepeat.get(roomId)) {
      const queue = roomQueue.get(roomId) || [];
      queue.push({ ...current, startedAtMs: Date.now(), paused: false, pausedAtMs: null, accumulatedPauseMs: 0 });
      roomQueue.set(roomId, queue);
    }
  }
  if (reason === 'stopped') {
    roomQueue.set(roomId, []);
  }
  playNextInQueue(io, roomId);
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
      authed.roomRole = user.isAdmin ? 'admin' : 'member';
      authed.roomMuted = false;
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

        let access: { role: string; isMuted: boolean; isBanned: boolean } | null = null;
        if (!authed.isAdmin) {
          access = await prisma.voiceRoomAccess.findUnique({
            where: { roomId_userId: { roomId, userId: authed.userId } },
            select: { role: true, isMuted: true, isBanned: true },
          });
          if (!access) return ack?.({ error: 'مالكش صلاحية دخول الغرفة دي' });
          if (access.isBanned) return ack?.({ error: 'انت محظور من الغرفة دي' });
        }

        authed.roomRole = (access?.role as AuthedSocket['roomRole']) || (authed.isAdmin ? 'admin' : 'member');
        authed.roomMuted = access?.isMuted || false;

        if (!authed.isAdmin && typeof room.maxMembers === 'number' && room.maxMembers > 0) {
          const alreadyIn = (roomMembers.get(roomId) || new Map());
          const alreadyMember = Array.from(alreadyIn.values()).some((m) => m.userId === authed.userId);
          if (!alreadyMember && countHumanMembers(roomId) >= room.maxMembers) {
            return ack?.({ error: 'الغرفة دي وصلت للحد الأقصى من الأعضاء دلوقتي' });
          }
        }

        if (authed.currentRoomId && authed.currentRoomId !== roomId) {
          await leaveCurrentRoom(io, authed);
        }

        authed.currentRoomId = roomId;
        socket.join(roomId);
        if (!roomMembers.has(roomId)) roomMembers.set(roomId, new Map());
        // الغرفة كانت فاضية قبل الدخول ده؟ يبقى ده أول عضو — نبدأ عدّاد
        // "الغرفة شغالة من قد إيه" من دلوقتي بالظبط.
        if (roomMembers.get(roomId)!.size === 0 && !roomSessionStart.has(roomId)) {
          roomSessionStart.set(roomId, Date.now());
        }
        roomMembers.get(roomId)!.set(socket.id, {
          userId: authed.userId,
          username: authed.username,
          isAdmin: isEffectiveAdmin(authed),
          isModerator: authed.roomRole === 'moderator',
          isMuted: authed.roomMuted,
          avatarUrl: authed.avatarUrl,
        });

        roomChatLocked.set(roomId, room.chatLocked);

        const recentMessages = await prisma.voiceRoomMessage.findMany({
          where: { roomId },
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: { replyTo: { select: { id: true, username: true, body: true, isSystem: true, isDeleted: true } } },
        });
        const reactionsByMessage = await serializeReactions(recentMessages.map((m) => m.id));

        ack?.({
          room: { id: room.id, name: room.name, description: room.description || null, maxMembers: room.maxMembers },
          messages: recentMessages
            .reverse()
            .map((m) => serializeMessage(m, { reactions: reactionsByMessage.get(m.id), replyTo: m.replyTo })),
          playback: roomPlayback.get(roomId) || null,
          queue: roomQueue.get(roomId) || [],
          repeat: roomRepeat.get(roomId) || false,
          shuffle: roomShuffle.get(roomId) || false,
          chatLocked: room.chatLocked,
          members: serializeMembers(roomId),
          sessionStartedAtMs: roomSessionStart.get(roomId) ?? null,
          myRole: authed.roomRole,
          isMuted: authed.roomMuted,
        });

        broadcastMembers(io, roomId);
        evaluateBotLifecycle(io, roomId);
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
        const sessions: Record<string, number | null> = {};
        for (const roomId of ids) {
          if (!authed.isAdmin) {
            const access = await prisma.voiceRoomAccess.findUnique({
              where: { roomId_userId: { roomId, userId: authed.userId } },
            });
            if (!access) continue;
          }
          socket.join(watchRoomName(roomId));
          members[roomId] = serializeMembers(roomId);
          sessions[roomId] = roomSessionStart.get(roomId) ?? null;
        }
        ack?.({ members, sessions });
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

    socket.on('voiceRoom:message', async (rawPayload: unknown, ack?: (res: any) => void) => {
      try {
        const roomId = authed.currentRoomId;
        if (!roomId) return ack?.({ error: 'لسه مادخلتش أي غرفة' });

        // توافق: لو الفرونت لسه بيبعت نص عادي (string) بدل كائن، بنلفّه.
        const payload =
          typeof rawPayload === 'string' ? { body: rawPayload, attachment: null } : ((rawPayload as any) || {});
        const text = typeof payload.body === 'string' ? payload.body.trim() : '';
        const attachment =
          payload.attachment && typeof payload.attachment.url === 'string'
            ? {
                url: String(payload.attachment.url),
                type: String(payload.attachment.type || 'file'),
                name: payload.attachment.name ? String(payload.attachment.name) : null,
                mime: payload.attachment.mime ? String(payload.attachment.mime) : null,
                size: Number.isFinite(Number(payload.attachment.size)) ? Number(payload.attachment.size) : null,
              }
            : null;

        if (!text && !attachment) return ack?.({ error: 'اكتب رسالة أو أرفق حاجة الأول' });
        if (text.length > 500) return ack?.({ error: 'الرسالة طويلة جدًا' });

        if (roomChatLocked.get(roomId) && !isEffectiveModerator(authed)) {
          return ack?.({ error: 'الشات مقفول دلوقتي من الأدمن' });
        }
        if (authed.roomMuted) {
          return ack?.({ error: 'انت مكتوم في الشات جوه الغرفة دي' });
        }

        const playQuery = !attachment && isEffectiveAdmin(authed) ? matchPlayCommand(text) : null;
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
              paused: false,
              pausedAtMs: null,
              accumulatedPauseMs: 0,
            };

            ensureBotPresent(io, roomId);

            if (roomPlayback.get(roomId)) {
              // فيه تلاوة شغّالة أصلًا — الجديدة تروح لقائمة الانتظار وتشتغل
              // تلقائي أول ما اللي قبلها تخلص (أو لو الأدمن عمل "تخطي").
              const queue = roomQueue.get(roomId) || [];
              queue.push(state);
              roomQueue.set(roomId, queue);
              broadcastQueueState(io, roomId);
              const sysMsg = await createSystemMessage(roomId, `➕ اتضافت لقائمة الانتظار: ${top.title}`);
              io.to(roomId).emit('voiceRoom:message', sysMsg);
            } else {
              roomPlayback.set(roomId, state);
              io.to(roomId).emit('voiceRoom:playback', state);
              broadcastQueueState(io, roomId);
              const sysMsg = await createSystemMessage(roomId, `▶️ الأدمن شغّل تلاوة: ${top.title}`);
              io.to(roomId).emit('voiceRoom:message', sysMsg);
            }
            evaluateBotLifecycle(io, roomId);
            return ack?.({ ok: true });
          } catch (err) {
            const message = err instanceof QuranSearchError ? err.message : 'تعذّر التشغيل، حاول تاني';
            return ack?.({ error: message });
          }
        }

        const mentions = extractMentions(text, roomId);
        const replyToId = typeof payload.replyToId === 'string' && payload.replyToId ? payload.replyToId : null;
        let replyTo: { id: string; username: string; body: string; isSystem: boolean; isDeleted: boolean } | null = null;
        if (replyToId) {
          replyTo = await prisma.voiceRoomMessage.findFirst({
            where: { id: replyToId, roomId },
            select: { id: true, username: true, body: true, isSystem: true, isDeleted: true },
          });
        }

        const saved = await prisma.voiceRoomMessage.create({
          data: {
            roomId,
            userId: authed.userId,
            username: authed.username,
            isAdmin: isEffectiveAdmin(authed),
            body: text,
            isSystem: false,
            mentions: mentions.length ? JSON.stringify(mentions) : null,
            attachmentUrl: attachment?.url || null,
            attachmentType: attachment?.type || null,
            attachmentName: attachment?.name || null,
            attachmentMime: attachment?.mime || null,
            attachmentSize: attachment?.size ?? null,
            replyToId: replyTo?.id || null,
          },
        });
        const serialized = serializeMessage(saved, { replyTo, reactions: [] });
        io.to(roomId).emit('voiceRoom:message', serialized);

        // إشعار فوري (Toast) لمين اتعمله منشن، حتى لو مش فاتح الشات دلوقتي —
        // بيوصله كحدث منفصل عن الرسالة العادية عشان الواجهة تفرّق بينهم.
        if (mentions.length) {
          const membersMap = roomMembers.get(roomId);
          if (membersMap) {
            for (const [socketId, info] of membersMap.entries()) {
              if (!mentions.includes(info.username) || info.userId === authed.userId) continue;
              const targetSocket = ioRef?.sockets.sockets.get(socketId);
              targetSocket?.emit('voiceRoom:mentioned', { messageId: serialized.id, byUsername: authed.username });
            }
          }
        }
        ack?.({ ok: true });
      } catch (err) {
        console.error('voiceRoom:message failed:', err);
        ack?.({ error: 'حصل خطأ، حاول تاني' });
      }
    });

    // ===== تحكّم الأدمن في مشغّل القرآن (لوحة التحكم) =====
    socket.on('voiceRoom:control', async (payload: unknown, ack?: (res: any) => void) => {
      try {
        const roomId = authed.currentRoomId;
        if (!roomId) return ack?.({ error: 'لسه مادخلتش أي غرفة' });
        if (!isEffectiveAdmin(authed)) return ack?.({ error: 'الميزة دي للأدمن بس' });

        const action = (payload as any)?.action;
        const current = roomPlayback.get(roomId);

        switch (action) {
          case 'pause': {
            if (!current || current.paused) return ack?.({ error: 'مفيش حاجة شغّالة دلوقتي' });
            current.paused = true;
            current.pausedAtMs = Date.now();
            io.to(roomId).emit('voiceRoom:playbackControl', { action: 'pause' });
            break;
          }
          case 'resume': {
            if (!current || !current.paused) return ack?.({ error: 'مفيش حاجة موقوفة دلوقتي' });
            current.accumulatedPauseMs += Date.now() - (current.pausedAtMs || Date.now());
            current.paused = false;
            current.pausedAtMs = null;
            io.to(roomId).emit('voiceRoom:playbackControl', { action: 'resume' });
            break;
          }
          case 'stop': {
            if (!current && (roomQueue.get(roomId) || []).length === 0) {
              return ack?.({ error: 'مفيش حاجة شغّالة دلوقتي' });
            }
            io.to(roomId).emit('voiceRoom:playbackControl', { action: 'stop' });
            const sysMsg = await createSystemMessage(roomId, '⏹️ الأدمن أوقف التشغيل');
            io.to(roomId).emit('voiceRoom:message', sysMsg);
            advanceToNext(io, roomId, 'stopped');
            break;
          }
          case 'next': {
            if (!current) return ack?.({ error: 'مفيش حاجة شغّالة دلوقتي' });
            const sysMsg = await createSystemMessage(roomId, '⏭️ الأدمن عمل تخطي للتلاوة الجاية');
            io.to(roomId).emit('voiceRoom:message', sysMsg);
            advanceToNext(io, roomId, 'skipped');
            break;
          }
          case 'previous': {
            const history = roomHistory.get(roomId) || [];
            const prev = history.pop();
            if (!prev) return ack?.({ error: 'مفيش تلاوة سابقة نرجعلها' });
            roomHistory.set(roomId, history);
            if (current) {
              const queue = roomQueue.get(roomId) || [];
              queue.unshift(current);
              roomQueue.set(roomId, queue);
            }
            const restarted: RoomPlaybackState = { ...prev, startedAtMs: Date.now(), paused: false, pausedAtMs: null, accumulatedPauseMs: 0 };
            roomPlayback.set(roomId, restarted);
            io.to(roomId).emit('voiceRoom:playback', restarted);
            broadcastQueueState(io, roomId);
            break;
          }
          case 'repeat': {
            const next = !(roomRepeat.get(roomId) || false);
            roomRepeat.set(roomId, next);
            broadcastQueueState(io, roomId);
            break;
          }
          case 'shuffle': {
            const next = !(roomShuffle.get(roomId) || false);
            roomShuffle.set(roomId, next);
            broadcastQueueState(io, roomId);
            break;
          }
          case 'volume': {
            const value = Number((payload as any)?.value);
            if (!Number.isFinite(value) || value < 0 || value > 100) {
              return ack?.({ error: 'قيمة الصوت غلط' });
            }
            io.to(roomId).emit('voiceRoom:forceVolume', { volume: value });
            break;
          }
          default:
            return ack?.({ error: 'أمر غير معروف' });
        }

        evaluateBotLifecycle(io, roomId);
        ack?.({ ok: true });
      } catch (err) {
        console.error('voiceRoom:control failed:', err);
        ack?.({ error: 'حصل خطأ، حاول تاني' });
      }
    });

    // أي عضو (مش بس الأدمن) بيبلّغ السيرفر لما الفيديو يخلص عنده — بنتأكد
    // إن ده نفس الفيديو الشغّال دلوقتي بالظبط (عشان لو وصل بلاغين مكرّرين
    // من أكتر من عضو في نفس اللحظة ميحصلش تخطي مزدوج للطابور).
    socket.on('voiceRoom:trackEnded', (payload: unknown) => {
      const roomId = authed.currentRoomId;
      if (!roomId) return;
      const current = roomPlayback.get(roomId);
      const videoId = (payload as any)?.videoId;
      if (!current || current.videoId !== videoId) return;
      advanceToNext(io, roomId, 'ended');
    });

    // ===== صلاحيات الأدمن على الشات: تثبيت/حذف رسالة، مسح الشات، قفله =====
    socket.on('voiceRoom:pinMessage', async (payload: unknown, ack?: (res: any) => void) => {
      try {
        const roomId = authed.currentRoomId;
        if (!roomId) return ack?.({ error: 'لسه مادخلتش أي غرفة' });
        if (!isEffectiveModerator(authed)) return ack?.({ error: 'الميزة دي للأدمن أو المشرف بس' });

        const messageId = (payload as any)?.messageId;
        const pinned = Boolean((payload as any)?.pinned);
        if (typeof messageId !== 'string') return ack?.({ error: 'بيانات غلط' });

        const updated = await prisma.voiceRoomMessage.update({
          where: { id: messageId },
          data: { isPinned: pinned },
          include: { replyTo: { select: { id: true, username: true, body: true, isSystem: true, isDeleted: true } } },
        });
        const reactionsMap = await serializeReactions([messageId]);
        io.to(roomId).emit(
          'voiceRoom:messageUpdated',
          serializeMessage(updated, { replyTo: updated.replyTo, reactions: reactionsMap.get(messageId) }),
        );
        ack?.({ ok: true });
      } catch (err) {
        console.error('voiceRoom:pinMessage failed:', err);
        ack?.({ error: 'تعذّر تثبيت الرسالة' });
      }
    });

    socket.on('voiceRoom:reaction', async (payload: unknown, ack?: (res: any) => void) => {
      try {
        const roomId = authed.currentRoomId;
        if (!roomId) return ack?.({ error: 'لسه مادخلتش أي غرفة' });
        const messageId = (payload as any)?.messageId;
        const emoji = (payload as any)?.emoji;
        if (typeof messageId !== 'string' || typeof emoji !== 'string' || !emoji) return ack?.({ error: 'بيانات غلط' });

        const existing = await prisma.voiceRoomMessageReaction.findUnique({
          where: { messageId_userId_emoji: { messageId, userId: authed.userId, emoji } },
        });
        if (existing) {
          await prisma.voiceRoomMessageReaction.delete({ where: { id: existing.id } });
        } else {
          await prisma.voiceRoomMessageReaction.create({ data: { messageId, userId: authed.userId, username: authed.username, emoji } });
        }
        const reactionsMap = await serializeReactions([messageId]);
        io.to(roomId).emit('voiceRoom:reactionUpdated', { messageId, reactions: reactionsMap.get(messageId) || [] });
        ack?.({ ok: true });
      } catch (err) {
        console.error('voiceRoom:reaction failed:', err);
        ack?.({ error: 'تعذّر إضافة التفاعل' });
      }
    });

    socket.on('voiceRoom:deleteMessage', async (payload: unknown, ack?: (res: any) => void) => {
      try {
        const roomId = authed.currentRoomId;
        if (!roomId) return ack?.({ error: 'لسه مادخلتش أي غرفة' });

        const messageId = (payload as any)?.messageId;
        if (typeof messageId !== 'string') return ack?.({ error: 'بيانات غلط' });

        const target = await prisma.voiceRoomMessage.findUnique({ where: { id: messageId } });
        if (!target || target.roomId !== roomId) return ack?.({ error: 'الرسالة دي مش موجودة' });
        // الأدمن أو المشرف يقدر يحذف رسالة أي حد؛ أي عضو تاني يقدر يحذف رسالته هو بس.
        if (!isEffectiveModerator(authed) && target.userId !== authed.userId) {
          return ack?.({ error: 'تقدر تحذف رسالتك بس' });
        }

        const updated = await prisma.voiceRoomMessage.update({
          where: { id: messageId },
          data: { isDeleted: true, isPinned: false },
        });
        io.to(roomId).emit('voiceRoom:messageUpdated', serializeMessage(updated));
        ack?.({ ok: true });
      } catch (err) {
        console.error('voiceRoom:deleteMessage failed:', err);
        ack?.({ error: 'تعذّر حذف الرسالة' });
      }
    });

    socket.on('voiceRoom:clearChat', async (_payload: unknown, ack?: (res: any) => void) => {
      try {
        const roomId = authed.currentRoomId;
        if (!roomId) return ack?.({ error: 'لسه مادخلتش أي غرفة' });
        if (!isEffectiveModerator(authed)) return ack?.({ error: 'الميزة دي للأدمن أو المشرف بس' });

        await prisma.voiceRoomMessage.updateMany({
          where: { roomId, isDeleted: false },
          data: { isDeleted: true, isPinned: false },
        });
        io.to(roomId).emit('voiceRoom:chatCleared');
        ack?.({ ok: true });
      } catch (err) {
        console.error('voiceRoom:clearChat failed:', err);
        ack?.({ error: 'تعذّر مسح الشات' });
      }
    });

    socket.on('voiceRoom:toggleChatLock', async (payload: unknown, ack?: (res: any) => void) => {
      try {
        const roomId = authed.currentRoomId;
        if (!roomId) return ack?.({ error: 'لسه مادخلتش أي غرفة' });
        if (!isEffectiveModerator(authed)) return ack?.({ error: 'الميزة دي للأدمن أو المشرف بس' });

        const locked = Boolean((payload as any)?.locked);
        await prisma.voiceRoom.update({ where: { id: roomId }, data: { chatLocked: locked } });
        roomChatLocked.set(roomId, locked);
        io.to(roomId).emit('voiceRoom:chatLocked', { locked });
        const sysMsg = await createSystemMessage(roomId, locked ? '🔒 الأدمن قفل الشات' : '🔓 الأدمن فتح الشات');
        io.to(roomId).emit('voiceRoom:message', sysMsg);
        ack?.({ ok: true });
      } catch (err) {
        console.error('voiceRoom:toggleChatLock failed:', err);
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
    // الغرفة فضيت خالص (من البني آدمين) — نمسح عدّاد "شغالة من قد إيه"
    // عشان لو رجعوا يدخلوا يبدأ من الأول زي ما طلب بالظبط. التلاوة والبوت
    // بيفضلوا "محفوظين" في الذاكرة (evaluateBotLifecycle هي اللي بتقرر
    // متى البوت يخرج فعليًا بعد الـ ٥ دقايق).
    roomSessionStart.delete(roomId);
  }

  authed.leave(roomId);
  broadcastMembers(io, roomId);
  evaluateBotLifecycle(io, roomId);
  try {
    const sysMsg = await createSystemMessage(roomId, `${authed.username} خرج من الغرفة`);
    io.to(roomId).emit('voiceRoom:message', sysMsg);
  } catch (err) {
    console.error('voiceRoom leave system message failed:', err);
  }
}

// بيُستخدم من مسارات الأدمن (adminVoiceRooms.ts) لما الأدمن يغيّر دور عضو
// (member/moderator/admin) أو يكتمه أو يطرده — لو العضو ده متواجد فعليًا في
// الغرفة دلوقتي، التغيير بيتطبّق على اتصاله الحي فورًا من غير ما يحتاج
// يعمل إعادة اتصال (زي ما طلب: "لو الأدمن غيّر صلاحيات أي عضو تتطبق فورًا").
export function applyMemberModeration(
  roomId: string,
  userId: string,
  patch: { role?: 'member' | 'moderator' | 'admin'; isMuted?: boolean; kick?: boolean }
) {
  if (!ioRef) return;
  const members = roomMembers.get(roomId);
  if (!members) return;

  for (const [socketId, info] of members.entries()) {
    if (info.userId !== userId) continue;
    const socket = ioRef.sockets.sockets.get(socketId) as AuthedSocket | undefined;
    if (socket) {
      if (patch.role !== undefined) socket.roomRole = patch.role;
      if (patch.isMuted !== undefined) socket.roomMuted = patch.isMuted;
      info.isAdmin = isEffectiveAdmin(socket);
      info.isModerator = socket.roomRole === 'moderator';
      info.isMuted = socket.roomMuted;
      members.set(socketId, info);
      socket.emit('voiceRoom:permissionsUpdated', { role: socket.roomRole, isMuted: socket.roomMuted });

      if (patch.kick) {
        socket.emit('voiceRoom:kicked');
        socket.leave(roomId);
        socket.currentRoomId = null;
      }
    }
    if (patch.kick) members.delete(socketId);
  }

  if (patch.kick && members.size === 0) {
    roomMembers.delete(roomId);
    roomSessionStart.delete(roomId);
  }
  broadcastMembers(ioRef, roomId);
  evaluateBotLifecycle(ioRef, roomId);
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

  if (members.size === 0) {
    roomMembers.delete(roomId);
    roomSessionStart.delete(roomId);
  }
  broadcastMembers(ioRef, roomId);
  evaluateBotLifecycle(ioRef, roomId);
}

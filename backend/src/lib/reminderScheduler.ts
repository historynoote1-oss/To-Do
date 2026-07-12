import { prisma } from './prisma';
import { sendPushToUser } from './push';

const CHECK_INTERVAL_MS = 15 * 1000;
// أي تذكير فاته موعده بفرق كبير (مثلًا السيرفر كان واقف) لسه بنبعته، لكن مش
// معقول نبعت تذكير اتأخر أيام — بنعتبره "قديم جدًا" ونعلّمه مبعوت من غير
// إشعار فعلي عشان منغرقش المستخدم بإشعارات متأخرة وقت ما السيرفر يرجع.
const STALE_AFTER_MS = 6 * 60 * 60 * 1000;

function buildPushPayload(reminder: {
  message: string | null;
  list: { title: string } | null;
  item: { content: string; list: { title: string } } | null;
}) {
  const taskTitle = reminder.item ? reminder.item.content : reminder.list?.title || 'مهمتك';
  const context = reminder.item ? reminder.item.list.title : null;
  return {
    title: '🔔 تذكير بمهمة',
    body: reminder.message?.trim() || (context ? `${taskTitle} — ضمن "${context}"` : taskTitle),
    tag: 'todo-reminder',
    url: '/',
  };
}

async function tick() {
  const now = new Date();
  const staleThreshold = new Date(now.getTime() - STALE_AFTER_MS);

  const due = await prisma.reminder.findMany({
    where: { isSent: false, remindAt: { lte: now } },
    include: {
      list: { select: { title: true } },
      item: { select: { content: true, list: { select: { title: true } } } },
    },
    take: 200,
  });

  if (due.length === 0) return;

  const ids = due.map((r) => r.id);
  await prisma.reminder.updateMany({
    where: { id: { in: ids } },
    data: { isSent: true, sentAt: now },
  });

  // إشعارات الجهاز (Web Push) بنبعتها بس للتذكيرات اللي لسه "طازة"؛ القديمة
  // بتتعلّم مبعوتة عشان تختفي من الطابور بس من غير إزعاج المستخدم بمتأخرات.
  await Promise.all(
    due
      .filter((r) => r.remindAt >= staleThreshold)
      .map((r) => sendPushToUser(r.userId, buildPushPayload(r)).catch((err) => console.error('فشل إرسال Push:', err)))
  );
}

let started = false;

export function startReminderScheduler() {
  if (started) return;
  started = true;
  setInterval(() => {
    tick().catch((err) => console.error('خطأ في جدولة التذكيرات:', err));
  }, CHECK_INTERVAL_MS);
  console.log('⏰ جدولة التذكيرات شغالة');
}

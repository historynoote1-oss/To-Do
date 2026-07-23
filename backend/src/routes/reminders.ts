import { Router } from 'express';
import { prisma } from '../lib/core/prisma';
import { AuthRequest } from '../middleware/verifyUser';

const router = Router();

const MIN_OFFSET_MINUTES = 1;
const MAX_OFFSET_MINUTES = 60 * 24 * 90; // حتى 90 يوم قبل الاستحقاق كحد أقصى معقول
// أول ما تذكير معيّن يتبعت (isSent=true)، بنسيبه ظاهر في قائمة "المستحقة"
// للفرونت إند لمدة دقيقتين بس بعد وقت الإرسال — عشان أي تاب فاتح يقدر يعرض
// الـ toast والصوت، من غير ما يفضل التذكير القديم يرجع يظهر تاني لو المستخدم
// فتح تاب جديد بعد ساعة مثلًا.
const DUE_VISIBILITY_MS = 2 * 60 * 1000;

function computeBeforeDueRemindAt(dueDate: Date, offsetMinutes: number) {
  return new Date(dueDate.getTime() - offsetMinutes * 60 * 1000);
}

// بيتأكد إن الـ target (مهمة رئيسية أو فرعية) موجود وملك المستخدم الحالي،
// وبيرجّع بياناته (محتاجينها لمعرفة dueDate لو الوضع BEFORE_DUE)
async function resolveTarget(userId: string, listId?: string, itemId?: string) {
  if (itemId) {
    const item = await prisma.todoItem.findFirst({
      where: { id: itemId, list: { userId } },
    });
    return item ? { kind: 'item' as const, dueDate: item.dueDate, listId: item.listId, itemId: item.id } : null;
  }
  if (listId) {
    const list = await prisma.todoList.findFirst({ where: { id: listId, userId } });
    return list ? { kind: 'list' as const, dueDate: null, listId: list.id, itemId: null } : null;
  }
  return null;
}

// GET /api/reminders?listId=..&itemId=..  → تذكيرات هدف معيّن، أو كل تذكيرات
// المستخدم لو مفيش فلتر، مرتبة بأقرب موعد الأول.
router.get('/reminders', async (req: AuthRequest, res) => {
  const { listId, itemId } = req.query as { listId?: string; itemId?: string };

  const reminders = await prisma.reminder.findMany({
    where: {
      userId: req.userId!,
      ...(itemId ? { itemId } : {}),
      ...(listId && !itemId ? { listId } : {}),
    },
    orderBy: { remindAt: 'asc' },
  });
  res.json(reminders);
});

// GET /api/reminders/due → التذكيرات اللي اتبعتت فعلًا خلال آخر دقيقتين، عشان
// أي تاب فاتح يعرض إشعار داخل الموقع (toast + صوت) حتى لو إشعار الجهاز
// (Web Push) وصل أو معدش وصل. الإرسال الفعلي وتعليم isSent بيحصل من الجدولة
// في الخلفية (lib/reminderScheduler.ts)، مش من هنا.
router.get('/reminders/due', async (req: AuthRequest, res) => {
  const since = new Date(Date.now() - DUE_VISIBILITY_MS);
  const due = await prisma.reminder.findMany({
    where: {
      userId: req.userId!,
      isSent: true,
      sentAt: { gte: since },
    },
    orderBy: { sentAt: 'desc' },
  });
  res.json(due);
});

router.post('/reminders', async (req: AuthRequest, res) => {
  const { listId, itemId, mode, remindAt, offsetMinutes, message } = req.body as {
    listId?: string;
    itemId?: string;
    mode?: 'CUSTOM' | 'BEFORE_DUE';
    remindAt?: string;
    offsetMinutes?: number;
    message?: string;
  };

  if (!listId && !itemId) return res.status(400).json({ error: 'لازم تحدد مهمة رئيسية أو فرعية للتذكير' });
  if (listId && itemId) return res.status(400).json({ error: 'التذكير بيتبع مهمة واحدة بس' });
  if (mode !== 'CUSTOM' && mode !== 'BEFORE_DUE') return res.status(400).json({ error: 'نوع تذكير غير صحيح' });
  if (message && message.length > 200) return res.status(400).json({ error: 'نص التذكير طويل جدًا' });

  const target = await resolveTarget(req.userId!, listId, itemId);
  if (!target) return res.status(404).json({ error: 'المهمة المطلوبة غير موجودة' });

  let finalRemindAt: Date;
  let finalOffset: number | null = null;

  if (mode === 'BEFORE_DUE') {
    if (target.kind === 'list') {
      return res.status(400).json({ error: 'المهام الرئيسية معندهاش موعد استحقاق — استخدم وقت مخصص بدل ده' });
    }
    if (!target.dueDate) {
      return res.status(400).json({ error: 'حدد موعد استحقاق للمهمة الفرعية الأول عشان تقدر تحسب التذكير قبله' });
    }
    if (
      typeof offsetMinutes !== 'number' ||
      !Number.isFinite(offsetMinutes) ||
      offsetMinutes < MIN_OFFSET_MINUTES ||
      offsetMinutes > MAX_OFFSET_MINUTES
    ) {
      return res.status(400).json({ error: 'قيمة الوقت قبل الاستحقاق غير صحيحة' });
    }
    finalOffset = Math.round(offsetMinutes);
    finalRemindAt = computeBeforeDueRemindAt(target.dueDate, finalOffset);
  } else {
    if (!remindAt) return res.status(400).json({ error: 'حدد وقت التذكير' });
    const parsed = new Date(remindAt);
    if (Number.isNaN(parsed.getTime())) return res.status(400).json({ error: 'صيغة الوقت غير صحيحة' });
    finalRemindAt = parsed;
  }

  const reminder = await prisma.reminder.create({
    data: {
      userId: req.userId!,
      listId: target.kind === 'list' ? target.listId : null,
      itemId: target.kind === 'item' ? target.itemId : null,
      mode,
      offsetMinutes: finalOffset,
      remindAt: finalRemindAt,
      message: message?.trim() || null,
    },
  });
  res.json(reminder);
});

router.patch('/reminders/:id', async (req: AuthRequest, res) => {
  const existing = await prisma.reminder.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  });
  if (!existing) return res.status(404).json({ error: 'التذكير غير موجود' });

  const { remindAt, offsetMinutes, message } = req.body as {
    remindAt?: string;
    offsetMinutes?: number;
    message?: string;
  };

  let finalRemindAt = existing.remindAt;
  let finalOffset = existing.offsetMinutes;

  if (existing.mode === 'BEFORE_DUE') {
    if (offsetMinutes !== undefined) {
      if (
        typeof offsetMinutes !== 'number' ||
        !Number.isFinite(offsetMinutes) ||
        offsetMinutes < MIN_OFFSET_MINUTES ||
        offsetMinutes > MAX_OFFSET_MINUTES
      ) {
        return res.status(400).json({ error: 'قيمة الوقت قبل الاستحقاق غير صحيحة' });
      }
      const item = await prisma.todoItem.findUnique({ where: { id: existing.itemId! } });
      if (!item?.dueDate) return res.status(400).json({ error: 'المهمة الفرعية معندهاش موعد استحقاق حاليًا' });
      finalOffset = Math.round(offsetMinutes);
      finalRemindAt = computeBeforeDueRemindAt(item.dueDate, finalOffset);
    }
  } else if (remindAt !== undefined) {
    const parsed = new Date(remindAt);
    if (Number.isNaN(parsed.getTime())) return res.status(400).json({ error: 'صيغة الوقت غير صحيحة' });
    finalRemindAt = parsed;
  }

  if (message !== undefined && message && message.length > 200) {
    return res.status(400).json({ error: 'نص التذكير طويل جدًا' });
  }

  const updated = await prisma.reminder.update({
    where: { id: existing.id },
    data: {
      remindAt: finalRemindAt,
      offsetMinutes: finalOffset,
      message: message !== undefined ? message?.trim() || null : existing.message,
      // أي تعديل بيرجّع التذكير "مش مبعوت" تاني، حتى لو كان اتبعت قبل كده،
      // عشان لو المستخدم أجّله لموعد جديد يوصله إشعار في الموعد الجديد فعلًا.
      isSent: false,
      sentAt: null,
    },
  });
  res.json(updated);
});

router.delete('/reminders/:id', async (req: AuthRequest, res) => {
  const existing = await prisma.reminder.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  });
  if (!existing) return res.status(404).json({ error: 'التذكير غير موجود' });

  await prisma.reminder.delete({ where: { id: existing.id } });
  res.json({ success: true });
});

export default router;

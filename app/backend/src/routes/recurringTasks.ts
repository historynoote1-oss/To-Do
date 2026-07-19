import { Router } from 'express';
import { Prisma, Priority } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/verifyUser';
import {
  RECURRENCE_FREQUENCIES,
  RecurrenceFrequency,
  MIN_INTERVAL,
  MAX_INTERVAL,
  fastForward,
} from '../lib/recurrence';
import { generateOccurrence } from '../lib/recurringTaskScheduler';

const router = Router();

const VALID_PRIORITIES = ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const MAX_ITEMS = 40;
const MAX_TITLE_LENGTH = 80;
const MAX_ITEM_LENGTH = 200;

const RECURRING_TASK_INCLUDE = {
  items: { orderBy: { position: 'asc' } },
  lifeArea: { select: { id: true, name: true, color: true, icon: true, imageUrl: true, parentId: true } },
  _count: { select: { generatedLists: true } },
} satisfies Prisma.RecurringTaskInclude;

function parseFrequency(value: unknown): RecurrenceFrequency {
  if (typeof value !== 'string' || !RECURRENCE_FREQUENCIES.includes(value as RecurrenceFrequency)) {
    throw new Error('نمط التكرار غير صحيح');
  }
  return value as RecurrenceFrequency;
}

function parseInterval(value: unknown): number {
  if (value === undefined || value === null || value === '') return 1;
  const n = Number(value);
  if (!Number.isInteger(n) || n < MIN_INTERVAL || n > MAX_INTERVAL) {
    throw new Error(`دورة التكرار لازم تكون رقم صحيح بين ${MIN_INTERVAL} و ${MAX_INTERVAL}`);
  }
  return n;
}

function parseStartDate(value: unknown): Date {
  if (!value) throw new Error('تاريخ بداية التكرار مطلوب');
  const d = new Date(value as string);
  if (Number.isNaN(d.getTime())) throw new Error('تاريخ بداية التكرار غير صحيح');
  return d;
}

async function parseLifeAreaId(value: unknown, userId: string): Promise<string | null | undefined> {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string') throw new Error('مجال الحياة غير صحيح');
  const area = await prisma.lifeArea.findFirst({ where: { id: value, userId } });
  if (!area) throw new Error('مجال الحياة غير موجود');
  return value;
}

interface ParsedItem {
  content: string;
  priority: Priority;
}

function parseItems(value: unknown): ParsedItem[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('قائمة المهام الفرعية غير صحيحة');
  if (value.length > MAX_ITEMS) throw new Error(`أقصى عدد مهام فرعية للقالب الواحد هو ${MAX_ITEMS}`);
  return value.map((raw) => {
    const content = typeof raw?.content === 'string' ? raw.content.trim() : '';
    if (!content) throw new Error('محتوى المهمة الفرعية مينفعش يبقى فاضي');
    if (content.length > MAX_ITEM_LENGTH) throw new Error('محتوى المهمة الفرعية طويل جدًا');
    const priority = (typeof raw?.priority === 'string' && VALID_PRIORITIES.includes(raw.priority) ? raw.priority : 'NONE') as Priority;
    return { content, priority };
  });
}

// بترجع كل قوالب المهام المتكررة الخاصة بالمستخدم — دي "المكان" المنظم اللي
// المستخدم بيرجعله يعدّل على أي قالب في أي وقت (شوف رسالة الطلب الأصلية).
router.get('/', async (req: AuthRequest, res) => {
  const tasks = await prisma.recurringTask.findMany({
    where: { userId: req.userId! },
    include: RECURRING_TASK_INCLUDE,
    orderBy: { createdAt: 'asc' },
  });
  res.json(tasks);
});

router.post('/', async (req: AuthRequest, res) => {
  const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
  if (!title) return res.status(400).json({ error: 'اسم المهمة المتكررة مطلوب' });
  if (title.length > MAX_TITLE_LENGTH) return res.status(400).json({ error: 'اسم المهمة طويل جدًا' });

  const priority = req.body.priority || 'NONE';
  if (!VALID_PRIORITIES.includes(priority)) return res.status(400).json({ error: 'أولوية غير صحيحة' });

  let frequency: RecurrenceFrequency;
  let interval: number;
  let startDate: Date;
  let lifeAreaId: string | null | undefined;
  let items: ParsedItem[];
  try {
    frequency = parseFrequency(req.body.frequency);
    interval = parseInterval(req.body.interval);
    startDate = parseStartDate(req.body.startDate);
    lifeAreaId = await parseLifeAreaId(req.body.lifeAreaId, req.userId!);
    items = parseItems(req.body.items);
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'بيانات غير صحيحة' });
  }

  const task = await prisma.recurringTask.create({
    data: {
      userId: req.userId!,
      title,
      priority,
      frequency,
      interval,
      startDate,
      nextRunAt: startDate,
      lifeAreaId: lifeAreaId ?? undefined,
      items: { create: items.map((it, index) => ({ content: it.content, priority: it.priority, position: index })) },
    },
    include: RECURRING_TASK_INCLUDE,
  });

  res.json(task);
});

router.patch('/:id', async (req: AuthRequest, res) => {
  const task = await prisma.recurringTask.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!task) return res.status(404).json({ error: 'المهمة المتكررة غير موجودة' });

  const data: Record<string, unknown> = {};

  if (req.body.title !== undefined) {
    const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
    if (!title) return res.status(400).json({ error: 'اسم المهمة المتكررة مطلوب' });
    if (title.length > MAX_TITLE_LENGTH) return res.status(400).json({ error: 'اسم المهمة طويل جدًا' });
    data.title = title;
  }

  if (req.body.priority !== undefined) {
    if (!VALID_PRIORITIES.includes(req.body.priority)) return res.status(400).json({ error: 'أولوية غير صحيحة' });
    data.priority = req.body.priority;
  }

  let frequency: RecurrenceFrequency = task.frequency as RecurrenceFrequency;
  let interval: number = task.interval;
  let startDate: Date = task.startDate;
  let startDateChanged = false;
  try {
    if (req.body.frequency !== undefined) {
      frequency = parseFrequency(req.body.frequency);
      data.frequency = frequency;
    }
    if (req.body.interval !== undefined) {
      interval = parseInterval(req.body.interval);
      data.interval = interval;
    }
    if (req.body.startDate !== undefined) {
      startDate = parseStartDate(req.body.startDate);
      startDateChanged = true;
      data.startDate = startDate;
    }
    if (req.body.lifeAreaId !== undefined) {
      data.lifeAreaId = await parseLifeAreaId(req.body.lifeAreaId, req.userId!);
    }
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'بيانات غير صحيحة' });
  }

  // لو المستخدم غيّر نمط/دورة/تاريخ بداية التكرار، لازم نعيد حساب موعد
  // الدورة الجاية عشان الجدولة تفضل متوافقة مع الإعدادات الجديدة، بدل ما
  // تكمل على حساب مبني على الإعدادات القديمة.
  if (req.body.frequency !== undefined || req.body.interval !== undefined || startDateChanged) {
    const anchor = startDateChanged ? startDate : task.startDate;
    // لو الأنكر (تاريخ البداية) لسه في المستقبل، بيفضل زي ما هو. لو في
    // الماضي، بنقفز مباشرة لأقرب دورة جاية بعد النهاردة من غير ما نولّد كل
    // الدورات الفايتة بينهم.
    data.nextRunAt = fastForward(anchor, frequency, interval, new Date());
  }

  if (req.body.isActive !== undefined) {
    data.isActive = Boolean(req.body.isActive);
  }

  let items: ParsedItem[] | undefined;
  if (req.body.items !== undefined) {
    try {
      items = parseItems(req.body.items);
    } catch (err) {
      return res.status(400).json({ error: err instanceof Error ? err.message : 'بيانات غير صحيحة' });
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (items !== undefined) {
      await tx.recurringTaskItem.deleteMany({ where: { recurringTaskId: task.id } });
      if (items.length > 0) {
        await tx.recurringTaskItem.createMany({
          data: items.map((it, index) => ({
            recurringTaskId: task.id,
            content: it.content,
            priority: it.priority,
            position: index,
          })),
        });
      }
    }
    return tx.recurringTask.update({
      where: { id: task.id },
      data: data as any,
      include: RECURRING_TASK_INCLUDE,
    });
  });

  res.json(updated);
});

// إيقاف/تشغيل مؤقت من غير حذف القالب.
router.post('/:id/pause', async (req: AuthRequest, res) => {
  const task = await prisma.recurringTask.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!task) return res.status(404).json({ error: 'المهمة المتكررة غير موجودة' });
  const updated = await prisma.recurringTask.update({
    where: { id: task.id },
    data: { isActive: false },
    include: RECURRING_TASK_INCLUDE,
  });
  res.json(updated);
});

router.post('/:id/resume', async (req: AuthRequest, res) => {
  const task = await prisma.recurringTask.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!task) return res.status(404).json({ error: 'المهمة المتكررة غير موجودة' });
  // بنقفز لأقرب دورة جاية حقيقية عشان لو القالب فضل موقوف فترة طويلة، منولّدش
  // كل الدورات اللي فاتت وقت الإيقاف دفعة واحدة أول ما يترجّع يشتغل.
  const nextRunAt = fastForward(task.nextRunAt, task.frequency as RecurrenceFrequency, task.interval, new Date());
  const updated = await prisma.recurringTask.update({
    where: { id: task.id },
    data: { isActive: true, nextRunAt },
    include: RECURRING_TASK_INCLUDE,
  });
  res.json(updated);
});

// توليد نسخة فورية يدويًا (من غير ما ننتظر موعد الدورة الجاية) — مفيد لو
// المستخدم عايز يبدأ النهاردة بالظبط قبل أول تشغيل تلقائي للجدولة.
router.post('/:id/generate-now', async (req: AuthRequest, res) => {
  const task = await prisma.recurringTask.findFirst({
    where: { id: req.params.id, userId: req.userId! },
    include: { items: { orderBy: { position: 'asc' } } },
  });
  if (!task) return res.status(404).json({ error: 'المهمة المتكررة غير موجودة' });

  try {
    const list = await generateOccurrence(task, new Date());
    if (!list) return res.status(409).json({ error: 'تعذّر توليد نسخة الآن، حاول تاني' });
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: 'تعذّر توليد نسخة جديدة' });
  }
});

router.delete('/:id', async (req: AuthRequest, res) => {
  const task = await prisma.recurringTask.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!task) return res.status(404).json({ error: 'المهمة المتكررة غير موجودة' });
  await prisma.recurringTask.delete({ where: { id: task.id } });
  res.json({ success: true });
});

export default router;

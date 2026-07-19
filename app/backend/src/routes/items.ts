import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/verifyUser';
import { syncListArchiveState } from '../lib/archive';

const router = Router();
const VALID_PRIORITIES = ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

// رسالة موحّدة لأي محاولة تعديل مهمة فرعية تابعة لمهمة رئيسية "متأخرة"
// اتؤرشفت تلقائيًا — مجمّدة نهائيًا زي أي جزء تاني منها (شوف تعليق
// archiveReason في schema.prisma وlib/archive.ts).
const OVERDUE_LOCK_ERROR = 'المهمة دي ضمن مهمة متأخرة اتؤرشفت تلقائيًا، ومحتواها مجمّد ومينفعش يتعدّل';

router.post('/items', async (req: AuthRequest, res) => {
  const { listId, content, priority, dueDate } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'محتوى المهمة الفرعية مطلوب' });
  if (priority && !VALID_PRIORITIES.includes(priority)) {
    return res.status(400).json({ error: 'أولوية غير صحيحة' });
  }

  const list = await prisma.todoList.findFirst({
    where: { id: listId, userId: req.userId! },
  });
  if (!list) return res.status(404).json({ error: 'المهمة الرئيسية غير موجودة' });
  if (list.archiveReason === 'OVERDUE') return res.status(400).json({ error: OVERDUE_LOCK_ERROR });

  const count = await prisma.todoItem.count({ where: { listId: list.id } });

  const item = await prisma.todoItem.create({
    data: {
      listId: list.id,
      content: content.trim(),
      priority: priority || 'NONE',
      dueDate: dueDate ? new Date(dueDate) : null,
      position: count,
    },
  });

  // مهمة فرعية جديدة دايمًا "غير منجزة"، فلو المهمة الرئيسية كانت مؤرشفة
  // (مكتملة قبل كده) لازم ترجع تلقائيًا للقائمة النشطة.
  await syncListArchiveState(list.id);

  res.json(item);
});

router.patch('/items/:id', async (req: AuthRequest, res) => {
  const item = await prisma.todoItem.findFirst({
    where: { id: req.params.id, list: { userId: req.userId! } },
    include: { list: { select: { archiveReason: true } } },
  });
  if (!item) return res.status(404).json({ error: 'المهمة الفرعية غير موجودة' });
  if (item.list.archiveReason === 'OVERDUE') return res.status(400).json({ error: OVERDUE_LOCK_ERROR });
  if (req.body.priority !== undefined && !VALID_PRIORITIES.includes(req.body.priority)) {
    return res.status(400).json({ error: 'أولوية غير صحيحة' });
  }

  const newDueDate =
    req.body.dueDate !== undefined ? (req.body.dueDate ? new Date(req.body.dueDate) : null) : item.dueDate;

  const updated = await prisma.todoItem.update({
    where: { id: item.id },
    data: {
      content: req.body.content ?? item.content,
      isDone: req.body.isDone ?? item.isDone,
      priority: req.body.priority ?? item.priority,
      dueDate: newDueDate,
    },
  });

  // لو موعد الاستحقاق اتغيّر، أي تذكير من نوع "قبل الاستحقاق" مرتبط بالمهمة
  // دي لازم يتحرك معاه تلقائيًا (أو يتعطّل لو الموعد اتشال خالص).
  if (req.body.dueDate !== undefined) {
    const dueReminders = await prisma.reminder.findMany({
      where: { itemId: item.id, mode: 'BEFORE_DUE' },
    });
    if (dueReminders.length > 0) {
      await prisma.$transaction(
        dueReminders.map((r) =>
          prisma.reminder.update({
            where: { id: r.id },
            data: newDueDate
              ? {
                  remindAt: new Date(newDueDate.getTime() - (r.offsetMinutes || 0) * 60 * 1000),
                  isSent: false,
                  sentAt: null,
                }
              : // مفيش موعد استحقاق دلوقتي؛ التذكير القديم بيتجمّد (متعلّم مبعوت) لحد
                // ما المستخدم يحدد موعد جديد أو يعدّل التذكير بنفسه.
                { isSent: true, sentAt: new Date() },
          })
        )
      );
    }
  }

  // بعد أي تعديل ممكن يغيّر حالة الإنجاز (isDone)، بنزامن أرشفة المهمة
  // الرئيسية تلقائيًا: اكتملت كل المهام الفرعية => أرشفة، رجعت واحدة غير
  // منجزة => استرجاع من الأرشيف.
  if (req.body.isDone !== undefined) {
    await syncListArchiveState(item.listId);
  }

  res.json(updated);
});

router.delete('/items/:id', async (req: AuthRequest, res) => {
  const item = await prisma.todoItem.findFirst({
    where: { id: req.params.id, list: { userId: req.userId! } },
    include: { list: { select: { archiveReason: true } } },
  });
  if (!item) return res.status(404).json({ error: 'المهمة الفرعية غير موجودة' });
  if (item.list.archiveReason === 'OVERDUE') return res.status(400).json({ error: OVERDUE_LOCK_ERROR });

  await prisma.todoItem.delete({ where: { id: item.id } });

  // حذف مهمة فرعية ممكن يغيّر نسبة الاكتمال في الاتجاهين (حذف آخر مهمة
  // غير منجزة يكمّل القائمة، أو حذف كل المهام يفضّي القائمة فترجع نشطة).
  await syncListArchiveState(item.listId);

  res.json({ success: true });
});

// لتحديث ترتيب أكتر من مهمة دفعة واحدة (drag & drop مستقبلًا)
router.patch('/items-reorder', async (req: AuthRequest, res) => {
  const { items } = req.body as { items: { id: string; position: number }[] };
  if (!Array.isArray(items)) return res.status(400).json({ error: 'صيغة غير صحيحة' });

  await prisma.$transaction(
    items.map((it) =>
      prisma.todoItem.updateMany({
        where: { id: it.id, list: { userId: req.userId! } },
        data: { position: it.position },
      })
    )
  );
  res.json({ success: true });
});

export default router;

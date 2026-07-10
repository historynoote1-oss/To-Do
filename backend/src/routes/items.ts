import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/verifyUser';

const router = Router();

router.post('/items', async (req: AuthRequest, res) => {
  const { listId, content, priority, dueDate } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'محتوى المهمة مطلوب' });

  const list = await prisma.todoList.findFirst({
    where: { id: listId, userId: req.userId! },
  });
  if (!list) return res.status(404).json({ error: 'القائمة غير موجودة' });

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
  res.json(item);
});

router.patch('/items/:id', async (req: AuthRequest, res) => {
  const item = await prisma.todoItem.findFirst({
    where: { id: req.params.id, list: { userId: req.userId! } },
  });
  if (!item) return res.status(404).json({ error: 'المهمة غير موجودة' });

  const updated = await prisma.todoItem.update({
    where: { id: item.id },
    data: {
      content: req.body.content ?? item.content,
      isDone: req.body.isDone ?? item.isDone,
      priority: req.body.priority ?? item.priority,
      dueDate:
        req.body.dueDate !== undefined
          ? req.body.dueDate
            ? new Date(req.body.dueDate)
            : null
          : item.dueDate,
    },
  });
  res.json(updated);
});

router.delete('/items/:id', async (req: AuthRequest, res) => {
  const item = await prisma.todoItem.findFirst({
    where: { id: req.params.id, list: { userId: req.userId! } },
  });
  if (!item) return res.status(404).json({ error: 'المهمة غير موجودة' });

  await prisma.todoItem.delete({ where: { id: item.id } });
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

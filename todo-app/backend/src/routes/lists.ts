import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/verifyUser';

const router = Router();

router.get('/', async (req: AuthRequest, res) => {
  const lists = await prisma.todoList.findMany({
    where: { userId: req.userId! },
    include: { items: { orderBy: { position: 'asc' } } },
    orderBy: { createdAt: 'asc' },
  });
  res.json(lists);
});

const VALID_PRIORITIES = ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

router.post('/', async (req: AuthRequest, res) => {
  const { priority } = req.body;
  if (priority && !VALID_PRIORITIES.includes(priority)) {
    return res.status(400).json({ error: 'أولوية غير صحيحة' });
  }
  try {
    const list = await prisma.todoList.create({
      data: {
        userId: req.userId!,
        title: req.body.title || 'قائمتي',
        priority: priority || 'NONE',
      },
    });
    res.json(list);
  } catch (err) {
    res.status(400).json({ error: 'فيه مهمة رئيسية بنفس الاسم بالفعل' });
  }
});

router.patch('/:id', async (req: AuthRequest, res) => {
  const list = await prisma.todoList.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  });
  if (!list) return res.status(404).json({ error: 'المهمة الرئيسية غير موجودة' });

  if (req.body.priority !== undefined && !VALID_PRIORITIES.includes(req.body.priority)) {
    return res.status(400).json({ error: 'أولوية غير صحيحة' });
  }

  const updated = await prisma.todoList.update({
    where: { id: list.id },
    data: {
      title: req.body.title ?? list.title,
      priority: req.body.priority ?? list.priority,
    },
  });
  res.json(updated);
});

router.delete('/:id', async (req: AuthRequest, res) => {
  const list = await prisma.todoList.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  });
  if (!list) return res.status(404).json({ error: 'المهمة الرئيسية غير موجودة' });

  await prisma.todoList.delete({ where: { id: list.id } });
  res.json({ success: true });
});

export default router;

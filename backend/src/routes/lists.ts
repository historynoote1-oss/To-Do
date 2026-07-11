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

router.post('/', async (req: AuthRequest, res) => {
  try {
    const list = await prisma.todoList.create({
      data: {
        userId: req.userId!,
        title: req.body.title || 'قائمتي',
      },
    });
    res.json(list);
  } catch (err) {
    res.status(400).json({ error: 'فيه قائمة بنفس الاسم بالفعل' });
  }
});

router.patch('/:id', async (req: AuthRequest, res) => {
  const list = await prisma.todoList.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  });
  if (!list) return res.status(404).json({ error: 'القائمة غير موجودة' });

  const updated = await prisma.todoList.update({
    where: { id: list.id },
    data: { title: req.body.title },
  });
  res.json(updated);
});

router.delete('/:id', async (req: AuthRequest, res) => {
  const list = await prisma.todoList.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  });
  if (!list) return res.status(404).json({ error: 'القائمة غير موجودة' });

  await prisma.todoList.delete({ where: { id: list.id } });
  res.json({ success: true });
});

export default router;

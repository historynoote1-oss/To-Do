import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/verifyUser';
import { requireAdminPassword } from '../middleware/requireAdminPassword';

const router = Router();

async function logAction(adminId: string, action: string, ip: string, targetUsername?: string | null) {
  const admin = await prisma.user.findUnique({ where: { id: adminId }, select: { username: true } });
  await prisma.adminAuditLog.create({
    data: {
      adminUsername: admin?.username || 'unknown',
      targetUsername: targetUsername || null,
      action,
      ip,
    },
  });
}

// ===== القوائم (Lists) — بحث + تصفح عبر كل المستخدمين =====

router.get('/lists', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const page = Math.max(Number(req.query.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 20, 1), 100);

  const where = q
    ? {
        OR: [
          { title: { contains: q, mode: 'insensitive' as const } },
          { user: { username: { contains: q, mode: 'insensitive' as const } } },
        ],
      }
    : {};

  const [lists, total] = await Promise.all([
    prisma.todoList.findMany({
      where,
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { id: true, username: true } },
        _count: { select: { items: true } },
      },
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.todoList.count({ where }),
  ]);

  res.json({ lists, total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) });
});

router.get('/lists/:id', async (req, res) => {
  const list = await prisma.todoList.findUnique({
    where: { id: req.params.id },
    include: {
      user: { select: { id: true, username: true } },
      items: { orderBy: { position: 'asc' } },
    },
  });
  if (!list) return res.status(404).json({ error: 'القائمة غير موجودة' });
  res.json(list);
});

// تعديل كامل لعنوان أي قائمة لأي مستخدم — تحكم شامل بدون قيود على المحتوى
router.patch('/lists/:id', async (req: AuthRequest, res) => {
  const { title } = req.body as { title?: string };
  if (!title || !title.trim()) return res.status(400).json({ error: 'العنوان مطلوب' });

  const list = await prisma.todoList.findUnique({ where: { id: req.params.id }, include: { user: true } });
  if (!list) return res.status(404).json({ error: 'القائمة غير موجودة' });

  const updated = await prisma.todoList.update({ where: { id: list.id }, data: { title: title.trim() } });
  await logAction(req.userId!, `تعديل عنوان قائمة (${list.title} ← ${updated.title})`, req.ip!, list.user.username);
  res.json(updated);
});

router.delete('/lists/:id', requireAdminPassword, async (req: AuthRequest, res) => {
  const list = await prisma.todoList.findUnique({ where: { id: req.params.id }, include: { user: true } });
  if (!list) return res.status(404).json({ error: 'القائمة غير موجودة' });

  await prisma.todoList.delete({ where: { id: list.id } });
  await logAction(req.userId!, `حذف قائمة "${list.title}"`, req.ip!, list.user.username);
  res.json({ success: true });
});

// ===== المهام (Items) — بحث + فلترة عبر كل المستخدمين =====

router.get('/items', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const priority = typeof req.query.priority === 'string' ? req.query.priority : '';
  const status = typeof req.query.status === 'string' ? req.query.status : ''; // done | pending
  const page = Math.max(Number(req.query.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 20, 1), 100);

  const where: Record<string, unknown> = {};
  if (q) where.content = { contains: q, mode: 'insensitive' as const };
  if (priority && ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(priority)) where.priority = priority;
  if (status === 'done') where.isDone = true;
  if (status === 'pending') where.isDone = false;

  const [items, total] = await Promise.all([
    prisma.todoItem.findMany({
      where,
      select: {
        id: true,
        content: true,
        isDone: true,
        priority: true,
        dueDate: true,
        createdAt: true,
        updatedAt: true,
        list: { select: { id: true, title: true, user: { select: { id: true, username: true } } } },
      },
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.todoItem.count({ where }),
  ]);

  res.json({ items, total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) });
});

// تعديل شامل لأي مهمة (المحتوى، الحالة، الأولوية، تاريخ الاستحقاق) لأي مستخدم
router.patch('/items/:id', async (req: AuthRequest, res) => {
  const { content, isDone, priority, dueDate } = req.body as {
    content?: string;
    isDone?: boolean;
    priority?: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    dueDate?: string | null;
  };

  const item = await prisma.todoItem.findUnique({
    where: { id: req.params.id },
    include: { list: { include: { user: true } } },
  });
  if (!item) return res.status(404).json({ error: 'المهمة غير موجودة' });

  const data: any = {};
  if (content !== undefined) data.content = content.trim();
  if (isDone !== undefined) data.isDone = isDone;
  if (priority !== undefined) data.priority = priority;
  if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;

  const updated = await prisma.todoItem.update({ where: { id: item.id }, data });
  await logAction(req.userId!, 'تعديل مهمة', req.ip!, item.list.user.username);
  res.json(updated);
});

router.delete('/items/:id', requireAdminPassword, async (req: AuthRequest, res) => {
  const item = await prisma.todoItem.findUnique({
    where: { id: req.params.id },
    include: { list: { include: { user: true } } },
  });
  if (!item) return res.status(404).json({ error: 'المهمة غير موجودة' });

  await prisma.todoItem.delete({ where: { id: item.id } });
  await logAction(req.userId!, `حذف مهمة "${item.content}"`, req.ip!, item.list.user.username);
  res.json({ success: true });
});

export default router;

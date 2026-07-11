import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/verifyUser';
import { hashPassword, generateTempPassword } from '../lib/auth';

const router = Router();

async function logAction(adminId: string, targetUserId: string | null, action: string) {
  const admin = await prisma.user.findUnique({ where: { id: adminId }, select: { username: true } });
  const target = targetUserId
    ? await prisma.user.findUnique({ where: { id: targetUserId }, select: { username: true } })
    : null;
  await prisma.adminAuditLog.create({
    data: {
      adminUsername: admin?.username || 'unknown',
      targetUsername: target?.username || null,
      action,
    },
  });
}

router.get('/stats', async (_req, res) => {
  const [usersCount, listsCount, itemsCount, doneItemsCount, activeCount] = await Promise.all([
    prisma.user.count(),
    prisma.todoList.count(),
    prisma.todoItem.count(),
    prisma.todoItem.count({ where: { isDone: true } }),
    prisma.user.count({ where: { isActive: true } }),
  ]);

  res.json({ usersCount, listsCount, itemsCount, doneItemsCount, activeCount });
});

router.get('/users', async (_req, res) => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      isAdmin: true,
      isActive: true,
      lastLoginAt: true,
      lastLoginIp: true,
      createdAt: true,
      _count: { select: { lists: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(users);
});

router.get('/users/:id', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      username: true,
      isAdmin: true,
      isActive: true,
      lastLoginAt: true,
      lastLoginIp: true,
      createdAt: true,
      lists: {
        include: { items: true },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
  res.json(user);
});

// تعليق / إعادة تفعيل الحساب
router.patch('/users/:id/suspend', async (req: AuthRequest, res) => {
  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: 'المستخدم غير موجود' });
  if (target.id === req.userId) {
    return res.status(400).json({ error: 'متقدرش تعلّق حسابك انت بنفسك' });
  }

  const updated = await prisma.user.update({
    where: { id: target.id },
    data: { isActive: !target.isActive },
  });

  await logAction(req.userId!, target.id, updated.isActive ? 'إعادة تفعيل حساب' : 'تعليق حساب');
  res.json({ isActive: updated.isActive });
});

// تسجيل خروج إجباري من كل الأجهزة (بيلغي كل الجلسات القديمة فورًا)
router.post('/users/:id/force-logout', async (req: AuthRequest, res) => {
  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: 'المستخدم غير موجود' });

  await prisma.user.update({
    where: { id: target.id },
    data: { tokenVersion: { increment: 1 } },
  });

  await logAction(req.userId!, target.id, 'تسجيل خروج إجباري');
  res.json({ success: true });
});

// إعادة تعيين إجبارية لكلمة المرور — بيتولّد باسورد مؤقت عشوائي وبيتشفّر ويتخزن،
// وبيترجع نص واحد بس في الرد ده عشان الأدمن يديه للعضو يدويًا (تليجرام، رسالة، إلخ).
// الباسورد القديم بيتمسح تمامًا ومفيش أي طريقة ترجعله تاني.
router.post('/users/:id/reset-password', async (req: AuthRequest, res) => {
  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: 'المستخدم غير موجود' });

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  await prisma.user.update({
    where: { id: target.id },
    data: { passwordHash, tokenVersion: { increment: 1 } },
  });

  await logAction(req.userId!, target.id, 'إعادة تعيين كلمة المرور');
  res.json({ tempPassword });
});

router.delete('/users/:id', async (req: AuthRequest, res) => {
  if (req.params.id === req.userId) {
    return res.status(400).json({ error: 'متقدرش تحذف حسابك انت بنفسك من هنا' });
  }
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

  await logAction(req.userId!, user.id, 'حذف حساب');
  await prisma.user.delete({ where: { id: user.id } });
  res.json({ success: true });
});

router.get('/audit-log', async (_req, res) => {
  const logs = await prisma.adminAuditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json(logs);
});

export default router;

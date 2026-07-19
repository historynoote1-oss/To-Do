import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/verifyUser';

const router = Router();

// بترجّع آخر 50 إشعار للمستخدم + عدد غير المقروء (للبادج على الجرس).
router.get('/notifications', async (req: AuthRequest, res) => {
  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: req.userId! },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.notification.count({ where: { userId: req.userId!, isRead: false } }),
  ]);
  res.json({ notifications, unreadCount });
});

router.post('/notifications/:id/read', async (req: AuthRequest, res) => {
  const notification = await prisma.notification.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  });
  if (!notification) return res.status(404).json({ error: 'الإشعار غير موجود' });

  const updated = await prisma.notification.update({
    where: { id: notification.id },
    data: { isRead: true, readAt: new Date() },
  });
  res.json(updated);
});

router.post('/notifications/read-all', async (req: AuthRequest, res) => {
  await prisma.notification.updateMany({
    where: { userId: req.userId!, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
  res.json({ success: true });
});

router.delete('/notifications/:id', async (req: AuthRequest, res) => {
  const notification = await prisma.notification.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  });
  if (!notification) return res.status(404).json({ error: 'الإشعار غير موجود' });

  await prisma.notification.delete({ where: { id: notification.id } });
  res.json({ success: true });
});

export default router;

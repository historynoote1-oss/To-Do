import { Router } from 'express';
import { prisma } from '../lib/core/prisma';
import { AuthRequest } from '../middleware/verifyUser';
import { getVapidPublicKey, isPushConfigured } from '../lib/core/push';

const router = Router();

router.get('/push/vapid-public-key', (_req: AuthRequest, res) => {
  res.json({ publicKey: getVapidPublicKey(), enabled: isPushConfigured() });
});

router.post('/push/subscribe', async (req: AuthRequest, res) => {
  const { endpoint, keys } = req.body as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: 'بيانات الاشتراك ناقصة' });
  }

  // نفس المتصفح ممكن يشترك تاني (بعد مسح البيانات مثلًا) فبنعمل upsert
  // بالـ endpoint بدل ما نكرر صفوف قديمة ميتة.
  const subscription = await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { userId: req.userId!, p256dh: keys.p256dh, auth: keys.auth },
    create: { userId: req.userId!, endpoint, p256dh: keys.p256dh, auth: keys.auth },
  });
  res.json({ success: true, id: subscription.id });
});

router.post('/push/unsubscribe', async (req: AuthRequest, res) => {
  const { endpoint } = req.body as { endpoint?: string };
  if (!endpoint) return res.status(400).json({ error: 'الرابط مطلوب' });

  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: req.userId! } });
  res.json({ success: true });
});

export default router;
